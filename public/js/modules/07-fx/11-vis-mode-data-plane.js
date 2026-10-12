'use strict';

/* =========================================================================
   OrangeSea · Folia 移植视觉模式宿主数据面（动画强度档 / 主题词色表 / 每模式调参）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — 对齐 folia-major 的三个宿主职责缺口：
   ① 动画强度档：Folia Theme.animationIntensity 三档 'calm'|'normal'|'chaotic'
     （原版 AppearanceSection.tsx 主题级循环切换），本仓落为 fx 偏好
     visAnimationIntensity（默认 'normal'），随主题下发全部移植引擎；
     claddagh（intensity 分支）/diorama（resolveDioramaMotionParams）等消费。
   ② 主题词色表：Folia Theme.wordColors = WordColorEntry[{word,color}]
     用户可编辑列表（ThemeParkContentPanel，上限 WORD_COLOR_LIMIT=40，
     themeParkDraft.ts:19）。本仓存 localStorage orangesea-vis-word-colors-v1，
     各桥构造 Theme 时注入；引擎 prepareWordColorMatchers 空表回退 accentColor。
   ③ 每模式调参：Folia 每模式 tuning + settingsPanels.tsx 滑杆/开关面板。
     本仓以显式 schema（字段/标签/类型/范围，自 settingsPanels.tsx 机械提取，
     标签用中文名）驱动 DIY 控制台「模式调参」面板；覆盖值存 localStorage
     orangesea-vis-tuning-v1（按 mode 键），桥在 create 时
     Object.assign({}, DEFAULT, overrides) 合并；引擎支持 setTuning 的模式
     改动即 live 应用（各桥经 visModeTuningRegisterLiveApply 注册），不支持的
     模式（sonnet/diorama）如实标注「下次进入生效」。
   ========================================================================= */

/* ---------- ① 动画强度档 ---------- */

function visAnimationIntensityNormalize(value) {
  var v = String(value || '').trim().toLowerCase();
  return (v === 'calm' || v === 'chaotic') ? v : 'normal';
}

function visAnimationIntensityCurrent() {
  try {
    return visAnimationIntensityNormalize(
      (typeof fx !== 'undefined' && fx && fx.visAnimationIntensity) || 'normal');
  } catch (e) {
    return 'normal';
  }
}

/* ---------- ② 主题词色表（orangesea-vis-word-colors-v1，上限同 Folia 40） ---------- */

var VIS_WORD_COLORS_STORE_KEY = 'orangesea-vis-word-colors-v1';
/* folia-major themeParkDraft.ts:19 WORD_COLOR_LIMIT */
var VIS_WORD_COLORS_LIMIT = 40;

function visHexColorNormalize(value, fallback) {
  var hex = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = '#' + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) + hex.charAt(3) + hex.charAt(3);
  }
  if (!/^#[0-9a-f]{6}$/.test(hex)) hex = (fallback && /^#[0-9a-f]{6}$/.test(fallback)) ? fallback : '#ffcf9e';
  return hex;
}

/* 条目清洗：word 去空白截 24 字，color 归一 6 位 hex；非法条目丢弃（去重按词） */
function visWordColorsSanitize(list) {
  var out = [];
  var seen = {};
  var src = Array.isArray(list) ? list : [];
  for (var i = 0; i < src.length && out.length < VIS_WORD_COLORS_LIMIT; i++) {
    var e = src[i];
    if (!e || typeof e !== 'object') continue;
    var word = String(e.word || '').trim().slice(0, 24);
    if (!word || seen[word]) continue;
    seen[word] = true;
    out.push({ word: word, color: visHexColorNormalize(e.color) });
  }
  return out;
}

function visWordColorsWrite(list) {
  var clean = visWordColorsSanitize(list).slice(0, VIS_WORD_COLORS_LIMIT);
  try {
    localStorage.setItem(VIS_WORD_COLORS_STORE_KEY, JSON.stringify(clean));
  } catch (e) { }
  return clean;
}

/* 每次读盘（词表 ≤40 条，代价可忽略），避免多写入点之间的缓存失步 */
function visWordColorsList() {
  var raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(VIS_WORD_COLORS_STORE_KEY) || '[]');
  } catch (e) {
    raw = [];
  }
  return visWordColorsSanitize(Array.isArray(raw) ? raw : []);
}

function visWordColorsAdd(word, color) {
  var list = visWordColorsList();
  var w = String(word || '').trim().slice(0, 24);
  if (!w) return false;
  for (var i = 0; i < list.length; i++) {
    if (list[i].word === w) { /* 已存在 → 改色 */
      list[i].color = visHexColorNormalize(color, list[i].color);
      visWordColorsWrite(list);
      return true;
    }
  }
  if (list.length >= VIS_WORD_COLORS_LIMIT) return false;
  list.push({ word: w, color: visHexColorNormalize(color) });
  visWordColorsWrite(list);
  return true;
}

