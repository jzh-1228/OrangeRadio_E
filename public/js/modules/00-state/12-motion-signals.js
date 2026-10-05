// ============================================================
// 12-motion-signals.js — 每帧信号对象（MotionValue 的原生等价）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/stores/motionSignals.ts 协议思想。
//
// 协议本质：「每帧值绝不进响应式状态」。currentTime/audioPower/bands/spectrum
// 是模块级单例信号，主循环写入、各视觉模式 rAF 读取——身份进程级稳定，
// 订阅者只在值变化时被唤醒（离散事件），不随每帧重渲染。
//
// 本阶段为地基：主循环开始写入；各模式仍可自算特征（现状不破坏），
// 逐步迁移到统一信号源（覆盖层自算 audio 特征 → motionSignalGet('bands')）。
// ============================================================

var MOTION_SIGNAL_KEYS = ['currentTime', 'audioPower', 'bands', 'spectrum', 'lyricCurrentTime'];

var motionSignals = (function () {
  var values = {
    currentTime: 0,
    lyricCurrentTime: 0,
    audioPower: 0,
    bands: null,     // { kick, vocal, mid, treble, rms }
    spectrum: null   // Uint8Array（主循环 frequencyData 的引用）
  };
  var listeners = {};
  return {
    get: function (key) { return values[key]; },
    set: function (key, value, opts) {
      var prev = values[key];
      values[key] = value;
      // 引用型就地更新信号（如 spectrum 共享主循环的 frequencyData）不适用
      // "值变化才唤醒"——引用恒等而内容每帧在变，须由写入方传 force 逐帧唤醒。
      var force = !!(opts && opts.force);
      var subs = listeners[key];
      if (subs && subs.length && (force || prev !== value)) {
        for (var i = 0; i < subs.length; i++) {
          try { subs[i](value, prev); } catch (e) { }
        }
      }
    },
    subscribe: function (key, listener) {
      if (typeof listener !== 'function') return function () { };
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(listener);
      return function () {
        var idx = listeners[key].indexOf(listener);
        if (idx >= 0) listeners[key].splice(idx, 1);
      };
    }
  };
})();

function motionSignalGet(key) { return motionSignals.get(key); }
function motionSignalSet(key, value, force) { motionSignals.set(key, value, { force: force }); }
function motionSignalSubscribe(key, listener) { return motionSignals.subscribe(key, listener); }
