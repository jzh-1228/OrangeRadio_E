/* =========================================================================
   OrangeSea · 队列拼贴（Lattice · 播放队列封面海报墙 · 无限晶格版）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/app/lattice/
     layout.ts（无限晶格 + 队列环绕）/ blockTemplates.ts + blockReflows.ts
     （12×8 混合槽位精确覆盖，数据见 22a-lattice-blocks.js）/
     LatticePoster.tsx（shade 叠色 / 编号徽章 / 展开卡歌词与走带）。
   -------------------------------------------------------------------------
   整面墙是 12×8 block 的无限晶格：每 block 12 张海报、大小 2×2 ~ 6×6
   混合平铺（四基础模板 × 四反射周期出现），队列按 cellSlot % len 环绕
   填满整面墙。当前播放的海报自动 6×6 展开——同一 block 的另外 11 张按
   预计算让位表重排（block 始终精确覆盖，无空隙无重叠），展开卡内实时
   显示歌词与走带。拖拽平移整面墙；点击任意海报从该曲播放（墙不改队列：
   skipShuffleOrder）。视口外的 block 不建 DOM（上限 400 实例）。
   ========================================================================= */

var LATTICE_STORE_KEY = 'orangesea-lattice-mode-v1';
var latticeMode = readBooleanPreference(LATTICE_STORE_KEY, false);
/* ---------- 几何常量（Folia PosterWall: CELL_SIZE=128 GAP=8） ---------- */
var LT_CELL = 128;
var LT_GAP = 8;
var LT_PITCH = LT_CELL + LT_GAP;
var LT_BLOCK_W = LATTICE_BLOCK_COLS * LT_PITCH;
var LT_BLOCK_H = LATTICE_BLOCK_ROWS * LT_PITCH;
var LT_MAX_INSTANCES = 400;          /* MAX_RENDERED_INSTANCES */
var LT_FIELD_ASPECT = 2.2;           /* 环绕单元的横竖偏好 */

/* ---------- 运行状态 ---------- */
var latticeCam = { x: LT_BLOCK_W / 2, y: LT_BLOCK_H / 2 };   /* 世界坐标（屏幕中心） */
var latticeWorldEl = null;
var latticeInstances = {};           /* key → {el, coverUrl, queueIndex, badge, copy} */
var latticeInstanceCount = 0;
var latticeExpanded = null;          /* { repeatX, repeatY, localCol, localRow, slot, queueIndex } */
var latticeQueueLen = 0;
var latticeQueueToken = 0;
var latticeLastWallKey = '';
var latticeLastCurrentIdx = -1;
var latticeLastLineIdx = -99;
var latticeLastProgress = '';
var latticeDrag = null;
var latticeRafPending = false;

/* ---------- 纯逻辑（测试直接覆盖） ---------- */

