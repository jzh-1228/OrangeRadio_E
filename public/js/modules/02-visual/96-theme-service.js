// ============================================================
// 96-theme-service.js — 封面派生双主题服务（Folia builtinTheme 全链移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0):
//   src/utils/themeColorMath.ts（色彩数学：HSL/对比度/亮度求解器）
//   src/utils/builtinTheme/coverPaletteAnalysis.ts（封面色板分析）
//   src/utils/builtinTheme/generateBuiltinDualTheme.ts（双主题生成）
//   src/utils/builtinTheme/themeNameTable.ts / themeDescriptionTable.ts
//
// Folia 的"主题预设"不是静态清单：每首歌按封面色相 + 和声方案生成
// 昼/夜一对主题（背景基调按 ink/tinted/rich 三档、文本色沿亮度轴解对比度、
// 诗意见证名如"潮汐子夜 Built-in"与一句氛围描述），昼夜自动切换。
// 本移植保持算法与文案逐行一致；随机源改为按歌曲 key 播种的确定性
// mulberry32（同一首歌每次生成同一主题，跨会话稳定）。
//
// 消费端：
//   1) 背景 context（95-background-runtime currentCoverPalette 委派至此）
//   2) 烟纸 fumeTheme 颜色同步（20-fume fumeSyncTheme）
//   3) CSS 变量 --theme-*（UI 徽章等取用）
//   4) DIY 控制台「外观」：主题模式 seg（跟随昼夜/白天/黑夜）+ 主题名/描述
// ============================================================

/* ---------- §1 色彩数学（themeColorMath.ts） ---------- */

var THEME_FALLBACK_COLOR = '#4f7cff';

function themeClamp01(v) { return Math.max(0, Math.min(1, v)); }
function themeNormalizeHue(hue) { return ((hue % 360) + 360) % 360; }

