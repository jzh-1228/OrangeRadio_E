// ============================================================
// 21-deck-manager.js — Automix 智能过渡 · 宿主层（原生 JS 重写）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/automix/useAutomixDecks.ts 的无 React 重写。
//
// 2a 形态：决策引擎完整（trackProfile/chooser/planner/musicalTime/deckClock 曲线数学），
// 执行层为元素级（等功率交叉走双元素 volume + playbackRate 变速，复用 albumGapless
// 已验证的混合通道与 playQueueAt 收养分支）——不触碰主音频图，零图重建风险。
// 2b 将引入常驻双 deck AutomixDeckChain（三频段接缝/回声抛掷/stem 交接的采样级调度）。
//
// 时序（对齐 Folia automixSession 语义）：
//   距歌尾 ≤26s：取下一首播放数据 → 预载 B 元素（mute 预缓冲）+ 离线分析
//   距歌尾 = overlap+1s（ARM_LEAD）：armed —— B seek 到 inStart、布防
//   到 outStart：fading —— 等功率曲线交叉（元素 volume，rAF 驱动）+ 出场曲变速
//   settle：B 收养为主元素（playQueueAt albumGaplessHandoff 通道）或回退
// ============================================================
var AUTOMIX_TICK_INTERVAL_MS = 400; // AUTOMIX_ARM_LEAD_SEC 由 06-transition-planner 定义

var automixState = {
  enabled: false,
  phase: 'idle',            // idle | armed | fading | settling
  bDeck: null,              // 进场 deck（一次性，settle 后退役）
  bData: null,              // 下一首播放数据（playQueueAt 复用）
  bSongKey: '',
  bNextIdx: -1,
  plan: null,
  fadeRaf: 0,
  tickTimer: 0,
  lastTickAt: 0,
  aStartVolume: 1,
  suppressedOnEnded: null
};

function automixSettings() {
  return {
    mode: (fx.automixMode === 'crossfade') ? 'crossfade' : 'automix',
    crossfadeMaxSec: Math.min(25, Math.max(1, Number(fx.automixCrossfadeSec) || 6)),
    performance: !!fx.automixPerformance
  };
}

function automixSetEnabled(on) {
  fx.automixEnabled = !!on;
  if (!fx.automixEnabled) automixAbort('disabled');
  if (typeof scheduleLyricLayoutSave === 'function') scheduleLyricLayoutSave(120);
  if (typeof updateFxInputs === 'function') { try { updateFxInputs(); } catch (e) { } }
}

// 开关持久化走 fx 标准链路（fx.automixEnabled 在 autosave 白名单内）；
// fx 运行时从存档恢复后由 bindings 调 automixSetEnabled 同步运行时状态。

// planner 期望 {startTime, endTime, fullText}；MineRadio 行为 {t, duration?, text, words[]}
function automixLyricLinesForPlanner() {
  if (!Array.isArray(lyricsLines) || !lyricsLines.length) return null;
  var out = [];
  for (var i = 0; i < lyricsLines.length; i++) {
    var line = lyricsLines[i];
    if (!line) continue;
    var text = String(line.text || '').trim();
    if (!text) continue;
    var start = Number(line.t);
    if (!isFinite(start)) continue;
    var end = start + Math.max(0.2, Number(line.duration) || 2.4);
    if (Array.isArray(line.words) && line.words.length) {
      var last = line.words[line.words.length - 1];
      if (last && isFinite(last.t)) end = Math.max(end, last.t + Math.max(0.06, last.d || 0));
    }
    out.push({ startTime: start, endTime: end, fullText: text });
  }
  return out.length ? out : null;
}

function automixTrackFor(song, durationSec, useCurrentLyrics) {
  return {
    duration: Number(durationSec) || (Number(song && song.durationMs) || 0) / 1000 || 0,
    lines: useCurrentLyrics ? automixLyricLinesForPlanner() : null,
    profile: (typeof getTrackProfile === 'function' && song) ? getTrackProfile(song) : null,
    vocalEnd: null,
    separated: null
  };
}