function visWordColorsRemoveAt(index) {
  var list = visWordColorsList();
  var i = Math.round(Number(index));
  if (!(i >= 0) || i >= list.length) return false;
  list.splice(i, 1);
  visWordColorsWrite(list);
  return true;
}

function visWordColorsClear() {
  visWordColorsWrite([]);
}

/* ---------- ③ 每模式调参（orangesea-vis-tuning-v1 按 mode 键） ----------
   schema 自 folia settingsPanels.tsx / types.ts DEFAULT_*_TUNING 机械提取；
   defaults 与各引擎内置 DEFAULT_*_TUNING 原值一致（引擎逐字段空值合并，
   覆盖值只需携带 schema 字段）。live 标记 = 引擎是否暴露 setTuning：
   sonnet（仅 swapSong，tuning 建时生效）/diorama（无 setTuning）为 false。 */

var VIS_MODE_TUNING_STORE_KEY = 'orangesea-vis-tuning-v1';

var VIS_MODE_TUNING_DEFS = {
  sonnet: {
    label: '商籁', live: false,
    defaults: {
      cameraIntensity: 1, typographyMotion: 1, mgDensity: 1,
      showOnlyText: false, showGuide: true, showBackgroundMg: true,
      showFixedGeo: true, showGiantDecorativeText: true, showBackgroundDecor: true,
      enableTransitions: true, textureResolution: 1.5,
      postProcessEnabled: false, postProcessGrain: 0.2, postProcessContrast: 0,
      postProcessRgbShift: 0, postProcessHalftone: 0, postProcessVignette: 0.85,
      postProcessLensDistortion: 0.3, postProcessLensDispersion: 0.6
    },
    schema: [
      { key: 'cameraIntensity', label: '镜头强度', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'typographyMotion', label: '字体动效', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'mgDensity', label: '背景密度', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'textureResolution', label: '纹理分辨率', type: 'range', min: 0.5, max: 4, step: 0.25 },
      { key: 'showOnlyText', label: '仅歌词', type: 'toggle' },
      { key: 'showGuide', label: '参考线', type: 'toggle' },
      { key: 'showBackgroundMg', label: '背景层', type: 'toggle' },
      { key: 'showFixedGeo', label: '几何图形', type: 'toggle' },
      { key: 'showGiantDecorativeText', label: '装饰大字', type: 'toggle' },
      { key: 'showBackgroundDecor', label: '背景装饰', type: 'toggle' },
      { key: 'enableTransitions', label: '转场', type: 'toggle' },
      { key: 'postProcessEnabled', label: '后处理总开关', type: 'toggle' },
      { key: 'postProcessGrain', label: '胶片颗粒', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'postProcessContrast', label: '对比增强', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'postProcessRgbShift', label: 'RGB 色差', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'postProcessHalftone', label: '网点', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'postProcessVignette', label: '暗角', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'postProcessLensDistortion', label: '镜头畸变', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'postProcessLensDispersion', label: '镜头色散', type: 'range', min: 0, max: 1, step: 0.05 }
    ]
  },
  tempera: {
    label: '凝彩', live: true,
    defaults: {
      cameraIntensity: 1, glyphMotion: 1, wholeLineLyrics: false,
      glyphSettleStretch: 0.5, colorMode: 'duo', showBlocks: true,
      showDecor: true, showCornerMarks: true, textInversion: true,
      layerImageFrequency: 0.6, enableTransitions: true, textureResolution: 1.5,
      postProcessEnabled: true, postProcessGrain: 0.2, postProcessContrast: 0,
      postProcessRgbShift: 0, postProcessVignette: 0.85, postProcessLensDistortion: 0.3
    },
    schema: [
      { key: 'cameraIntensity', label: '镜头强度', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'glyphMotion', label: '字形动效', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'glyphSettleStretch', label: '逐字入场时序', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'wholeLineLyrics', label: '整行歌词', type: 'toggle' },
      { key: 'colorMode', label: '配色模式', type: 'choice', options: [{ value: 'duo', label: '双色' }, { value: 'mono', label: '单色' }, { value: 'gradient', label: '渐变' }] },
      { key: 'showBlocks', label: '色块', type: 'toggle' },
      { key: 'showDecor', label: '装饰', type: 'toggle' },
      { key: 'showCornerMarks', label: '边角线框', type: 'toggle' },
      { key: 'textInversion', label: '文字动态反色', type: 'toggle' },
      { key: 'enableTransitions', label: '转场', type: 'toggle' },
      { key: 'layerImageFrequency', label: '贴图出现率', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'textureResolution', label: '纹理分辨率', type: 'range', min: 0.5, max: 4, step: 0.25 },
      { key: 'postProcessEnabled', label: '后处理总开关', type: 'toggle' },
      { key: 'postProcessGrain', label: '胶片颗粒', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'postProcessContrast', label: '对比增强', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'postProcessRgbShift', label: 'RGB 色差', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'postProcessVignette', label: '暗角', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'postProcessLensDistortion', label: '镜头畸变', type: 'range', min: 0, max: 2, step: 0.05 }
    ]
  },
  lumiere: {
    label: '绘光', live: true,
    defaults: {
      lightIntensity: 1, audioResponse: 1, fogDensity: 1, darkField: 0.75,
      moteAmount: 1, bloom: 1, textBloom: 1, unlitOpacity: 0.22,
      windowNeighbors: 2, decay: 1, echo: 1, fogOctaves: 5,
      lineArt: true, frontBokeh: true, trails: true, hideTrails: false,
      seamlessTransitions: true, overlayFrame: true, textOnly: false,
      keywordColors: true, themeIcons: true, themeColorMix: 0.3,
      renderQuality: 'full'
    },
    schema: [
      { key: 'lightIntensity', label: '光强倍率', type: 'range', min: 0.3, max: 2, step: 0.05 },
      { key: 'audioResponse', label: '随乐变亮', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'bloom', label: '图形辉光', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'textBloom', label: '文字辉光', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'darkField', label: '暗场强度', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'fogDensity', label: '烟雾浓度', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'fogOctaves', label: '烟雾细节', type: 'range', min: 2, max: 6, step: 1, integer: true },
      { key: 'moteAmount', label: '浮尘数量', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'unlitOpacity', label: '未唱字透明', type: 'range', min: 0.05, max: 0.6, step: 0.01 },
      { key: 'themeColorMix', label: '主题色占比', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'decay', label: '崩解强度', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'echo', label: '背景歌词', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'windowNeighbors', label: '邻行窗口', type: 'choice', options: [{ value: 1, label: '1 行' }, { value: 2, label: '2 行' }] },
      { key: 'renderQuality', label: '画质档', type: 'choice', options: [{ value: 'full', label: '完整' }, { value: 'balanced', label: '均衡' }, { value: 'low', label: '低耗' }] },
      { key: 'textOnly', label: '仅文字', type: 'toggle' },
      { key: 'lineArt', label: '线稿', type: 'toggle' },
      { key: 'frontBokeh', label: '前景散景', type: 'toggle' },
      { key: 'trails', label: '轨迹线', type: 'toggle' },
      { key: 'hideTrails', label: '隐藏轨迹', type: 'toggle' },
      { key: 'seamlessTransitions', label: '无缝过渡', type: 'toggle' },
      { key: 'overlayFrame', label: '画框', type: 'toggle' },
      { key: 'keywordColors', label: '词色着色', type: 'toggle' },
      { key: 'themeIcons', label: '主题图标', type: 'toggle' }
    ]
  },
  pendolo: {
    label: '钟摆', live: true,
    defaults: {
      arcRadius: 0.42, arcAngleDeg: 100, wheelCenterX: 0.0, wheelCenterY: 0.5,
      tickSnappiness: 2.0, activeScale: 1.25, showGearDecor: 'subtle',
      showCenterGradient: true, showCoverOnWatchFace: false, enableLineGlow: false
    },
    schema: [
      { key: 'wheelCenterX', label: '轮心水平', type: 'range', min: -0.2, max: 0.4, step: 0.01 },
      { key: 'arcRadius', label: '弧半径', type: 'range', min: 0.25, max: 0.8, step: 0.01 },
      { key: 'arcAngleDeg', label: '弧角度', type: 'range', min: 40, max: 160, step: 5, unit: '°' },
      { key: 'tickSnappiness', label: '刻度利落', type: 'range', min: 0.5, max: 2, step: 0.1 },
      { key: 'activeScale', label: '活跃缩放', type: 'range', min: 1, max: 1.6, step: 0.05 },
      { key: 'showGearDecor', label: '齿轮装饰', type: 'choice', options: [{ value: 'none', label: '无' }, { value: 'subtle', label: '淡' }, { value: 'full', label: '全' }] },
      { key: 'showCenterGradient', label: '中心渐变', type: 'toggle' },
      { key: 'showCoverOnWatchFace', label: '封面表盘', type: 'toggle' },
      { key: 'enableLineGlow', label: '指针辉光', type: 'toggle' }
    ]
  },
  monet: {
    label: '莫奈', live: true,
    defaults: {
      keywordColoringEnabled: true, showDescription: true,
      showAudioVisualization: true, audioStyle: 'bar', fontScale: 1.2
    },
    schema: [
      { key: 'fontScale', label: '字号缩放', type: 'range', min: 0.7, max: 1.5, step: 0.05 },
      { key: 'keywordColoringEnabled', label: '词色着色', type: 'toggle' },
      { key: 'showDescription', label: '歌曲描述', type: 'toggle' },
      { key: 'showAudioVisualization', label: '音频可视化', type: 'toggle' },
      { key: 'audioStyle', label: '频谱样式', type: 'choice', options: [{ value: 'bar', label: '柱状' }, { value: 'line', label: '线状' }] }
    ]
  },
  fume: {
    label: '烟雾', live: true,
    defaults: {
      hidePrintSymbols: false, disableGeometricBackground: true,
      backgroundObjectOpacity: 0.5, textHoldRatio: 1,
      cameraTrackingMode: 'smooth', cameraSpeed: 1,
      glowIntensity: 1, heroScale: 1
    },
    schema: [
      { key: 'hidePrintSymbols', label: '隐藏印刷符号', type: 'toggle' },
      { key: 'disableGeometricBackground', label: '关闭几何背景', type: 'toggle' },
      { key: 'backgroundObjectOpacity', label: '背景物透明', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'textHoldRatio', label: '文字驻留比', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'cameraSpeed', label: '镜头速度', type: 'range', min: 0.55, max: 1.85, step: 0.05 },
      { key: 'cameraTrackingMode', label: '镜头跟随', type: 'choice', options: [{ value: 'stepped', label: '步进' }, { value: 'smooth', label: '平滑' }] },
      { key: 'glowIntensity', label: '辉光强度', type: 'range', min: 0, max: 1.8, step: 0.05 },
      { key: 'heroScale', label: '主体缩放', type: 'range', min: 0.82, max: 1.32, step: 0.02 }
    ]
  },
  claddagh: {
    label: '克尔之结', live: true,
    defaults: {
      focusScaleRatio: 0.65, radiusScale: 1.0, ellipseTiltDeg: 45,
      showAxisLine: true, letterSpacingOffset: 0
    },
    schema: [
      { key: 'focusScaleRatio', label: '聚焦放大', type: 'range', min: 0, max: 1.5, step: 0.05 },
      { key: 'radiusScale', label: '半径缩放', type: 'range', min: 0.5, max: 1.5, step: 0.05 },
      { key: 'ellipseTiltDeg', label: '椭圆倾角', type: 'range', min: 0, max: 60, step: 1, unit: '°' },
      { key: 'showAxisLine', label: '轴线', type: 'toggle' },
      { key: 'letterSpacingOffset', label: '字距偏移', type: 'range', min: -5, max: 20, step: 0.5, unit: 'px' }
    ]
  },
  partita: {
    label: '云阶', live: true,
    defaults: {
      showGuideLines: true, useSemanticLayout: true,
      staggerMin: 20, staggerMax: 100
    },
    schema: [
      { key: 'showGuideLines', label: '参考线', type: 'toggle' },
      { key: 'useSemanticLayout', label: '语义布局', type: 'toggle' },
      { key: 'staggerMin', label: '错层下限', type: 'range', min: 0, max: 180, step: 5, unit: 'px' },
      { key: 'staggerMax', label: '错层上限', type: 'range', min: 0, max: 180, step: 5, unit: 'px' }
    ]
  },
  classic: {
    label: '经典', live: true,
    defaults: {
      enableWordRotation: true, breathingFloatMultiplier: 1,
      useLegacyLayout: false, wordSpacing: 0.7
    },
    schema: [
      { key: 'enableWordRotation', label: '逐字旋转', type: 'toggle' },
      { key: 'useLegacyLayout', label: '旧版排版', type: 'toggle' },
      { key: 'breathingFloatMultiplier', label: '呼吸浮动', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'wordSpacing', label: '词间距', type: 'range', min: 0, max: 2, step: 0.05 }
    ]
  },
  cadenza: {
    label: '华彩', live: true,
    defaults: {
      fontScale: 1.12, widthRatio: 0.72, motionAmount: 1,
      glowIntensity: 1, beamIntensity: 0
    },
    schema: [
      { key: 'fontScale', label: '字号缩放', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'widthRatio', label: '宽度占比', type: 'range', min: 0.3, max: 1.2, step: 0.05 },
      { key: 'motionAmount', label: '动效强度', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'glowIntensity', label: '辉光强度', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'beamIntensity', label: '光束强度', type: 'range', min: 0, max: 2, step: 0.05 }
    ]
  },
  cappella: {
    label: '卡佩拉', live: true,
    defaults: {
      showEmoMessages: true, emojiPackSource: 'builtin', avatarSource: 'cover'
    },
    schema: [
      { key: 'showEmoMessages', label: '表情消息', type: 'toggle' },
      { key: 'avatarSource', label: '形象来源', type: 'choice', options: [{ value: 'cover', label: '封面' }, { value: 'builtin', label: '内置' }, { value: 'color', label: '纯色' }] },
      { key: 'emojiPackSource', label: '表情包', type: 'choice', options: [{ value: 'builtin', label: '内置' }] }
    ]
  },
  diorama: {
    label: '镜台', live: false,
    defaults: {
      cameraSpeed: 1, motionAmount: 1, audioReactivity: 1,
      particleDensity: 576, particleScale: 1,
      particleGlowEnabled: true, particleGlowIntensity: 0.65,
      showParticles: true, backgroundParticleCircumference: 28,
      backgroundParticleRadial: 2,
      glowEnabled: true, glowIntensity: 1,
      soulEnabled: true, soulIntensity: 1, soulActiveEnabled: false,
      gradientEnabled: false, gradientIntensity: 1,
      keywordColoringEnabled: true
    },
    schema: [
      { key: 'cameraSpeed', label: '镜头速度', type: 'range', min: 0.55, max: 1.85, step: 0.05 },
      { key: 'motionAmount', label: '律动强度', type: 'range', min: 0.4, max: 1.6, step: 0.05 },
      { key: 'audioReactivity', label: '音频响应', type: 'range', min: 0, max: 1.5, step: 0.05 },
      { key: 'particleDensity', label: '粒子密度', type: 'range', min: 96, max: 1536, step: 24, integer: true },
      { key: 'particleScale', label: '粒子缩放', type: 'range', min: 0.65, max: 1.6, step: 0.05 },
      { key: 'particleGlowEnabled', label: '粒子光晕', type: 'toggle' },
      { key: 'particleGlowIntensity', label: '粒子光晕强', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'showParticles', label: '背景浮尘', type: 'toggle' },
      { key: 'backgroundParticleCircumference', label: '浮尘·圆周', type: 'range', min: 4, max: 48, step: 2, integer: true },
      { key: 'backgroundParticleRadial', label: '浮尘·径向', type: 'range', min: 1, max: 4, step: 1, integer: true },
      { key: 'glowEnabled', label: '辉光跟唱', type: 'toggle' },
      { key: 'glowIntensity', label: '辉光强度', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'soulEnabled', label: '灵魂出窍', type: 'toggle' },
      { key: 'soulIntensity', label: '出窍强度', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'soulActiveEnabled', label: '当前字漂移', type: 'toggle' },
      { key: 'gradientEnabled', label: '渐变跟唱', type: 'toggle' },
      { key: 'gradientIntensity', label: '渐变强度', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'keywordColoringEnabled', label: '词色着色', type: 'toggle' }
    ]
  },
  tilt: {
    label: '斜排', live: true,
    defaults: {
      splitProbability: 0.75, tiltStyleProbability: 0.35, colorScheme: 'default'
    },
    schema: [
      { key: 'splitProbability', label: '拆行概率', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'tiltStyleProbability', label: '斜体概率', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'colorScheme', label: '配色方案', type: 'choice', options: [{ value: 'default', label: '默认' }, { value: 'swap', label: '主强调互换' }, { value: 'accentAll', label: '全强调色' }, { value: 'primaryAll', label: '全主色' }] }
    ]
  }
};