function themeClampChannel(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function themeParseColor(value) {
  if (typeof value !== 'string') return null;
  var text = value.trim();
  var m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(text);
  if (m) {
    var hex = m[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  /* 歌词取色管线产物是 rgb()/rgba() 字符串（Folia parseColorChannels 等价） */
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(text);
  if (m) {
    return { r: +m[1] % 256, g: +m[2] % 256, b: +m[3] % 256 };
  }
  return null;
}

function themeRgbToHex(rgb) {
  function ch(c) { var s = themeClampChannel(c).toString(16); return s.length < 2 ? '0' + s : s; }
  return '#' + ch(rgb.r) + ch(rgb.g) + ch(rgb.b);
}

function themeRgbToHsl(rgb) {
  var r = themeClampChannel(rgb.r) / 255;
  var g = themeClampChannel(rgb.g) / 255;
  var b = themeClampChannel(rgb.b) / 255;
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  var delta = max - min;
  var lightness = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  var saturation = delta / (1 - Math.abs(2 * lightness - 1));
  var hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return { h: themeNormalizeHue(hue * 60), s: themeClamp01(saturation), l: themeClamp01(lightness) };
}

function themeHslToRgb(hsl) {
  var hue = themeNormalizeHue(hsl.h);
  var saturation = themeClamp01(hsl.s);
  var lightness = themeClamp01(hsl.l);
  var chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  var secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  var offset = lightness - chroma / 2;
  var sector = Math.floor(hue / 60) % 6;
  var rgb;
  if (sector === 0) rgb = [chroma, secondary, 0];
  else if (sector === 1) rgb = [secondary, chroma, 0];
  else if (sector === 2) rgb = [0, chroma, secondary];
  else if (sector === 3) rgb = [0, secondary, chroma];
  else if (sector === 4) rgb = [secondary, 0, chroma];
  else rgb = [chroma, 0, secondary];
  return {
    r: themeClampChannel((rgb[0] + offset) * 255),
    g: themeClampChannel((rgb[1] + offset) * 255),
    b: themeClampChannel((rgb[2] + offset) * 255)
  };
}

function themeHexToHsl(color) {
  var parsed = themeParseColor(color);
  return parsed ? themeRgbToHsl(parsed) : null;
}

function themeHslToHex(hsl) { return themeRgbToHex(themeHslToRgb(hsl)); }

function themeMixHex(from, to, amount) {
  var a = themeParseColor(from);
  var b = themeParseColor(to);
  if (!a || !b) return b ? themeRgbToHex(b) : (a ? themeRgbToHex(a) : THEME_FALLBACK_COLOR);
  var ratio = themeClamp01(amount);
  return themeRgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio
  });
}

function themeRelativeLuminance(color) {
  var parsed = themeParseColor(color);
  if (!parsed) return 0;
  function transform(channel) {
    var n = channel / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * transform(parsed.r) + 0.7152 * transform(parsed.g) + 0.0722 * transform(parsed.b);
}

function themeContrastRatio(fg, bg) {
  var la = themeRelativeLuminance(fg);
  var lb = themeRelativeLuminance(bg);
  var lighter = Math.max(la, lb);
  var darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function themeHueDistance(a, b) {
  var d = Math.abs(themeNormalizeHue(a) - themeNormalizeHue(b));
  return Math.min(d, 360 - d);
}

/* 沿亮度轴离开背景直到过对比度地板（保色相保饱和度）；到不了取最优。
   与 Folia adjustLightnessForContrast 逐行一致。 */
function themeAdjustLightnessForContrast(color, background, minRatio, step, maxSteps) {
  step = step || 0.02;
  maxSteps = maxSteps || 50;
  var hsl = themeHexToHsl(color);
  if (!hsl) return color;
  var goDarker = themeRelativeLuminance(background) > 0.35;
  var direction = goDarker ? -1 : 1;
  var bestColor = themeHslToHex(hsl);
  var bestRatio = themeContrastRatio(bestColor, background);
  for (var i = 0; i <= maxSteps; i++) {
    var lightness = themeClamp01(hsl.l + direction * step * i);
    var candidate = themeHslToHex({ h: hsl.h, s: hsl.s, l: lightness });
    var ratio = themeContrastRatio(candidate, background);
    if (ratio > bestRatio) { bestRatio = ratio; bestColor = candidate; }
    if (ratio >= minRatio) return candidate;
    if (i > 0 && (lightness === 0 || lightness === 1)) return bestColor;
  }
  return bestColor;
}

/* ---------- §2 封面色板分析（coverPaletteAnalysis.ts） ---------- */

var THEME_MIN_SUPPORT_SATURATION = 0.15;
var THEME_MIN_SUPPORT_HUE_DISTANCE = 25;
var THEME_MAX_SUPPORT_HUE_DISTANCE = 160;
var THEME_MONOCHROME_SATURATION_CEILING = 0.18;

function themeCoverColorScore(hsl) {
  return hsl.s * Math.max(0, 1 - Math.abs(hsl.l - 0.5) * 1.2);
}

function themePickWeighted(random, entries) {
  var total = 0;
  for (var i = 0; i < entries.length; i++) total += entries[i].weight;
  var cursor = random() * total;
  for (var j = 0; j < entries.length; j++) {
    cursor -= entries[j].weight;
    if (cursor <= 0) return entries[j].value;
  }
  return entries[entries.length - 1].value;
}

function themePickBaseColor(parsedColors, random) {
  if (!parsedColors.length) {
    return { h: random() * 360, s: 0.35 + random() * 0.3, l: 0.5 };
  }
  var scored = parsedColors[0];
  for (var i = 1; i < parsedColors.length; i++) {
    if (themeCoverColorScore(parsedColors[i]) > themeCoverColorScore(scored)) scored = parsedColors[i];
  }
  return themeCoverColorScore(scored) > 0.02 ? scored : parsedColors[0];
}

function themePickSupportHue(parsedColors, base) {
  for (var i = 0; i < parsedColors.length; i++) {
    var c = parsedColors[i];
    if (c.s < THEME_MIN_SUPPORT_SATURATION) continue;
    var distance = themeHueDistance(c.h, base.h);
    if (distance >= THEME_MIN_SUPPORT_HUE_DISTANCE && distance <= THEME_MAX_SUPPORT_HUE_DISTANCE) return c.h;
  }
  return null;
}

function themePickScheme(baseSaturation, supportHue, random) {
  if (supportHue !== null && random() < 0.65) return 'duotone';
  return themePickWeighted(random, [
    { value: 'analogous', weight: 3 },
    { value: 'complementary', weight: 2 },
    { value: 'split', weight: 2 },
    { value: 'triadic', weight: 1.5 },
    { value: 'monochrome', weight: baseSaturation < THEME_MONOCHROME_SATURATION_CEILING ? 2.5 : 0 }
  ]);
}

function themeResolveAccentHue(scheme, baseHue, supportHue, random) {
  var sign = random() < 0.5 ? -1 : 1;
  if (scheme === 'duotone') return supportHue == null ? baseHue : supportHue;
  if (scheme === 'analogous') return baseHue + sign * (20 + random() * 15);
  if (scheme === 'complementary') return baseHue + 150 + random() * 30;
  if (scheme === 'split') return baseHue + (sign < 0 ? 150 : 210);
  if (scheme === 'triadic') return baseHue + sign * 120;
  return baseHue;   /* monochrome */
}

function themeAnalyzeCoverPalette(coverColors, random) {
  var parsedColors = [];
  for (var i = 0; i < (coverColors ? coverColors.length : 0); i++) {
    var hsl = themeHexToHsl(coverColors[i]);
    if (hsl) parsedColors.push(hsl);
  }
  var base = themePickBaseColor(parsedColors, random);
  var supportHue = themePickSupportHue(parsedColors, base);
  var scheme = themePickScheme(base.s, supportHue, random);
  var accentJitter = scheme === 'monochrome' ? 0 : (random() - 0.5) * 16;
  return {
    baseHue: themeNormalizeHue(base.h),
    baseSaturation: base.s,
    baseLightness: base.l,
    accentHue: themeNormalizeHue(themeResolveAccentHue(scheme, base.h, supportHue, random) + accentJitter),
    scheme: scheme,
    tone: themePickWeighted(random, [
      { value: 'ink', weight: 3 },
      { value: 'tinted', weight: 4 },
      { value: 'rich', weight: 2.5 }
    ])
  };
}

/* ---------- §3 数值设计空间（themeColorRanges.ts） ---------- */

var THEME_PRIMARY_MIN_CONTRAST = 9;
var THEME_ACCENT_MIN_CONTRAST = 3.2;
var THEME_SECONDARY_MIN_CONTRAST = 4.5;
var THEME_MIN_BACKGROUND_SATURATION = 0.04;

var THEME_BACKGROUND_TONES = {
  ink: {
    darkLightness: [0.055, 0.085], darkSaturation: [0.10, 0.22],
    lightLightness: [0.940, 0.965], lightSaturation: [0.05, 0.12]
  },
  tinted: {
    darkLightness: [0.075, 0.110], darkSaturation: [0.20, 0.36],
    lightLightness: [0.920, 0.950], lightSaturation: [0.10, 0.20]
  },
  rich: {
    darkLightness: [0.095, 0.140], darkSaturation: [0.32, 0.50],
    lightLightness: [0.900, 0.935], lightSaturation: [0.18, 0.30]
  }
};

var THEME_PRIMARY_RANGES = {
  light: { saturation: [0.15, 0.40], lightness: [0.10, 0.20] },
  dark: { saturation: [0.10, 0.30], lightness: [0.90, 0.96] }
};
var THEME_ACCENT_RANGES = {
  light: { saturation: [0.55, 0.88], lightness: [0.38, 0.55] },
  dark: { saturation: [0.55, 0.92], lightness: [0.55, 0.72] }
};
var THEME_SECONDARY_RANGES = {
  light: { saturation: [0.15, 0.45], lightness: [0.32, 0.46] },
  dark: { saturation: [0.15, 0.45], lightness: [0.62, 0.76] }
};

/* ---------- §4 命名与描述（themeNameTable.ts / themeDescriptionTable.ts） ---------- */

var THEME_BUILTIN_NAME_SUFFIX = ' Built-in';
var THEME_NEUTRAL_SATURATION_CEILING = 0.12;
var THEME_NEUTRAL_PREFIXES = ['月白', '银灰', '素墨', '雾白', '灰烬'];
var THEME_HUE_PREFIX_BUCKETS = [
  { maxHue: 20, prefixes: ['绯色', '朱砂', '珊瑚', '赤霞', '石榴'] },
  { maxHue: 45, prefixes: ['琥珀', '暮光', '橘光', '麦浪', '落日'] },
  { maxHue: 70, prefixes: ['鎏金', '稻香', '芒草', '秋黄', '沙丘'] },
  { maxHue: 105, prefixes: ['新柳', '青苔', '竹露', '草木', '春芜'] },
  { maxHue: 165, prefixes: ['苔痕', '松风', '薄荷', '翡翠', '深林'] },
  { maxHue: 205, prefixes: ['潮汐', '雾蓝', '海雾', '天青', '汀洲'] },
  { maxHue: 255, prefixes: ['深蓝', '靛青', '群青', '远洋', '蓝调'] },
  { maxHue: 300, prefixes: ['紫烟', '丁香', '暮霭', '紫棠', '薰衣'] },
  { maxHue: 360, prefixes: ['玫影', '桃夭', '藕荷', '蔷薇', '胭脂'] }
];
var THEME_LIGHT_SUFFIXES = ['破晓', '晨光', '微光', '初雪', '白昼', '浮云', '日砂'];
var THEME_DARK_SUFFIXES = ['子夜', '夜色', '深潭', '暗涌', '沉夜', '夜航', '星屑'];

function themePickFrom(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function themeResolveHuePrefixes(hue) {
  for (var i = 0; i < THEME_HUE_PREFIX_BUCKETS.length; i++) {
    if (hue < THEME_HUE_PREFIX_BUCKETS[i].maxHue) return THEME_HUE_PREFIX_BUCKETS[i].prefixes;
  }
  return THEME_HUE_PREFIX_BUCKETS[THEME_HUE_PREFIX_BUCKETS.length - 1].prefixes;
}

function themePickBuiltinNames(palette, random) {
  var prefixes = palette.baseSaturation < THEME_NEUTRAL_SATURATION_CEILING
    ? THEME_NEUTRAL_PREFIXES
    : themeResolveHuePrefixes(palette.baseHue);
  var prefix = themePickFrom(prefixes, random);
  return {
    light: prefix + themePickFrom(THEME_LIGHT_SUFFIXES, random) + THEME_BUILTIN_NAME_SUFFIX,
    dark: prefix + themePickFrom(THEME_DARK_SUFFIXES, random) + THEME_BUILTIN_NAME_SUFFIX
  };
}

var THEME_LIGHT_DESCRIPTIONS = {
  warm: [
    '阳光落在窗台上，我忽然想起了那年的夏天。',
    '橘子汽水的味道，一整个下午都没有散去。',
    '我把心事晒在阳台，风一吹就全都跑掉了。',
    '热气腾腾的黄昏里，我们谁也没有先开口。',
    '像是握着一颗刚出炉的糖，烫手却舍不得放。'
  ],
  gold: [
    '麦田的风从耳边掠过，我又想起那条回家的路。',
    '午后的光把一切都镀成蜜色，时间慢得像糖。',
    '我把耳机塞进耳朵，整个世界忽然温柔起来。',
    '阳光穿过树叶的缝隙，落成一地细碎的金子。',
    '骑车经过那条巷子时，风里全是稻草的味道。'
  ],
  green: [
    '雨后的青草味钻进鼻腔，我忽然想去很远的地方。',
    '推开窗，整个春天都涌了进来，我却说不出话。',
    '阳光落在叶脉上，我数着它们发呆了一下午。',
    '山间的风很轻，把我心里的褶皱也抚平了。',
    '我躺在草地上，听见这个世界安静地生长。'
  ],
  blue: [
    '海风吹过晾晒的白衬衫，那年夏天还没有结束。',
    '推开窗是一整片蓝，我忽然不想去任何地方了。',
    '天空蓝得不像话，我把心事都寄给了云。',
    '清晨的水汽还没散，整座城市都是浅蓝色的。',
    '我沿着河堤走了很久，风一直安静地陪着我。'
  ],
  purple: [
    '薰衣草的味道很淡，像一段快要忘掉的心事。',
    '黄昏把云染成淡紫，我站在原地看了很久。',
    '梦醒之后天光微紫，我还留在昨夜的情节里。',
    '紫丁香开了满树，我却只想起一个人的名字。',
    '我把那封信折成四折，藏进了春天的口袋里。'
  ],
  neutral: [
    '灰白的天空下，我把耳机音量调到了最大。',
    '雾还没散，整座城市都像一张过曝的旧照片。',
    '我在空荡的房间里坐着，阳光淡得几乎没有。',
    '所有颜色都退去了，只剩下我和这段旋律。',
    '冬天的早晨很安静，我听见自己呼吸的声音。'
  ]
};
var THEME_DARK_DESCRIPTIONS = {
  warm: [
    '余温还留在指尖，夜色已经漫过了整条街。',
    '炉火熄了，我仍坐在原地想那句没说完的话。',
    '深夜的红灯一闪一闪，像谁没能说出口的爱。',
    '我在暗处点了一支烟，把心事烧成了灰烬。',
    '热烈过后的沉默里，我听见自己的心跳。'
  ],
  gold: [
    '路灯把影子拉得很长，我一个人慢慢走回去。',
    '夜里的灯火像散落的碎金，我数着它们入睡。',
    '我在黑暗里回忆那个金色的下午，久久不愿醒。',
    '秋夜的风有点凉，可我还是不想早点回家。',
    '屋里只剩一盏暖灯，照着我还没写完的信。'
  ],
  green: [
    '深林的夜没有星星，只有风穿过树梢的声音。',
    '我在暗绿色的夜里走着，像走进了一场旧梦。',
    '夜露沾湿了裤脚，我还舍不得离开这片安静。',
    '整座山都睡着了，只有我的心事还醒着。',
    '苔藓在黑暗里悄悄蔓延，像我没说出口的思念。'
  ],
  blue: [
    '深夜的海把所有声音都吞掉了，只剩下呼吸。',
    '我在蓝色的黑暗里漂着，谁也找不到我。',
    '窗外下着雨，我把整个夜晚都听成了潮声。',
    '星星沉在海底，我在岸上等一句晚安。',
    '午夜的车窗外一片深蓝，我不想到站。'
  ],
  purple: [
    '暮色一寸寸沉下去，我的心事也跟着沉了。',
    '紫色的夜里我做了一个梦，梦里全是旧时光。',
    '霓虹把夜色染成暧昧的紫，我不敢多看一眼。',
    '我在深夜反复播放这首歌，像反复回到了过去。',
    '月光穿过窗帘的缝，把我的孤独照得很轻。'
  ],
  neutral: [
    '黑白的夜里，我把所有心事都调成了静音。',
    '墨色漫过窗台，我在这片安静里慢慢沉下去。',
    '我关掉了所有的灯，只留这首歌陪着我。',
    '深夜的房间没有颜色，只有旋律在轻轻发亮。',
    '世界安静得像一场默片，而我是唯一的观众。'
  ]
};

function themeResolveDescriptionFamily(palette) {
  if (palette.baseSaturation < THEME_NEUTRAL_SATURATION_CEILING) return 'neutral';
  if (palette.baseHue < 45 || palette.baseHue >= 330) return 'warm';
  if (palette.baseHue < 105) return 'gold';
  if (palette.baseHue < 165) return 'green';
  if (palette.baseHue < 255) return 'blue';
  return 'purple';
}

function themePickBuiltinDescriptions(palette, random) {
  var family = themeResolveDescriptionFamily(palette);
  return {
    light: themePickFrom(THEME_LIGHT_DESCRIPTIONS[family], random),
    dark: themePickFrom(THEME_DARK_DESCRIPTIONS[family], random)
  };
}

/* ---------- §5 双主题生成（generateBuiltinDualTheme.ts） ---------- */

function themeBetween(random, range) { return range[0] + random() * (range[1] - range[0]); }

function themeLerpHue(from, to, amount) {
  var delta = ((to - from + 540) % 360) - 180;
  return themeNormalizeHue(from + delta * amount);
}

function themeBuildBackgroundColor(mode, palette, random) {
  var tone = THEME_BACKGROUND_TONES[palette.tone];
  var lightnessRange = mode === 'dark' ? tone.darkLightness : tone.lightLightness;
  var saturationRange = mode === 'dark' ? tone.darkSaturation : tone.lightSaturation;
  var coverWeight = 0.55 + 0.45 * themeClamp01(palette.baseSaturation / 0.7);
  return themeHslToHex({
    h: palette.baseHue,
    s: Math.max(THEME_MIN_BACKGROUND_SATURATION, themeBetween(random, saturationRange) * coverWeight),
    l: themeBetween(random, lightnessRange)
  });
}

function themeBuildAccentColor(mode, palette, backgroundColor, primaryColor, random) {
  var ranges = THEME_ACCENT_RANGES[mode];
  var saturation = themeBetween(random, ranges.saturation);
  var lightness = themeBetween(random, ranges.lightness);
  var accent = themeAdjustLightnessForContrast(
    themeHslToHex({ h: palette.accentHue, s: saturation, l: lightness }),
    backgroundColor, THEME_ACCENT_MIN_CONTRAST);
  var collidesWithPrimary = themeHueDistance(palette.accentHue, palette.baseHue) < 15
    && themeContrastRatio(accent, primaryColor) < 1.3;
  if (!collidesWithPrimary) return accent;
  return themeAdjustLightnessForContrast(
    themeHslToHex({ h: themeNormalizeHue(palette.accentHue + 40), s: saturation, l: lightness }),
    backgroundColor, THEME_ACCENT_MIN_CONTRAST);
}

function themeBuildModeTheme(mode, palette, random, name, description) {
  var backgroundColor = themeBuildBackgroundColor(mode, palette, random);
  var primaryRanges = THEME_PRIMARY_RANGES[mode];
  var primaryColor = themeAdjustLightnessForContrast(
    themeHslToHex({
      h: palette.baseHue,
      s: themeBetween(random, primaryRanges.saturation),
      l: themeBetween(random, primaryRanges.lightness)
    }),
    backgroundColor, THEME_PRIMARY_MIN_CONTRAST);
  var accentColor = themeBuildAccentColor(mode, palette, backgroundColor, primaryColor, random);
  var secondaryRanges = THEME_SECONDARY_RANGES[mode];
  var secondaryColor = themeAdjustLightnessForContrast(
    themeHslToHex({
      h: themeLerpHue(palette.baseHue, palette.accentHue, 0.2 + random() * 0.4),
      s: themeBetween(random, secondaryRanges.saturation),
      l: themeBetween(random, secondaryRanges.lightness)
    }),
    backgroundColor, THEME_SECONDARY_MIN_CONTRAST);
  return {
    name: name,
    description: description,
    backgroundColor: backgroundColor,
    primaryColor: primaryColor,
    accentColor: accentColor,
    secondaryColor: secondaryColor,
    fontStyle: 'sans',
    animationIntensity: 'normal',
    provider: 'Built-in'
  };
}

/* 确定性随机（mulberry32 + 字符串哈希播种）：同歌同主题，跨会话稳定 */
function themeHashSeed(text) {
  var h = 2166136261;
  text = String(text || '');
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function themeMulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function themeGenerateBuiltinDualTheme(coverColors, random) {
  var palette = themeAnalyzeCoverPalette(coverColors || [], random);
  var names = themePickBuiltinNames(palette, random);
  var descriptions = themePickBuiltinDescriptions(palette, random);
  return {
    light: themeBuildModeTheme('light', palette, random, names.light, descriptions.light),
    dark: themeBuildModeTheme('dark', palette, random, names.dark, descriptions.dark)
  };
}

/* ---------- §6 宿主：昼房切换 / 缓存 / 消费端 ---------- */

/* 基础预设对（Folia baseThemes.ts 逐字段移植）：
   墨染（Midnight Default，zinc 系暗夜）与素白（Daylight Default，stone 系日光，
   强调色 orange-600）。这是"保存自定义或应用生成主题之前用户看到的那对主题"，
   也是无封面时的回退。 */
var THEME_BASE_DUAL = {
  light: {
    name: '素白 Default',
    backgroundColor: '#f5f5f4',
    primaryColor: '#1c1917',
    accentColor: '#ea580c',
    secondaryColor: '#44403c',
    fontStyle: 'sans',
    animationIntensity: 'normal',
    provider: 'Built-in'
  },
  dark: {
    name: '墨染 Default',
    backgroundColor: '#09090b',
    primaryColor: '#f4f4f5',
    accentColor: '#f4f4f5',
    secondaryColor: '#71717a',
    fontStyle: 'sans',
    animationIntensity: 'normal',
    provider: 'Built-in'
  }
};

/* ---------- 我的主题库（Theme Park 的保存主题等价：localStorage 双主题清单） ---------- */

var THEME_LIBRARY_KEY = 'orangesea-theme-library-v1';

function themeLibraryRead() {
  try {
    var raw = JSON.parse(localStorage.getItem(THEME_LIBRARY_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var e = raw[i];
      if (e && e.id && e.light && e.dark
        && e.light.backgroundColor && e.light.primaryColor && e.light.accentColor
        && e.dark.backgroundColor && e.dark.primaryColor && e.dark.accentColor) {
        out.push(e);
      }
    }
    return out;
  } catch (err) {
    return [];
  }
}

function themeLibraryWrite(list) {
  try { localStorage.setItem(THEME_LIBRARY_KEY, JSON.stringify(list || [])); } catch (err) { }
}

function themeSanitizeSavedSide(side) {
  return {
    name: String(side.name || '我的主题').slice(0, 40),
    description: String(side.description || '').slice(0, 60),
    backgroundColor: themeParseColor(side.backgroundColor) ? side.backgroundColor : '#09090b',
    primaryColor: themeParseColor(side.primaryColor) ? side.primaryColor : '#f4f4f5',
    accentColor: themeParseColor(side.accentColor) ? side.accentColor : '#f4f4f5',
    secondaryColor: themeParseColor(side.secondaryColor) ? side.secondaryColor : '#71717a',
    fontStyle: 'sans',
    animationIntensity: 'normal',
    provider: 'Custom'
  };
}

/* 把当前生效的双主题（封面派生结果或基础对）存进库；返回条目或 null */
function themeLibrarySaveCurrent(name) {
  var dual = null;
  var generated = themeCurrentDualTheme();
  dual = generated || THEME_BASE_DUAL;
  var entry = {
    id: 'th-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
    name: String(name || '').trim().slice(0, 24) || (dual.dark && dual.dark.name ? String(dual.dark.name).replace(/ Built-in$/, '') : '我的主题'),
    createdAt: Date.now(),
    light: null,
    dark: null
  };
  /* 两侧统一用用户起的名字（应用后主题名/描述行读得到） */
  entry.light = themeSanitizeSavedSide(dual.light);
  entry.dark = themeSanitizeSavedSide(dual.dark);
  entry.light.name = entry.name;
  entry.dark.name = entry.name;
  var list = themeLibraryRead();
  list.push(entry);
  themeLibraryWrite(list);
  return entry;
}

function themeLibraryDelete(id) {
  var list = themeLibraryRead();
  var next = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].id !== id) next.push(list[i]);
  }
  themeLibraryWrite(next);
  /* 若删的是正在用的：回到封面派生 */
  if (String((typeof fx !== 'undefined' && fx && fx.themePreset) || '').indexOf('custom:') === 0) {
    var currentId = String(fx.themePreset).slice(7);
    if (currentId === id && typeof fx !== 'undefined' && fx) {
      fx.themePreset = 'cover';
      if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'themePreset' });
    }
  }
}

/* ---------- 主题来源解析（fx.themePreset：cover 派生 / base 墨染素白 / custom:<id>） ---------- */

function themeCurrentPresetSetting() {
  var raw = (typeof fx !== 'undefined' && fx && fx.themePreset) || 'cover';
  if (raw === 'base') return 'base';
  if (String(raw).indexOf('custom:') === 0) {
    var id = String(raw).slice(7);
    var list = themeLibraryRead();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return 'cover';   /* 库里已不存在 → 回退派生 */
  }
  return 'cover';
}

var duoThemeState = {
  dual: null,
  cacheKey: '',
  activeMode: '',             /* 实际生效 light|dark（解析 fx.themeMode 后） */
  cssKey: ''
};

function themeCurrentModeSetting() {
  var raw = (typeof fx !== 'undefined' && fx) ? fx.themeMode : 'auto';
  return raw === 'light' || raw === 'dark' ? raw : 'auto';
}

function themeIsDaylight() {
  var hour = new Date().getHours();
  return hour >= 7 && hour < 19;
}

function themeResolveActiveMode() {
  var setting = themeCurrentModeSetting();
  return setting === 'auto' ? (themeIsDaylight() ? 'light' : 'dark') : setting;
}

/* 当前歌的封面取色 hex 列表（歌词取色管线产物） */
function themeCoverColorsForCurrentSong() {
  var pal = (typeof stageLyrics !== 'undefined' && stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette)) || null;
  if (!pal) return null;
  var out = [];
  if (pal.base) out.push(pal.base);
  if (pal.primary) out.push(pal.primary);
  if (pal.secondary) out.push(pal.secondary);
  if (pal.highlight || pal.accent) out.push(pal.highlight || pal.accent);
  return out.length ? out : null;
}

