/* =========================================================================
   OrangeSea · 队列拼贴（Lattice · 播放队列封面海报墙）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0)
   -------------------------------------------------------------------------
   Folia Lattice 队列展示面的原生等价，三条铁律照搬原版：
   ① 墙只渲染队列、绝不改动队列（点击海报播放用 skipShuffleOrder，
     不触发随机重排——当前播放留在它在队列里的原位）；
   ② 海报严格平铺（grid 等距网格），不缩放不叠压邻居；
   ③ 当前播放的海报在墙中原位展开成一张横向大卡（grid-column: span 2）：
     封面 + 歌名歌手 + 实时滚动歌词（当前行高亮、原词翻译对照、自动居中）
     + 进度 + 走带。原版 latticeModel 的 now/played/upcoming 三态保留。
   纯 DOM 零 canvas 零 rAF：队列指纹 600ms / 歌词与进度 300ms 轮询，
   值变化才写 DOM。覆盖层范式与胶片电台/烟纸一致。
   ========================================================================= */

var LATTICE_STORE_KEY = 'orangesea-lattice-mode-v1';
var latticeMode = readBooleanPreference(LATTICE_STORE_KEY, false);
var latticePrevQuality = null;
var latticeQueueToken = 0;
var latticeLastWallKey = '';
var latticeLastCurrentIdx = -1;
var latticeLastLineIdx = -99;
var latticeLastProgress = '';
var latticeLastLyricsKey = '';

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

function latticeLyricsKey(lines) {
  /* 歌词集指纹：行数 + 首末文本——决定展开卡歌词区是否重建 */
  if (!lines || !lines.length) return '0';
  var first = lines[0] || {};
  var last = lines[lines.length - 1] || {};
  return lines.length + '\u0001' + (first.text || '') + '\u0001' + (last.text || '');
}

function latticeFormatTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function latticeCurrentLyricIndex() {
  try {
    var t = getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
    return (typeof findStageLyricIndexAtTime === 'function') ? findStageLyricIndexAtTime(t) : -1;
  } catch (e) {
    return -1;
  }
}

/* ---------- 海报墙 ---------- */

function latticeCoverStyle(poster, song, fallbackId) {
  var cover = song && song.cover;
  if (cover) {
    poster.style.background = '';
    poster.style.backgroundImage = 'url("' + cover.replace(/"/g, '%22') + '")';
  } else {
    poster.style.backgroundImage = '';
    poster.style.background = latticeFallbackGradient(fallbackId);
  }
}

/* 普通海报：封面 + 编号 + 在播徽章 + 歌名（当前海报另建展开卡） */
function latticeBuildPlainPoster(song, index, section) {
  var poster = document.createElement('div');
  poster.className = 'lattice-poster'
    + (section === 'played' ? ' is-played' : '')
    + (section === 'now' ? ' is-current' : '');
  poster.tabIndex = 0;
  poster.setAttribute('role', 'button');
  poster.dataset.queueIndex = String(index);
  latticeCoverStyle(poster, song, song.id || song.name || ('q' + index));

  var num = document.createElement('div');
  num.className = 'lattice-poster-num';
  num.textContent = latticeBadgeText(index);
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
  title.textContent = (song && (song.name || song.title)) || '未知曲目';
  var artist = document.createElement('div');
  artist.className = 'lattice-poster-artist';
  artist.textContent = (song && (song.artist || song.album)) || '';
  meta.appendChild(title);
  meta.appendChild(artist);
  poster.appendChild(meta);
  return poster;
}