function visModeTuningDef(mode) {
  return Object.prototype.hasOwnProperty.call(VIS_MODE_TUNING_DEFS, mode) ? VIS_MODE_TUNING_DEFS[mode] : null;
}

function visModeTuningReadAll() {
  var raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(VIS_MODE_TUNING_STORE_KEY) || '{}');
  } catch (e) {
    raw = {};
  }
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

function visModeTuningWriteMode(mode, overrides) {
  var all = visModeTuningReadAll();
  var clean = {};
  var def = visModeTuningDef(mode);
  if (!def) return {};
  var schemaKeys = {};
  def.schema.forEach(function (f) { schemaKeys[f.key] = f; });
  var src = (overrides && typeof overrides === 'object') ? overrides : {};
  Object.keys(src).forEach(function (key) {
    if (!schemaKeys[key]) return;
    clean[key] = visModeTuningCoerce(mode, schemaKeys[key], src[key]);
  });
  if (Object.keys(clean).length) all[mode] = clean;
  else delete all[mode];
  try {
    localStorage.setItem(VIS_MODE_TUNING_STORE_KEY, JSON.stringify(all));
  } catch (e) { }
  return clean;
}

/* schema 类型收敛：range 数值夹取（integer 取整）；toggle 布尔；choice 白名单。
   非法值回退引擎默认（defaults[field.key]），mode 用于查缺省表 */
