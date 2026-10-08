/* =========================================================================
   OrangeSea · 队列拼贴（Lattice · 播放队列封面海报墙 + 正在播放卡片）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0)
   -------------------------------------------------------------------------
   Folia Lattice 队列展示面的原生等价：整个 playQueue 投影成一面海报墙
   （编号徽章 1 起、已播/在播/待播三态，播放头是唯一真相源），当前播放
   海报描边高亮并自动滚到视口中央；中央浮"正在播放"卡片——封面、歌名、
   原词与翻译对照的当前句、进度与走带。纯 DOM 零 canvas 零 rAF，全部
   轮询驱动（队列 600ms / 卡片 300ms），只在值变化时写 DOM。
   覆盖层范式与胶片电台/烟纸一致：bodyClass + localStorage + 注册表互斥。
   ========================================================================= */

var LATTICE_STORE_KEY = 'orangesea-lattice-mode-v1';
var latticeMode = readBooleanPreference(LATTICE_STORE_KEY, false);
var latticePrevQuality = null;
var latticeQueueToken = 0;
var latticeLastWallKey = '';
var latticeLastCurrentIdx = -1;
var latticeLastLineIdx = -99;
var latticeLastProgress = '';
var latticeCardHidden = false;

/* ---------- 纯工具（测试直接覆盖 window.*） ---------- */

function latticeBadgeText(queueIndex) {
  /* 海报徽章：1 起，两位补零（与原版 number badge 一致） */
  var n = Math.max(0, Math.floor(Number(queueIndex) || 0)) + 1;
  return n < 10 ? '0' + n : String(n);
}

function latticeSectionFor(index, currentIndex) {
  /* 播放头分区：now / played（已播压暗）/ upcoming */
  index = Math.floor(Number(index) || 0);
  currentIndex = Math.floor(Number(currentIndex));
  if (currentIndex >= 0 && index === currentIndex) return 'now';
  if (currentIndex >= 0 && index < currentIndex) return 'played';
  return 'upcoming';
}

function latticeFallbackGradient(id) {
  /* 无封面海报：按 id 稳定取色相的双色渐变（Folia fallbackBackground 同款） */
  var text = String(id || '');
  var sum = 0;
  for (var i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  var hue = sum % 360;
  return 'linear-gradient(145deg, hsl(' + hue + ' 68% 58%), hsl(' + ((hue + 52) % 360) + ' 62% 18%))';
}

function latticeQueueKey(queue, currentIndex) {
  /* 队列指纹：长度 + 当前位 + 封面/歌名拼接——任何变化重建海报墙 */
  var parts = [String((queue && queue.length) || 0), String(currentIndex == null ? -1 : currentIndex)];
  if (queue) {
    for (var i = 0; i < queue.length; i++) {
      var s = queue[i] || {};
      parts.push((s.name || s.title || '') + '\u0001' + (s.cover || '') + '\u0001' + (s.id || ''));
    }
  }
  return parts.join('\u0002');
}

function latticeFormatTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function latticeCurrentLyricLine() {
  try {
    var t = getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
    var idx = (typeof findStageLyricIndexAtTime === 'function') ? findStageLyricIndexAtTime(t) : -1;
    if (idx < 0 || typeof lyricsLines === 'undefined' || !lyricsLines) return null;
    var line = lyricsLines[idx];
    if (!line) return null;
    var text = String(line.text || '').trim();
    if (!text) return null;
    return { index: idx, text: text, translation: String(line.translation || '').trim() };
  } catch (e) {
    return null;
  }
}

/* ---------- 海报墙 ---------- */

function latticeBuildWall() {
  var wall = document.getElementById('lattice-wall');
  if (!wall) return;
  var queue = (typeof playQueue !== 'undefined' && playQueue) ? playQueue : [];
  var currentIdx = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
  var key = latticeQueueKey(queue, currentIdx);
  if (key === latticeLastWallKey && wall.childElementCount) return;
  latticeLastWallKey = key;

  var empty = document.getElementById('lattice-empty');
  if (empty) empty.classList.toggle('is-shown', queue.length === 0);

  wall.textContent = '';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (var i = 0; i < queue.length; i++) {
    var song = queue[i] || {};
    var section = latticeSectionFor(i, currentIdx);
    var poster = document.createElement('div');
    poster.className = 'lattice-poster'
      + (section === 'played' ? ' is-played' : '')
      + (section === 'now' ? ' is-current' : '');
    poster.tabIndex = 0;
    poster.setAttribute('role', 'button');
    poster.dataset.queueIndex = String(i);
    var cover = song.cover || '';
    if (cover) {
      poster.style.backgroundImage = 'url("' + cover.replace(/"/g, '%22') + '")';
    } else {
      poster.style.background = latticeFallbackGradient(song.id || song.name || ('q' + i));
    }
    if (!reduced) poster.style.animationDelay = Math.min(i * 18, 640) + 'ms';

    var num = document.createElement('div');
    num.className = 'lattice-poster-num';
    num.textContent = latticeBadgeText(i);
    poster.appendChild(num);

    if (section === 'now') {
      var now = document.createElement('div');
      now.className = 'lattice-poster-now';
      now.innerHTML = '<span class="dot"></span>正在播放';
      poster.appendChild(now);
    }

    var meta = document.createElement('div');
    meta.className = 'lattice-poster-meta';
    var title = document.createElement('div');
    title.className = 'lattice-poster-title';
    title.textContent = song.name || song.title || '未知曲目';
    var artist = document.createElement('div');
    artist.className = 'lattice-poster-artist';
    artist.textContent = song.artist || song.album || '';
    meta.appendChild(title);
    meta.appendChild(artist);
    poster.appendChild(meta);

    poster.addEventListener('click', function (ev) {
      var idx = Number(this.dataset.queueIndex);
      if (Number.isFinite(idx) && typeof playQueueAt === 'function') {
        playQueueAt(idx);
        ev.stopPropagation();
      }
    });
    poster.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var idx = Number(this.dataset.queueIndex);
      if (Number.isFinite(idx) && typeof playQueueAt === 'function') {
        playQueueAt(idx);
        ev.preventDefault();
      }
    });
    wall.appendChild(poster);
  }
  latticeLastCurrentIdx = currentIdx;
  latticeCenterCurrent(false);
}

