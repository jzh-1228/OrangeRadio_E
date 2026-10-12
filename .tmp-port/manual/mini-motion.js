/* =========================================================================
   mini-motion —— framer-motion 动画子集的忠实实现（无构建环境用）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：为 classic 等 React/framer-motion DOM 模式的
   渲染核心落地提供运动时。只实现 Folia 模式实际用到的 API 面：

     · mmApplyVariant(el, variants, name, custom)  —— variants 三态切换
       （variant 可为函数，收 custom；打断旧动画，从当前值续跑——framer 语义）
     · transition 支持：{duration, ease, delay, times, repeat: Infinity,
       type: 'spring', stiffness, damping, transitionEnd, <prop>: {...覆盖}}
       （per-prop 覆盖该 prop 的同名字段，其余继承顶层——framer 合并语义）
       ease 可为 easing 名 / 函数 / cubic-bezier 参数数组（framer 同接受）
     · 插值器：number / color(hex|rgb|rgba|transparent → rgba 串) / filter
       等复杂值（同名函数序列逐数值插值）/ 复合值 token 通道（box-shadow/
       text-shadow/drop-shadow 类「颜色+长度」多段值：文本骨架与值类型序列
       对齐时逐段插值；形状不对齐回退函数序列通道；再不行离散关键帧）
     · 'none' 零形态（framer 渐变语义）：关键帧序列中的 'none'/'auto'/'0'
       位按第一个含复杂数值的关键帧作模板推导零形态（长度全 0 保留单位、
       颜色保留 RGB 置 alpha=0）后整体渐变插值——motion-dom
       make-none-animatable + complex.getAnimatableNone 同构；仅形状无法
       对齐的值才离散跳变
     · spring：半隐式欧拉（v += (k*(t-x)-c*v)*dt，restSpeed/restDelta 0.01，
       dt 夹 1/30）——framer-motion spring 同构
     · ease：cubicBezier 求解；tween 缺省 easeOut（framer 默认），
       easeOut=(0,0,.58,1) / easeInOut=(.42,0,.58,1) / linear——与 framer
       easing 定义同参
     · transform 组装顺序 translateX translateY scale rotate（framer 默认序）
     · mmMotionValue(get)：{get, subscribe, emit}——useMotionValueEvent 的
       等价，由引擎核心每帧轮询 get() 派发 change

   设计取舍：独立 rAF 引擎，无活动动画即停（不空转）；classic 的全部
   transition 的关键参数均为显式（Folia 源码仅依赖「tween 缺省 easeOut」
   一处缺省），故行为可精确复刻。
   ========================================================================= */

var MM_EASE_LINEAR = function (t) { return t; };