function visModeTuningCoerce(mode, field, value) {
  function fallback() {
    var def = visModeTuningDef(mode);
    return (def && def.defaults && def.defaults[field.key] !== undefined) ? def.defaults[field.key] : undefined;
  }
  if (!field) return value;
  if (field.type === 'toggle') return value === true;
  if (field.type === 'choice') {
    var opts = field.options || [];
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === value || String(opts[i].value) === String(value)) return opts[i].value;
    }
    return fallback();
  }
  var n = Number(value);
  if (!isFinite(n)) return fallback();
  var min = (field.min != null) ? Number(field.min) : -Infinity;
  var max = (field.max != null) ? Number(field.max) : Infinity;
  n = Math.max(min, Math.min(max, n));
  if (field.integer) n = Math.round(n);
  return n;
}

function visModeTuningOverrides(mode) {
  var def = visModeTuningDef(mode);
  if (!def) return {};
  var all = visModeTuningReadAll();
  var raw = (all[mode] && typeof all[mode] === 'object') ? all[mode] : {};
  var out = {};
  def.schema.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(raw, f.key)) {
      out[f.key] = visModeTuningCoerce(mode, f, raw[f.key]);
    }
  });
  return out;
}

/* 桥 create 时调用：完整 DEFAULT + 覆盖（引擎端逐字段空值合并，缺省安全） */
function visModeTuningResolved(mode) {
  var def = visModeTuningDef(mode);
  if (!def) return {};
  return Object.assign({}, def.defaults, visModeTuningOverrides(mode));
}

