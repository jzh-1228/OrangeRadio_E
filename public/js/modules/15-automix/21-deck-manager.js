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
  bPreparing: false,        // 取播放数据在飞标志（tick 节流 400ms，防重复发起+Audio 泄漏）
  prepareTicket: 0,         // 在途 prepare 作废票据：abort/reset 后晚到的响应不再安装
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
  if (!next) return false; // 空洞队列防御：null fall-through 会在 automixTick 解引用崩溃
  if (next.type === 'local' || next.source === 'local' || next.localUrl) return false; // 本地歌 2a 暂保守跳过（文件直连）
  return true;
}

// armed 存续条件复核（automixCanAttempt 仅适用于 idle——它第二行就排除非 idle 相位；
// armed 相位由本函数复核，armed→fading 的推进则由 automixPumpArmed 的 rAF 逐帧负责）
function automixArmedStillValid() {
  if (!fx || !fx.automixEnabled) return false;
  if (!audio || audio.paused || !isFinite(audio.duration) || audio.duration <= 0) return false;
  if (playMode === 'single') return false;
  if (typeof albumGaplessState !== 'undefined' && albumGaplessState.preload) return false;
  if (typeof cuefieldAutoMixExecuting !== 'undefined' && cuefieldAutoMixExecuting) return false;
  if (typeof cuefieldAutoMixEnabled !== 'undefined' && cuefieldAutoMixEnabled) return false;
  var idx = automixState.bNextIdx;
  if (idx < 0 || idx >= playQueue.length) return false;
  if (queueItemKey(playQueue[idx]) !== automixState.bSongKey) return false;
  var plan = automixState.plan;
  if (plan && plan.outStart - (audio.currentTime || 0) > AUTOMIX_ARM_LEAD_SEC + 2) return false; // seek 后退，过渡窗已过
  return true;
}

// 主循环挂载点：窗口检测 + 布防 + 交接时序
function automixTick(nowMs) {
  if (automixState.phase === 'fading' || automixState.phase === 'settling') return;
  if (nowMs - automixState.lastTickAt < AUTOMIX_TICK_INTERVAL_MS) return;
  automixState.lastTickAt = nowMs;
  if (automixState.phase === 'armed') {
    if (!automixArmedStillValid()) automixAbort('conditions-changed');
    return; // 布防期只做存续复核；到点推进 fading 由 automixPumpArmed 逐帧轮询
  }
  if (!automixCanAttempt()) return;
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

  // 预载（一次性）：B 元素 + 播放数据。取数是网络请求（resolveAlbumGaplessPlaybackData → apiJson），
  // tick 每 400ms 一次，无在飞标志会并发多份请求并各自 new Audio 覆盖 bDeck（泄漏）。
  if (!automixState.bDeck && !automixState.bPreparing) {
    automixState.bPreparing = true;
    var ticket = ++automixState.prepareTicket;
    automixPrepareDeck(nextIdx, next, plan, ticket).catch(function (err) {
      console.warn('[Automix] prepare failed:', err && err.message);
      automixAbort('prepare-failed');
    }).finally(function () {
      if (ticket === automixState.prepareTicket) automixState.bPreparing = false;
    });
    return;
  }
  if (automixState.phase === 'idle' && timeLeftToOut <= AUTOMIX_ARM_LEAD_SEC + 0.05) {
    automixArm(plan);
  }
}