/* cubic-bezier 求值（牛顿迭代 + 二分兜底），framer-motion easing 同参 */
function mmCubicBezier(x1, y1, x2, y2) {
  var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
  function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
  function sampleDX(t) { return (3 * ax * t + 2 * bx) * t + cx; }
  return function (progress) {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    var t = progress;
    for (var i = 0; i < 8; i++) {
      var x = sampleX(t) - progress;
      if (Math.abs(x) < 1e-6) return sampleY(t);
      var d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= x / d;
    }
    var lo = 0, hi = 1; t = progress;
    for (var j = 0; j < 20; j++) {
      var xv = sampleX(t);
      if (Math.abs(xv - progress) < 1e-6) break;
      if (xv < progress) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

var MM_EASE = {
  linear: MM_EASE_LINEAR,
  ease: mmCubicBezier(0.25, 0.1, 0.25, 1),
  easeIn: mmCubicBezier(0.42, 0, 1, 1),
  easeOut: mmCubicBezier(0, 0, 0.58, 1),
  easeInOut: mmCubicBezier(0.42, 0, 0.58, 1)
};

function mmResolveEase(ease) {
  if (!ease) return MM_EASE.easeOut;   /* framer tween 缺省 easeOut */
  if (typeof ease === 'function') return ease;
  /* framer 也接受 cubic-bezier 参数数组（如 claddagh 主容器 [0.16,1,0.3,1]） */
  if (Array.isArray(ease) && ease.length === 4) {
    return mmCubicBezier(ease[0], ease[1], ease[2], ease[3]);
  }
  return MM_EASE[ease] || MM_EASE_LINEAR;
}

/* ---------- 颜色解析/插值（hex|rgb|rgba|transparent → [r,g,b,a]） ---------- */

var MM_COLOR_CACHE = {};
function mmParseColor(css) {
  if (MM_COLOR_CACHE[css] !== undefined) return MM_COLOR_CACHE[css];
  var out = null, s = String(css == null ? '' : css).trim();
  if (s === 'transparent') out = [0, 0, 0, 0];
  else if (s.charAt(0) === '#') {
    var hex = s.slice(1);
    var p = function (v) { return parseInt(v, 16); };
    if (/^[0-9a-fA-F]{3}$/.test(hex)) out = [p(hex[0] + hex[0]), p(hex[1] + hex[1]), p(hex[2] + hex[2]), 1];
    else if (/^[0-9a-fA-F]{6}$/.test(hex)) out = [p(hex.slice(0, 2)), p(hex.slice(2, 4)), p(hex.slice(4, 6)), 1];
    else if (/^[0-9a-fA-F]{8}$/.test(hex)) out = [p(hex.slice(0, 2)), p(hex.slice(2, 4)), p(hex.slice(4, 6)), p(hex.slice(6, 8)) / 255];
  } else {
    var m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      var parts = m[1].split(/[,\/\s]+/).filter(function (x) { return x.length; });
      if (parts.length >= 3) {
        out = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]),
          parts.length > 3 && parts[3] != null ? (String(parts[3]).indexOf('%') >= 0 ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1];
        if (out.some(function (v) { return !isFinite(v); })) out = null;
      }
    }
  }
  MM_COLOR_CACHE[css] = out;
  return out;
}

function mmMixColor(a, b, k) {
  var ca = mmParseColor(a), cb = mmParseColor(b);
  if (!ca || !cb) return k >= 0.5 ? b : a;
  var r = Math.round(ca[0] + (cb[0] - ca[0]) * k);
  var g = Math.round(ca[1] + (cb[1] - ca[1]) * k);
  var bl = Math.round(ca[2] + (cb[2] - ca[2]) * k);
  var al = ca[3] + (cb[3] - ca[3]) * k;
  return 'rgba(' + r + ', ' + g + ', ' + bl + ', ' + Number(al.toFixed(3)) + ')';
}

function mmIsColor(v) { return typeof v === 'string' && mmParseColor(v) != null; }

/* ---------- filter 等复杂值：同名函数序列 + 数值列表 ---------- */

var MM_FUNC_RE = /([a-zA-Z-]+)\(([^)]*)\)/g;
function mmParseComplex(css) {
  var funcs = [], nums = [], m;
  MM_FUNC_RE.lastIndex = 0;
  while ((m = MM_FUNC_RE.exec(css)) != null) {
    funcs.push(m[1]);
    m[2].split(',').forEach(function (tok) {
      var n = parseFloat(tok);
      if (isFinite(n)) nums.push(n);
    });
  }
  return funcs.length ? { funcs: funcs, nums: nums } : null;
}