/* live 应用注册表：支持 setTuning 的桥在加载期注册；tempera 等懒加载桥晚于
   本模块落地，故注册接口早于消费（typeof 守卫由桥侧负责） */
var visModeTuningLiveAppliers = {};
function visModeTuningRegisterLiveApply(mode, fn) {
  if (mode && typeof fn === 'function') visModeTuningLiveAppliers[mode] = fn;
}
function visModeTuningApplyLive(mode) {
  var fn = visModeTuningLiveAppliers[mode];
  if (!fn) return false;
  try {
    fn(visModeTuningResolved(mode));
    return true;
  } catch (e) {
    try { console.warn('[VisModeTuning] live apply failed:', mode, e); } catch (e2) { }
    return false;
  }
}

function visModeTuningPatch(mode, key, value) {
  var overrides = visModeTuningOverrides(mode);
  overrides[key] = value;
  visModeTuningWriteMode(mode, overrides);
  visModeTuningApplyLive(mode);
}

function visModeTuningReset(mode) {
  visModeTuningWriteMode(mode, {});
  visModeTuningApplyLive(mode);
}

/* ---------- DIY 控制台 UI（日落暖色 declarative 体系） ---------- */

function visIntensitySyncSeg() {
  var seg = document.getElementById('vis-intensity-seg');
  if (!seg) return;
  var current = visAnimationIntensityCurrent();
  var buttons = seg.querySelectorAll('[data-vis-intensity]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-vis-intensity') === current);
  }
}

