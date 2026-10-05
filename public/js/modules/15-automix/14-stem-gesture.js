// ============================================================
// 14-stem-gesture.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/stemGesture.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const CELL_SEC = 0.05;
const REST_DB = -30;
const CUT_SEC = 0.5;
const EXIT_FLOOR_SEC = 0.05;
const MIN_RECEDE_SEC = 1;
const DEEP_REST_DB = -45;
const SOFT_EXIT_SEC = 1.2;
const SUSTAIN_MIN_SEC = 1.2;
const SUSTAIN_FLAT_DB = 7;
const SUSTAIN_CELLS = 5;
const VOCAL_TAIL_SEC = 0.3;
const SWAP_TARGET = 0.42;
const MAX_TAIL_BARS = 2;
const TAIL_GUARD_SEC = 0.3;
const envelopeOf = (channels, sampleRate, cellSec = CELL_SEC) => {
  const cell = Math.max(1, Math.round(cellSec * sampleRate));
  const length = channels[0]?.length ?? 0;
  const cells = Math.floor(length / cell);
  const out = new Float32Array(cells);
  for (let c = 0; c < cells; c += 1) {
    let sum = 0;
    for (let i = c * cell; i < (c + 1) * cell; i += 1) {
      let frame = 0;
      for (const channel of channels) frame += channel[i];
      sum += (frame / channels.length) ** 2;
    }
    out[c] = Math.sqrt(sum / cell);
  }
  return out;
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const db = (ratio) => 20 * Math.log10(Math.max(ratio, 1e-12));
const findSustain = (vocals, mix, cellSec = CELL_SEC) => {
  const reference = Math.max(median(mix), 1e-12);
  const floor = reference * 10 ** (REST_DB / 20);
  const band = 10 ** (-SUSTAIN_FLAT_DB / 20);
  const need = Math.max(1, Math.round(SUSTAIN_MIN_SEC / cellSec));
  let held = null;
  let start = -1;
  let peak = 0;
  for (let cell = 0; cell <= vocals.length; cell += 1) {
    const level = cell < vocals.length ? vocals[cell] : 0;
    if (start >= 0 && level > floor && level >= peak * band) {
      if (level > peak) peak = level;
      continue;
    }
    if (start >= 0 && cell - start >= need) {
      held = {
        from: start * cellSec,
        to: cell * cellSec,
        holdDb: db(peak / reference)
      };
    }
    start = level > floor ? cell : -1;
    peak = level;
  }
  return held;
};
const planVocalExit = (vocals, mix, hardEnd, recedeFrom = EXIT_FLOOR_SEC, cellSec = CELL_SEC, mayRide = true) => {
  const reference = median(mix);
  const span = Math.max(1, Math.round(CUT_SEC / cellSec));
  const loudAt = (cell) => {
    let peak = 0;
    for (let c = cell; c < cell + span; c += 1) peak = Math.max(peak, vocals[c] ?? 0);
    return db(peak / Math.max(reference, 1e-12));
  };
  const firstCell = Math.round(recedeFrom / cellSec);
  const lastCell = Math.floor((hardEnd - CUT_SEC) / cellSec);
  let last = { cell: -1, value: Infinity };
  let quietest = { cell: firstCell, value: Infinity };
  for (let cell = firstCell; cell <= lastCell; cell += 1) {
    const value = loudAt(cell);
    if (value < quietest.value) quietest = { cell, value };
    if (value <= REST_DB) last = { cell, value };
  }
  if (!Number.isFinite(quietest.value)) quietest = { cell: firstCell, value: loudAt(firstCell) };
  const best = last.cell >= 0 ? last : quietest;
  const at = best.cell * cellSec;
  const softness = Math.min(1, Math.max(
    0,
    (best.value - DEEP_REST_DB) / (REST_DB - DEEP_REST_DB)
  ));
  const exitSec = CUT_SEC + softness * (SOFT_EXIT_SEC - CUT_SEC);
  const held = findSustain(vocals, mix, cellSec);
  const windowSec = vocals.length * cellSec;
  const ridable = mayRide && held !== null && held.from <= hardEnd && held.to > hardEnd && held.to <= windowSec - cellSec;
  if (ridable && held) {
    return {
      from: held.to,
      to: Math.min(held.to + CUT_SEC, windowSec),
      kind: "release",
      loudDb: best.value,
      held
    };
  }
  return last.cell >= 0 ? { from: at, to: Math.min(at + exitSec, hardEnd), kind: "rest", loudDb: best.value, held } : { from: recedeFrom, to: hardEnd, kind: "recede", loudDb: best.value, held };
};
const lastVocalMoment = (vocals, mix, cellSec = CELL_SEC) => {
  const floor = median(mix) * 10 ** (REST_DB / 20);
  let run = 0;
  let edge = -1;
  for (let cell = vocals.length - 1; cell >= 0; cell -= 1) {
    if (vocals[cell] <= floor) {
      run = 0;
      continue;
    }
    if (run === 0) edge = cell;
    run += 1;
    if (run >= SUSTAIN_CELLS) return (edge + 1) * cellSec + VOCAL_TAIL_SEC;
  }
  return null;
};
const singsInWindow = (vocals, reference) => {
  const floor = median(reference) * 10 ** (REST_DB / 20);
  let run = 0;
  for (let cell = 0; cell < vocals.length; cell += 1) {
    if (vocals[cell] <= floor) {
      run = 0;
      continue;
    }
    run += 1;
    if (run >= SUSTAIN_CELLS) return true;
  }
  return false;
};
const planStemHandover = (windowSec, outgoingBarSec, incomingBarSec, downbeats, vocals, mix, incoming = {}, cellSec = CELL_SEC) => {
  const bar = outgoingBarSec && outgoingBarSec > 0 ? outgoingBarSec : windowSec / 4;
  const target = Math.max(
    SWAP_TARGET * windowSec,
    windowSec - (1 + MAX_TAIL_BARS) * bar
  );
  const reachable = downbeats.filter((at) => at >= 1 && at <= windowSec - 1.5);
  const swap = reachable.length ? reachable.reduce((best, at) => Math.abs(at - target) < Math.abs(best - target) ? at : best) : target;
  const bassAt = Math.min(swap + bar, windowSec - TAIL_GUARD_SEC);
  const inBar = incomingBarSec && incomingBarSec > 0 ? incomingBarSec : bar;
  const noOneWaiting = incoming.sings === false;
  const entry = noOneWaiting ? windowSec : Math.min(windowSec - 0.6, swap + inBar);
  const hardEnd = noOneWaiting ? windowSec : Math.min(entry + CUT_SEC, windowSec - 0.4);
  const recedeFloor = noOneWaiting ? CUT_SEC : MIN_RECEDE_SEC;
  const holdUntil = noOneWaiting ? hardEnd - recedeFloor : swap;
  const recedeFrom = Math.max(EXIT_FLOOR_SEC, Math.min(holdUntil, hardEnd - recedeFloor));
  const exit = planVocalExit(vocals, mix, hardEnd, recedeFrom, cellSec, !incoming.keysClash);
  const vocalIn = exit.kind === "release" ? Math.max(entry, Math.min(exit.from - inBar, windowSec - 0.6)) : entry;
  return { swap, bassAt, vocalIn, dueAt: entry, exit };
};
const rise = (from, to, at) => {
  if (at <= from) return 0;
  if (at >= to) return 1;
  return Math.sin((at - from) / (to - from) * (Math.PI / 2));
};
const fall = (from, to, at) => Math.cos(rise(from, to, at) * (Math.PI / 2));
const CURVE_RATE = 200;
const curveOf = (seconds, shape) => {
  const points = Math.max(2, Math.ceil(seconds * CURVE_RATE));
  const out = new Float32Array(points);
  for (let i = 0; i < points; i += 1) out[i] = shape(i / (points - 1) * seconds);
  return out;
};
const SWAP_EDGE_SEC = 6e-3;
const outgoingCurves = (windowSec, plan) => ({
  vocals: curveOf(windowSec, (at) => fall(plan.exit.from, plan.exit.to, at)),
  drums: curveOf(windowSec, (at) => fall(plan.swap, plan.swap + SWAP_EDGE_SEC, at)),
  bass: curveOf(windowSec, (at) => fall(plan.bassAt, plan.bassAt + SWAP_EDGE_SEC, at)),
  // The pad and guitar bed is the one stem that neither swaps nor cuts: it is thinned from below
  // as it goes, so what is left of the outgoing track under the incoming one is air rather than
  // body. The filter sweep that does the thinning is scheduled separately.
  other: curveOf(windowSec, (at) => fall(windowSec * 0.92, windowSec, at))
});
const incomingCurves = (windowSec, plan) => ({
  vocals: curveOf(windowSec, (at) => rise(plan.vocalIn, plan.vocalIn + CUT_SEC, at)),
  drums: curveOf(windowSec, (at) => rise(plan.swap, plan.swap + SWAP_EDGE_SEC, at)),
  bass: curveOf(windowSec, (at) => rise(plan.bassAt, plan.bassAt + SWAP_EDGE_SEC, at)),
  // Arrives BEFORE its own drums, so the incoming track is already present as atmosphere when the
  // beat changes hands. Round ten measured this the hard way: on the one pair where the incoming
  // track was made to crash in with its drums it scored 3.0, against 7.0 for entering quietly.
  other: curveOf(windowSec, (at) => rise(Math.max(0, plan.swap - 1.2), plan.swap, at))
});
const OTHER_SWEEP_HZ = [25, 2200];
const OTHER_SWEEP_END = 0.92;