/* ---------- 复合值 token 通道：shadow 类「颜色+长度」逐段插值与 'none' 零形态 ----------
   原版依据（folia-major node_modules/motion-dom，AGPL-3.0 同仓）：
   · value/types/complex/index.mjs —— analyseComplexValue 用 complexRegex 把
     CSS 值拆成（颜色|数字）值序列 + 文本模板 split[]；getAnimatableNone 把
     数字→0、颜色→color.getAnimatableNone 后按模板重拼。
   · value/types/color/index.mjs —— color.getAnimatableNone：解析后 alpha=0
     再 transform 回串（RGB 通道保留，插值时颜色通道连续渐变）。
   · animation/keyframes/utils/make-none-animatable.mjs —— 关键帧序列里
     'none'/'auto'/'0'（invalidTemplates）位用第一个「含复杂数值」的关键帧
     作模板推导零形态替换（含末帧——终态写零形态而非 'none'，视觉等价）。
   覆盖范围按管线实际色域裁剪：颜色复用 mmParseColor（hex|rgb|rgba|
   transparent，不含 hsl）、不覆盖 CSS var()/calc 除数（管线无此用法）。 */

var MM_TOKEN_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|-?(?:\d+(?:\.\d+)?|\.\d+)/gi;

/* 'none' 等不可作模板的字面量（make-none-animatable invalidTemplates 同集） */
var MM_INVALID_TEMPLATES = { none: 1, auto: 1, '0': 1 };

/* token 化（analyseComplexValue 简化版，纯函数）：
   返回 { splits:[文本模板], vals:[颜色原文|数字], types:['num'|'color'],
          units:[num 的单位或 ''] }；无可插值值（无数字无颜色）返回 null。
   rgba(...) 整体先于裸数字被吃掉（正则分支序），嵌套括号不误切。 */