function themeSongKey() {
  try {
    if (typeof lyricCurrentCoverPaletteKey === 'function') {
      var key = lyricCurrentCoverPaletteKey();
      if (key) return String(key);
    }
  } catch (e) { }
  return (typeof currentIdx !== 'undefined' && currentIdx >= 0) ? ('idx:' + currentIdx) : 'none';
}

/* 生成/缓存当前歌双主题；返回 {light, dark} 或 null（无取色时）。
   取色管线分步写入 base/primary/secondary——键需连续两拍一致才重生成（防中途快照翻主题）。 */
var duoThemePendingKey = '';
function themeCurrentDualTheme() {
  var colors = themeCoverColorsForCurrentSong();
  var key = themeSongKey() + '|' + (colors ? colors.join(',') : '');
  if (key === duoThemeState.cacheKey) return duoThemeState.dual;
  if (key !== duoThemePendingKey) {
    duoThemePendingKey = key;   /* 首见：等下一拍确认，不翻当前主题 */
    return duoThemeState.dual;
  }
  duoThemeState.cacheKey = key;
  duoThemeState.dual = colors
    ? themeGenerateBuiltinDualTheme(colors, themeMulberry32(themeHashSeed(key)))
    : null;
  return duoThemeState.dual;
}

/* 当前生效主题（Folia Theme 形状）。来源解析：
   cover = 封面派生（无取色回退墨染/素白，与 Folia"保存前看到的那对"一致）；
   base = 墨染/素白；custom:<id> = 我的主题库条目。昼房由 fx.themeMode 决定。 */