function automixCanAttempt() {
  if (!fx || !fx.automixEnabled) return false;
  if (automixState.phase !== 'idle') return false;
  if (!audio || audio.paused || !isFinite(audio.duration) || audio.duration <= 0) return false;
  if (playMode === 'single') return false;  // 单曲循环无过渡对象
  if (typeof albumGaplessState !== 'undefined' && albumGaplessState.preload) return false; // 专辑无缝优先
  if (typeof cuefieldAutoMixExecuting !== 'undefined' && cuefieldAutoMixExecuting) return false;
  if (typeof cuefieldAutoMixEnabled !== 'undefined' && cuefieldAutoMixEnabled) return false; // cuefield 开启时让位
  var nextIdx = currentIdx + 1;
  if (nextIdx < 0 || nextIdx >= playQueue.length) return false;
  var next = playQueue[nextIdx];
  if (!next || next.type === 'local' || next.localUrl) { /* 本地歌 2a 可混合（文件直连），暂保守跳过 */ if (next && (next.type === 'local' || next.source === 'local')) return false; }
  return true;
}

// 主循环挂载点：窗口检测 + 布防 + 交接时序
function automixTick(nowMs) {
  if (automixState.phase === 'fading' || automixState.phase === 'settling') return;
  if (nowMs - automixState.lastTickAt < AUTOMIX_TICK_INTERVAL_MS) return;
  automixState.lastTickAt = nowMs;
  if (!automixCanAttempt()) { if (automixState.phase === 'armed') automixAbort('conditions-changed'); return; }
  var remaining = audio.duration - audio.currentTime;
  if (remaining > AUTOMIX_MAX_OVERLAP_SEC + AUTOMIX_ARM_LEAD_SEC) return;

  var nextIdx = currentIdx + 1;
  var next = playQueue[nextIdx];
  var fromTrack = automixTrackFor(playQueue[currentIdx], audio.duration, true);
  var toTrack = automixTrackFor(next, next.durationMs / 1000, false);
  var settings = automixSettings();
  var plan = planForMode(settings, fromTrack, toTrack, null, audio.currentTime || 0);
  if (!plan || plan.kind === 'hardCut') return;  // 硬切交给常规切歌
  var outStart = plan.outStart;
  var timeLeftToOut = outStart - (audio.currentTime || 0);

  // 预载（一次性）：B 元素 + 播放数据
  if (!automixState.bDeck) {
    automixPrepareDeck(nextIdx, next, plan).catch(function (err) {
      console.warn('[Automix] prepare failed:', err && err.message);
      automixAbort('prepare-failed');
    });
    return;
  }
  if (automixState.phase === 'idle' && timeLeftToOut <= AUTOMIX_ARM_LEAD_SEC + 0.05) {
    automixArm(plan);
  }
}

async function automixPrepareDeck(nextIdx, song, plan) {
  var data = await resolveAlbumGaplessPlaybackData(song);
  if (!data || !data.url) throw new Error('no playback url');
  var proxyUrl = '/api/audio?url=' + encodeURIComponent(data.url);
  var el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  el.src = proxyUrl;
  el.volume = 0;                 // 预缓冲期静默
  automixState.bDeck = el;
  automixState.bData = data;
  automixState.bSongKey = queueItemKey(song);
  automixState.bNextIdx = nextIdx;
  // 离线分析下一首（分析队列串行、范围限制在 [当前, 下一首]）
  try {
    setAnalysisScope([playQueue[currentIdx], song]);
    ensureTrackProfile({ song: song, wantGrid: false, audioUrl: proxyUrl, enableMediaCache: false });
    ensureTrackProfile({ song: playQueue[currentIdx], wantGrid: false, audioUrl: audio && audio.src, enableMediaCache: false });
  } catch (e) { /* 分析失败不阻断过渡 */ }
  await new Promise(function (resolve) {
    if (el.readyState >= 2) return resolve();
    el.addEventListener('loadeddata', function onLd() { el.removeEventListener('loadeddata', onLd); resolve(); }, { once: true });
    el.addEventListener('error', function onErr() { el.removeEventListener('error', onErr); resolve(); }, { once: true });
    setTimeout(resolve, 8000); // 预载超时：交给 fading 段兜底
  });
}

