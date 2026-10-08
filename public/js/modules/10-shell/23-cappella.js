/* =========================================================================
   OrangeSea · 群唱（Cappella · 聊天气泡歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/visualizer/cappella/
   VisualizerCappella.tsx 的对话式歌词核心（确定性左右序列/短行承接/间奏
   表情包/逐字浮现/激活气泡膨胀），宿主换为原生 DOM 覆盖层范式。
   -------------------------------------------------------------------------
   每句歌词是一条聊天消息：左侧是四位"合唱成员"轮换（头像=稳定色相字块），
   右侧是"主唱"（歌名卡也由它发出）；间奏"......"变成表情包大贴纸，
   普通行结束后按概率触发回应贴纸。发送者分配按歌曲 key 确定性播种
   （同歌同对话）。当前句气泡放大发亮，唱完收缩变暗，聊天流自动滚到最新。
   ========================================================================= */

var CAPPELLA_STORE_KEY = 'orangesea-cappella-v1';
var cappellaMode = readBooleanPreference(CAPPELLA_STORE_KEY, false);
var cappellaPrevQuality = null;
var cappellaTimer = 0;
var cappellaLinesKey = '';
var cappellaMessages = [];
var cappellaDomByKey = {};
var cappellaLastActiveIdx = -99;

/* ---------- 纯逻辑（测试直接覆盖） ---------- */

function cappellaHashString(input) {
  var hash = 2166136261;
  input = String(input);
  for (var i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cappellaSeededUnit() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) parts.push(arguments[i]);
  return cappellaHashString(parts.join('|')) / 0xffffffff;
}

var CAPPELLA_SHORT_LINE_CHAR_LIMIT = 12;
var CAPPELLA_INTERLUDE_TEXT = '......';

function cappellaCountCompactChars(text) {
  return String(text || '').replace(/\s/g, '').length;
}

/* 三档强度的序列与动效参数（照抄 normal/chaotic 档；calm 档供后续设置） */
var CAPPELLA_CONFIGS = {
  calm: {
    forceRightEveryLines: 7, shortLineCarryChance: 0.92,
    sideSequence: ['left', 'left', 'right', 'left', 'right'], sideFlipChance: 0.08,
    randomEmoChance: 0, minLinesBetweenRandomEmos: 6, maxRandomEmoRatio: 0
  },
  normal: {
    forceRightEveryLines: 5, shortLineCarryChance: 0.68,
    sideSequence: ['left', 'right', 'left', 'right', 'right'], sideFlipChance: 0.18,
    randomEmoChance: 0.1, minLinesBetweenRandomEmos: 3, maxRandomEmoRatio: 0.125
  },
  chaotic: {
    forceRightEveryLines: 3, shortLineCarryChance: 0.36,
    sideSequence: ['left', 'right', 'right', 'left', 'right', 'left'], sideFlipChance: 0.42,
    randomEmoChance: 0.22, minLinesBetweenRandomEmos: 2, maxRandomEmoRatio: 1 / 6
  }
};

var CAPPELLA_RIGHT_AVATAR_INDEX = 8;
var CAPPELLA_LEFT_AVATAR_INDICES = [0, 3, 6, 1, 4];
var CAPPELLA_EMOJI_POOL = ['🎵', '🎶', '✨', '💫', '🌙', '⭐', '🌈', '🎤', '❤️', '🔥', '😊', '😳', '🥰', '🙌'];

function cappellaPickStableEmo(seedParts) {
  var u = cappellaSeededUnit.apply(null, seedParts);
  return CAPPELLA_EMOJI_POOL[Math.floor(u * CAPPELLA_EMOJI_POOL.length) % CAPPELLA_EMOJI_POOL.length];
}

/* 行数据（lyricsLines {t,text,duration,words}）→ 消息序列（Folia buildCappellaMessages 的
   无 Agent 版：确定性左右序列 + 短行承接 + 强制右 + 间奏/回应表情包） */