function mmParseTokens(css) {
  var s = String(css == null ? '' : css);
  var re = MM_TOKEN_RE; re.lastIndex = 0;
  var splits = [], vals = [], types = [], units = [], last = 0, m, found = false;
  while ((m = re.exec(s)) != null) {
    var tok = m[0], type = null, val = null, unit = '';
    if (tok.charAt(0) === '#' || /^rgba?\(/i.test(tok)) {
      if (!mmParseColor(tok)) continue;   /* 形似色但解析失败（越界 hex 等）→ 当文本 */
      type = 'color'; val = tok;
    } else {
      var n = parseFloat(tok);
      if (!isFinite(n)) continue;
      type = 'num'; val = n;
      var um = tok.match(/[a-z%]+/i);
      unit = um ? um[0] : '';
    }
    splits.push(s.slice(last, m.index));
    vals.push(val); types.push(type); units.push(unit);
    last = m.index + tok.length;
    found = true;
  }
  if (!found) return null;
  splits.push(s.slice(last));
  return { splits: splits, vals: vals, types: types, units: units };
}

/* 逐段插值（纯函数）：文本骨架/值类型/单位完全对齐才插值（安全方向——
   不对齐返回 null 走离散），对齐时数字逐位、颜色走既有颜色通道。 */
function mmMixTokens(a, b, k) {
  var ta = mmParseTokens(a), tb = mmParseTokens(b);
  if (!ta || !tb || ta.vals.length !== tb.vals.length) return null;
  var n = ta.vals.length, i;
  for (i = 0; i < n; i++) {
    if (ta.types[i] !== tb.types[i] || ta.splits[i] !== tb.splits[i]) return null;
    if (ta.types[i] === 'num' && ta.units[i] !== tb.units[i]) return null;
  }
  if (ta.splits[n] !== tb.splits[n]) return null;
  var out = '';
  for (i = 0; i < n; i++) {
    out += ta.splits[i];
    if (ta.types[i] === 'num') {
      var v = ta.vals[i] + (tb.vals[i] - ta.vals[i]) * k;
      out += String(Number(v.toFixed(3))) + ta.units[i];
    } else {
      out += mmMixColor(ta.vals[i], tb.vals[i], k);
    }
  }
  out += ta.splits[n];
  return out;
}

/* 零形态推导（complex.getAnimatableNone 同构，纯函数）：
   数字→0（保留单位）、颜色→保留 RGB 置 alpha=0、其余文本原样。 */
function mmZeroFormOf(template) {
  var t = mmParseTokens(template);
  if (!t) return null;
  var out = '';
  for (var i = 0; i < t.vals.length; i++) {
    out += t.splits[i];
    if (t.types[i] === 'color') {
      var c = mmParseColor(t.vals[i]);
      out += 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', 0)';
    } else {
      out += '0' + t.units[i];
    }
  }
  out += t.splits[t.vals.length];
  return out;
}

/* 关键帧 'none' 归一化（makeNoneKeyframesAnimatable 同构，纯函数）：
   找第一个非 'none'/'auto'/'0' 且可 token 化的字符串关键帧作模板，把所有
   invalid 字面量位替换为其零形态；无可作模板的返回原数组。返回拷贝，
   不改传入数组（variant 字面量可能被同变体多次复用）。 */
function mmMakeNoneKeyframesAnimatable(keyframes) {
  var template = null, i;
  for (i = 0; i < keyframes.length; i++) {
    var kf = keyframes[i];
    if (typeof kf === 'string' && !MM_INVALID_TEMPLATES[kf] && mmParseTokens(kf)) {
      template = kf; break;
    }
  }
  if (template == null) return keyframes;
  var out = null;
  for (i = 0; i < keyframes.length; i++) {
    var kf2 = keyframes[i];
    if (typeof kf2 === 'string' && kf2 !== template && MM_INVALID_TEMPLATES[kf2]) {
      var zf = mmZeroFormOf(template);
      if (zf != null) {
        if (!out) out = keyframes.slice();
        out[i] = zf;
      }
    }
  }
  return out || keyframes;
}

/* 单值对 'none' 规范化：任一端是 invalid 字面量时换成另一端的零形态 */
function mmNormalizePair(from, to) {
  if (from === to) return [from, to];
  if (MM_INVALID_TEMPLATES[from]) {
    var zf1 = mmZeroFormOf(to);
    if (zf1 != null) return [zf1, to];
  } else if (MM_INVALID_TEMPLATES[to]) {
    var zf2 = mmZeroFormOf(from);
    if (zf2 != null) return [from, zf2];
  }
  return [from, to];
}

function mmMixComplex(a, b, k) {
  var pa = mmParseComplex(a), pb = mmParseComplex(b);
  if (!pa || !pb || pa.funcs.length !== pb.funcs.length) return k >= 0.5 ? b : a;
  for (var i = 0; i < pa.funcs.length; i++) {
    if (pa.funcs[i] !== pb.funcs[i]) return k >= 0.5 ? b : a;
  }
  /* 数值按序插值，重新拼串（保留每段的原始单位与非数值 token） */
  var out = '', idx = 0, m, last = 0, re = /([a-zA-Z-]+)\(([^)]*)\)/g;
  while ((m = re.exec(a)) != null) {
    out += a.slice(last, m.index);
    var inner = '', toks = m[2].split(',');
    for (var t = 0; t < toks.length; t++) {
      var tok = toks[t], n = parseFloat(tok);
      if (isFinite(n) && idx < pb.nums.length) {
        var v = n + (pb.nums[idx] - n) * k;
        var unit = (String(tok).match(/px|deg|%| /) || [''])[0];
        inner += (t ? ',' : '') + String(Number(v.toFixed(3))) + unit;
        idx++;
      } else {
        inner += (t ? ',' : '') + tok;
      }
    }
    out += m[1] + '(' + inner + ')';
    last = m.index + m[0].length;
  }
  out += a.slice(last);
  return out;
}

/* ---------- 值插值分派（null = 不可插值 → 离散） ---------- */

function mmMixValue(from, to, k) {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * k;
  if (mmIsColor(from) && mmIsColor(to)) return mmMixColor(from, to, k);
  /* token 通道优先于函数序列通道：shadow 类复合值的 offset/blur 在
     func 外（mmParseComplex 提取不到，嵌套括号重拼也会误切），须逐段
     插值；对齐失败再回退 mmMixComplex（blur 等简单函数序列旧行为不变） */
  var mixed = mmMixTokens(from, to, k);
  if (mixed !== null) return mixed;
  if (mmParseComplex(from) && mmParseComplex(to)) return mmMixComplex(from, to, k);
  return null;
}

