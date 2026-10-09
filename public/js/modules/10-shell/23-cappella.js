/* =========================================================================
   OrangeSea · 群唱（Cappella · 聊天气泡歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/visualizer/cappella/
   VisualizerCappella.tsx 的对话式歌词（确定性左右序列/短行承接/间奏与回应
   表情包/逐字浮现/激活气泡膨胀与流光），宿主换为原生 DOM 覆盖层范式。
   头像与表情图片来自 Folia 内置资源（AI 生成，上游声明可自由分发，
   见 public/assets/cappella/README.md）。
   -------------------------------------------------------------------------
   每句歌词是一条聊天消息：左侧是"合唱成员"轮换（圆形人物头像），
   右侧是"主唱"（歌名卡也由它发出）；间奏"......"变成表情包大贴纸，
   普通行结束后按概率触发回应贴纸。气泡配色按主题三色生成（Folia
   getBubbleColors 直译：右侧 accent 混 primary 深底浅字、左侧 secondary
   向 accent 按头像 tone 渐进）。当前句气泡放大、内缘流光扫动、
   逐字浮现；唱完收缩变暗并浮出时间戳。
   ========================================================================= */

var CAPPELLA_STORE_KEY = 'orangesea-cappella-v1';
var cappellaMode = readBooleanPreference(CAPPELLA_STORE_KEY, false);
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

/* 三档强度（Folia getCappellaIntensityConfig 全数值直译：sequencing + motion） */
var CAPPELLA_CONFIGS = {
  calm: {
    sequencing: {
      forceRightEveryLines: 7, shortLineCarryChance: 0.92,
      sideSequence: ['left', 'left', 'right', 'left', 'right'], sideFlipChance: 0.08,
      randomEmoChance: 0, minLinesBetweenRandomEmos: 6, maxRandomEmoRatio: 0
    },
    motion: {
      rowEnterY: 14, rowEnterScale: 0.992, rowEnterDuration: 0.28,
      rowExitY: -10, rowExitScale: 0.985, rowExitDuration: 0.22,
      activeScale: 1.07, passedScale: 0.96, passedOpacity: 0.88,
      activeFontMultiplier: 1.22, inactiveFontMultiplier: 0.96,
      activePaddingX: 18, activePaddingY: 14, inactivePaddingX: 16, inactivePaddingY: 12,
      activeMinHeight: 58, inactiveMinHeight: 44,
      glowOpacity: 0.26, glowDuration: 2.2, glowRightAlpha: 0.26, glowLeftAlpha: 0.14,
      activeShadowAlpha: 0.24,
      emoActiveSize: 132, emoInactiveSize: 96, emoEnterScale: 0.74, emoSizeTransitionDuration: 0.22
    }
  },
  normal: {
    sequencing: {
      forceRightEveryLines: 5, shortLineCarryChance: 0.68,
      sideSequence: ['left', 'right', 'left', 'right', 'right'], sideFlipChance: 0.18,
      randomEmoChance: 0.1, minLinesBetweenRandomEmos: 3, maxRandomEmoRatio: 0.125
    },
    motion: {
      rowEnterY: 22, rowEnterScale: 0.98, rowEnterDuration: 0.32,
      rowExitY: -18, rowExitScale: 0.965, rowExitDuration: 0.24,
      activeScale: 1.12, passedScale: 0.92, passedOpacity: 0.82,
      activeFontMultiplier: 1.34, inactiveFontMultiplier: 0.94,
      activePaddingX: 20, activePaddingY: 16, inactivePaddingX: 16, inactivePaddingY: 12,
      activeMinHeight: 64, inactiveMinHeight: 44,
      glowOpacity: 0.4, glowDuration: 1.8, glowRightAlpha: 0.34, glowLeftAlpha: 0.18,
      activeShadowAlpha: 0.34,
      emoActiveSize: 160, emoInactiveSize: 110, emoEnterScale: 0.6, emoSizeTransitionDuration: 0.25
    }
  },
  chaotic: {
    sequencing: {
      forceRightEveryLines: 3, shortLineCarryChance: 0.36,
      sideSequence: ['left', 'right', 'right', 'left', 'right', 'left'], sideFlipChance: 0.42,
      randomEmoChance: 0.22, minLinesBetweenRandomEmos: 2, maxRandomEmoRatio: 1 / 6
    },
    motion: {
      rowEnterY: 30, rowEnterScale: 0.968, rowEnterDuration: 0.38,
      rowExitY: -26, rowExitScale: 0.94, rowExitDuration: 0.28,
      activeScale: 1.18, passedScale: 0.88, passedOpacity: 0.76,
      activeFontMultiplier: 1.4, inactiveFontMultiplier: 0.92,
      activePaddingX: 22, activePaddingY: 17, inactivePaddingX: 15, inactivePaddingY: 11,
      activeMinHeight: 68, inactiveMinHeight: 42,
      glowOpacity: 0.52, glowDuration: 1.35, glowRightAlpha: 0.42, glowLeftAlpha: 0.24,
      activeShadowAlpha: 0.42,
      emoActiveSize: 178, emoInactiveSize: 122, emoEnterScale: 0.54, emoSizeTransitionDuration: 0.28
    }
  }
};

