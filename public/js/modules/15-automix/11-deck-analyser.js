// ============================================================
// 11-deck-analyser.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/deckAnalyser.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const DA_FFT_SIZE = 1024;
const DA_FLUX_CEILING_HZ = 5e3;
const ENVELOPE_SIZE = 320;
const PEAK_DECAY_DB_PER_SEC = 12;
const MIN_FRAMES_FOR_LEVEL = 16;
const TEMPO_REFRESH_SEC = 0.5;
const CONTINUITY_GAP_SEC = 0.5;
const createDeckAnalyser = (context, input, sink) => {
  const node = context.createAnalyser();
  node.fftSize = DA_FFT_SIZE;
  node.smoothingTimeConstant = 0;
  const shelf = context.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 1681.974;
  shelf.gain.value = 4;
  const rumble = context.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 38.135;
  rumble.Q.value = 0.5003;
  const silent = context.createGain();
  silent.gain.value = 0;
  input.connect(shelf).connect(rumble).connect(node).connect(silent).connect(sink);
  const spectrum = new Float32Array(node.frequencyBinCount);
  const previous = new Float32Array(node.frequencyBinCount);
  const samples = new Float32Array(node.fftSize);
  const fluxBins = Math.max(
    8,
    Math.round(node.frequencyBinCount * DA_FLUX_CEILING_HZ / (context.sampleRate / 2))
  );
  let envelope = [];
  let levels = [];
  let continuous = true;
  let frames = 0;
  let firstTickTime = 0;
  let lastTickTime = 0;
  let peakDb = SILENCE_DB;
  let cachedTempo = null;
  let cachedAt = -Infinity;
  const hopSec = () => frames > 1 ? (lastTickTime - firstTickTime) / (frames - 1) : 0;
  const tick = (contextTime) => {
    node.getFloatTimeDomainData(samples);
    node.getFloatFrequencyData(spectrum);
    const level = rmsDb(samples);
    const elapsed = frames ? Math.max(0, contextTime - lastTickTime) : 0;
    peakDb = Math.max(level, peakDb - PEAK_DECAY_DB_PER_SEC * elapsed);
    if (elapsed > CONTINUITY_GAP_SEC) continuous = false;
    levels.push(level);
    if (frames) {
      envelope.push(spectralFlux(spectrum, previous, fluxBins));
      if (envelope.length > ENVELOPE_SIZE) envelope.shift();
    } else {
      firstTickTime = contextTime;
    }
    previous.set(spectrum);
    lastTickTime = contextTime;
    frames += 1;
  };
  const tempo = () => {
    if (lastTickTime - cachedAt < TEMPO_REFRESH_SEC) return cachedTempo;
    cachedAt = lastTickTime;
    cachedTempo = estimateTempo(envelope, hopSec());
    return cachedTempo;
  };
  const nextBeatIn = (contextTime) => {
    const estimate = tempo();
    if (!estimate || estimate.confidence < MIN_TEMPO_CONFIDENCE) return null;
    const period = estimate.periodSec;
    const lastBeatAt = lastTickTime - estimate.beatOffsetHops * hopSec();
    const since = contextTime - lastBeatAt;
    return period - (since % period + period) % period;
  };
  return {
    tick,
    loudnessDb: () => frames >= MIN_FRAMES_FOR_LEVEL ? peakDb : null,
    levelHistory: () => continuous && frames > MIN_FRAMES_FOR_LEVEL ? { db: levels, hopSec: hopSec() } : null,
    tempo,
    nextBeatIn,
    reset: () => {
      envelope = [];
      levels = [];
      continuous = true;
      frames = 0;
      peakDb = SILENCE_DB;
      cachedTempo = null;
      cachedAt = -Infinity;
    }
  };
};