/* ---------- 元素动画状态 ---------- */

var MM_STATE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
var MM_LIVE = [];          /* 活动动画列表 */
var MM_RAF = 0;

function mmGetState(el) {
  var st = MM_STATE.get(el);
  if (!st) {
    st = { anim: {}, tf: { x: 0, y: 0, scale: 1, rotate: 0 } };
    MM_STATE.set(el, st);
  }
  return st;
}

function mmApplyTransform(el, st) {
  var tf = st.tf;
  el.style.transform = 'translateX(' + tf.x + 'px) translateY(' + tf.y + 'px) scale(' + tf.scale + ') rotate(' + tf.rotate + 'deg)';
}

/* 当前值读取（动画中取活动值，否则取内联样式/变换状态） */
function mmCurrent(el, st, prop) {
  var a = st.anim[prop];
  if (a && !a.dead) {
    if (a.cur != null && typeof a.cur === 'number') return a.cur;
  }
  if (prop === 'x' || prop === 'y' || prop === 'scale' || prop === 'rotate') return st.tf[prop];
  if (prop === 'opacity') return parseFloat(el.style.opacity || '1');
  if (prop === 'color' || prop === 'filter' || prop === 'textShadow') return el.style[prop] || '';
  return el.style[prop] || '';
}

/* ---------- 动画实例 ---------- */

function mmStartProp(el, st, prop, from, to, trans, onDone) {
  var old = st.anim[prop];
  if (old) old.dead = true;   /* 打断：新动画从各自当前值续跑（framer 语义） */

  var anim = {
    el: el, st: st, prop: prop, to: to,
    keyframes: Array.isArray(to) ? to : null,
    delay: ((trans.delay || 0) * 1000) || 0,
    duration: 0, ease: null, spring: false,
    repeat: trans.repeat || 0,
    t: 0, dead: false, cur: null,
    onDone: onDone || null, done: false
  };
  var cfg = trans[prop] || trans;   /* per-prop 覆盖，其余继承顶层 */

  if (anim.keyframes) {
    /* 'none' 关键帧先按模板归一为可插值零形态（framer makeNoneKeyframesAnimatable
       语义）——归一失败（无模板或形状不对齐）才落离散跳变 */
    anim.keyframes = mmMakeNoneKeyframesAnimatable(anim.keyframes);
    var n = anim.keyframes.length;
    var times = cfg.times || trans.times;
    if (times && times.length === n) anim.times = times.slice();
    else {
      anim.times = [];
      for (var i = 0; i < n; i++) anim.times.push(n === 1 ? 1 : i / (n - 1));
    }
    anim.duration = Math.max(((cfg.duration != null ? cfg.duration : trans.duration) || 0.3) * 1000, 1);
    anim.ease = mmResolveEase(cfg.ease != null ? cfg.ease : trans.ease);
    /* 不可插值属性（形状无法对齐的 textShadow 等）→ 离散关键帧 */
    anim.discrete = mmMixValue(anim.keyframes[0], anim.keyframes[Math.min(1, n - 1)], 0.5) === null;
  } else if (cfg.type === 'spring') {
    anim.spring = true;
    anim.from = typeof from === 'number' ? from : parseFloat(from) || 0;
    anim.stiffness = cfg.stiffness != null ? cfg.stiffness : (trans.stiffness != null ? trans.stiffness : 200);
    anim.damping = cfg.damping != null ? cfg.damping : (trans.damping != null ? trans.damping : 20);
  } else {
    var pair = mmNormalizePair(String(from), String(to));
    anim.from = typeof from === 'number' ? from : pair[0];
    anim.to = typeof to === 'number' ? to : pair[1];
    anim.duration = Math.max(((cfg.duration != null ? cfg.duration : trans.duration) || 0.3) * 1000, 1);
    anim.ease = mmResolveEase(cfg.ease != null ? cfg.ease : trans.ease);
    anim.discrete = mmMixValue(anim.from, anim.to, 0.5) === null;
  }

  st.anim[prop] = anim;
  MM_LIVE.push(anim);
  mmKick();
  return anim;
}