/* 展开卡（当前播放海报的原位放大形态）：封面 + 信息 + 实时歌词 + 进度 + 走带 */
function latticeBuildExpandedPoster(song, index) {
  var poster = document.createElement('div');
  poster.className = 'lattice-poster is-current is-expanded';
  poster.dataset.queueIndex = String(index);

  var num = document.createElement('div');
  num.className = 'lattice-poster-num';
  num.textContent = latticeBadgeText(index);
  poster.appendChild(num);

  var art = document.createElement('div');
  art.className = 'lattice-expanded-art';
  latticeCoverStyle(art, song, song.id || song.name || 'now');
  poster.appendChild(art);

  var body = document.createElement('div');
  body.className = 'lattice-expanded-body';

  var info = document.createElement('div');
  info.className = 'lattice-expanded-info';
  var now = document.createElement('div');
  now.className = 'lattice-expanded-now';
  now.innerHTML = '<span class="dot"></span>正在播放';
  var title = document.createElement('div');
  title.className = 'lattice-expanded-title';
  title.textContent = (song && (song.name || song.title)) || '未知曲目';
  var artist = document.createElement('div');
  artist.className = 'lattice-expanded-artist';
  artist.textContent = (song && (song.artist || song.album)) || '';
  info.appendChild(now);
  info.appendChild(title);
  info.appendChild(artist);
  body.appendChild(info);

  var lyrics = document.createElement('div');
  lyrics.className = 'lattice-lyrics';
  lyrics.id = 'lattice-lyrics';
  body.appendChild(lyrics);

  var bottom = document.createElement('div');
  bottom.className = 'lattice-expanded-bottom';
  var progress = document.createElement('div');
  progress.className = 'lattice-expanded-progress';
  progress.innerHTML = '<div class="lattice-expanded-progress-bar" id="lattice-progress-bar"></div>';
  var controls = document.createElement('div');
  controls.className = 'lattice-expanded-controls';
  controls.innerHTML =
    '<button class="lattice-ctrl" data-lattice-act="prev" title="上一首"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5.2l9 6.8-9 6.8zM17 5h2v14h-2z"/></svg></button>' +
    '<button class="lattice-ctrl is-main" data-lattice-act="play" title="播放/暂停"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path class="lattice-play-icon" data-state="play" d="M8 5.2l11 6.8-11 6.8z"/></svg></button>' +
    '<button class="lattice-ctrl" data-lattice-act="next" title="下一首"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18 5.2l-9 6.8 9 6.8zM5 5h2v14H5z"/></svg></button>' +
    '<span class="lattice-expanded-time" id="lattice-time">0:00 / 0:00</span>';
  bottom.appendChild(progress);
  bottom.appendChild(controls);
  body.appendChild(bottom);

  poster.appendChild(body);
  return poster;
}

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
    var poster = (section === 'now' && i === currentIdx)
      ? latticeBuildExpandedPoster(song, i)
      : latticeBuildPlainPoster(song, i, section);
    if (!reduced) poster.style.animationDelay = Math.min(i * 18, 640) + 'ms';
    wall.appendChild(poster);
  }
  latticeLastCurrentIdx = currentIdx;
  latticeBuildLyrics();
  latticeLastLineIdx = -99;
  latticeCenterCurrent(false);
}

/* 展开卡歌词区：全量行（原词+翻译），当前行高亮由 tick 维护 */
function latticeBuildLyrics() {
  var box = document.getElementById('lattice-lyrics');
  if (!box) return;
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var key = latticeLyricsKey(lines);
  if (key === latticeLastLyricsKey && box.childElementCount) return;
  latticeLastLyricsKey = key;
  box.textContent = '';
  if (!lines.length) {
    var ph = document.createElement('div');
    ph.className = 'lattice-lyrics-empty';
    ph.textContent = '暂无歌词';
    box.appendChild(ph);
    return;
  }
  var frag = document.createDocumentFragment();
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i] || {};
    var text = String(line.text || '').trim();
    if (!text) continue;
    var row = document.createElement('div');
    row.className = 'lattice-lyrics-row';
    row.dataset.lineIndex = String(i);
    var main = document.createElement('div');
    main.className = 'lattice-lyrics-text';
    main.textContent = text;
    row.appendChild(main);
    var tr = String(line.translation || '').trim();
    if (tr) {
      var trEl = document.createElement('div');
      trEl.className = 'lattice-lyrics-tr';
      trEl.textContent = tr;
      row.appendChild(trEl);
    }
    frag.appendChild(row);
  }
  box.appendChild(frag);
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

/* 队列轮询：指纹变化 → 整墙重建（队列内容/播放头变了）；否则播放头位移走轻量换卡 */
function latticeWatchQueue() {
  var token = ++latticeQueueToken;
  function check() {
    if (token !== latticeQueueToken || !latticeMode) return;
    var queue = (typeof playQueue !== 'undefined' && playQueue) ? playQueue : [];
    var currentIdx = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
    var key = latticeQueueKey(queue, currentIdx);
    if (key !== latticeLastWallKey) {
      latticeBuildWall();
    }
    setTimeout(check, 600);
  }
  check();
}

/* ---------- 展开卡实时内容（歌词行 / 进度 / 图标） ---------- */