/* 内置头像（Folia folia-chan，AI 生成可自由分发）与表情包（9 张） */
var CAPPELLA_AVATAR_FILES = [
  'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png',
  'avatar8.png', 'avatar9.png', 'avatar10.png', 'avatar11.png', 'avatar12.png',
  'avatar13.png', 'avatar14.png', 'avatar15.png', 'avatar16.png', 'avatar17.png'
];
var CAPPELLA_AVATAR_URLS = CAPPELLA_AVATAR_FILES.map(function (f) {
  return 'assets/cappella/avatar/' + f;
});
var CAPPELLA_EMO_FILES = [
  'happy1.png', 'love1.png', 'normal1.png', 'sleepy1.png', 'sleepy2.png',
  'sleepy3.png', 'vibe1.png', 'vibe2.png', 'vibe3.png'
];
var CAPPELLA_EMO_URLS = CAPPELLA_EMO_FILES.map(function (f) {
  return 'assets/cappella/emo/' + f;
});

var CAPPELLA_RIGHT_AVATAR_INDEX = 8;
var CAPPELLA_LEFT_AVATAR_INDICES = [0, 3, 6, 1, 4];

function cappellaPickStableEmoUrl(seedParts) {
  var u = cappellaSeededUnit.apply(null, seedParts);
  return CAPPELLA_EMO_URLS[Math.floor(u * CAPPELLA_EMO_URLS.length) % CAPPELLA_EMO_URLS.length];
}

/* ---------- 色彩（Folia colorMix.mixColors / getBubbleColors 直译） ---------- */