function mmSampleProp(anim, progress) {
  if (anim.spring) return anim.cur != null ? anim.cur : anim.from;
  if (anim.discrete) {
    var kf = anim.keyframes || [anim.from, anim.to];
    var tm = anim.times || [0, 1];
    if (progress >= 1) return kf[kf.length - 1];
    for (var i = tm.length - 1; i >= 0; i--) {
      if (progress >= tm[i]) return kf[Math.min(i, kf.length - 1)];
    }
    return kf[0];
  }
  if (anim.keyframes) {
    var kfs = anim.keyframes, times = anim.times;
    if (progress >= 1) return kfs[kfs.length - 1];
    var seg = 0;
    while (seg < times.length - 1 && progress >= times[seg + 1]) seg++;
    var t0 = times[seg], t1 = times[Math.min(seg + 1, times.length - 1)];
    var local = t1 > t0 ? (progress - t0) / (t1 - t0) : 1;
    return mmMixValue(kfs[seg], kfs[seg + 1], anim.ease(local));
  }
  return mmMixValue(anim.from, anim.to, anim.ease(progress));
}

function mmWriteProp(el, st, prop, value) {
  if (prop === 'x' || prop === 'y' || prop === 'scale' || prop === 'rotate') {
    st.tf[prop] = typeof value === 'number' ? value : (parseFloat(value) || 0);
    mmApplyTransform(el, st);
  } else if (prop === 'textShadow' || prop === 'filter' || prop === 'color' || prop === 'opacity' || prop === 'backgroundColor') {
    el.style[prop] = value;
  } else {
    try { el.style[prop] = value; } catch (e) { }
  }
}

function mmFinishAnim(anim) {
  var final = anim.keyframes ? anim.keyframes[anim.keyframes.length - 1] : anim.to;
  mmWriteProp(anim.el, anim.st, anim.prop, final);
  if (anim.st.anim[anim.prop] === anim) delete anim.st.anim[anim.prop];
  anim.dead = true;
  if (!anim.done) { anim.done = true; if (anim.onDone) anim.onDone(); }
}

/* ---------- 引擎循环 ---------- */

function mmKick() {
  if (!MM_RAF && typeof requestAnimationFrame === 'function') {
    MM_RAF = requestAnimationFrame(mmStep);
  }
}

function mmStep(now) {
  MM_RAF = 0;
  var dt = Math.min(now - (mmStep.last || now), 33);
  mmStep.last = now;
  var sdt = dt / 1000;

  for (var i = MM_LIVE.length - 1; i >= 0; i--) {
    var anim = MM_LIVE[i];
    if (anim.dead) { MM_LIVE.splice(i, 1); continue; }
    anim.t += dt;
    var elapsed = anim.t - anim.delay;
    if (elapsed < 0) continue;

    if (anim.spring) {
      if (anim.cur == null) { anim.cur = anim.from; anim.vel = 0; anim.life = 0; }
      anim.life += sdt;
      var steps = Math.max(1, Math.ceil(sdt / (1 / 120)));
      var h = sdt / steps;
      for (var s = 0; s < steps; s++) {
        var force = anim.stiffness * (anim.to - anim.cur) - anim.damping * anim.vel;
        anim.vel += force * h;
        anim.cur += anim.vel * h;
      }
      if ((Math.abs(anim.vel) < 0.01 && Math.abs(anim.to - anim.cur) < 0.01) || anim.life > 8) {
        mmFinishAnim(anim);
        MM_LIVE.splice(i, 1);
        continue;
      }
      mmWriteProp(anim.el, anim.st, anim.prop, anim.cur);
      continue;
    }

    var progress = elapsed / anim.duration;
    if (anim.repeat && anim.duration > 0) {
      progress = progress % 1;
    } else if (progress >= 1) {
      mmFinishAnim(anim);
      MM_LIVE.splice(i, 1);
      continue;
    }
    mmWriteProp(anim.el, anim.st, anim.prop, mmSampleProp(anim, progress));
  }

  if (MM_LIVE.length) mmKick();
  else mmStep.last = 0;
}