function automixArm(plan) {
  var el = automixState.bDeck;
  if (!el) return automixAbort('no-deck');
  if (queueItemKey(playQueue[automixState.bNextIdx]) !== automixState.bSongKey) return automixAbort('queue-moved');
  automixState.plan = plan;
  automixState.phase = 'armed';
  // B 定位进场点并待命（静默）
  try { el.currentTime = Math.max(0, plan.inStart || 0); } catch (e) { }
  // 抑制主元素 onended：出 deck 的 ended 属于本过渡，不能触发常规切歌
  if (audio) {
    automixState.suppressedOnEnded = audio.onended;
    automixState.suppressedOnEndedSrc = audio;
    audio.onended = null;
  }
  console.log('[Automix] armed: ' + plan.style + ' overlap ' + plan.overlap.toFixed(1) + 's — ' + plan.reason);
  // armed → fading 由 armed 轮询推进（remain 到 outStart）
  automixPumpArmed();
}

function automixPumpArmed() {
  if (automixState.phase !== 'armed') return;
  var plan = automixState.plan;
  var t = audio ? audio.currentTime : 0;
  if (t >= plan.outStart - 0.05) { automixStartFading(); return; }
  requestAnimationFrame(automixPumpArmed);
}

function automixStartFading() {
  var plan = automixState.plan;
  var bEl = automixState.bDeck;
  if (!bEl || !audio) return automixAbort('fading-missing-deck');
  automixState.phase = 'fading';
  automixState.aStartVolume = audio ? audio.volume : 1;
  // 变速只弯出场曲（元素自带 preservesPitch 时间伸缩）
  if (plan.stretch && Math.abs(plan.stretch - 1) > 0.001) {
    applyTempoBend(audio, plan.stretch);
  }
  bEl.volume = 0;
  bEl.playbackRate = 1;
  var playPromise = bEl.play();
  if (playPromise && playPromise.catch) playPromise.catch(function () { automixAbort('b-deck-play-failed'); });
  // 等功率曲线：出场曲从当前音量滑到 0，进场曲 0 → 目标音量；together 平台段由曲线形状给出
  var totalSec = Math.max(0.3, plan.overlap);
  var steps = Math.max(8, Math.round(totalSec * 30));
  var curves = buildCrossfadeCurves(totalSec, 0.5, plan.style === 'plainBlend' ? 0 : 0.35);
  var startAt = performance.now();
  var settleOnEnded = function () { if (automixState.phase === 'fading') automixSettle(); };
  audio.onended = settleOnEnded; // 出 deck 提前播完 → 直接收尾
  var step = function () {
    if (automixState.phase !== 'fading') return;
    var t = (performance.now() - startAt) / 1000;
    var k = Math.min(1, t / totalSec);
    var idx = Math.min(curves.out.length - 1, Math.round(k * (curves.out.length - 1)));
    var target = automixState.aStartVolume;
    audio.volume = Math.max(0, Math.min(1, curves.out[idx] * target));
    bEl.volume = Math.max(0, Math.min(1, curves.in[idx] * target));
    if (audio.currentTime >= plan.outStart + totalSec || audio.ended || bEl.ended) { automixSettle(); return; }
    automixState.fadeRaf = requestAnimationFrame(step);
  };
  automixState.fadeRaf = requestAnimationFrame(step);
}

