// ============================================================
// 12-tempo-bend.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/tempoBend.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const applyTempoBend = (element, rate) => {
  if (!(rate > 0) || Math.abs(rate - 1) < 1e-3) {
    resetTempoBend(element);
    return 1;
  }
  element.preservesPitch = true;
  element.playbackRate = rate;
  return rate;
};
const resetTempoBend = (element) => {
  if (element && element.playbackRate !== 1) element.playbackRate = 1;
};