function themeServiceActiveTheme() {
  var preset = themeCurrentPresetSetting();
  var dual = null;
  if (preset === 'base') {
    dual = THEME_BASE_DUAL;
  } else if (preset && typeof preset === 'object') {
    dual = preset;
  } else {
    dual = themeCurrentDualTheme() || THEME_BASE_DUAL;
  }
  return dual[themeResolveActiveMode()] || dual.dark;
}

/* CSS 变量输出（主题变化才写） */
function themeSyncCssVars(active) {
  if (!active) return;
  var key = active.name + '|' + active.backgroundColor + '|' + active.accentColor;
  if (key === duoThemeState.cssKey) return;
  duoThemeState.cssKey = key;
  var root = document.documentElement;
  root.style.setProperty('--theme-bg', active.backgroundColor);
  root.style.setProperty('--theme-primary', active.primaryColor);
  root.style.setProperty('--theme-accent', active.accentColor);
  root.style.setProperty('--theme-secondary', active.secondaryColor);
}

/* 轮询宿主：封面/昼夜/设置变化 → 更新生效主题 + CSS 变量 + UI 行 */
var duoThemeTimer = 0;
var duoThemeLastAppliedName = '';

function themeServiceApply() {
  var active = themeServiceActiveTheme();
  themeSyncCssVars(active);
  var name = active ? active.name : '';
  if (name !== duoThemeLastAppliedName) {
    duoThemeLastAppliedName = name;
    themeRenderInfoLine(active);
  }
}