function cappellaBuildMessages(rawLines, titleText, intensityKey, songKey) {
  var config = CAPPELLA_CONFIGS[intensityKey] || CAPPELLA_CONFIGS.normal;
  var messages = [{
    id: 'title',
    kind: 'title',
    text: String(titleText || 'OrangeSea'),
    side: 'right',
    avatarIndex: CAPPELLA_RIGHT_AVATAR_INDEX
  }];
  if (!rawLines || !rawLines.length) return messages;

  var sideCursor = 0;
  var leftAvatarCursor = 0;
  var lastSender = null;
  var linesSinceEmo = Number.POSITIVE_INFINITY;
  var emoCount = 0;
  var emoCap = Math.floor(rawLines.length * config.maxRandomEmoRatio);

  for (var lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
    var line = rawLines[lineIndex] || {};
    var nextLine = rawLines[lineIndex + 1];
    var start = Number(line.t) || 0;
    var end = start + (Number(line.duration) > 0 ? Number(line.duration) : 2.4);
    var renderEnd = nextLine ? Math.min(end, Number(nextLine.t) || end) : end;
    var isShort = cappellaCountCompactChars(line.text) <= CAPPELLA_SHORT_LINE_CHAR_LIMIT;
    var isInterlude = String(line.text || '').trim() === CAPPELLA_INTERLUDE_TEXT;

    var forceRight = (lineIndex + 1) % config.forceRightEveryLines === 0;
    var carry = !forceRight && isShort && lastSender
      && cappellaSeededUnit('carry', start, lineIndex, songKey) <= config.shortLineCarryChance;
    var baseSide = config.sideSequence[sideCursor % config.sideSequence.length];
    var flip = !forceRight && cappellaSeededUnit('flip', start, lineIndex, songKey) < config.sideFlipChance;
    var side = forceRight ? 'right' : (carry && lastSender ? lastSender.side : (flip ? (baseSide === 'left' ? 'right' : 'left') : baseSide));
    var avatarIndex = side === 'left'
      ? CAPPELLA_LEFT_AVATAR_INDICES[leftAvatarCursor % CAPPELLA_LEFT_AVATAR_INDICES.length]
      : CAPPELLA_RIGHT_AVATAR_INDEX;
    var sender = { side: side, avatarIndex: avatarIndex };

    var baseId = 'msg-' + songKey + '-' + lineIndex;
    if (isInterlude) {
      messages.push({
        id: baseId + '-emo',
        kind: 'emo',
        text: cappellaPickStableEmo(['interlude', start, lineIndex, songKey]),
        start: start,
        end: Math.max(start + 0.12, renderEnd),
        side: side, avatarIndex: avatarIndex, lineIndex: lineIndex
      });
    } else {
      messages.push({
        id: baseId,
        kind: 'lyric',
        text: String(line.text || ''),
        start: start, end: end, renderEnd: renderEnd,
        side: side, avatarIndex: avatarIndex, lineIndex: lineIndex,
        hasWords: !!(line.words && line.words.length)
      });
    }
    linesSinceEmo += 1;

    var canReact = !isInterlude && emoCount < emoCap && linesSinceEmo >= config.minLinesBetweenRandomEmos;
    if (canReact && cappellaSeededUnit('random-emo', start, end, lineIndex, songKey) < config.randomEmoChance) {
      messages.push({
        id: baseId + '-react',
        kind: 'emo',
        text: cappellaPickStableEmo(['reaction', start, end, lineIndex, side, songKey]),
        start: end,
        end: Math.max(end + 0.08, renderEnd),
        side: side, avatarIndex: avatarIndex, lineIndex: lineIndex
      });
      emoCount += 1;
      linesSinceEmo = 0;
    }

    if (forceRight) {
      sideCursor = 0;
      lastSender = null;
    } else if (!carry) {
      if (side === 'left') leftAvatarCursor += 1;
      sideCursor += 1;
      lastSender = sender;
    } else {
      lastSender = sender;
    }
  }
  return messages;
}

