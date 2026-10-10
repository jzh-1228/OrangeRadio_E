// OrangeSea · Pixi 初始化（folia loadPixi 等价，AGPL-3.0 from folia-major）
// 1) preferredFragmentPrecision = 'highp'：防 NVIDIA/ANGLE mediump 精度黑三角
//    （NoiseFilter 的 fract(sin(dot)) 在 fp16 下溢出——详见 folia loadPixi.ts 注释）
// 2) installPixiFilterPoolCompat：Pixi 8.21.0 FilterSystem 池子裁剪竞争补丁
// 所有引擎运行时创建前必须先跑本初始化（幂等）。
(function (PIXI, global) {
"use strict";
const PATCHED = Symbol.for('folia.pixi821FilterPoolCompat');
/** Unbind all live renderers before the shared pool destroys textures; keep normal draws unchanged. */
const installPixiFilterPoolCompat = (pixi) => {
    if (pixi.VERSION !== '8.21.0')
        return;
    const prototype = pixi.FilterSystem.prototype;
    if (prototype[PATCHED])
        return;
    prototype[PATCHED] = true;
    const groups = new Set();
    const pool = pixi.TexturePool;
    const unbindPassTextures = () => {
        const source = pixi.Texture.EMPTY.source;
        groups.forEach(group => {
            group.setResource(source, 1);
            group.setResource(source.style, 2);
            group.setResource(source, 3);
        });
    };
    // init is picked up by Pixi's renderer runner before any filter is rendered.
    const init = prototype.init;
    prototype.init = function () {
        init?.call(this);
        groups.add(this._globalFilterBindGroup);
    };
    const destroy = prototype.destroy;
    prototype.destroy = function () {
        groups.delete(this._globalFilterBindGroup);
        this._globalFilterBindGroup.destroy();
        destroy.call(this);
    };
    // Resize, renderer destruction and clear() all discard idle textures through this method.
    const dropTextures = pool._dropTextures;
    pool._dropTextures = function (textures, shouldDestroy) {
        if (shouldDestroy && textures.length > 0)
            unbindPassTextures();
        dropTextures.call(this, textures, shouldDestroy);
    };
    // A checked-out texture can outlive its bucket and be destroyed directly on return.
    const returnTexture = pool.returnTexture;
    pool.returnTexture = function (texture, resetStyle) {
        const key = this._poolKey[texture.uid];
        if (key !== undefined && !this._buckets.has(key))
            unbindPassTextures();
        returnTexture.call(this, texture, resetStyle);
    };
};

// ensurePrecision 守卫诊断：r undefined 时打印调用栈（临时）
if (PIXI && typeof console !== 'undefined') {
  try {
    // GlProgram 构造在 minified 内部，无法直接包 rf —— 但 undefined 源必然是
    // t.vertex/t.fragment 在某条 transform 后变 undefined；在 from 层守卫：
    var __origFrom = PIXI.GlProgram.from.bind(PIXI.GlProgram);
    PIXI.GlProgram.from = function (opts) {
      if (!opts || typeof opts.vertex !== 'string' || typeof opts.fragment !== 'string') {
        console.warn('[pixi-init] GlProgram.from bad args:', typeof (opts && opts.vertex), typeof (opts && opts.fragment), (opts && opts.name) || '', new Error('trace').stack.split('\n').slice(1, 4).join(' | '));
      }
      return __origFrom(opts);
    };
  } catch (e) { }
}
if (PIXI && PIXI.GlProgram && PIXI.GlProgram.defaultOptions) {
    PIXI.GlProgram.defaultOptions.preferredFragmentPrecision = 'highp';
}
if (PIXI && typeof installPixiFilterPoolCompat === 'function') {
    installPixiFilterPoolCompat(PIXI);
}
global.__pixiInitialized = true;
})(typeof PIXI !== "undefined" ? PIXI : null, typeof window !== "undefined" ? window : this);