function themeServiceLoop() {
  if (duoThemeTimer) return;
  function tick() {
    try { themeServiceApply(); } catch (e) { /* 主题失败不伤主链路 */ }
    duoThemeTimer = setTimeout(tick, 1200);
  }
  tick();
}

/* ---------- §7 DIY 控制台「外观」：主题来源/昼夜 seg + 主题库 + 信息行 ---------- */

function themeRenderInfoLine(active) {
  var el = document.getElementById('theme-info-line');
  if (!el) return;
  var mode = themeResolveActiveMode() === 'light' ? '白天' : '黑夜';
  el.textContent = active
    ? active.name + ' · ' + (active.description || '') + ' · ' + mode
    : '等待封面取色 · 播放后生成主题 · ' + mode;
}

/* 来源 seg：封面派生 / 墨染素白（库主题在库列表里单选） */
function themeRenderPresetSeg() {
  var seg = document.getElementById('theme-preset-seg');
  if (!seg || seg._themeBound) return;
  seg._themeBound = true;
  seg.innerHTML =
    '<button type="button" data-theme-preset="cover" title="每首歌按封面取色生成昼/夜双主题">封面派生</button>' +
    '<button type="button" data-theme-preset="base" title="Folia 基础预设：墨染（夜）+ 素白（昼）">墨染素白</button>';
  seg.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-theme-preset]') : null;
    if (!btn) return;
    if (typeof fx !== 'undefined' && fx) fx.themePreset = btn.getAttribute('data-theme-preset');
    if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'themePreset' });
    themeSyncPresetSeg();
    themeRenderLibrary();
    themeServiceApply();
  });
  themeSyncPresetSeg();
}