function latticeHashString(input) {
  var hash = 2166136261;
  input = String(input);
  for (var i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/* 无封面时按歌曲 id 稳定取色相渐变兜底 */
function latticeFallbackGradient(id) {
  var hue = latticeHashString(String(id || '')) % 360;
  return 'linear-gradient(135deg, hsl(' + hue + ' 42% 30%), hsl(' + ((hue + 46) % 360) + ' 38% 16%))';
}

/* 队列环绕单元几何（Folia getLatticeGeometry 直译） */
function latticeCellGeometry(totalEntries) {
  var blocks = Math.max(1, Math.ceil(Math.max(0, totalEntries) / LATTICE_SLOTS_PER_BLOCK));
  var blocksPerRow = blocks <= 1
    ? 1
    : Math.max(1, Math.round(Math.sqrt(LT_FIELD_ASPECT * blocks * LATTICE_BLOCK_ROWS / LATTICE_BLOCK_COLS)));
  return { bpr: blocksPerRow, br: Math.ceil(blocks / blocksPerRow) };
}

/* cellSlot ≡ queueIndex (mod len) 的全部 (localRow, localCol, slot) 候选 */
function latticeCandidatesForQueueIndex(totalEntries, target) {
  var geo = latticeCellGeometry(totalEntries);
  var out = [];
  for (var lr = 0; lr < geo.br; lr++) {
    for (var lc = 0; lc < geo.bpr; lc++) {
      for (var slot = 0; slot < LATTICE_SLOTS_PER_BLOCK; slot++) {
        var cellSlot = (lr * geo.bpr + lc) * LATTICE_SLOTS_PER_BLOCK + slot;
        if (cellSlot % totalEntries === target) out.push({ lc: lc, lr: lr, slot: slot });
      }
    }
  }
  return out;
}

/* 绝对 block 坐标 → 世界原点 + cell 内局部坐标（Folia buildInstance 直译） */
function latticeBlockOrigin(geo, absCol, absRow) {
  var repeatX = Math.floor(absCol / geo.bpr);
  var repeatY = Math.floor(absRow / geo.br);
  return {
    repeatX: repeatX, repeatY: repeatY,
    lc: absCol - repeatX * geo.bpr, lr: absRow - repeatY * geo.br,
    x: repeatX * geo.bpr * LT_BLOCK_W + (absCol - repeatX * geo.bpr) * LT_BLOCK_W,
    y: repeatY * geo.br * LT_BLOCK_H + (absRow - repeatY * geo.br) * LT_BLOCK_H
  };
}

function latticeFormatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function latticeQueueKey(queue, currentIndex) {
  queue = queue || [];
  var parts = [queue.length, currentIndex];
  for (var i = 0; i < queue.length; i++) {
    var s = queue[i] || {};
    parts.push((s.id || s.songid || s.mid || i) + ':'
      + (s.title || s.name || '') + ':'
      + (s.cover || s.pic || ''));
  }
  return parts.join('|');
}

function latticeCurrentLyricIndex() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var t = 0;
  try {
    t = getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { t = 0; }
  var idx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (t >= (Number(lines[i].t) || 0)) idx = i; else break;
  }
  return idx;
}

/* ---------- 相机 ---------- */

function latticeApplyCamera(animate) {
  var world = latticeWorldEl;
  if (!world) return;
  var vw = window.innerWidth || 1280;
  var vh = window.innerHeight || 800;
  world.style.transition = animate === false ? 'none' : 'transform 0.55s cubic-bezier(0.32, 0.72, 0, 1)';
  world.style.transform = 'translate3d(' + Math.round(vw / 2 - latticeCam.x) + 'px,' + Math.round(vh / 2 - latticeCam.y) + 'px,0)';
}

/* 距相机最近的当前播放实例 → 展开目标（Folia useLatticePlaybackFocus 语义） */
function latticeResolveExpanded() {
  var n = latticeQueueLen;
  if (n <= 0) { latticeExpanded = null; return; }
  var target = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
  if (target < 0 || target >= n) { latticeExpanded = null; return; }
  var geo = latticeCellGeometry(n);
  var candidates = latticeCandidatesForQueueIndex(n, target);
  if (!candidates.length) { latticeExpanded = null; return; }
  var best = null;
  var bestDist = Infinity;
  /* 副本范围 ±1（相机附近的副本） */
  for (var rx = -1; rx <= 1; rx++) {
    for (var ry = -1; ry <= 1; ry++) {
      for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c];
        var origin = latticeBlockOrigin(geo, geo.bpr * rx + cand.lc, geo.br * ry + cand.lr);
        var tpl = latticeGetBlockTemplate(cand.lc, cand.lr);
        var slotRect = tpl[cand.slot];
        var cx = origin.x + (slotRect.x + slotRect.cols / 2) * LT_PITCH;
        var cy = origin.y + (slotRect.y + slotRect.rows / 2) * LT_PITCH;
        var dist = (cx - latticeCam.x) * (cx - latticeCam.x) + (cy - latticeCam.y) * (cy - latticeCam.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = {
            repeatX: rx, repeatY: ry, lc: cand.lc, lr: cand.lr, slot: cand.slot,
            queueIndex: target, cx: cx, cy: cy
          };
        }
      }
    }
  }
  latticeExpanded = best;
}

/* ---------- 实例同步（视口裁剪 + 差量 DOM） ---------- */

function latticeCoverForSong(song, fallbackId) {
  var cover = '';
  try {
    if (typeof getControlCoverUrl === 'function' && arguments.length === 99) cover = '';
  } catch (e) { }
  cover = (song && (song.cover || song.pic || song.album_cover)) || '';
  if (cover && !/^https?:|^data:|^assets|^blob:/.test(String(cover))) cover = String(cover);
  return cover || null;
}