/* ---------- variants 应用（framer animate 变体切换语义） ---------- */

function mmResolveVariant(variant, custom) {
  if (typeof variant === 'function') return variant(custom);
  return variant;
}

/**
 * 把 variant 目标应用到元素：对每个目标属性建立/替换动画；
 * transitionEnd 在该变体的全部有限动画完成后写入（framer 语义：收尾状态）。
 * 缺席键不动（保持当前值）——wordGlow passed 分支注释所述「新 variant 缺席
 * 键回退 initial」的行为，classic 各变体均已显式补键，不依赖该语义。
 */
function mmApplyVariant(el, variants, name, custom) {
  var st = mmGetState(el);
  var variant = mmResolveVariant(variants && variants[name], custom);
  if (!variant) return null;

  var end = variant.transitionEnd || null;
  var trans = variant.transition || {};
  var pending = 0;
  var endApplied = false;

  var onPropDone = function () {
    pending--;
    if (pending <= 0 && end && !endApplied) {
      endApplied = true;
      for (var k in end) {
        if (Object.prototype.hasOwnProperty.call(end, k)) {
          var a = st.anim[k];
          if (a) { a.dead = true; delete st.anim[k]; }
          mmWriteProp(el, st, k, end[k]);
        }
      }
    }
  };

  for (var prop in variant) {
    if (!Object.prototype.hasOwnProperty.call(variant, prop)) continue;
    if (prop === 'transition' || prop === 'transitionEnd') continue;
    var to = variant[prop];
    var cfg = trans[prop] || trans;
    var infinite = (trans.repeat === Infinity) || (cfg.repeat === Infinity);
    var spring = cfg.type === 'spring';

    if (infinite || spring) {
      /* 无限循环/spring 不参与 transitionEnd 计数 */
    } else {
      pending++;
    }
    if (Array.isArray(to)) {
      mmStartProp(el, st, prop, null, to, trans, (!infinite && !spring) ? onPropDone : null);
    } else {
      mmStartProp(el, st, prop, mmCurrent(el, st, prop), to, trans, (!infinite && !spring) ? onPropDone : null);
    }
  }
  if (pending <= 0 && end && !endApplied) {
    endApplied = true;
    for (var k2 in end) {
      if (Object.prototype.hasOwnProperty.call(end, k2)) {
        var a2 = st.anim[k2];
        if (a2) { a2.dead = true; delete st.anim[k2]; }
        mmWriteProp(el, st, k2, end[k2]);
      }
    }
  }
  return variant;
}

/* 初值直达（initial，无动画；数组关键帧取首值） */
function mmSetInitial(el, variant, custom) {
  var st = mmGetState(el);
  var v = mmResolveVariant(variant, custom);
  if (!v) return;
  for (var prop in v) {
    if (!Object.prototype.hasOwnProperty.call(v, prop)) continue;
    if (prop === 'transition' || prop === 'transitionEnd') continue;
    var val = v[prop];
    if (Array.isArray(val)) val = val[0];
    if (typeof val === 'object' && !(typeof val === 'string')) continue;
    mmWriteProp(el, st, prop, val);
  }
}

/* ---------- MotionValue 等价（引擎核心每帧轮询 get 派发 change） ---------- */

function mmMotionValue(getter) {
  return {
    get: getter,
    subs: [],
    subscribe: function (fn) { this.subs.push(fn); },
    emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
  };
}
