// ============================================================
// 05-transition-chooser.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/transitionChooser.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const MIN_KEY_CONFIDENCE = 0.25;
const FADE_OUT_SLOPE_DB_PER_SEC = -1.5;
const INTRO_SILENCE_SEC = 0.3;
const BEAT_CUT_SEC = 0.04;
const CUT_LEAD_SEC = 1.5;
const HEAD_BUDGET_SEC = 0.05;
const LENGTH_SCALE = {
  compatible: 1,
  adjacent: 0.85,
  neutral: 0.7,
  clashing: 0.4,
  unknown: 1
};
const ENERGY_STEP_CEILING_DB = 12;
const ENERGY_STEP_SCALE = 0.4;
const HOT_START_SCALE = 0.6;
const STYLE_SCALE = {
  beatCut: 1,
  bassSwap: 1,
  tailRide: 1.4,
  plainBlend: 1
};
const usableKey = (estimate) => estimate && estimate.key >= 0 && estimate.confidence >= MIN_KEY_CONFIDENCE ? estimate : null;
const endKey = (profile, which) => {
  if (!profile) return null;
  const endpoint = which === "outro" ? profile.outroKey : profile.introKey;
  return usableKey(endpoint) ?? usableKey({
    key: profile.key,
    major: profile.major,
    confidence: profile.keyConfidence
  });
};
const keyRelation = (from, to) => {
  const a = endKey(from, "outro");
  const b = endKey(to, "intro");
  if (!a || !b) return "unknown";
  const interval = ((b.key - a.key) % 12 + 12) % 12;
  if (a.major === b.major) {
    if (interval === 0 || interval === 7 || interval === 5) return "compatible";
    if (interval === 2 || interval === 10) return "adjacent";
  } else if (a.major && interval === 9 || !a.major && interval === 3) {
    return "compatible";
  } else if (interval === 0) {
    return "adjacent";
  }
  if (interval === 1 || interval === 11 || interval === 6) return "clashing";
  return "neutral";
};
const chooseTransitionStyle = (input) => {
  const { from, to } = input;
  const relation = keyRelation(from, to);
  const tempo = tempoMatch(settledBpm(from?.bpm, from?.outroBpm), to?.bpm);
  const tilt = toneTilt(from?.outroTone, to?.introTone);
  const step = from?.tailDb !== null && from?.tailDb !== void 0 && to ? Math.min(ENERGY_STEP_CEILING_DB, Math.abs(from.tailDb - to.headDb)) : 0;
  const energyScale = 1 + step / ENERGY_STEP_CEILING_DB * ENERGY_STEP_SCALE;
  const decide = (style, reason, extraScale = 1) => ({
    style,
    relation,
    tempo,
    // Floored, because these five numbers were each reasoned about ALONE and are applied together.
    // Clashing keys say 0.4, tempos too far apart 0.5, an incoming track at full level 0.6 - each a
    // defensible "make this shorter" - and multiplied they say 0.12, which is not shorter but a
    // hard cut arrived at by arithmetic no one wrote down. The gapless mistake in a different
    // costume: a heuristic may choose HOW two songs join, not decide the feature does not apply. A
    // quarter of a phrase is one bar, the shortest span that still reads as a join not a stop.
    lengthScale: Math.max(0.25, LENGTH_SCALE[relation] * STYLE_SCALE[style] * extraScale * TEMPO_LENGTH_SCALE[tempo.relation] * (style === "beatCut" ? 1 : energyScale)),
    // Nothing to match against on a cut: the two tracks are never both sounding.
    tiltDb: style === "beatCut" || style === "plainBlend" ? [0, 0] : tilt,
    // A track that stops at full level has an edge on it either way; a delay is what turns that
    // edge into something that sounds chosen.
    echoThrow: style === "beatCut" || from?.endsHot === true,
    reason
  });
  if (to?.startsHot === true && from?.bpm) {
    if (to.leadIn >= 60 / from.bpm) {
      return decide("beatCut", "the next track starts at full level, so this one is cut");
    }
    return decide(
      "bassSwap",
      "the next track starts at full level, so the overlap is kept short",
      HOT_START_SCALE
    );
  }
  if (tempo.relation === "far" && from?.bpm && to && to.leadIn >= 60 / from.bpm) {
    return decide("beatCut", `the two tempos are ${Math.round(Math.abs(tempo.ratio - 1) * 100)}% apart, so this one is cut`);
  }
  if (from?.outroSlope !== null && from?.outroSlope !== void 0 && from.outroSlope <= FADE_OUT_SLOPE_DB_PER_SEC) {
    return decide("bassSwap", "this track fades out on its own");
  }
  if (from?.endsHot === false && to && (to.leadIn > INTRO_SILENCE_SEC || to.startsHot === false)) {
    return decide("tailRide", "a decaying tail with an intro to come up underneath it");
  }
  if (from || to) return decide("bassSwap", "overlapped, with the low end handed over");
  return decide("plainBlend", "nothing measured about either track");
};
const TOGETHER = {
  beatCut: 0,
  bassSwap: 0.55,
  tailRide: 0.5,
  plainBlend: 0
};
const shapeBlend = (request) => {
  const { style, room, overlap, crossover, nextBeatIn, periodSec, incomingLeadIn } = request;
  if (style === "beatCut") {
    const headBudget = (incomingLeadIn ?? 0) + HEAD_BUDGET_SEC;
    const maxHold = Math.min(room - BEAT_CUT_SEC, headBudget);
    const steps = periodSec && nextBeatIn !== null && periodSec > 0 ? Math.floor((maxHold - nextBeatIn) / periodSec) : -1;
    const hold = steps >= 0 ? nextBeatIn + steps * periodSec : 0;
    return {
      style,
      hold: Math.max(0, hold),
      overlap: BEAT_CUT_SEC,
      crossover: 0.5,
      shapeBands: false,
      sweepOut: false,
      together: TOGETHER[style]
    };
  }
  return {
    style,
    hold: 0,
    overlap,
    crossover,
    together: TOGETHER[style],
    shapeBands: style !== "plainBlend",
    // Not on a ride: a decaying tail is already leaving of its own accord, and taking the top
    // off it as well removes the shimmer that is the whole reason to blend underneath one.
    sweepOut: style === "bassSwap"
  };
};