function latticeInstanceKey(repeatX, repeatY, lc, lr, slot) {
  return repeatX + ':' + repeatY + ':' + lc + ':' + lr + ':' + slot;
}

function latticeSyncInstances(initial) {
  var world = latticeWorldEl;
  if (!world) return;
  var queue = (typeof playQueue !== 'undefined' && playQueue) ? playQueue : [];
  var n = Math.max(1, queue.length);
  var geo = latticeCellGeometry(queue.length || 1);
  var vw = window.innerWidth || 1280;
  var vh = window.innerHeight || 800;
  var margin = LT_BLOCK_W;
  var minX = latticeCam.x - vw / 2 - margin, maxX = latticeCam.x + vw / 2 + margin;
  var minY = latticeCam.y - vh / 2 - margin, maxY = latticeCam.y + vh / 2 + margin;

  var colFrom = Math.floor(minX / LT_BLOCK_W) - 1, colTo = Math.floor(maxX / LT_BLOCK_W) + 1;
  var rowFrom = Math.floor(minY / LT_BLOCK_H) - 1, rowTo = Math.floor(maxY / LT_BLOCK_H) + 1;
  var keep = {};
  var built = 0;
  var frag = null;

  for (var absCol = colFrom; absCol <= colTo && built < LT_MAX_INSTANCES; absCol++) {
    for (var absRow = rowFrom; absRow <= rowTo && built < LT_MAX_INSTANCES; absRow++) {
      var origin = latticeBlockOrigin(geo, absCol, absRow);
      var isExpandedBlock = latticeExpanded
        && latticeExpanded.repeatX === origin.repeatX && latticeExpanded.repeatY === origin.repeatY
        && latticeExpanded.lc === origin.lc && latticeExpanded.lr === origin.lr;
      /* 模板按 cell 内局部坐标周期选取；展开块走让位表 */
      var layout = isExpandedBlock
        ? latticeGetBlockReflow(origin.lc, origin.lr, latticeExpanded.slot)
        : latticeGetBlockTemplate(origin.lc, origin.lr);
      if (!layout) continue;
      for (var slot = 0; slot < LATTICE_SLOTS_PER_BLOCK; slot++) {
        var rect = layout[slot];
        var key = latticeInstanceKey(origin.repeatX, origin.repeatY, origin.lc, origin.lr, slot);
        keep[key] = true;
        var existing = latticeInstances[key];
        if (existing) {
          /* 已有实例：槽位矩形可能因让位重排变化 → 只在变化时写样式 */
          latticePositionInstance(existing, origin, rect, slot);
          continue;
        }
        if (built >= LT_MAX_INSTANCES) break;
        var cellSlot = (origin.lr * geo.bpr + origin.lc) * LATTICE_SLOTS_PER_BLOCK + slot;
        var queueIndex = cellSlot % n;
        var song = queue[queueIndex] || {};
        var el = latticeBuildPosterEl(song, queueIndex, origin, rect, slot, initial);
        if (!frag) frag = document.createDocumentFragment();
        frag.appendChild(el);
        latticeInstances[key] = { el: el, key: key, queueIndex: queueIndex };
        latticePositionInstance(latticeInstances[key], origin, rect, slot);
        built++;
      }
    }
  }
  if (frag) world.appendChild(frag);
  /* 移除视口外实例 */
  for (var k in latticeInstances) {
    if (!keep[k]) {
      var inst = latticeInstances[k];
      if (inst.el && inst.el.parentNode) inst.el.parentNode.removeChild(inst.el);
      delete latticeInstances[k];
    }
  }
}