/* 头像：3×3 网格稳定色相 + 中心字符（Folia avatar 网格的字母块等价） */
function cappellaAvatarStyle(index) {
  var hue = (index * 41 + 190) % 360;
  return 'linear-gradient(145deg, hsl(' + hue + ' 52% 46%), hsl(' + ((hue + 40) % 360) + ' 48% 26%))';
}

function cappellaAvatarGlyph(index, titleText) {
  if (index === CAPPELLA_RIGHT_AVATAR_INDEX) {
    var t = String(titleText || 'O').trim();
    return t ? t.charAt(0).toUpperCase() : 'O';
  }
  return ['月', '星', '风', '海', '灯'][index % 5];
}

/* ---------- DOM 渲染 ---------- */

function cappellaEnsureDom() {
  var list = document.getElementById('cappella-list');
  if (!list) return null;
  return list;
}

function cappellaBuildDom(list, titleText) {
  list.textContent = '';
  cappellaDomByKey = {};
  var frag = document.createDocumentFragment();
  for (var i = 0; i < cappellaMessages.length; i++) {
    var m = cappellaMessages[i];
    var row = document.createElement('div');
    row.className = 'cappella-row is-' + m.side + (m.kind === 'title' ? ' is-title' : '');
    row.dataset.msgId = m.id;

    var avatar = document.createElement('div');
    avatar.className = 'cappella-avatar';
    avatar.style.background = cappellaAvatarStyle(m.avatarIndex);
    avatar.textContent = cappellaAvatarGlyph(m.avatarIndex, titleText);
    row.appendChild(avatar);

    var bubble = document.createElement('div');
    bubble.className = 'cappella-bubble' + (m.kind === 'emo' ? ' is-emo' : '');
    if (m.kind === 'emo') {
      bubble.textContent = m.text;
    } else if (m.kind === 'title') {
      bubble.textContent = m.text;
      bubble.classList.add('is-title-text');
    } else {
      /* 逐字 span：opacity 由 tick 按行内进度驱动 */
      var chars = Array.from(m.text);
      for (var c = 0; c < chars.length; c++) {
        var span = document.createElement('span');
        span.className = 'cappella-char';
        span.textContent = chars[c];
        bubble.appendChild(span);
      }
    }
    row.appendChild(bubble);
    frag.appendChild(row);
    cappellaDomByKey[m.id] = { row: row, bubble: bubble };
  }
  list.appendChild(frag);
  var scroller = document.getElementById('cappella-scroller');
  if (scroller) scroller.scrollTop = 0;
}

/* ---------- 30fps 语义的 250ms 轮询 tick ---------- */