function visIntensityRenderSeg() {
  var seg = document.getElementById('vis-intensity-seg');
  if (!seg || seg._visBound) return;
  seg._visBound = true;
  seg.innerHTML =
    '<button type="button" data-vis-intensity="calm">平静</button>' +
    '<button type="button" data-vis-intensity="normal">标准</button>' +
    '<button type="button" data-vis-intensity="chaotic">狂热</button>';
  seg.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-vis-intensity]') : null;
    if (!btn) return;
    var v = visAnimationIntensityNormalize(btn.getAttribute('data-vis-intensity'));
    if (typeof fx !== 'undefined' && fx) fx.visAnimationIntensity = v;
    if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'visAnimationIntensity' });
    visIntensitySyncSeg();
    if (typeof showToast === 'function') showToast('动画强度：' + (v === 'calm' ? '平静' : v === 'chaotic' ? '狂热' : '标准'));
  });
  visIntensitySyncSeg();
}

function visWordColorsRenderPanel() {
  var panel = document.getElementById('vis-word-colors');
  if (!panel || panel._visBound) return;
  panel._visBound = true;
  panel.innerHTML =
    '<div class="vis-wc-note">主题词色随主题下发移植模式；空表回退强调色。上限 ' + VIS_WORD_COLORS_LIMIT + ' 条（同 Folia），改动热生效。</div>' +
    '<div class="vis-wc-add-row">' +
    '<input id="vis-wc-word-input" class="theme-lib-input" type="text" maxlength="24" placeholder="关键词（如 潮汐）">' +
    '<input id="vis-wc-color-input" class="vis-wc-color" type="color" value="#ffcf9e" title="词色">' +
    '<button id="vis-wc-add-btn" class="theme-lib-btn is-save" type="button">添加</button>' +
    '</div>' +
    '<div class="vis-wc-count" id="vis-wc-count"></div>' +
    '<div class="vis-wc-list" id="vis-wc-list"></div>';
  var addBtn = document.getElementById('vis-wc-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var wordInput = document.getElementById('vis-wc-word-input');
      var colorInput = document.getElementById('vis-wc-color-input');
      var ok = visWordColorsAdd(wordInput ? wordInput.value : '', colorInput ? colorInput.value : '');
      if (!ok && wordInput && visWordColorsList().length >= VIS_WORD_COLORS_LIMIT) {
        if (typeof showToast === 'function') showToast('词色表已满（' + VIS_WORD_COLORS_LIMIT + ' 条）');
      }
      if (wordInput) wordInput.value = '';
      visWordColorsRenderList();
    });
  }
  visWordColorsRenderList();
}

