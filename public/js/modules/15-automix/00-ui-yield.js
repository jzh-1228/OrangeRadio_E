// ============================================================
// 00-ui-yield.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/uiYield.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const YIELD_BUDGET_MS = 8;
const paints = typeof document !== "undefined";
const yieldToUi = () => paints ? new Promise((resolve) => {
  setTimeout(resolve, 0);
}) : Promise.resolve();