function cappellaParseChannels(color) {
  var m = /^#([0-9a-f]{6})$/i.exec(String(color || '').trim());
  if (m) {
    return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  }
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(String(color || ''));
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

/* mixColors(from, to, mixAmount, alpha)：from→to 混色输出 rgba 串 */
function cappellaMixColors(fromColor, toColor, mixAmount, alpha) {
  var from = cappellaParseChannels(fromColor);
  var to = cappellaParseChannels(toColor);
  if (!from || !to) return toColor || fromColor || 'rgba(0,0,0,0)';
  var m = Math.max(0, Math.min(1, mixAmount));
  var r = Math.round(from.r + (to.r - from.r) * m);
  var g = Math.round(from.g + (to.g - from.g) * m);
  var b = Math.round(from.b + (to.b - from.b) * m);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
}

/* Folia getBubbleColors：右侧深底浅字，左侧按头像 tone 向 accent 渐进 */
function cappellaBubbleColors(message, theme) {
  if (message.side === 'right') {
    return {
      backgroundColor: cappellaMixColors(theme.accentColor, theme.primaryColor, 0.18, 0.94),
      borderColor: cappellaMixColors(theme.accentColor, theme.primaryColor, 0.34, 0.3),
      textColor: theme.backgroundColor
    };
  }
  var tone = (message.avatarIndex % 9) / 8;
  var accentMix = 0.18 + tone * 0.62;
  return {
    backgroundColor: cappellaMixColors(theme.secondaryColor, theme.accentColor, accentMix, 1),
    borderColor: cappellaMixColors(theme.secondaryColor, theme.accentColor, Math.min(accentMix + 0.18, 1), 0.26),
    textColor: theme.primaryColor
  };
}

/* ---------- 消息序列（Folia buildCappellaMessages 无 Agent 版） ---------- */

function cappellaBuildMessages(rawLines, titleText, intensityKey, songKey) {
  var config = CAPPELLA_CONFIGS[intensityKey] || CAPPELLA_CONFIGS.normal;
  var seq = config.sequencing;
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
  var emoCap = Math.floor(rawLines.length * seq.maxRandomEmoRatio);

  for (var lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
    var line = rawLines[lineIndex] || {};
    var nextLine = rawLines[lineIndex + 1];
    var start = Number(line.t) || 0;
    var end = start + (Number(line.duration) > 0 ? Number(line.duration) : 2.4);
    var renderEnd = nextLine ? Math.min(end, Number(nextLine.t) || end) : end;
    var isShort = cappellaCountCompactChars(line.text) <= CAPPELLA_SHORT_LINE_CHAR_LIMIT;
    var isInterlude = String(line.text || '').trim() === CAPPELLA_INTERLUDE_TEXT;

    var forceRight = (lineIndex + 1) % seq.forceRightEveryLines === 0;
    var carry = !forceRight && isShort && lastSender
      && cappellaSeededUnit('carry', start, lineIndex, songKey) <= seq.shortLineCarryChance;
    var baseSide = seq.sideSequence[sideCursor % seq.sideSequence.length];
    var flip = !forceRight && cappellaSeededUnit('flip', start, lineIndex, songKey) < seq.sideFlipChance;
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
        text: '',
        emoUrl: cappellaPickStableEmoUrl(['interlude', start, lineIndex, songKey]),
        start: start,
        end: Math.max(start + 0.12, renderEnd),
        renderEnd: renderEnd,
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

    var canReact = !isInterlude && emoCount < emoCap && linesSinceEmo >= seq.minLinesBetweenRandomEmos;
    if (canReact && cappellaSeededUnit('random-emo', start, end, lineIndex, songKey) < seq.randomEmoChance) {
      messages.push({
        id: baseId + '-react',
        kind: 'emo',
        text: '',
        emoUrl: cappellaPickStableEmoUrl(['reaction', start, end, lineIndex, side, songKey]),
        start: end,
        end: Math.max(end + 0.08, renderEnd),
        renderEnd: renderEnd,
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

function cappellaFormatTimestamp(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  var total = Math.max(0, Math.floor(seconds));
  var m = Math.floor(total / 60);
  var s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* 头像 URL（builtin 图片；按 index 取，右=固定第 9 张） */
function cappellaAvatarUrl(index, side) {
  var list = CAPPELLA_AVATAR_URLS;
  if (!list.length) return null;
  if (side === 'right') return list[Math.min(CAPPELLA_RIGHT_AVATAR_INDEX, list.length - 1)];
  return list[index % list.length];
}

/* ---------- DOM 渲染 ---------- */

function cappellaEnsureDom() {
  var list = document.getElementById('cappella-list');
  if (!list) return null;
  return list;
}

function cappellaBuildDom(list, titleText, theme, motion) {
  list.textContent = '';
  cappellaDomByKey = {};
  var frag = document.createDocumentFragment();
  for (var i = 0; i < cappellaMessages.length; i++) {
    var m = cappellaMessages[i];
    var colors = cappellaBubbleColors(m, theme);
    var isRight = m.side === 'right';
    var row = document.createElement('div');
    row.className = 'cappella-row is-' + m.side
      + (m.kind === 'title' ? ' is-title' : '')
      + (m.kind === 'emo' ? ' is-emo-row' : '');
    row.dataset.msgId = m.id;

    var avatar = document.createElement('div');
    avatar.className = 'cappella-avatar';
    var avatarUrl = cappellaAvatarUrl(m.avatarIndex, m.side);
    if (avatarUrl) {
      avatar.style.backgroundImage = 'url("' + avatarUrl + '")';
    } else {
      avatar.style.background = 'linear-gradient(135deg, ' + theme.primaryColor + ', ' + theme.accentColor + ')';
    }
    row.appendChild(avatar);

    if (m.kind === 'emo') {
      /* 表情贴纸（Folia: img + wiggle + 尺寸随 active）+ 外侧时间戳 */
      var emoWrap = document.createElement('div');
      emoWrap.className = 'cappella-emo';
      var img = document.createElement('img');
      img.src = m.emoUrl;
      img.alt = '';
      img.draggable = false;
      emoWrap.appendChild(img);
      var emoTs = document.createElement('span');
      emoTs.className = 'cappella-timestamp';
      emoTs.textContent = cappellaFormatTimestamp(m.renderEnd == null ? m.end : m.renderEnd);
      emoWrap.appendChild(emoTs);
      row.appendChild(emoWrap);
    } else {
      var bubble = document.createElement('div');
      bubble.className = 'cappella-bubble' + (m.kind === 'title' ? ' is-title-text' : '');
      bubble.style.backgroundColor = colors.backgroundColor;
      bubble.style.borderColor = colors.borderColor;
      bubble.style.color = colors.textColor;
      /* 激活流光层（Folia CappellaBubbleGlow） */
      var glow = document.createElement('span');
      glow.className = 'cappella-bubble-glow';
      glow.style.setProperty('--cp-glow-alpha', isRight ? motion.glowRightAlpha : motion.glowLeftAlpha);
      glow.style.animationDuration = motion.glowDuration + 's';
      bubble.appendChild(glow);
      /* 时间戳（Folia: 气泡外侧 8px，passed 后浮现） */
      var ts = document.createElement('span');
      ts.className = 'cappella-timestamp';
      ts.style.color = theme.secondaryColor;
      ts.textContent = cappellaFormatTimestamp(m.kind === 'title' ? 0 : (m.renderEnd == null ? m.end : m.renderEnd));
      bubble.appendChild(ts);
      if (m.kind === 'title') {
        var titleSpan = document.createElement('span');
        titleSpan.className = 'cappella-text';
        titleSpan.textContent = m.text;
        bubble.appendChild(titleSpan);
      } else {
        var textSpan = document.createElement('span');
        textSpan.className = 'cappella-text';
        var chars = Array.from(m.text);
        for (var c = 0; c < chars.length; c++) {
          var span = document.createElement('span');
          span.className = 'cappella-char';
          span.textContent = chars[c];
          textSpan.appendChild(span);
        }
        bubble.appendChild(textSpan);
      }
      row.appendChild(bubble);
    }
    frag.appendChild(row);
    cappellaDomByKey[m.id] = { row: row };
  }
  list.appendChild(frag);
  var scroller = document.getElementById('cappella-scroller');
  if (scroller) scroller.scrollTop = 0;
}

/* ---------- 250ms 轮询 tick ---------- */

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

function cappellaTick(motion) {
  var list = cappellaEnsureDom();
  if (!list) return;
  var t = cappellaNowTime();
  var activeIdx = cappellaActiveIndexAt(t);

  /* 消息三态 + 逐字 reveal（Folia: cappella-char-fade 220ms） */
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

  /* 滚动：最新可见消息贴底 */
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

/* 当前三档（主题 animationIntensity；缺省 normal）与主题色 */
function cappellaThemeNow() {
  var active = (typeof themeServiceActiveTheme === 'function') ? themeServiceActiveTheme() : null;
  var theme = active || { backgroundColor: '#171009', primaryColor: '#f2e6d4', accentColor: '#ff9c6e', secondaryColor: '#e6c9a6' };
  var intensity = (active && active.animationIntensity && CAPPELLA_CONFIGS[active.animationIntensity])
    ? active.animationIntensity : 'normal';
  return { theme: theme, intensity: intensity, config: CAPPELLA_CONFIGS[intensity] };
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
  var env = cappellaThemeNow();
  cappellaMessages = cappellaBuildMessages(lines, titleText, env.intensity, songKey);
  cappellaLastActiveIdx = -99;
  cappellaBuildDom(list, titleText, env.theme, env.config.motion);
  /* 档位 motion 参数写入覆盖层 CSS 变量 */
  var overlay = document.getElementById('cappella-overlay');
  if (overlay) cappellaApplyMotionVars(overlay, env.config.motion);
}

function cappellaApplyMotionVars(el, motion) {
  var s = el.style;
  s.setProperty('--cp-active-scale', motion.activeScale);
  s.setProperty('--cp-passed-scale', motion.passedScale);
  s.setProperty('--cp-passed-opacity', motion.passedOpacity);
  s.setProperty('--cp-active-font', (18 * motion.activeFontMultiplier).toFixed(2) + 'px');
  s.setProperty('--cp-inactive-font', (18 * motion.inactiveFontMultiplier).toFixed(2) + 'px');
  s.setProperty('--cp-active-pad-x', motion.activePaddingX + 'px');
  s.setProperty('--cp-active-pad-y', motion.activePaddingY + 'px');
  s.setProperty('--cp-inactive-pad-x', motion.inactivePaddingX + 'px');
  s.setProperty('--cp-inactive-pad-y', motion.inactivePaddingY + 'px');
  s.setProperty('--cp-active-min-h', motion.activeMinHeight + 'px');
  s.setProperty('--cp-inactive-min-h', motion.inactiveMinHeight + 'px');
  s.setProperty('--cp-glow-opacity', motion.glowOpacity);
  s.setProperty('--cp-emo-active', motion.emoActiveSize + 'px');
  s.setProperty('--cp-emo-inactive', motion.emoInactiveSize + 'px');
  s.setProperty('--cp-enter-y', motion.rowEnterY + 'px');
}

/* ---------- 生命周期 ---------- */

function startCappella() {
  cappellaLinesKey = '';
  cappellaRebuild();
  cappellaTick(cappellaThemeNow().config.motion);
  (function loop() {
    if (!cappellaMode) return;
    cappellaRebuild();
    cappellaTick(cappellaThemeNow().config.motion);
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
    startCappella();
  } else {
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