function latticeExpandedTick() {
  /* 歌词区：当前行高亮 + 平滑居中 */
  latticeBuildLyrics();
  var box = document.getElementById('lattice-lyrics');
  var lineIdx = latticeCurrentLyricIndex();
  if (lineIdx !== latticeLastLineIdx) {
    latticeLastLineIdx = lineIdx;
    if (box) {
      var rows = box.querySelectorAll('.lattice-lyrics-row');
      var targetRow = null;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var isNow = Number(row.dataset.lineIndex) === lineIdx;
        if (isNow && !row.classList.contains('is-now')) {
          row.classList.add('is-now');
          targetRow = row;
        } else if (!isNow && row.classList.contains('is-now')) {
          row.classList.remove('is-now');
        }
      }
      if (!targetRow) targetRow = box.querySelector('.lattice-lyrics-row.is-now');
      if (targetRow && targetRow.scrollIntoView) {
        try { targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        catch (e) { /* 展开卡不在墙上时忽略 */ }
      }
    }
  }
  /* 进度与时间 */
  var cur = (typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0;
  var dur = (typeof audio !== 'undefined' && audio && isFinite(audio.duration)) ? audio.duration : 0;
  var ratio = dur > 0 ? Math.min(1, Math.max(0, cur / dur)) : 0;
  var progressKey = ratio.toFixed(4) + '|' + Math.floor(cur);
  if (progressKey !== latticeLastProgress) {
    latticeLastProgress = progressKey;
    var bar = document.getElementById('lattice-progress-bar');
    if (bar) bar.style.width = (ratio * 100).toFixed(2) + '%';
    var time = document.getElementById('lattice-time');
    if (time) time.textContent = latticeFormatTime(cur) + ' / ' + latticeFormatTime(dur);
  }
  /* 播放/暂停图标 */
  var playing = (typeof audio !== 'undefined' && audio) ? !audio.paused : false;
  var icons = document.querySelectorAll('.lattice-play-icon');
  for (var k = 0; k < icons.length; k++) {
    var icon = icons[k];
    var want = playing ? 'pause' : 'play';
    if (icon.getAttribute('data-state') !== want) {
      icon.setAttribute('data-state', want);
      icon.setAttribute('d', playing ? 'M8 5.5v13M16 5.5v13' : 'M8 5.2l11 6.8-11 6.8z');
    }
  }
}

function latticeWatchExpanded() {
  function tick() {
    if (!latticeMode) return;
    latticeExpandedTick();
    setTimeout(tick, 300);
  }
  tick();
}

/* ---------- 交互（事件委托：一墙一监听） ---------- */

function latticeHandleWallClick(ev) {
  var actBtn = ev.target && ev.target.closest ? ev.target.closest('[data-lattice-act]') : null;
  if (actBtn) {
    var act = actBtn.getAttribute('data-lattice-act');
    if (act === 'prev' && typeof prevTrack === 'function') prevTrack(true);
    else if (act === 'play' && typeof togglePlay === 'function') togglePlay();
    else if (act === 'next' && typeof nextTrack === 'function') nextTrack(true);
    ev.stopPropagation();
    return;
  }
  var poster = ev.target && ev.target.closest ? ev.target.closest('.lattice-poster') : null;
  if (!poster || poster.classList.contains('is-expanded')) return;
  var idx = Number(poster.dataset.queueIndex);
  if (Number.isFinite(idx) && typeof playQueueAt === 'function') {
    /* 原版铁律：墙不改队列——skipShuffleOrder 让点击曲留在原位播放 */
    playQueueAt(idx, { skipShuffleOrder: true });
  }
}

function latticeHandleWallKey(ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  var poster = ev.target && ev.target.closest ? ev.target.closest('.lattice-poster') : null;
  if (!poster || poster.classList.contains('is-expanded')) return;
  var idx = Number(poster.dataset.queueIndex);
  if (Number.isFinite(idx) && typeof playQueueAt === 'function') {
    playQueueAt(idx, { skipShuffleOrder: true });
    ev.preventDefault();
  }
}

/* ---------- 生命周期 ---------- */

function startLattice() {
  latticeLastWallKey = '';
  latticeLastCurrentIdx = -1;
  latticeLastLineIdx = -99;
  latticeLastProgress = '';
  latticeLastLyricsKey = '';
  latticeBuildWall();
  latticeExpandedTick();
  latticeWatchQueue();
  latticeWatchExpanded();
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

var latticeWallClickBound = false;

function initLattice() {
  var back = document.getElementById('lattice-back');
  if (back) back.addEventListener('click', function () { applyLatticeMode(false, { save: true }); });
  var wall = document.getElementById('lattice-wall');
  if (wall && !latticeWallClickBound) {
    latticeWallClickBound = true;
    wall.addEventListener('click', latticeHandleWallClick);
    wall.addEventListener('keydown', latticeHandleWallKey);
  }
  applyLatticeMode(latticeMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initLattice, 320) : setTimeout(initLattice, 320);
