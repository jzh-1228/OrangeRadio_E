// ============================================================
// 01-signal-analysis.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/signalAnalysis.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const MIN_BPM = 60;
const MAX_BPM = 180;
const MIN_TEMPO_CONFIDENCE = 0.35;
const SILENCE_DB = -90;
const LOUD_OUTRO_DB = -14;
const QUIET_OUTRO_DB = -30;
const SILENT_TAIL_DB = -45;
const CROSSOVER_EARLY = 0.35;
const CROSSOVER_LATE = 0.55;
const MAX_TRIM_DB = 6;
const BEAT_SNAP_TOLERANCE = 0.25;
const DOWNBEAT_WINDOW_BARS = 24;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const dbToGain = (db) => 10 ** (db / 20);
const rmsDb = (samples) => {
  if (!samples.length) return SILENCE_DB;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index];
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
};
const fft = (real, imag) => {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const aReal = real[i + k];
        const aImag = imag[i + k];
        const bReal = real[i + k + len / 2] * curReal - imag[i + k + len / 2] * curImag;
        const bImag = real[i + k + len / 2] * curImag + imag[i + k + len / 2] * curReal;
        real[i + k] = aReal + bReal;
        imag[i + k] = aImag + bImag;
        real[i + k + len / 2] = aReal - bReal;
        imag[i + k + len / 2] = aImag - bImag;
        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
};
const spectralFlux = (current, previous, bins) => {
  const limit = Math.min(bins, current.length, previous.length);
  let flux = 0;
  for (let index = 0; index < limit; index += 1) {
    const now = Number.isFinite(current[index]) ? current[index] : SILENCE_DB;
    const before = Number.isFinite(previous[index]) ? previous[index] : SILENCE_DB;
    if (now > before) flux += now - before;
  }
  return flux;
};
const tempoPrior = (bpm) => Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.55) ** 2);
const TEMPO_HARMONICS = 4;
const PHASE_BEATS = 96;
const estimateTempo = (envelope, hopSec) => {
  if (!(hopSec > 0)) return null;
  const count = envelope.length;
  const minLag = Math.max(2, Math.round(60 / (MAX_BPM * hopSec)));
  const maxLag = Math.round(60 / (MIN_BPM * hopSec));
  if (count < maxLag * 3) return null;
  let mean = 0;
  for (const value of envelope) mean += value;
  mean /= count;
  const centred = new Float64Array(count);
  let energy = 0;
  for (let index = 0; index < count; index += 1) {
    const value = Math.max(0, envelope[index] - mean);
    centred[index] = value;
    energy += value * value;
  }
  if (energy <= 0) return null;
  const topLag = Math.min(Math.floor(count / 3), maxLag * TEMPO_HARMONICS);
  const correlation = new Float64Array(topLag + 1);
  for (let lag = minLag; lag <= topLag; lag += 1) {
    let sum = 0;
    for (let index = lag; index < count; index += 1) {
      sum += centred[index] * centred[index - lag];
    }
    correlation[lag] = sum / (count - lag);
  }
  let bestLag = 0;
  let bestScore = 0;
  let scoreSum = 0;
  let scored = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let harmonic = 1; harmonic <= TEMPO_HARMONICS; harmonic += 1) {
      const at = lag * harmonic;
      if (at > topLag) break;
      sum += correlation[at] / harmonic;
    }
    const score = sum * tempoPrior(60 / (lag * hopSec));
    scoreSum += score;
    scored += 1;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const average = scored ? scoreSum / scored : 0;
  if (!bestLag || bestScore <= 0 || average <= 0) return null;
  const refinePeriod = (lag) => {
    for (let harmonic = TEMPO_HARMONICS; harmonic >= 1; harmonic -= 1) {
      const centre = lag * harmonic;
      if (centre + 1 > topLag) continue;
      let peak = centre;
      const from = Math.max(minLag + 1, centre - harmonic);
      const to = Math.min(topLag - 1, centre + harmonic);
      for (let at = from; at <= to; at += 1) if (correlation[at] > correlation[peak]) peak = at;
      if (peak <= minLag || peak >= topLag) continue;
      const before = correlation[peak - 1];
      const after = correlation[peak + 1];
      const curve = before - 2 * correlation[peak] + after;
      if (!(curve < 0)) continue;
      const period2 = (peak + (before - after) / (2 * curve)) / harmonic;
      if (Math.abs(period2 - lag) <= 0.5) return period2;
    }
    return lag;
  };
  const period = refinePeriod(bestLag);
  let beatOffsetHops = 0;
  let bestPhase = -1;
  for (let offset = 0; offset < bestLag; offset += 1) {
    let sum = 0;
    for (let beat = 0; beat < PHASE_BEATS; beat += 1) {
      const index = Math.round(count - 1 - offset - beat * period);
      if (index < 0) break;
      sum += centred[index];
    }
    if (sum > bestPhase) {
      bestPhase = sum;
      beatOffsetHops = offset;
    }
  }
  return {
    bpm: 60 / (period * hopSec),
    periodSec: period * hopSec,
    confidence: clamp((bestScore / average - 1) / 2, 0, 1),
    beatOffsetHops
  };
};
const crossoverFor = (outgoingDb) => {
  if (outgoingDb === null || !Number.isFinite(outgoingDb)) {
    return (CROSSOVER_EARLY + CROSSOVER_LATE) / 2;
  }
  if (outgoingDb <= SILENT_TAIL_DB) return CROSSOVER_EARLY;
  const loudness = clamp((outgoingDb - QUIET_OUTRO_DB) / (LOUD_OUTRO_DB - QUIET_OUTRO_DB), 0, 1);
  return CROSSOVER_LATE + (CROSSOVER_EARLY - CROSSOVER_LATE) * loudness;
};
const trimForBalance = (outgoingDb, incomingDb) => clamp(outgoingDb - incomingDb, 0, MAX_TRIM_DB);
const planBlendShape = (input) => {
  const crossover = crossoverFor(input.outgoingDb);
  const shape = { overlap: input.overlap, crossover, snappedToBeat: false };
  const { nextBeatIn, periodSec } = input;
  if (nextBeatIn === null || periodSec === null || !(periodSec > 0)) return shape;
  const low = Math.max(input.minOverlap, input.overlap * (1 - BEAT_SNAP_TOLERANCE));
  const high = Math.min(input.maxOverlap, input.overlap * (1 + BEAT_SNAP_TOLERANCE));
  if (low > high) return shape;
  const target = input.overlap * crossover;
  const beat = nextBeatIn + Math.round((target - nextBeatIn) / periodSec) * periodSec;
  if (!(beat > 0)) return shape;
  const overlap = beat / crossover;
  if (overlap < low || overlap > high) return shape;
  return { overlap, crossover, snappedToBeat: true };
};
const BLEND_HEADROOM_DB = 1.5;
const headroomBell = (progress) => Math.sin(clamp(progress, 0, 1) * Math.PI);
const buildCrossfadeCurves = (crossover, together = 0, points = 64) => {
  const pivot = clamp(crossover, 0.15, 0.85);
  const held = clamp(together, 0, 0.8);
  const lead = pivot * (1 - held);
  const trail = pivot + (1 - pivot) * held;
  const out = new Float32Array(points);
  const incoming = new Float32Array(points);
  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1);
    const warped = progress <= lead ? progress / Math.max(1e-3, lead) * 0.5 : progress >= trail ? 0.5 + (progress - trail) / Math.max(1e-3, 1 - trail) * 0.5 : 0.5;
    const angle = warped * (Math.PI / 2);
    const headroom = dbToGain(-BLEND_HEADROOM_DB * headroomBell(progress));
    out[index] = Math.cos(angle) * headroom;
    incoming[index] = Math.sin(angle) * headroom;
  }
  return { out, in: incoming };
};
const TONE_EDGE_HZ = [250, 4e3];
const TONE_MID_HZ = Math.round(Math.sqrt(TONE_EDGE_HZ[0] * TONE_EDGE_HZ[1]));
const BASS_KILL_DB = 24;
const SWEEP_OUT_HIGH_DB = 9;
const BASS_SWAP_WIDTH = 0.12;
const MAX_TILT_DB = 3;
const buildBandCurves = (request) => {
  const points = request.points ?? 64;
  const seam = clamp(request.crossover, 0.15, 0.85);
  const width = Math.max(0.02, Math.min(BASS_SWAP_WIDTH, seam, 1 - seam));
  const tiltMid = clamp(request.tiltDb[0], -MAX_TILT_DB, MAX_TILT_DB);
  const tiltHigh = clamp(request.tiltDb[1], -MAX_TILT_DB, MAX_TILT_DB);
  const band = () => [
    new Float32Array(points),
    new Float32Array(points),
    new Float32Array(points)
  ];
  const out = band();
  const incoming = band();
  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1);
    const handover = clamp((progress - (seam - width / 2)) / width, 0, 1);
    const leaving = clamp((progress - seam) / Math.max(1e-3, 1 - seam), 0, 1) ** 2;
    const settling = clamp(1 - progress / Math.max(1e-3, seam), 0, 1);
    if (request.swapBass) {
      out[0][index] = -BASS_KILL_DB * handover;
      incoming[0][index] = -BASS_KILL_DB * (1 - handover);
    }
    if (request.sweepOut) {
      out[2][index] = -SWEEP_OUT_HIGH_DB * leaving;
    }
    incoming[1][index] = tiltMid * settling;
    incoming[2][index] = tiltHigh * settling;
  }
  return { out, in: incoming };
};
const toneTilt = (outgoing, incoming) => {
  if (!outgoing || !incoming || outgoing.length < 3 || incoming.length < 3) return [0, 0];
  const bend = (band) => {
    const a = outgoing[band];
    const b = incoming[band];
    if (!(a > 0) || !(b > 0)) return 0;
    return clamp(10 * Math.log10(a / b), -MAX_TILT_DB, MAX_TILT_DB);
  };
  return [bend(1), bend(2)];
};
const LUFS_OFFSET_DB = -0.691;
const kWeight = (samples, sampleRate) => {
  const out = new Float32Array(samples.length);
  if (!(sampleRate > 0) || !samples.length) return out;
  const shelfHz = 1681.974450955533;
  const shelfGainDb = 3.999843853973347;
  const shelfQ = 0.7071752369554196;
  const k1 = Math.tan(Math.PI * shelfHz / sampleRate);
  const vh = 10 ** (shelfGainDb / 20);
  const vb = vh ** 0.4996667741545416;
  const d0 = 1 + k1 / shelfQ + k1 * k1;
  const b = [
    (vh + vb * k1 / shelfQ + k1 * k1) / d0,
    2 * (k1 * k1 - vh) / d0,
    (vh - vb * k1 / shelfQ + k1 * k1) / d0
  ];
  const a = [2 * (k1 * k1 - 1) / d0, (1 - k1 / shelfQ + k1 * k1) / d0];
  const hpHz = 38.13547087602444;
  const hpQ = 0.5003270373238773;
  const k2 = Math.tan(Math.PI * hpHz / sampleRate);
  const d1 = 1 + k2 / hpQ + k2 * k2;
  const c = [2 * (k2 * k2 - 1) / d1, (1 - k2 / hpQ + k2 * k2) / d1];
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let p1 = 0;
  let p2 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const x = samples[index];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    const z = y - 2 * p1 + p2 - c[0] * q1 - c[1] * q2;
    p2 = p1;
    p1 = y;
    q2 = q1;
    q1 = z;
    out[index] = z;
  }
  return out;
};
const BEATS_PER_BAR = 4;
const votePhase = (envelope, hopSec, periodSec, beatOffsetSec, beatsPerBar) => {
  const radius = Math.max(1, Math.round(periodSec / hopSec / 8));
  const at = (seconds) => {
    const centre = Math.round(seconds / hopSec);
    if (centre < 0 || centre >= envelope.length) return null;
    let peak = envelope[centre];
    for (let index = centre - radius; index <= centre + radius; index += 1) {
      if (index >= 0 && index < envelope.length && envelope[index] > peak) {
        peak = envelope[index];
      }
    }
    return peak;
  };
  const middle = (values) => {
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const scores = [];
  const span = envelope.length * hopSec;
  const barSec = periodSec * beatsPerBar;
  for (let phase = 0; phase < beatsPerBar; phase += 1) {
    const hits = [];
    const first = beatOffsetSec + phase * periodSec;
    const bars = Math.floor((span - first) / barSec) + 1;
    for (let bar = Math.max(0, bars - DOWNBEAT_WINDOW_BARS); bar < bars; bar += 1) {
      const value = at(first + bar * barSec);
      if (value !== null) hits.push(value);
    }
    scores.push(middle(hits));
  }
  let best = 0;
  for (let phase = 1; phase < beatsPerBar; phase += 1) if (scores[phase] > scores[best]) best = phase;
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const windowStart = Math.min(
    envelope.length - 1,
    Math.max(0, Math.round((span - DOWNBEAT_WINDOW_BARS * barSec) / hopSec))
  );
  let floor = 0;
  for (let index = windowStart; index < envelope.length; index += 1) floor += envelope[index];
  floor /= envelope.length - windowStart;
  if (!(mean > 0) || scores[best] < mean * 1.25 || scores[best] < floor * 1.5) return null;
  return { phase: best, contrast: scores[best] / mean };
};
const estimateDownbeat = (lowEnvelope, hopSec, periodSec, beatOffsetSec, beatsPerBar = BEATS_PER_BAR, harmonicEnvelope) => {
  if (!(hopSec > 0) || !(periodSec > 0) || lowEnvelope.length < beatsPerBar * 4) return null;
  const kick = votePhase(lowEnvelope, hopSec, periodSec, beatOffsetSec, beatsPerBar);
  const harmony = harmonicEnvelope && harmonicEnvelope.length >= beatsPerBar * 4 ? votePhase(harmonicEnvelope, hopSec, periodSec, beatOffsetSec, beatsPerBar) : null;
  const winner = kick === null ? harmony : harmony === null ? kick : harmony.contrast > kick.contrast ? harmony : kick;
  if (winner === null) return null;
  const barSec = periodSec * beatsPerBar;
  return ((beatOffsetSec + winner.phase * periodSec) % barSec + barSec) % barSec;
};