function visWordColorsRenderList() {
  var listEl = document.getElementById('vis-wc-list');
  var countEl = document.getElementById('vis-wc-count');
  var list = visWordColorsList();
  if (countEl) countEl.textContent = list.length + ' / ' + VIS_WORD_COLORS_LIMIT;
  if (!listEl) return;
  /* 用户输入的 word 走 textContent 构建（innerHTML 拼串是存储型 XSS 注入点） */
  listEl.textContent = '';
  for (var i = 0; i < list.length; i++) {
    var row = document.createElement('div');
    row.className = 'vis-wc-row';
    row.setAttribute('data-vis-wc-idx', String(i));
    var swatch = document.createElement('span');
    swatch.className = 'vis-wc-swatch';
    swatch.style.background = list[i].color;
    var word = document.createElement('span');
    word.className = 'vis-wc-word';
    word.title = list[i].word;
    word.textContent = list[i].word;
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'theme-lib-btn is-del';
    del.setAttribute('data-vis-wc-del', String(i));
    del.title = '删除';
    del.textContent = '✕';
    row.appendChild(swatch); row.appendChild(word); row.appendChild(del);
    listEl.appendChild(row);
  }
  if (!list.length) {
    listEl.innerHTML = '<div class="theme-lib-empty">还没有词色——添加后命中歌词关键词的词会按色着色</div>';
  }
  var dels = listEl.querySelectorAll('[data-vis-wc-del]');
  for (var d = 0; d < dels.length; d++) {
    dels[d].addEventListener('click', function (e) {
      var idx = e.currentTarget && e.currentTarget.getAttribute ? e.currentTarget.getAttribute('data-vis-wc-del') : null;
      visWordColorsRemoveAt(idx);
      visWordColorsRenderList();
    });
  }
}

/* 模式调参面板：模式分段选择 + schema 渲染滑杆/开关/选项 + 重置 */
var visModeTuningActiveMode = 'sonnet';

function visModeTuningSyncModeSeg() {
  var seg = document.getElementById('vis-mt-mode-seg');
  if (!seg) return;
  var buttons = seg.querySelectorAll('[data-vis-mt-mode]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-vis-mt-mode') === visModeTuningActiveMode);
  }
}

function visModeTuningFormatValue(field, value) {
  if (field.type === 'toggle') return value ? '开' : '关';
  if (field.type === 'choice') {
    var opts = field.options || [];
    for (var i = 0; i < opts.length; i++) if (opts[i].value === value) return opts[i].label;
    return String(value);
  }
  var n = Number(value) || 0;
  var text = (field.integer ? String(Math.round(n)) : (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, ''));
  return text + (field.unit || '');
}