function latticeCenterCurrent(smooth) {
  var wall = document.getElementById('lattice-wall');
  if (!wall) return;
  var currentIdx = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
  if (currentIdx < 0) return;
  var target = wall.querySelector('.lattice-poster[data-queue-index="' + currentIdx + '"]');
  if (target && target.scrollIntoView) {
    try { target.scrollIntoView({ behavior: smooth === false ? 'auto' : 'smooth', block: 'center' }); }
    catch (e) { target.scrollIntoView(); }
  }
}

/* 队列轮询：指纹或播放头变化 → 增量更新三态类 + 自动居中（不重建墙，避免打断滚动） */
function latticeWatchQueue() {
  var token = ++latticeQueueToken;
  function check() {
    if (token !== latticeQueueToken || !latticeMode) return;
    var queue = (typeof playQueue !== 'undefined' && playQueue) ? playQueue : [];
    var currentIdx = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
    var key = latticeQueueKey(queue, currentIdx);
    if (key !== latticeLastWallKey) {
      latticeBuildWall();
      latticeRefreshCardMeta();   /* 重建路径（洗牌重排/队列增删）也要换卡面 */
    } else if (currentIdx !== latticeLastCurrentIdx) {
      latticeLastCurrentIdx = currentIdx;
      latticeRefreshSections();
      latticeCenterCurrent(true);
      latticeRefreshCardMeta();
    }
    setTimeout(check, 600);
  }
  check();
}

function latticeRefreshSections() {
  var wall = document.getElementById('lattice-wall');
  if (!wall) return;
  var currentIdx = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
  var posters = wall.children;
  for (var i = 0; i < posters.length; i++) {
    var poster = posters[i];
    var idx = Number(poster.dataset.queueIndex);
    if (!Number.isFinite(idx)) continue;
    var section = latticeSectionFor(idx, currentIdx);
    poster.classList.toggle('is-played', section === 'played');
    poster.classList.toggle('is-current', section === 'now');
    if (section === 'now' && !poster.querySelector('.lattice-poster-now')) {
      var now = document.createElement('div');
      now.className = 'lattice-poster-now';
      now.innerHTML = '<span class="dot"></span>正在播放';
      poster.appendChild(now);
    } else if (section !== 'now') {
      var old = poster.querySelector('.lattice-poster-now');
      if (old) old.remove();
    }
  }
}

/* ---------- 正在播放卡片 ---------- */

function latticeRefreshCardMeta() {
  var song = (typeof playQueue !== 'undefined' && playQueue && window.currentIdx >= 0)
    ? (playQueue[window.currentIdx] || {}) : {};
  var cover = document.getElementById('lattice-card-cover');
  if (cover) {
    if (song.cover) {
      cover.style.background = '';
      cover.style.backgroundImage = 'url("' + song.cover.replace(/"/g, '%22') + '")';
    } else {
      cover.style.backgroundImage = '';
      cover.style.background = latticeFallbackGradient(song.id || song.name || 'now');
    }
  }
  var title = document.getElementById('lattice-card-title');
  var artist = document.getElementById('lattice-card-artist');
  if (title) title.textContent = song.name || song.title || '未在播放';
  if (artist) artist.textContent = song.artist || song.album || '';
  latticeLastLineIdx = -99;   /* 强制下一拍刷新歌词 */
}

