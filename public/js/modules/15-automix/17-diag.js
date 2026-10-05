// ============================================================
// 17-diag.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/diag.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const bridge = () => typeof window !== "undefined" ? window.electron?.diagMark : void 0;
const diagMark = (text) => {
  try {
    bridge()?.(text);
  } catch {
  }
};
