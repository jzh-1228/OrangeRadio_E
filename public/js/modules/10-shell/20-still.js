/* =========================================================================
   OrangeSea · 静止（Still · 移植自 Folia still 视觉模式）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0):
     src/components/visualizer/still/entry.tsx / VisualizerStill.tsx

   静态低资源歌词模式：无 canvas、无动画库、无粒子——只有
   ① 中心径向暗角（Folia: radial-gradient(ellipse at center,
      transparent 0%, #000 100%) 夜间 0.65 档 → 本项目不透明覆盖层，
      等价为暖黑基底上中心微亮、边缘压黑的径向渐变）；
   ② 当前行 ±1 的三行静态歌词（Folia 数值直译：主行 40px/700，
      邻行 30px/600·30% 透明，翻译主行 24px/500·80%、邻行 20px/400·30%）。
   React useState 的索引回退语义原样保留：currentLineIndex === -1
   （前奏/间奏）时保持上一行不动，仅歌词列表变短越界时回退第 0 行。

   宿主替换：React 生命周期 → applyStillMode(on,{save}) 显式进出；
   MotionValue → motionSignalGet('currentTime')（主循环暂停时停写信号，
   与 audio.currentTime 偏差超阈值即以实测回退）；useEffect rAF →
   自有 30fps 循环（lyricsLines 是无事件普通数组，同胶片/流光范式，
   用「行索引/行数/首末行时间」零分配四元签名检测切歌）。
   ========================================================================= */

var STILL_STORE_KEY = 'orangesea-still-lyrics-v1';
var stillMode = readBooleanPreference(STILL_STORE_KEY, false);
var stillRafId = 0;
var stillLastFontKey = null;    /* 字体变化检测（fx.lyricFont 实时同步，与流光/雨窗一致） */

/* Folia VisualizerStill 的 useState(effectiveIndex) 直译（初始 max(0, idx) → 0） */
var stillEffectiveIndex = 0;

/* 渲染签名四元组（全数字比较，每帧零分配）：行索引/行数/首行 t/末行 t */
var stillSigIdx = -1;
var stillSigLen = -1;
var stillSigFirstT = -1;
var stillSigLastT = -1;

/* ---------- 切换 ---------- */
function applyStillMode(on, opts) {
  opts = opts || {};
  stillMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它覆盖层 */
  if (stillMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('still', { save: true });
  }
  document.body.classList.toggle('still', stillMode);
  var overlay = document.getElementById('still-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', stillMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(STILL_STORE_KEY, stillMode);
  if (stillMode) {
    startStill();
  } else {
    stopStill();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(stillMode ? '静止歌词已开启' : '已切回标准模式');
}

function toggleStillMode() {
  applyStillMode(!stillMode, { save: true, toast: true });
}

/* ---------- 启动 / 停止 ---------- */
function startStill() {
  /* 字号跟随「歌词大小」设置（--mfs，CSS 主行乘算） */
  if (typeof applyOverlayModeFontScale === "function") applyOverlayModeFontScale(document.getElementById("still-overlay"));
  stillFontStack();
  invalidateStillSignature();
  startStillLoop();
}

function stopStill() {
  stopStillLoop();
  clearStillLines();
}

function invalidateStillSignature() {
  stillSigIdx = -1;
  stillSigLen = -1;
  stillSigFirstT = -1;
  stillSigLastT = -1;
}

/* ---------- 字体跟随用户歌词字体选择（fx.lyricFont，与流光/雨窗/涂鸦一致） ---------- */
function stillFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  var overlay = document.getElementById('still-overlay');
  if (overlay) overlay.style.setProperty('--st-font', stack);
  return stack;
}

function checkStillFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (stillLastFontKey !== fontKey) {
    stillLastFontKey = fontKey;
    stillFontStack();
  }
}

/* ---------- 播放时间（MotionValue → motionSignalGet；lyric timing offset 生效） ---------- */
function stillPlaybackTime() {
  var raw = (typeof motionSignalGet === 'function') ? motionSignalGet('currentTime') : 0;
  if (typeof raw !== 'number' || !isFinite(raw) || raw < 0) raw = 0;
  if (typeof audio !== 'undefined' && audio) {
    var at = audio.currentTime || 0;
    /* 暂停/seek 时主循环停写信号（冻结旧值），以 audio 实测为准 */
    if (Math.abs(at - raw) > 0.05) raw = at;
  }
  try {
    if (typeof getAdjustedLyricPlaybackTime === 'function') return getAdjustedLyricPlaybackTime(raw);
  } catch (e) { }
  return raw;
}