function cappellaNowTime() {
  try {
    return getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function cappellaActiveIndexAt(t) {
  var active = -1;
  for (var i = 0; i < cappellaMessages.length; i++) {
    var m = cappellaMessages[i];
    if (m.kind === 'title') continue;
    if (t >= m.start && t < m.end) active = i;
    else if (m.kind === 'lyric' && t >= m.end && t < (m.renderEnd == null ? m.end : m.renderEnd)) {
      if (active < 0 || cappellaMessages[active].start <= m.start) active = i; /* 唱完但未过闸 */
    }
  }
  return active;
}

function cappellaTick() {
  var list = cappellaEnsureDom();
  if (!list) return;
  var t = cappellaNowTime();
  var activeIdx = cappellaActiveIndexAt(t);

  /* 消息三态 + 逐字 reveal */
  var nodes = list.children;
  for (var i = 0; i < nodes.length; i++) {
    var row = nodes[i];
    var id = row.dataset.msgId;
    var m = null;
    for (var k = 0; k < cappellaMessages.length; k++) {
      if (cappellaMessages[k].id === id) { m = cappellaMessages[k]; break; }
    }
    if (!m) continue;
    var isActive = i === activeIdx;
    var isPassed = m.kind !== 'title' && t >= (m.renderEnd == null ? m.end : m.renderEnd);
    row.classList.toggle('is-active', isActive);
    row.classList.toggle('is-passed', isPassed && !isActive);
    if (isActive && m.kind === 'lyric') {
      var chars = row.querySelectorAll('.cappella-char');
      var span = Math.max(0.12, m.end - m.start);
      var progress = Math.max(0, Math.min(1, (t - m.start) / span));
      var litCount = Math.floor(progress * chars.length + 0.35);
      for (var c = 0; c < chars.length; c++) {
        chars[c].classList.toggle('is-lit', c < litCount);
      }
    }
  }

  /* 滚动：最新可见消息贴底（保持最近 20 条窗口语义） */
  if (activeIdx !== cappellaLastActiveIdx) {
    cappellaLastActiveIdx = activeIdx;
    var scroller = document.getElementById('cappella-scroller');
    if (scroller) {
      var targetRow = nodes[Math.max(0, Math.min(nodes.length - 1, activeIdx))];
      if (targetRow && targetRow.scrollIntoView) {
        try { targetRow.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (e) { }
      }
    }
  }
}

function cappellaLinesKeyNow() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var first = lines[0], last = lines[lines.length - 1];
  return lines.length + '|' + (first ? first.t : 0) + '|' + (last ? last.t : 0) + '|'
    + ((typeof lyricsMetaVersion !== 'undefined') ? lyricsMetaVersion : 0);
}

function cappellaRebuild() {
  var list = cappellaEnsureDom();
  if (!list) return;
  var key = cappellaLinesKeyNow();
  if (key === cappellaLinesKey) return;
  cappellaLinesKey = key;
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var titleText = '';
  var titleEl = document.getElementById('control-title-text');
  if (titleEl) titleText = titleEl.textContent || '';
  var songKey = 'song';
  try {
    if (typeof lyricCurrentCoverPaletteKey === 'function') songKey = String(lyricCurrentCoverPaletteKey() || 'song');
  } catch (e) { }
  var intensity = 'normal';
  var active = (typeof themeServiceActiveTheme === 'function') ? themeServiceActiveTheme() : null;
  if (active && active.animationIntensity) intensity = active.animationIntensity;
  cappellaMessages = cappellaBuildMessages(lines, titleText, intensity, songKey);
  cappellaLastActiveIdx = -99;
  cappellaBuildDom(list, titleText);
}

/* ---------- 生命周期 ---------- */

function startCappella() {
  cappellaLinesKey = '';
  cappellaRebuild();
  cappellaTick();
  (function loop() {
    if (!cappellaMode) return;
    cappellaRebuild();
    cappellaTick();
    cappellaTimer = setTimeout(loop, 250);
  })();
}

function stopCappella() {
  if (cappellaTimer) { clearTimeout(cappellaTimer); cappellaTimer = 0; }
  cappellaLinesKey = '';
  cappellaMessages = [];
  cappellaLastActiveIdx = -99;
}

function applyCappellaMode(on, opts) {
  opts = opts || {};
  cappellaMode = !!on;
  if (cappellaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('cappella', { save: true });
  }
  document.body.classList.toggle('cappella', cappellaMode);
  var overlay = document.getElementById('cappella-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', cappellaMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(CAPPELLA_STORE_KEY, cappellaMode);
  if (cappellaMode) {
    if (typeof fx !== 'undefined' && fx && cappellaPrevQuality === null) {
      cappellaPrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
    startCappella();
  } else {
    if (cappellaPrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = cappellaPrevQuality;
      cappellaPrevQuality = null;
    }
    stopCappella();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(cappellaMode ? '群唱已开启' : '已切回标准模式');
}

function toggleCappellaMode() {
  applyCappellaMode(!cappellaMode, { save: true, toast: true });
}

scheduleUiWarmTask ? scheduleUiWarmTask(function () {
  applyCappellaMode(cappellaMode, { save: false });
}, 340) : setTimeout(function () {
  applyCappellaMode(cappellaMode, { save: false });
}, 340);
