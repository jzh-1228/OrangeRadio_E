// ============================================================
// 09-transition-cue.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/transitionCue.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const listeners = /* @__PURE__ */ new Set();
let active = null;
const announceTransition = (cue) => {
  if (cue?.preview) {
    const running = getActiveTransitionCue();
    if (running && !running.cue.preview) return;
  }
  active = cue === null ? null : { cue, startedAt: performance.now() };
  listeners.forEach((listener) => listener(cue));
};
const getActiveTransitionCue = () => {
  if (!active) return null;
  const elapsedMs = performance.now() - active.startedAt;
  if (elapsedMs >= active.cue.seconds * 1e3) return null;
  return { cue: active.cue, elapsedMs };
};
const MIN_DRAWN_SECONDS = 5;
const shouldDrawCue = (cue, switchedOn, renderer) => switchedOn && !cue.plain && cue.seconds >= MIN_DRAWN_SECONDS && (!cue.preview || cue.preview === renderer);
const subscribeToTransitionCue = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