async function automixPrepareDeck(nextIdx, song, plan, ticket) {
  var data = await resolveAlbumGaplessPlaybackData(song);
  if (!data || !data.url) throw new Error('no playback url');
  if (ticket !== automixState.prepareTicket) return; // 已被 abort/新一轮 prepare 取代：静默丢弃，不安装
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
    var wantGrid = automixSettings().mode === 'automix' && typeof canRunBeatThis === 'function' && canRunBeatThis();
    setAnalysisScope([playQueue[currentIdx], song]);
    ensureTrackProfile({ song: song, wantGrid: wantGrid, audioUrl: proxyUrl, enableMediaCache: false });
    ensureTrackProfile({ song: playQueue[currentIdx], wantGrid: wantGrid, audioUrl: audio && audio.src, enableMediaCache: false });
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
  // 等功率曲线：出场曲从当前音量滑到 0，进场曲 0 → 目标音量；together 平台段由曲线形状给出。
  // buildCrossfadeCurves 签名是 (crossover, together, points)：crossover 为 0~1 的交叉点进度
  // （非秒数）、points 为采样点数（非样式权重）。此前把 totalSec 传给 crossover、样式权重传给
  // points，导致 Float32Array 长度为 0 → step() 取值恒 undefined → volume=NaN 抛 TypeError。
  // crossover 取中点 0.5（planner 未携带该字段时的保守值，同 folia crossoverFor 无证据默认）。
  var totalSec = Math.max(0.3, plan.overlap);
  var steps = Math.max(8, Math.round(totalSec * 30));
  var curves = buildCrossfadeCurves(0.5, plan.style === 'plainBlend' ? 0 : 0.35, steps);
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
  var adoptable = !!(bEl && data && data.url && !bEl.error && bEl.src && currentIdx === idx - 1 && idx >= 0 && idx < playQueue.length);
  if (!adoptable) {
    // 回退：静音 B，恢复 A，常规切歌接管
    if (bEl) { try { bEl.pause(); } catch (e) { } bEl.src = ''; }
    if (audio && !audio.ended) {
      try { audio.volume = Math.max(0, Math.min(1, automixState.aStartVolume || 1)); } catch (e) { }
      // A 还要继续播完：还回被抑制的常规 onended（fading 期的 settleOnEnded 在 phase
      // 归 idle 后是空转，不恢复则 A 播完不再自动切歌——终审发现）
      var savedEnded = automixState.suppressedOnEnded;
      if (automixState.suppressedOnEndedSrc === audio && savedEnded) {
        try { audio.onended = savedEnded; } catch (e) { }
      }
    }
    else if (typeof nextTrack === 'function') nextTrack();
    automixFinishSettle();
    return;
  }
  bEl.volume = Math.max(0.2, Math.min(1, automixState.aStartVolume || 1));
  // 收养通道与 albumGapless handoff 一致：不重新取数、收养预载元素。
  // playQueueAt 是 async 函数，恒返回 Promise——`=== true` 同步比较恒 false（旧代码因此
  // 必然走进回退分支，把刚被收养的新歌元素 pause 并清空 src，播放链中断）。
  // 其同步段已完成收养（currentIdx/trackSwitchToken/全局 audio/UI 全部切到 B），必须等
  // Promise 终态再收尾；失败时 playQueueAt 内部有自己的自动兜底链，此处不得再动 bEl。
  Promise.resolve(playQueueAt(idx, {
    albumGaplessHandoff: true,
    automixAdopted: true,
    albumGaplessMixed: true,
    preloadedAudio: bEl,
    preloadedData: data,
    suppressPlayFailureNotice: true
  })).then(function () { automixFinishSettle(); }, function () { automixFinishSettle(); });
}

function automixFinishSettle() {
  // 出 deck 停止（收养后 audio 已指向 B）
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
  automixState.bPreparing = false;
  automixState.prepareTicket += 1; // 在途 prepare 的晚到响应作废
  automixState.plan = null;
  automixState.fadeRaf = 0;
  automixState.aStartVolume = 1;
  automixState.suppressedOnEnded = null;
  automixState.suppressedOnEndedSrc = null;
}