// 收尾：交接（收养 B）或回退
function automixSettle() {
  if (automixState.phase === 'settling' || automixState.phase === 'idle') return;
  automixState.phase = 'settling';
  if (automixState.fadeRaf) cancelAnimationFrame(automixState.fadeRaf);
  resetTempoBend(audio);
  var bEl = automixState.bDeck;
  var idx = automixState.bNextIdx;
  var data = automixState.bData;
  var ok = false;
  if (bEl && data && data.url && !bEl.error && bEl.src && currentIdx === idx - 1 && idx >= 0 && idx < playQueue.length) {
    bEl.volume = Math.max(0.2, Math.min(1, automixState.aStartVolume || 1));
    // 收养通道与 albumGapless handoff 一致：不重新取数、收养预载元素
    ok = playQueueAt(idx, {
      albumGaplessHandoff: true,
      automixAdopted: true,
      albumGaplessMixed: true,
      preloadedAudio: bEl,
      preloadedData: data,
      suppressPlayFailureNotice: true
    }) === true;
  }
  if (!ok) {
    // 回退：静音 B，恢复 A，常规切歌接管
    if (bEl) { try { bEl.pause(); } catch (e) { } bEl.src = ''; }
    if (audio && !audio.ended) { try { audio.volume = Math.max(0, Math.min(1, automixState.aStartVolume || 1)); } catch (e) { } }
    else if (typeof nextTrack === 'function') nextTrack();
  } else {
    // 出 deck 停止（收养后 audio 已指向 B）
    try { if (automixState.suppressedOnEndedSrc && automixState.suppressedOnEndedSrc !== audio) { automixState.suppressedOnEndedSrc.pause(); } } catch (e) { }
  }
  var oldA = automixState.suppressedOnEndedSrc;
  if (oldA && oldA !== audio) { try { oldA.pause(); oldA.src = ''; } catch (e) { } }
  automixResetState();
}

function automixAbort(reason) {
  if (automixState.fadeRaf) cancelAnimationFrame(automixState.fadeRaf);
  if (audio && automixState.phase === 'fading') {
    resetTempoBend(audio);
    try { audio.volume = Math.max(0, Math.min(1, automixState.aStartVolume || 1)); } catch (e) { }
  }
  if (automixState.bDeck) { try { automixState.bDeck.pause(); automixState.bDeck.src = ''; } catch (e) { } }
  // 恢复被抑制的常规切歌语义（同一元素上原样还回保存的 handler）
  var src = automixState.suppressedOnEndedSrc;
  var savedEnded = automixState.suppressedOnEnded;
  if (src && src === audio && savedEnded) {
    try { audio.onended = savedEnded; } catch (e) { }
  } else if (src && src !== audio) {
    try { src.pause(); src.src = ''; } catch (e) { }
  }
  if (reason) console.log('[Automix] aborted: ' + reason);
  automixResetState();
}

function automixResetState() {
  automixState.phase = 'idle';
  automixState.bDeck = null;
  automixState.bData = null;
  automixState.bSongKey = '';
  automixState.bNextIdx = -1;
  automixState.plan = null;
  automixState.fadeRaf = 0;
  automixState.aStartVolume = 1;
  automixState.suppressedOnEnded = null;
  automixState.suppressedOnEndedSrc = null;
}

// 切歌时由 playQueueAt 调用：新歌开始，旧的过渡状态全部作废
function automixOnTrackSwitched() {
  if (automixState.phase === 'fading' || automixState.phase === 'settling') return; // 交接路径自身触发
  automixAbort('');
}

// ---------- DIY 控制台 UI ----------

function updateAutomixConsoleState() {
  var toggle = document.getElementById('t-automix');
  if (toggle) toggle.classList.toggle('on', !!(fx && fx.automixEnabled));
  var seg = document.getElementById('automix-mode-seg');
  if (seg) {
    var mode = fx && fx.automixMode === 'crossfade' ? 'crossfade' : 'automix';
    seg.querySelectorAll('button').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-automix-mode') === mode);
    });
  }
}

function toggleAutomixEnabled() {
  automixSetEnabled(!(fx && fx.automixEnabled));
  updateAutomixConsoleState();
  if (typeof showToast === 'function') showToast(fx.automixEnabled ? '智能混音：开（下一首起生效）' : '智能混音：关');
}

function setAutomixMode(mode) {
  fx.automixMode = mode === 'crossfade' ? 'crossfade' : 'automix';
  if (typeof scheduleLyricLayoutSave === 'function') scheduleLyricLayoutSave(120);
  updateAutomixConsoleState();
}

(function bindAutomixConsoleControls() {
  function bind() {
    var seg = document.getElementById('automix-mode-seg');
    if (seg && !seg.__automixBound) {
      seg.__automixBound = true;
      seg.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () { setAutomixMode(btn.getAttribute('data-automix-mode')); });
      });
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
})();
