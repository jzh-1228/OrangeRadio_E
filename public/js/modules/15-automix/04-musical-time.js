// ============================================================
// 04-musical-time.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/musicalTime.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const BEATS_PER_PHRASE = BEATS_PER_BAR * 4;
const LOCKED_DEVIATION = 0.015;
const RAW_RATE_LIMIT = 0.0594;
const STRETCH_LIMIT = 0.12;
const DRIFT_LIMIT = 0.25;
const foldRatio = (ratio) => {
  let folded = ratio;
  while (folded > Math.SQRT2) folded /= 2;
  while (folded < 1 / Math.SQRT2) folded *= 2;
  return folded;
};
const tempoMatch = (fromBpm, toBpm) => {
  if (!fromBpm || !toBpm || !(fromBpm > 0) || !(toBpm > 0)) {
    return { relation: "unknown", stretch: 1, ratio: 1 };
  }
  const ratio = foldRatio(toBpm / fromBpm);
  const deviation = Math.abs(ratio - 1);
  if (deviation < LOCKED_DEVIATION) return { relation: "locked", stretch: 1, ratio };
  if (deviation <= RAW_RATE_LIMIT) return { relation: "near", stretch: ratio, ratio };
  if (deviation <= STRETCH_LIMIT) return { relation: "stretchable", stretch: ratio, ratio };
  if (deviation <= DRIFT_LIMIT) return { relation: "drifting", stretch: 1, ratio };
  return { relation: "far", stretch: 1, ratio };
};
const settledBpm = (whole, outro) => {
  const wholeOk = whole && whole > 0 ? whole : null;
  const outroOk = outro && outro > 0 ? outro : null;
  if (!outroOk) return wholeOk;
  if (!wholeOk) return outroOk;
  const folded = foldRatio(outroOk / wholeOk);
  if (Math.abs(folded - 1) > RAW_RATE_LIMIT) return null;
  return wholeOk * folded;
};
const TEMPO_LENGTH_SCALE = {
  locked: 1.3,
  near: 1.2,
  stretchable: 1.1,
  // The first grade that is NOT put onto one grid, so this is the first one where the length has
  // to pay for the drift instead of the rate paying for it.
  drifting: 0.6,
  far: 0.5,
  unknown: 1
};
const quantiseToMusic = (seconds, beatSec, maxSeconds) => {
  if (beatSec === null || !(beatSec > 0)) return Math.min(seconds, maxSeconds);
  const unitFor = (beats2) => beats2 >= BEATS_PER_PHRASE ? BEATS_PER_PHRASE : beats2 >= BEATS_PER_BAR ? BEATS_PER_BAR : 1;
  const wanted = seconds / beatSec;
  let unit = unitFor(wanted);
  let beats = Math.round(wanted / unit) * unit;
  while (beats * beatSec > maxSeconds && beats > 1) {
    const next = unitFor(beats - unit);
    if (next < unit) unit = next;
    beats = Math.max(1, beats - unit);
  }
  return Math.max(1, beats) * beatSec;
};
const barGrid = (bpm, downbeatOffset, beatsPerBar = BEATS_PER_BAR) => {
  if (!bpm || !(bpm > 0) || downbeatOffset === null || downbeatOffset === void 0) return null;
  const period = 60 / bpm * beatsPerBar;
  return { offset: (downbeatOffset % period + period) % period, period };
};
const snapToGrid = (seconds, grid, toleranceSec) => {
  if (!grid || !(grid.period > 0) || !(toleranceSec > 0)) return seconds;
  const line = grid.offset + Math.round((seconds - grid.offset) / grid.period) * grid.period;
  return Math.abs(line - seconds) <= toleranceSec && line > 0 ? line : seconds;
};
const alignEntry = (earliest, incoming, outgoingBarPhase) => {
  if (!incoming || outgoingBarPhase === null || !(incoming.period > 0)) return earliest;
  const barsIn = Math.ceil((earliest - incoming.offset) / incoming.period);
  const line = incoming.offset + Math.max(0, barsIn) * incoming.period;
  const entry = line - outgoingBarPhase;
  return entry >= earliest ? entry : entry + incoming.period;
};