function latticeCardTick() {
  /* 歌词行 + 进度 + 时间：值变化才写 DOM */
  var line = latticeCurrentLyricLine();
  var lineIdx = line ? line.index : -1;
  if (lineIdx !== latticeLastLineIdx) {
    latticeLastLineIdx = lineIdx;
    var lineEl = document.getElementById('lattice-card-line');
    var trEl = document.getElementById('lattice-card-tr');
    if (lineEl) {
      lineEl.textContent = line ? line.text : '♪';
      lineEl.classList.toggle('is-empty', !line);
    }
    if (trEl) trEl.textContent = line ? line.translation : '';
  }
  var cur = (typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0;
  var dur = (typeof audio !== 'undefined' && audio && isFinite(audio.duration)) ? audio.duration : 0;
  var progress = dur > 0 ? (cur / dur) : 0;
  var progressKey = progress.toFixed(4) + '|' + Math.floor(cur);
  if (progressKey !== latticeLastProgress) {
    latticeLastProgress = progressKey;
    var bar = document.getElementById('lattice-card-progress-bar');
    if (bar) bar.style.width = (Math.min(1, Math.max(0, progress)) * 100).toFixed(2) + '%';
    var time = document.getElementById('lattice-card-time');
    if (time) time.textContent = latticeFormatTime(cur) + ' / ' + latticeFormatTime(dur);
  }
  latticeRefreshPlayIcon();
}

function latticeRefreshPlayIcon() {
  var playing = (typeof audio !== 'undefined' && audio) ? !audio.paused : false;
  var icon = document.getElementById('lattice-play-icon');
  if (!icon) return;
  var want = playing ? 'pause' : 'play';
  if (icon.dataset.state === want) return;
  icon.dataset.state = want;
  icon.setAttribute('d', playing
    ? 'M8 5.5v13M16 5.5v13'
    : 'M8 5.2l11 6.8-11 6.8z');
}

function latticeWatchCard() {
  function tick() {
    if (!latticeMode) return;
    latticeCardTick();
    setTimeout(tick, 300);
  }
  tick();
}

/* ---------- 卡片收起 / 唤起 ---------- */

function latticeSetCardHidden(hidden) {
  latticeCardHidden = !!hidden;
  var card = document.getElementById('lattice-card');
  var restore = document.getElementById('lattice-card-restore');
  if (card) card.classList.toggle('is-hidden', latticeCardHidden);
  if (restore) restore.classList.toggle('is-shown', latticeCardHidden);
}

/* ---------- 生命周期 ---------- */

function startLattice() {
  latticeLastWallKey = '';
  latticeLastCurrentIdx = -1;
  latticeLastLineIdx = -99;
  latticeLastProgress = '';
  latticeBuildWall();
  latticeRefreshCardMeta();
  latticeCardTick();
  latticeWatchQueue();
  latticeWatchCard();
  setTimeout(function () { if (latticeMode) latticeCenterCurrent(true); }, 60);
}

function stopLattice() {
  latticeQueueToken++;
  latticeLastWallKey = '';
  latticeLastCurrentIdx = -1;
}

function applyLatticeMode(on, opts) {
  opts = opts || {};
  latticeMode = !!on;
  /* 互斥：经视觉模式注册表退出其它覆盖层 */
  if (latticeMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('lattice', { save: true });
  }
  document.body.classList.toggle('lattice', latticeMode);
  var overlay = document.getElementById('lattice-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', latticeMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(LATTICE_STORE_KEY, latticeMode);
  if (latticeMode) {
    startLattice();
    /* 3D 主场景已被海报墙盖住：临时切 eco 质量档（退出恢复） */
    if (typeof fx !== 'undefined' && fx && latticePrevQuality === null) {
      latticePrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
  } else {
    stopLattice();
    if (latticePrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = latticePrevQuality;
      latticePrevQuality = null;
    }
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(latticeMode ? '队列拼贴已开启' : '已切回标准模式');
}

function toggleLatticeMode() {
  applyLatticeMode(!latticeMode, { save: true, toast: true });
}

/* 静态控件接线（返回 / 收起 / 唤起 / 走带） */
function initLattice() {
  var back = document.getElementById('lattice-back');
  if (back) back.addEventListener('click', function () { applyLatticeMode(false, { save: true }); });
  var toggle = document.getElementById('lattice-card-toggle');
  if (toggle) toggle.addEventListener('click', function () { latticeSetCardHidden(true); });
  var restore = document.getElementById('lattice-card-restore');
  if (restore) restore.addEventListener('click', function () { latticeSetCardHidden(false); });
  var prev = document.getElementById('lattice-prev-btn');
  if (prev) prev.addEventListener('click', function () { if (typeof prevTrack === 'function') prevTrack(true); });
  var play = document.getElementById('lattice-play-btn');
  if (play) play.addEventListener('click', function () { if (typeof togglePlay === 'function') togglePlay(); });
  var next = document.getElementById('lattice-next-btn');
  if (next) next.addEventListener('click', function () { if (typeof nextTrack === 'function') nextTrack(true); });
  applyLatticeMode(latticeMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initLattice, 320) : setTimeout(initLattice, 320);