function latticePositionInstance(inst, origin, rect, slot) {
  var el = inst.el;
  var x = origin.x + rect.x * LT_PITCH;
  var y = origin.y + rect.y * LT_PITCH;
  var w = rect.cols * LT_PITCH - LT_GAP;
  var h = rect.rows * LT_PITCH - LT_GAP;
  var pos = x.toFixed(1) + '|' + y.toFixed(1) + '|' + w + '|' + h;
  if (el.dataset.pos !== pos) {
    el.dataset.pos = pos;
    el.style.left = x.toFixed(1) + 'px';
    el.style.top = y.toFixed(1) + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }
  var isExpandedCard = latticeExpanded
    && latticeExpanded.repeatX === origin.repeatX && latticeExpanded.repeatY === origin.repeatY
    && latticeExpanded.lc === origin.lc && latticeExpanded.lr === origin.lr
    && latticeExpanded.slot === slot;
  var wantExpanded = isExpandedCard ? 'yes' : '';
  if (el.dataset.expanded !== wantExpanded) {
    el.dataset.expanded = wantExpanded;
    el.classList.toggle('is-expanded', !!wantExpanded);
    if (wantExpanded) latticeFillExpandedContent(el, inst.queueIndex);
  }
}

function latticeBuildPosterEl(song, queueIndex, origin, rect, slot, initial) {
  var el = document.createElement('div');
  el.className = 'lattice-poster';
  el.dataset.queueIndex = String(queueIndex);
  el.tabIndex = 0;
  var cover = latticeCoverForSong(song, song ? (song.id || song.songid || queueIndex) : queueIndex);
  el.style.backgroundImage = cover
    ? 'url("' + cover + '")'
    : latticeFallbackGradient(song ? (song.id || song.songid || queueIndex) : queueIndex);

  var shade = document.createElement('span');
  shade.className = 'lattice-poster-shade';
  el.appendChild(shade);

  var badge = document.createElement('span');
  badge.className = 'lattice-poster-badge';
  el.appendChild(badge);

  var copy = document.createElement('span');
  copy.className = 'lattice-poster-copy';
  var title = document.createElement('b');
  title.textContent = (song && (song.title || song.name)) || '—';
  var artist = document.createElement('small');
  artist.textContent = (song && (song.artist || song.singer)) || '';
  copy.appendChild(title);
  copy.appendChild(artist);
  el.appendChild(copy);

  /* 当前播放（非展开副本）徽章文案 */
  latticeRefreshPosterState(el, song, queueIndex);
  if (initial) el.classList.add('is-entering');
  return el;
}

function latticeRefreshPosterState(el, song, queueIndex) {
  var currentIdx = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
  var isCurrent = queueIndex === currentIdx;
  el.classList.toggle('is-current', isCurrent);
  var badge = el.querySelector('.lattice-poster-badge');
  if (badge) {
    var text = (isCurrent ? '正在播放 · ' : '') + String(queueIndex + 1).padStart(2, '0');
    if (badge.textContent !== text) badge.textContent = text;
  }
}

/* 全墙状态刷新（播放头移动：徽章 + is-current） */
function latticeRefreshAllPosterStates() {
  var queue = (typeof playQueue !== 'undefined' && playQueue) ? playQueue : [];
  for (var k in latticeInstances) {
    var inst = latticeInstances[k];
    if (inst.el && inst.el.style.display !== 'none') {
      latticeRefreshPosterState(inst.el, queue[inst.queueIndex], inst.queueIndex);
    }
  }
}

/* ---------- 展开卡内容（歌词 + 走带） ---------- */

function latticeFillExpandedContent(el, queueIndex) {
  /* 清旧内容（shade/badge/copy 保留在前面） */
  var oldLyrics = el.querySelector('.lattice-poster-lyrics');
  if (oldLyrics) oldLyrics.parentNode.removeChild(oldLyrics);
  var oldControls = el.querySelector('.lattice-poster-controls');
  if (oldControls) oldControls.parentNode.removeChild(oldControls);

  var lyrics = document.createElement('div');
  lyrics.className = 'lattice-poster-lyrics';
  lyrics.id = 'lattice-lyrics';
  el.appendChild(lyrics);

  var controls = document.createElement('div');
  controls.className = 'lattice-poster-controls';
  controls.innerHTML =
    '<button data-lattice-act="prev" title="上一首"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2.4v14H6zM19 5.2v13.6L9.5 12z"/></svg></button>' +
    '<button data-lattice-act="play" title="播放/暂停"><svg class="lattice-play-icon" data-state="play" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2l11 6.8-11 6.8z"/></svg></button>' +
    '<button data-lattice-act="next" title="下一首"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 5H18v14h-2.4zM5 5.2v13.6L14.5 12z"/></svg></button>' +
    '<span class="lattice-time" id="lattice-time">0:00 / 0:00</span>' +
    '<span class="lattice-progress"><span class="lattice-progress-bar" id="lattice-progress-bar"></span></span>';
  el.appendChild(controls);
  latticeLastLineIdx = -99;
  latticeLastProgress = '';
}