/* Folia VisualizerStill.tsx useEffect 索引回退的直译：
   currentLineIndex !== -1 → 跟随；否则（前奏/间奏）保持上一行，
   仅当歌词列表变短导致越界时回退第 0 行。 */
function updateStillEffectiveIndex(currentIdx, lineCount) {
  if (currentIdx !== -1) {
    stillEffectiveIndex = currentIdx;
  } else if (stillEffectiveIndex >= lineCount) {
    stillEffectiveIndex = 0;
  }
}

/* ---------- 三行渲染（Folia [-1,0,1].map(offset) 布局直译） ----------
   行缺失 → 空 slot（CSS h-20=5rem 占位）；
   主文本/翻译各自按 fullText/translation 存在性渲染（textContent 赋值天然防注入）。 */
function renderStillSlot(kind, lineIdx) {
  var slot = document.getElementById('still-slot-' + kind);
  var textEl = document.getElementById('still-text-' + kind);
  var trEl = document.getElementById('still-tr-' + kind);
  if (!slot || !textEl || !trEl) return;
  var line = (lineIdx >= 0 && typeof lyricsLines !== 'undefined' && lyricsLines &&
    lineIdx < lyricsLines.length) ? lyricsLines[lineIdx] : null;
  if (!line) {
    if (!slot.classList.contains('empty')) slot.classList.add('empty');
    if (textEl.textContent !== '') textEl.textContent = '';
    if (trEl.textContent !== '') trEl.textContent = '';
    return;
  }
  if (slot.classList.contains('empty')) slot.classList.remove('empty');
  var text = (typeof line.text === 'string') ? line.text : '';
  var tr = (typeof line.translation === 'string') ? line.translation : '';
  /* Folia: line.fullText 为 falsy 时不渲染主文本；translation 同理（hideTranslationSubtitle 恒 false，Folia 默认） */
  if (textEl.textContent !== text) textEl.textContent = text;
  textEl.classList.toggle('still-hidden', !text.trim());
  if (trEl.textContent !== tr) trEl.textContent = tr;
  trEl.classList.toggle('still-hidden', !tr.trim());
}

function clearStillLines() {
  stillEffectiveIndex = 0;
  invalidateStillSignature();
  renderStillSlot('prev', -1);
  renderStillSlot('main', -1);
  renderStillSlot('next', -1);
}

/* ---------- 行定位 tick（30fps；签名不变则零 DOM 操作零分配） ---------- */
function tickStill() {
  if (!stillMode) return;
  var len = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines.length : 0;
  var nowTime = stillPlaybackTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(nowTime);
  } catch (e) { idx = -1; }
  if (idx < 0) idx = -1;
  updateStillEffectiveIndex(idx, len);
  /* 切歌检测：行数或首末行时间变化即视为歌词数据更换（无事件数组范式） */
  var firstT = len ? (Number(lyricsLines[0] && lyricsLines[0].t) || 0) : 0;
  var lastT = len ? (Number(lyricsLines[len - 1] && lyricsLines[len - 1].t) || 0) : 0;
  if (stillEffectiveIndex !== stillSigIdx || len !== stillSigLen ||
    firstT !== stillSigFirstT || lastT !== stillSigLastT) {
    stillSigIdx = stillEffectiveIndex;
    stillSigLen = len;
    stillSigFirstT = firstT;
    stillSigLastT = lastT;
    renderStillSlot('prev', stillEffectiveIndex - 1);
    renderStillSlot('main', stillEffectiveIndex);
    renderStillSlot('next', stillEffectiveIndex + 1);
  }
}

/* ---------- 主循环（rAF 节流 ~30fps；静态模式本就近零开销） ---------- */
function startStillLoop() {
  stopStillLoop();
  var lastTick = 0;
  function frame(now) {
    if (!stillMode) return;
    if (now - lastTick > 33) {
      lastTick = now;
      tickStill();
      checkStillFontChange();
    }
    stillRafId = requestAnimationFrame(frame);
  }
  stillRafId = requestAnimationFrame(frame);
}

function stopStillLoop() {
  if (stillRafId) {
    cancelAnimationFrame(stillRafId);
    stillRafId = 0;
  }
}

/* ---------- 启动绑定 ---------- */
function initStill() {
  applyStillMode(stillMode, { save: false });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initStill, 300) : setTimeout(initStill, 300);