function themeSyncPresetSeg() {
  var seg = document.getElementById('theme-preset-seg');
  if (!seg) return;
  var current = themeCurrentPresetSetting();
  var currentKey = current === 'base' ? 'base' : 'cover';
  var buttons = seg.querySelectorAll('[data-theme-preset]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-theme-preset') === currentKey);
  }
}

/* 我的主题库：保存当前双主题（派生结果或基础对）→ 列表应用/删除 */
function themeRenderLibrary() {
  var box = document.getElementById('theme-library');
  if (!box) return;
  if (!box._themeLibBound) {
    box._themeLibBound = true;
    box.addEventListener('click', function (e) {
      var actBtn = e.target && e.target.closest ? e.target.closest('[data-theme-lib-act]') : null;
      if (!actBtn) return;
      var act = actBtn.getAttribute('data-theme-lib-act');
      var id = actBtn.getAttribute('data-lib-id');
      if (act === 'apply' && typeof fx !== 'undefined' && fx) {
        fx.themePreset = 'custom:' + id;
        if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'themePreset' });
        themeSyncPresetSeg();
        themeRenderLibrary();
        themeServiceApply();
      } else if (act === 'del') {
        themeLibraryDelete(id);
        themeSyncPresetSeg();
        themeRenderLibrary();
        themeServiceApply();
      }
    });
    var saveBtn = document.getElementById('theme-library-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var input = document.getElementById('theme-library-name');
        var name = input ? input.value : '';
        var entry = themeLibrarySaveCurrent(name);
        if (input) input.value = '';
        if (typeof showToast === 'function') showToast('已保存主题「' + entry.name + '」');
        themeRenderLibrary();
      });
    }
  }
  var list = themeLibraryRead();
  var current = themeCurrentPresetSetting();
  var currentId = (current && typeof current === 'object') ? current.id : '';
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var active = e.id === currentId;
    html += '<div class="theme-lib-row' + (active ? ' is-active' : '') + '" data-lib-id="' + e.id + '">' +
      '<span class="theme-lib-swatch" style="background:linear-gradient(135deg,' + e.light.backgroundColor + ' 50%,' + e.dark.backgroundColor + ' 50%)"></span>' +
      '<span class="theme-lib-name" title="' + e.name.replace(/"/g, '') + '">' + e.name + '</span>' +
      '<button type="button" class="theme-lib-btn" data-theme-lib-act="apply" data-lib-id="' + e.id + '">' + (active ? '使用中' : '应用') + '</button>' +
      '<button type="button" class="theme-lib-btn is-del" data-theme-lib-act="del" data-lib-id="' + e.id + '" title="删除">✕</button>' +
      '</div>';
  }
  var listEl = document.getElementById('theme-library-list');
  if (listEl) {
    listEl.innerHTML = html || '<div class="theme-lib-empty">还没有保存的主题——封面派生出喜欢的配色后点「保存当前」</div>';
  }
}