/* 歌词行构建 + 推进（展开卡内） */
function latticeBuildLyrics() {
  var box = document.getElementById('lattice-lyrics');
  if (!box) return;
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var key = lines.length + '|' + (lines[0] ? lines[0].t : 0) + '|' + (lines.length ? lines[lines.length - 1].t : 0);
  if (key === box.dataset.key) return;
  box.dataset.key = key;
  box.textContent = '';
  var frag = document.createDocumentFragment();
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i] || {};
    var text = String(line.text || '').trim();
    if (!text) continue;
    var row = document.createElement('div');
    row.className = 'lattice-lyrics-row';
    row.dataset.lineIndex = String(i);
    var main = document.createElement('div');
    main.className = 'lattice-lyrics-main';
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

function latticeExpandedTick() {
  latticeBuildLyrics();
  var box = document.getElementById('lattice-lyrics');
  var lineIdx = latticeCurrentLyricIndex();
  if (box && lineIdx !== latticeLastLineIdx) {
    latticeLastLineIdx = lineIdx;
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
    if (targetRow) {
      /* 展开卡内自滚（不能用 scrollIntoView：会连带滚动外层墙） */
      var target = targetRow.offsetTop - (box.clientHeight - targetRow.offsetHeight) / 2;
      box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
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
      var path = icon.querySelector('path');
      if (path) path.setAttribute('d', playing ? 'M8 5.5v13M16 5.5v13' : 'M8 5.2l11 6.8-11 6.8z');
    }
  }
}

/* ---------- 重建 / 聚焦 ---------- */

function latticeRebuild(initial) {
  var world = latticeWorldEl;
  if (!world) return;
  var queue = (typeof playQueue !== 'undefined' && playQueue) ? playQueue : [];
  latticeQueueLen = queue.length;
  var empty = document.getElementById('lattice-empty');
  if (empty) empty.style.display = queue.length ? 'none' : 'flex';
  if (!queue.length) {
    for (var k in latticeInstances) {
      var inst = latticeInstances[k];
      if (inst.el && inst.el.parentNode) inst.el.parentNode.removeChild(inst.el);
    }
    latticeInstances = {};
    latticeExpanded = null;
    return;
  }
  latticeResolveExpanded();
  latticeSyncInstances(initial);
  latticeRefreshAllPosterStates();
  latticeBuildLyrics();
}

/* 切歌：聚焦展开卡居中 */
function latticeFocusCurrent(animate) {
  if (!latticeExpanded) return;
  latticeCam.x = latticeExpanded.cx;
  latticeCam.y = latticeExpanded.cy;
  latticeApplyCamera(animate);
  latticeScheduleSync();
}

/* ---------- 拖拽平移（useWallPointerPan 的纯 DOM 等价） ---------- */

function latticeBindDrag() {
  var field = document.getElementById('lattice-field');
  if (!field || field.dataset.dragBound) return;
  field.dataset.dragBound = '1';
  field.addEventListener('pointerdown', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('.lattice-poster')) {
      /* 卡片上的点击/文字选择仍可发生；只在中缝/空白处起拖 */
      latticeDrag = null;
      return;
    }
    latticeDrag = { startX: ev.clientX, startY: ev.clientY, camX: latticeCam.x, camY: latticeCam.y, moved: 0 };
    field.setPointerCapture && field.setPointerCapture(ev.pointerId);
  });
  field.addEventListener('pointermove', function (ev) {
    if (!latticeDrag) return;
    var dx = ev.clientX - latticeDrag.startX;
    var dy = ev.clientY - latticeDrag.startY;
    latticeDrag.moved = Math.max(latticeDrag.moved, Math.abs(dx) + Math.abs(dy));
    latticeCam.x = latticeDrag.camX - dx;
    latticeCam.y = latticeDrag.camY - dy;
    latticeApplyCamera(false);
    latticeScheduleSync();
  });
  var end = function () { latticeDrag = null; };
  field.addEventListener('pointerup', end);
  field.addEventListener('pointercancel', end);
  /* 滚轮：横竖滚平移（不缩放，保持平铺观感） */
  field.addEventListener('wheel', function (ev) {
    if (!latticeMode) return;
    latticeCam.x += ev.deltaX;
    latticeCam.y += ev.deltaY;
    latticeApplyCamera(false);
    latticeScheduleSync();
  }, { passive: true });
}