// 切歌时由 playQueueAt 调用：新歌开始，旧的过渡状态全部作废
function automixOnTrackSwitched() {
  if (automixState.phase === 'settling') return; // 交接路径自身触发（automixSettle→playQueueAt 收养）
  // armed/fading 时段的切歌只可能来自外部（用户手动切歌等）：必须终止过渡——
  // 否则 fade step 的 rAF 仍以 phase==='fading' 运行，且闭包读全局 audio，会把切换后
  // 新元素的 volume 按出场曲线逐帧压向 0，同时旧 B 元素继续出声，fading 状态卡死。
  automixAbort('track-switched');
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

// ---------- 模型下载管理（automix-model-panel） ----------

var automixModelProgressSubscribed = false;
// 主进程 status() 只返回 path/downloading（无 installed/progress 字段）；
// 百分比来自 automix-model-progress 事件的 {name, received, total}，本地维护最近值。
var automixModelProgress = {};

function automixModelInstalled(m) { return !!(m && m.path); }

function automixRenderModelState() {
  var panel = document.getElementById('automix-model-panel');
  if (!panel || !window.electron || typeof window.electron.getAutomixModelStatus !== 'function') return;
  window.electron.getAutomixModelStatus().then(function (status) {
    if (!status) return;
    var list = panel.querySelector('.automix-model-list');
    if (!list) return;
    var html = '';
    (status.models || []).forEach(function (m) {
      var installed = automixModelInstalled(m);
      var prog = automixModelProgress[m.name];
      var state = installed ? '已安装'
        : (m.downloading ? (typeof prog === 'number' ? Math.round(prog * 100) + '%' : '下载中') : '未安装');
      html += '<div class="automix-model-row" data-model="' + (m.name || '') + '">' +
        '<span class="automix-model-name">' + (m.label || m.name || '') + (m.bytes ? ' · ' + (m.bytes / 1048576).toFixed(0) + 'MB' : '') + '</span>' +
        '<span class="automix-model-state">' + state + '</span>' +
        (installed || m.downloading
          ? (m.downloading ? '<button type="button" class="automix-model-btn" data-action="cancel">取消</button>' : '')
          : '<button type="button" class="automix-model-btn" data-action="download">下载</button>') +
        '</div>';
    });
    var manual = status.manual;
    if (manual && Array.isArray(manual.links) && manual.links.length) {
      html += '<div class="automix-model-row automix-model-manual"><span class="automix-model-hint">下载慢？网盘手动下载：' +
        manual.links.map(function (link) {
          return '<a href="' + link.url + '" target="_blank" rel="noopener noreferrer">' + (link.label || '网盘') +
            (link.code ? '（提取码 ' + link.code + '）' : '') + '</a>';
        }).join(' · ') + '</span></div>';
    }
    var anyInstalled = (status.models || []).some(function (m) { return automixModelInstalled(m); });
    if (anyInstalled) {
      html += '<div class="automix-model-row"><span class="automix-model-hint">删除已下载的模型释放磁盘</span>' +
        '<button type="button" class="automix-model-btn" data-action="remove-all">删除全部模型</button></div>';
    }
    list.innerHTML = html || '<div class="automix-model-row"><span class="automix-model-hint">拍点检测与人声分离模型可选装（完全体混音）</span></div>';
  }).catch(function () { });
}

function automixBindModelPanel() {
  var panel = document.getElementById('automix-model-panel');
  if (!panel || panel.__automixBound) return;
  panel.__automixBound = true;
  panel.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('.automix-model-btn') : null;
    if (!btn || !window.electron) return;
    var row = btn.closest('.automix-model-row');
    var name = row && row.getAttribute('data-model');
    if (!name) return;
    var action = btn.getAttribute('data-action');
    if (action === 'remove-all') {
      if (window.electron.removeAutomixModels) {
        window.electron.removeAutomixModels().then(function () {
          automixRenderModelState();
          if (typeof refreshModelAvailability === 'function') refreshModelAvailability();
        }).catch(function () { });
      }
      return;
    }
    if (!name) return;
    if (action === 'cancel') window.electron.cancelAutomixModelDownload(name);
    else window.electron.downloadAutomixModel(name);
  });
  if (!automixModelProgressSubscribed && typeof window !== 'undefined' && window.electron && typeof window.electron.onAutomixModelProgress === 'function') {
    automixModelProgressSubscribed = true;
    window.electron.onAutomixModelProgress(function (p) {
      if (p && p.name && Number(p.total) > 0) {
        automixModelProgress[p.name] = Math.max(0, Math.min(1, Number(p.received) / Number(p.total)));
      }
      automixRenderModelState();
      if (typeof refreshModelAvailability === 'function') refreshModelAvailability();
    });
  }
  setInterval(automixRenderModelState, 5000);
  automixRenderModelState();
}

(function scheduleAutomixModelPanel() {
  function go() { automixBindModelPanel(); }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }
})();

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
