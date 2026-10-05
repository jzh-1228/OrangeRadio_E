// ============================================================
// 07-crossfade-planner.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/crossfadePlanner.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const CROSSFADE_MIN_SEC = 1;
const CROSSFADE_MAX_SEC = AUTOMIX_MAX_OVERLAP_SEC;
const CROSSFADE_DEFAULT_SEC = 5;
const clampCrossfadeSeconds = (seconds) => Number.isFinite(seconds) ? Math.min(CROSSFADE_MAX_SEC, Math.max(CROSSFADE_MIN_SEC, Math.round(seconds))) : CROSSFADE_DEFAULT_SEC;
const round = (seconds) => Math.round(seconds * 100) / 100;
const planCrossfade = (from, to, seconds, at = 0) => {
  if (!Number.isFinite(from.duration) || from.duration <= 0) {
    return hardCut("outgoing duration unknown, nothing to schedule a fade against");
  }
  const { sounding: end } = endsOf(from);
  const inStart = Math.max(0, (to.profile?.leadIn ?? 0) - ENTRY_MARGIN_SEC);
  const asked = clampCrossfadeSeconds(seconds);
  const incoming = Number.isFinite(to.duration) ? Math.max(0, to.duration - inStart) : Infinity;
  const room = Math.min(Math.max(0, end - at), incoming, end / 4);
  const overlap = Math.min(asked, room);
  if (overlap < AUTOMIX_MIN_OVERLAP_SEC) {
    return hardCut(`no room to crossfade - ${round(Math.max(0, room))}s available`);
  }
  const capped = overlap < asked - 0.05 ? `, capped from ${asked}s by ${round(room)}s of room` : "";
  const entry = inStart > 0.05 ? `, entering the next track at ${round(inStart)}s` : "";
  return {
    kind: "fade",
    style: "plainBlend",
    // These fields state the crossfade as the absence of automix's four moves - no key argument,
    // no tempo bend, no tone match, no echo throw - spelled out rather than defaulted so it can
    // never quietly grow one and stop being the predictable half of this setting.
    relation: "unknown",
    tempo: "unknown",
    stretch: 1,
    tiltDb: [0, 0],
    echoThrow: false,
    outStart: round(end - overlap),
    inStart: round(inStart),
    overlap: round(overlap),
    minOverlap: AUTOMIX_MIN_OVERLAP_SEC,
    reason: `crossfade ${round(overlap)}s${capped}${entry}`
  };
};
