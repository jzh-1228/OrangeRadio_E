// ============================================================
// 08-transition-strategy.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/transitionStrategy.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const DEFAULT_TRANSITION_SETTINGS = {
  // Automix, because it is what the existing switch has always done: a listener who already had
  // blending on must not find it behaving differently after an update.
  mode: "automix",
  crossfadeMaxSec: CROSSFADE_DEFAULT_SEC,
  // Off. Every other default here is "what this already did", and this did nothing.
  performance: false
};
const isTransitionMode = (value) => value === "crossfade" || value === "automix";
const modeNeedsBeatGrid = (mode) => mode === "automix";
const canAnalyseTracks = () => {
  if (typeof window === "undefined") return false;
  const offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  return typeof offline === "function";
};
const hasEvidence = (from, to, bpm) => Boolean(
  from.profile || to.profile || bpm !== null && Number.isFinite(bpm) && bpm > 0 || from.lines?.length
);
const planForMode = (settings, from, to, bpm = null, at = 0) => {
  if (settings.mode === "crossfade") {
    return planCrossfade(from, to, clampCrossfadeSeconds(settings.crossfadeMaxSec), at);
  }
  if (hasEvidence(from, to, bpm)) {
    const plan2 = planTransition(from, to, bpm, at);
    if (!settings.performance) return plan2;
    return {
      ...plan2,
      expansion: chooseExpansionIntensity({
        tailDb: from.profile?.tailDb,
        headDb: to.profile?.headDb,
        startsHot: to.profile?.startsHot
      })
    };
  }
  const plan = planCrossfade(from, to, CROSSFADE_DEFAULT_SEC, at);
  return { ...plan, reason: `automix has no evidence here, ${plan.reason} instead` };
};