function latticeScheduleSync() {
  if (latticeRafPending) return;
  latticeRafPending = true;
  requestAnimationFrame(function () {
    latticeRafPending = false;
    if (latticeMode) latticeSyncInstances(false);
  });
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
  if (latticeDrag && latticeDrag.moved > 6) return;   /* 拖拽尾声不算点击 */
  var poster = ev.target && ev.target.closest ? ev.target.closest('.lattice-poster') : null;
  if (!poster) return;
  if (poster.classList.contains('is-expanded')) return;   /* 展开卡自身不重复触发 */
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

/* ---------- 轮询 ---------- */

function latticeWatchQueue() {
  var token = ++latticeQueueToken;
  function check() {
    if (token !== latticeQueueToken || !latticeMode) return;
    var queue = (typeof playQueue !== 'undefined' && playQueue) ? playQueue : [];
    var currentIdx = (typeof window.currentIdx !== 'undefined') ? window.currentIdx : -1;
    var key = latticeQueueKey(queue, currentIdx);
    if (key !== latticeLastWallKey) {
      latticeLastWallKey = key;
      latticeRebuild(false);
      if (currentIdx !== latticeLastCurrentIdx) {
        latticeLastCurrentIdx = currentIdx;
        latticeFocusCurrent(true);
      }
    }
    setTimeout(check, 600);
  }
  check();
}

function latticeWatchExpanded() {
  function tick() {
    if (!latticeMode) return;
    latticeExpandedTick();
    setTimeout(tick, 300);
  }
  tick();
}

/* ---------- 生命周期 ---------- */

function startLattice() {
  latticeWorldEl = document.getElementById('lattice-world');
  var field = document.getElementById('lattice-field');
  if (field) {
    if (!field.dataset.clickBound) {
      field.dataset.clickBound = '1';
      field.addEventListener('click', latticeHandleWallClick);
      field.addEventListener('keydown', latticeHandleWallKey);
    }
    latticeBindDrag();
  }
  latticeLastWallKey = '';
  latticeLastCurrentIdx = -1;
  latticeLastLineIdx = -99;
  latticeLastProgress = '';
  latticeCam.x = LT_BLOCK_W / 2;
  latticeCam.y = LT_BLOCK_H / 2;
  latticeApplyCamera(false);
  latticeRebuild(true);
  latticeExpandedTick();
  latticeWatchQueue();
  latticeWatchExpanded();
  setTimeout(function () { if (latticeMode) latticeFocusCurrent(true); }, 80);
}

function stopLattice() {
  latticeQueueToken++;
  latticeLastWallKey = '';
  latticeLastCurrentIdx = -1;
  /* 保留实例 DOM（隐藏由 overlay display:none 承担），退出重建时全量清 */
  for (var k in latticeInstances) {
    var inst = latticeInstances[k];
    if (inst.el && inst.el.parentNode) inst.el.parentNode.removeChild(inst.el);
  }
  latticeInstances = {};
  latticeExpanded = null;
}

function applyLatticeMode(on, opts) {
  opts = opts || {};
  latticeMode = !!on;
  if (latticeMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('lattice', { save: true });
  }
  document.body.classList.toggle('lattice', latticeMode);
  var overlay = document.getElementById('lattice-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', latticeMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(LATTICE_STORE_KEY, latticeMode);
  if (latticeMode) {
    startLattice();
  } else {
    stopLattice();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(latticeMode ? '队列拼贴已开启' : '已切回标准模式');
}

function toggleLatticeMode() {
  applyLatticeMode(!latticeMode, { save: true, toast: true });
}

function initLattice() {
  var back = document.getElementById('lattice-back');
  if (back && !back.dataset.bound) {
    back.dataset.bound = '1';
    back.addEventListener('click', function () { applyLatticeMode(false, { save: true }); });
  }
  applyLatticeMode(latticeMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initLattice, 330) : setTimeout(initLattice, 330);