function themeRenderModeSeg() {
  var seg = document.getElementById('theme-mode-seg');
  if (!seg || seg._themeBound) return;
  seg._themeBound = true;
  seg.innerHTML =
    '<button type="button" data-theme-mode="auto">跟随昼夜</button>' +
    '<button type="button" data-theme-mode="light">白天</button>' +
    '<button type="button" data-theme-mode="dark">黑夜</button>';
  seg.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-theme-mode]') : null;
    if (!btn) return;
    var mode = btn.getAttribute('data-theme-mode');
    if (typeof fx !== 'undefined' && fx) fx.themeMode = mode;
    if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'themeMode' });
    themeSyncModeSeg();
    themeServiceApply();
  });
  themeSyncModeSeg();
}

function themeSyncModeSeg() {
  var seg = document.getElementById('theme-mode-seg');
  if (!seg) return;
  var current = themeCurrentModeSetting();
  var buttons = seg.querySelectorAll('[data-theme-mode]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-theme-mode') === current);
  }
}

function initThemeService() {
  themeRenderModeSeg();
  themeRenderPresetSeg();
  themeRenderLibrary();
  themeServiceApply();
  themeServiceLoop();
}

if (typeof scheduleUiWarmTask === 'function') scheduleUiWarmTask(initThemeService, 380);
else setTimeout(initThemeService, 380);
