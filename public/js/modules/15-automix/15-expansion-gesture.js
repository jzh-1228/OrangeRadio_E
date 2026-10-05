// ============================================================
// 15-expansion-gesture.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/expansionGesture.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const MIN_SPAN_SEC = 0.35;
const EDGE_SEC = 2e-3;
const SPINBACK_TOP_RATE = 2.6;
const SPINBACK_DECAY = 0.35;
const SHALLOWEST_DIVISION = 2;
const STEPS = [
  { at: 0.25, beats: 2, levels: 1, topRate: 1.02, spinbackBeats: 0 },
  { at: 0.5, beats: 4, levels: 2, topRate: 1.06, spinbackBeats: 0 },
  { at: 0.75, beats: 8, levels: 3, topRate: 1.12, spinbackBeats: 0.5 },
  { at: 1, beats: 12, levels: 3, topRate: 1.2, spinbackBeats: 1 }
];
const expansionStems = (intensity) => intensity >= 0.75 ? ["drums", "other"] : ["drums"];
const egClamp = (value, low, high) => Math.min(high, Math.max(low, value));
const levelShare = (level, levels) => 1 / 2 ** level / (2 - 1 / 2 ** (levels - 1));
const nearestStep = (intensity) => STEPS.reduce(
  (best, candidate) => Math.abs(candidate.at - intensity) < Math.abs(best.at - intensity) ? candidate : best,
  STEPS[0]
);
const chooseExpansionIntensity = (evidence) => {
  const measured = (value) => value !== null && value !== void 0 && Number.isFinite(value);
  const lift = measured(evidence.tailDb) && measured(evidence.headDb) ? evidence.headDb - evidence.tailDb : null;
  let score = 0.5;
  if (evidence.startsHot) score += 0.25;
  if (lift !== null) {
    if (lift >= 3) score += 0.25;
    else if (lift <= -3) score -= 0.5;
    else if (lift <= -1) score -= 0.25;
  }
  return nearestStep(egClamp(score, 0.25, 1)).at;
};
const planExpansion = (intensity, swapAt, barSec, windowSec, beatsPerBar = 4) => {
  const step = nearestStep(intensity);
  const bar = barSec && barSec > 0 ? barSec : windowSec / 4;
  const beat = bar / Math.max(1, beatsPerBar);
  const asked = step.beats * beat;
  const span = Math.min(asked, swapAt);
  if (!Number.isFinite(span) || span < MIN_SPAN_SEC) return null;
  const from = swapAt - span;
  const divisionAt = (level) => beat / (SHALLOWEST_DIVISION * 2 ** level);
  let levels = step.levels;
  while (levels > 1 && span * levelShare(levels - 1, levels) < divisionAt(levels - 1) * 2) {
    levels -= 1;
  }
  const repeats = [];
  let levelStart = 0;
  for (let level = 0; level < levels; level += 1) {
    const levelSpan = span * levelShare(level, levels);
    const division = divisionAt(level);
    const count = Math.max(1, Math.round(levelSpan / division));
    const length = levelSpan / count;
    const wanted = from + levelStart;
    const snapped = swapAt - Math.round((swapAt - wanted) / beat) * beat;
    const sourceAt = Math.max(0, Math.min(snapped, swapAt - length));
    for (let i = 0; i < count; i += 1) {
      repeats.push({
        at: levelStart + i * length,
        length,
        // Every repeat in a level loops that level's FIRST slice. That is what a
        // beat-repeat is: the music stops advancing and starts insisting. Reading each
        // repeat from its own position would just be the original audio with edges in it.
        sourceAt,
        sourceLength: length,
        rate: 1
      });
    }
    levelStart += levelSpan;
  }
  const last = Math.max(1, repeats.length - 1);
  for (let i = 0; i < repeats.length; i += 1) {
    repeats[i].rate = 1 + (step.topRate - 1) * (i / last);
  }
  const spinbackSec = Math.min(step.spinbackBeats * beat, span / 3);
  const shortened = span < asked - 1e-6;
  return {
    intensity: step.at,
    from,
    to: swapAt,
    stems: expansionStems(step.at),
    repeats,
    spinbackSec,
    reason: `${Math.round(step.at * 100)}% build, ${span.toFixed(2)}s (${levels} level${levels === 1 ? "" : "s"}, ${repeats.length} repeats${spinbackSec > 0 ? `, ${spinbackSec.toFixed(2)}s spinback` : ""})${shortened ? `, shortened from ${asked.toFixed(2)}s to clear the swap` : ""}`
  };
};
const renderExpansion = (channels, plan, sampleRate) => {
  const total = Math.max(1, Math.round((plan.to - plan.from) * sampleRate));
  const out = channels.map(() => new Float32Array(total));
  const edge = Math.max(1, Math.round(EDGE_SEC * sampleRate));
  const spinFrom = plan.spinbackSec > 0 ? Math.max(0, total - Math.round(plan.spinbackSec * sampleRate)) : total;
  for (const repeat of plan.repeats) {
    const start = Math.round(repeat.at * sampleRate);
    const stop = Math.min(total, spinFrom, start + Math.round(repeat.length * sampleRate));
    if (stop <= start) continue;
    const sliceAt = Math.round(repeat.sourceAt * sampleRate);
    const sliceLength = Math.max(1, Math.round(repeat.sourceLength * sampleRate));
    const run = stop - start;
    const fade = Math.max(1, Math.min(edge, Math.floor(run / 2)));
    for (let channel = 0; channel < channels.length; channel += 1) {
      const source = channels[channel];
      const target = out[channel];
      for (let i = 0; i < run; i += 1) {
        const phase = i * repeat.rate % sliceLength;
        const read = sliceAt + Math.floor(phase);
        const sample = read >= 0 && read < source.length ? source[read] : 0;
        const toWrap = Math.min(phase, sliceLength - phase) / repeat.rate;
        const shape = Math.min(1, toWrap / fade, (run - 1 - i) / fade);
        target[start + i] = sample * Math.max(0, shape);
      }
    }
  }
  if (spinFrom < total) {
    const run = total - spinFrom;
    const origin = Math.round(plan.to * sampleRate);
    const decay = Math.max(1, Math.round(run * SPINBACK_DECAY));
    for (let channel = 0; channel < channels.length; channel += 1) {
      const source = channels[channel];
      const target = out[channel];
      let read = origin;
      for (let i = 0; i < run; i += 1) {
        read -= 1 + (SPINBACK_TOP_RATE - 1) * (i / run);
        const at = Math.floor(read);
        const sample = at >= 0 && at < source.length ? source[at] : 0;
        const left = run - 1 - i;
        target[spinFrom + i] = sample * (left < decay ? left / decay : 1);
      }
    }
  }
  return out;
};
const expansionMask = (windowSec, plan) => curveOf(windowSec, (at) => at >= plan.from && at < plan.to ? 0 : 1);