function visModeTuningRenderControls() {
  var body = document.getElementById('vis-mt-controls');
  if (!body) return;
  var def = visModeTuningDef(visModeTuningActiveMode);
  if (!def) { body.innerHTML = ''; return; }
  var resolved = visModeTuningResolved(visModeTuningActiveMode);
  var liveNote = def.live
    ? '<span class="vis-mt-live is-live">改动即时生效</span>'
    : '<span class="vis-mt-live">下次进入该模式生效</span>';
  var html = '<div class="vis-mt-head"><strong>' + def.label + '调参</strong>' + liveNote +
    '<button type="button" class="theme-lib-btn is-del" id="vis-mt-reset">恢复默认</button></div>';
  for (var i = 0; i < def.schema.length; i++) {
    var f = def.schema[i];
    var v = resolved[f.key];
    if (f.type === 'toggle') {
      html += '<div class="fx-toggle vis-mt-toggle' + (v ? ' on' : '') + '" data-vis-mt-toggle="' + f.key + '"><span>' + f.label + '</span><span class="dot"></span></div>';
    } else if (f.type === 'choice') {
      html += '<div class="fx-seg vis-mt-choice" role="group" aria-label="' + f.label + '" data-vis-mt-choice="' + f.key + '">';
      for (var o = 0; o < f.options.length; o++) {
        html += '<button type="button" data-vis-mt-opt="' + f.options[o].value + '"' + (f.options[o].value === v ? ' class="active"' : '') + '>' + f.options[o].label + '</button>';
      }
      html += '</div>';
    } else {
      var stepAttr = (f.step != null) ? f.step : 0.05;
      html += '<div class="fx-slider vis-mt-slider"><label>' + f.label + '</label>' +
        '<input type="range" data-vis-mt-range="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + stepAttr + '" value="' + v + '">' +
        '<output>' + visModeTuningFormatValue(f, v) + '</output></div>';
    }
  }
  body.innerHTML = html;

  var ranges = body.querySelectorAll('[data-vis-mt-range]');
  for (var r = 0; r < ranges.length; r++) {
    (function (input) {
      var key = input.getAttribute('data-vis-mt-range');
      var field = null;
      def.schema.forEach(function (f2) { if (f2.key === key) field = f2; });
      input.addEventListener('input', function () {
        var value = field && field.integer ? Math.round(Number(input.value)) : Number(input.value);
        var out = input.parentElement && input.parentElement.querySelector('output');
        if (out) out.textContent = visModeTuningFormatValue(field, value);
      });
      input.addEventListener('change', function () {
        visModeTuningPatch(visModeTuningActiveMode, key, Number(input.value));
      });
    })(ranges[r]);
  }
  var toggles = body.querySelectorAll('[data-vis-mt-toggle]');
  for (var t = 0; t < toggles.length; t++) {
    (function (el) {
      var key = el.getAttribute('data-vis-mt-toggle');
      el.addEventListener('click', function () {
        var next = !el.classList.contains('on');
        el.classList.toggle('on', next);
        visModeTuningPatch(visModeTuningActiveMode, key, next);
      });
    })(toggles[t]);
  }
  var choices = body.querySelectorAll('[data-vis-mt-choice]');
  for (var c = 0; c < choices.length; c++) {
    (function (seg, key) {
      seg.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-vis-mt-opt]') : null;
        if (!btn) return;
        var raw = btn.getAttribute('data-vis-mt-opt');
        var field = null;
        def.schema.forEach(function (f2) { if (f2.key === key) field = f2; });
        var value = raw;
        if (field && field.options) {
          for (var oi = 0; oi < field.options.length; oi++) {
            if (String(field.options[oi].value) === raw) { value = field.options[oi].value; break; }
          }
        }
        var btns = seg.querySelectorAll('[data-vis-mt-opt]');
        for (var bi = 0; bi < btns.length; bi++) btns[bi].classList.remove('active');
        btn.classList.add('active');
        visModeTuningPatch(visModeTuningActiveMode, key, value);
      });
    })(choices[c], choices[c].getAttribute('data-vis-mt-choice'));
  }
  var reset = document.getElementById('vis-mt-reset');
  if (reset) {
    reset.addEventListener('click', function () {
      visModeTuningReset(visModeTuningActiveMode);
      visModeTuningRenderControls();
      if (typeof showToast === 'function') showToast('已恢复默认：' + def.label);
    });
  }
}

function visModeTuningRenderPanel() {
  var panel = document.getElementById('vis-mode-tuning');
  if (!panel || panel._visBound) return;
  panel._visBound = true;
  var segHtml = '';
  Object.keys(VIS_MODE_TUNING_DEFS).forEach(function (mode) {
    segHtml += '<button type="button" data-vis-mt-mode="' + mode + '">' + VIS_MODE_TUNING_DEFS[mode].label + '</button>';
  });
  panel.innerHTML =
    '<div class="vis-mt-note">Folia 移植模式每模式调参（引擎默认 + 本地覆盖）；不支持的运行时如实标注生效时机。</div>' +
    '<div class="fx-seg" id="vis-mt-mode-seg" role="group" aria-label="选择调参模式">' + segHtml + '</div>' +
    '<div id="vis-mt-controls" class="vis-mt-controls"></div>';
  var seg = document.getElementById('vis-mt-mode-seg');
  if (seg) {
    seg.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-vis-mt-mode]') : null;
      if (!btn) return;
      visModeTuningActiveMode = btn.getAttribute('data-vis-mt-mode');
      visModeTuningSyncModeSeg();
      visModeTuningRenderControls();
    });
  }
  visModeTuningSyncModeSeg();
  visModeTuningRenderControls();
}

function initVisModeDataPlane() {
  visIntensityRenderSeg();
  visWordColorsRenderPanel();
  visModeTuningRenderPanel();
}

if (typeof scheduleUiWarmTask === 'function') scheduleUiWarmTask(initVisModeDataPlane, 340);
else if (typeof setTimeout === 'function') setTimeout(initVisModeDataPlane, 340);
