// ============================================================
// 02-track-profile.js — Automix 智能过渡引擎·离线测量主体（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/automix/trackProfile.ts
// ============================================================
const TRACK_PROFILE_VERSION = 9;
const PROFILE_SAMPLE_RATE = 22050;
// 命名带 PROFILE_ 前缀：index-loader 把全部模块拼进单个 script 共享全局作用域，
// 此处顶层 const 若与 00-state/00-core-stores.js 的同名顶层 var 撞名 → SyntaxError 全应用启动崩溃。
const PROFILE_FFT_SIZE = 2048;
const HOP = 512;
const FLUX_CEILING_HZ = 5e3;
const CHROMA_MIN_HZ = 65;
const CHROMA_MAX_HZ = 2e3;
const SILENCE_BELOW_PEAK_DB = 40;
const EDGE_WINDOW_SEC = 10;
const HOT_WINDOW_SEC = 1.5;
const HOT_EDGE_DB = 6;
const VOCAL_LOW_HZ = 300;
const VOCAL_HIGH_HZ = 3400;
const VOCAL_MIN_SEC = 0.8;
const VOCAL_SMOOTH_SEC = 0.5;
const VOCAL_RISE = 0.5;
const DOWNBEAT_CEILING_HZ = 150;
const ENDPOINT_CHROMA_SEC = 20;
const OUTRO_TEMPO_SEC = 30;
const HEAD_TEMPO_TOLERANCE = 0.1;
const CHROMA_MAX_FLATNESS = 0.28;
const modulo = (value, span) => (value % span + span) % span;
const NOVELTY_BIN_SEC = 1;
const NOVELTY_HALF_KERNEL = 4;
const NOVELTY_MIN_KERNEL = 2;
const NOVELTY_MIN_SEC = 2;
const NOVELTY_SIGMAS = 1;
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const correlate = (a, b) => {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let top = 0;
  let leftSq = 0;
  let rightSq = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] - meanA;
    const right = b[index] - meanB;
    top += left * right;
    leftSq += left * left;
    rightSq += right * right;
  }
  return leftSq > 0 && rightSq > 0 ? top / Math.sqrt(leftSq * rightSq) : 0;
};
const keyFromChroma = (chroma) => {
  let best = { key: -1, major: true, score: -Infinity };
  let runnerUp = -Infinity;
  for (let rotation = 0; rotation < 12; rotation += 1) {
    const rotated = chroma.map((_, index) => chroma[(index + rotation) % 12]);
    for (const major of [true, false]) {
      const score = correlate(rotated, major ? MAJOR_PROFILE : MINOR_PROFILE);
      if (score > best.score) {
        runnerUp = best.score;
        best = { key: rotation, major, score };
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }
  }
  if (best.key < 0 || !Number.isFinite(best.score) || best.score <= 0) {
    return { key: -1, major: true, confidence: 0 };
  }
  const margin = Number.isFinite(runnerUp) ? Math.max(0, best.score - runnerUp) : 0;
  return {
    key: best.key,
    major: best.major,
    // Both halves matter: a strong fit that a dozen other keys fit equally well says nothing.
    confidence: Math.min(1, Math.max(0, best.score) * Math.min(1, margin / 0.15))
  };
};
const smooth = (values, window) => {
  const half = Math.max(0, Math.floor(window / 2));
  if (!half) return [...values];
  const prefix = new Float64Array(values.length + 1);
  for (let index = 0; index < values.length; index += 1) prefix[index + 1] = prefix[index] + values[index];
  return values.map((_, index) => {
    const from = Math.max(0, index - half);
    const to = Math.min(values.length, index + half + 1);
    return (prefix[to] - prefix[from]) / (to - from);
  });
};
const firstSustained = (centre, hopSec) => {
  if (!centre.length) return null;
  const curve = smooth(centre, Math.round(VOCAL_SMOOTH_SEC / hopSec));
  let low = Infinity;
  let high = -Infinity;
  for (const value of curve) {
    if (value < low) low = value;
    if (value > high) high = value;
  }
  if (!(high - low > 0.02)) return null;
  const threshold = low + (high - low) * VOCAL_RISE;
  const needed = Math.max(1, Math.round(VOCAL_MIN_SEC / hopSec));
  let run = 0;
  for (let index = 0; index < curve.length; index += 1) {
    if (curve[index] <= threshold) {
      run = 0;
      continue;
    }
    run += 1;
    if (run >= needed) return (index - run + 1) * hopSec;
  }
  return null;
};
const findBoundaries = (bins, binSec) => {
  const half = NOVELTY_HALF_KERNEL;
  if (bins.length < half * 2 + 3) return [];
  const unit = bins.map((bin) => {
    let energy = 0;
    for (const value of bin) energy += value * value;
    const scale = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    return bin.map((value) => value * scale);
  });
  const similarity = (a, b) => {
    let dot = 0;
    for (let index = 0; index < 12; index += 1) dot += unit[a][index] * unit[b][index];
    return dot;
  };
  const novelty = new Array(bins.length).fill(0);
  const first = NOVELTY_MIN_KERNEL;
  const last = bins.length - 1 - NOVELTY_MIN_KERNEL;
  for (let centre = first; centre <= last; centre += 1) {
    const reach = Math.min(half, centre, bins.length - 1 - centre);
    let score = 0;
    let mass = 0;
    for (let a = -reach; a < reach; a += 1) {
      for (let b = -reach; b < reach; b += 1) {
        const sign = a < 0 === b < 0 ? 1 : -1;
        const taper = Math.exp(-(a * a + b * b) / (2 * (half / 2) ** 2));
        score += sign * taper * similarity(centre + a, centre + b);
        mass += taper;
      }
    }
    novelty[centre] = mass > 0 ? score / mass : 0;
  }
  const scored = novelty.slice(half, bins.length - half);
  if (Math.max(...scored) - Math.min(...scored) < 1e-6) return [];
  const mean = scored.reduce((sum, value) => sum + value, 0) / scored.length;
  const variance = scored.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scored.length;
  const threshold = mean + NOVELTY_SIGMAS * Math.sqrt(variance);
  const lean = (index) => {
    const left = novelty[index - 1];
    const right = novelty[index + 1];
    const curve = left - 2 * novelty[index] + right;
    if (!(Math.abs(curve) > 1e-12)) return 0;
    return Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curve)));
  };
  const earliest = Math.max(first + 1, Math.ceil(NOVELTY_MIN_SEC / binSec));
  const boundaries = [];
  for (let index = earliest; index < last; index += 1) {
    const isPeak = novelty[index] > novelty[index - 1] && novelty[index] >= novelty[index + 1];
    if (isPeak && novelty[index] > threshold) boundaries.push((index + lean(index)) * binSec);
  }
  return boundaries;
};
const slopePerSec = (values, hopSec) => {
  const count = values.length;
  if (count < 2) return 0;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let top = 0;
  let bottom = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = index - meanX;
    top += dx * (values[index] - meanY);
    bottom += dx * dx;
  }
  return bottom > 0 ? top / bottom / hopSec : 0;
};
const measureEdges = (levels, hopSec, frameSec = 0) => {
  if (!levels.length || !(hopSec > 0)) return null;
  let peak = SILENCE_DB;
  for (const level of levels) if (level > peak) peak = level;
  if (peak <= SILENCE_DB) return null;
  const floor = peak - SILENCE_BELOW_PEAK_DB;
  const first = levels.findIndex((level) => level > floor);
  let last = -1;
  for (let index = levels.length - 1; index >= 0; index -= 1) {
    if (levels[index] > floor) {
      last = index;
      break;
    }
  }
  if (first < 0 || last < first) return null;
  const sounding = levels.slice(first, last + 1);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const edgeFrames = Math.max(2, Math.round(EDGE_WINDOW_SEC / hopSec));
  const hotFrames = Math.max(2, Math.round(HOT_WINDOW_SEC / hopSec));
  const average = mean(sounding);
  const head = (frames) => sounding.slice(0, Math.min(frames, sounding.length));
  const tail = (frames) => sounding.slice(Math.max(0, sounding.length - frames));
  const prefix = new Float64Array(sounding.length + 1);
  for (let index = 0; index < sounding.length; index += 1) {
    prefix[index + 1] = prefix[index] + sounding[index];
  }
  const holdsLevelAt = (endExclusive) => {
    const from = Math.max(0, endExclusive - hotFrames);
    return (prefix[endExclusive] - prefix[from]) / (endExclusive - from) > average - HOT_EDGE_DB;
  };
  let body = sounding.length;
  while (body > 1 && !holdsLevelAt(body)) body -= 1;
  let energy = 0;
  let counted = 0;
  for (const level of levels) {
    if (level <= SILENCE_DB) continue;
    energy += 10 ** (level / 10);
    counted += 1;
  }
  const integrated = (values) => {
    if (!values.length) return SILENCE_DB;
    let sum = 0;
    for (const value of values) sum += 10 ** (value / 10);
    return Math.max(SILENCE_DB, 10 * Math.log10(sum / values.length) + LUFS_OFFSET_DB);
  };
  return {
    leadIn: first * hopSec,
    soundingEnd: last * hopSec + frameSec,
    bodyEnd: Math.max(0, (first + body - 1) * hopSec + frameSec),
    // Averaged over a second or so rather than read off one frame: a single loud transient at
    // the top of a track is a count-in, not a track that starts at full tilt.
    startsHot: mean(head(hotFrames)) > average - HOT_EDGE_DB,
    endsHot: mean(tail(hotFrames)) > average - HOT_EDGE_DB,
    introSlope: slopePerSec(head(edgeFrames), hopSec),
    outroSlope: slopePerSec(tail(edgeFrames), hopSec),
    loudness: counted ? 10 * Math.log10(energy / counted) + LUFS_OFFSET_DB : SILENCE_DB,
    headDb: integrated(head(edgeFrames)),
    tailDb: integrated(tail(edgeFrames))
  };
};
const analyseTrack = async (mono, sampleRate, options = {}) => {
  const duration = mono.length / sampleRate;
  if (!(duration > 1) || !(sampleRate > 0)) return null;
  const hopSec = HOP / sampleRate;
  const bins = PROFILE_FFT_SIZE / 2;
  const binHz = sampleRate / PROFILE_FFT_SIZE;
  const fluxBins = Math.max(8, Math.round(FLUX_CEILING_HZ / binHz));
  const lowFluxBins = Math.max(4, Math.round(DOWNBEAT_CEILING_HZ / binHz));
  const toneEdgeBins = TONE_EDGE_HZ.map((hz) => Math.min(bins, Math.round(hz / binHz)));
  const weighted = kWeight(mono, sampleRate);
  const real = new Float64Array(PROFILE_FFT_SIZE);
  const imag = new Float64Array(PROFILE_FFT_SIZE);
  const spectrum = new Float32Array(bins);
  const previous = new Float32Array(bins);
  const frame = new Float32Array(PROFILE_FFT_SIZE);
  const window = new Float64Array(PROFILE_FFT_SIZE);
  for (let index = 0; index < PROFILE_FFT_SIZE; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (PROFILE_FFT_SIZE - 1));
  }
  const binPitchClass = new Int8Array(bins);
  for (let index = 0; index < bins; index += 1) {
    const hz = index * binHz;
    binPitchClass[index] = hz >= CHROMA_MIN_HZ && hz <= CHROMA_MAX_HZ ? (Math.round(12 * Math.log2(hz / 440) + 69) % 12 + 12) % 12 : -1;
  }
  const chromaBinList = [];
  for (let index = 0; index < bins; index += 1) if (binPitchClass[index] >= 0) chromaBinList.push(index);
  const magnitudes = new Float64Array(bins);
  const side = options.side && options.side.length >= mono.length ? options.side : null;
  const vocalLowBin = Math.max(1, Math.floor(VOCAL_LOW_HZ / binHz));
  const vocalHighBin = Math.min(bins - 1, Math.ceil(VOCAL_HIGH_HZ / binHz));
  const sideReal = new Float64Array(side ? PROFILE_FFT_SIZE : 0);
  const sideImag = new Float64Array(side ? PROFILE_FFT_SIZE : 0);
  const levels = [];
  const envelope = [];
  const lowEnvelope = [];
  const centre = [];
  const chroma = new Array(12).fill(0);
  const binCount = Math.max(1, Math.ceil(duration / NOVELTY_BIN_SEC));
  const sectionBins = Array.from({ length: binCount }, () => new Float64Array(12));
  const toneBins = Array.from({ length: binCount }, () => new Float64Array(3));
  const frameChroma = new Float64Array(12);
  const previousChroma = new Float64Array(12);
  const chromaEnvelope = [];
  let frames = 0;
  let yieldBy = performance.now() + YIELD_BUDGET_MS;
  for (let start = 0; start + PROFILE_FFT_SIZE <= mono.length; start += HOP) {
    frame.set(mono.subarray(start, start + PROFILE_FFT_SIZE));
    levels.push(rmsDb(weighted.subarray(start, start + PROFILE_FFT_SIZE)));
    for (let index = 0; index < PROFILE_FFT_SIZE; index += 1) {
      real[index] = frame[index] * window[index];
      imag[index] = 0;
    }
    fft(real, imag);
    const binIndex = Math.min(binCount - 1, Math.floor(start / sampleRate / NOVELTY_BIN_SEC));
    const sectionBin = sectionBins[binIndex];
    const toneBin = toneBins[binIndex];
    let midBand = 0;
    let peak = 0;
    for (let index = 0; index < bins; index += 1) {
      const magnitude = Math.hypot(real[index], imag[index]);
      magnitudes[index] = magnitude;
      spectrum[index] = magnitude > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(magnitude)) : SILENCE_DB;
      const power = magnitude * magnitude;
      if (index < toneEdgeBins[0]) toneBin[0] += power;
      else if (index < toneEdgeBins[1]) toneBin[1] += power;
      else toneBin[2] += power;
      if (index >= vocalLowBin && index <= vocalHighBin) midBand += power;
      if (binPitchClass[index] >= 0 && magnitude > peak) peak = magnitude;
    }
    const floor = peak * 1e-3;
    let arithmetic = 0;
    let logSum = 0;
    for (const index of chromaBinList) {
      const magnitude = Math.max(magnitudes[index], floor);
      arithmetic += magnitude;
      logSum += Math.log(magnitude);
    }
    const flatness = arithmetic > 0 && chromaBinList.length ? Math.exp(logSum / chromaBinList.length) / (arithmetic / chromaBinList.length) : 1;
    const tonality = Math.max(0, 1 - flatness / CHROMA_MAX_FLATNESS);
    frameChroma.fill(0);
    if (tonality > 0) {
      for (const index of chromaBinList) {
        const contribution = magnitudes[index] * tonality;
        chroma[binPitchClass[index]] += contribution;
        sectionBin[binPitchClass[index]] += contribution;
        frameChroma[binPitchClass[index]] += contribution;
      }
    }
    let harmonicChange = 0;
    let chromaSum = 0;
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) chromaSum += frameChroma[pitchClass];
    if (chromaSum > 0) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        const share = frameChroma[pitchClass] / chromaSum;
        harmonicChange += Math.max(0, share - previousChroma[pitchClass]);
        frameChroma[pitchClass] = share;
      }
      previousChroma.set(frameChroma);
    }
    if (side) {
      for (let index = 0; index < PROFILE_FFT_SIZE; index += 1) {
        sideReal[index] = side[start + index] * window[index];
        sideImag[index] = 0;
      }
      fft(sideReal, sideImag);
      let sideBand = 0;
      for (let index = vocalLowBin; index <= vocalHighBin; index += 1) {
        sideBand += sideReal[index] * sideReal[index] + sideImag[index] * sideImag[index];
      }
      const total = midBand + sideBand;
      centre.push(total > 0 ? midBand / total : 0.5);
    }
    if (frames > 0) {
      envelope.push(spectralFlux(spectrum, previous, fluxBins));
      lowEnvelope.push(spectralFlux(spectrum, previous, lowFluxBins));
      chromaEnvelope.push(harmonicChange);
    }
    previous.set(spectrum);
    frames += 1;
    if (performance.now() >= yieldBy) {
      await yieldToUi();
      yieldBy = performance.now() + YIELD_BUDGET_MS;
    }
  }
  const edges = measureEdges(levels, hopSec, PROFILE_FFT_SIZE / sampleRate);
  if (!edges) return null;
  const measured = options.grid ? gridFromBeats(options.grid, { partial: options.partial }) : null;
  const tempo = estimateTempo(envelope, hopSec);
  const lastBeatSec = tempo ? (envelope.length - 1 - tempo.beatOffsetHops) * hopSec + PROFILE_FFT_SIZE / (2 * sampleRate) : 0;
  const beatOffset = tempo && tempo.periodSec > 0 ? (lastBeatSec % tempo.periodSec + tempo.periodSec) % tempo.periodSec : 0;
  const key = keyFromChroma(chroma);
  const partial = options.partial === true;
  const envelopeStartSec = PROFILE_FFT_SIZE / (2 * sampleRate);
  const barSec = tempo && tempo.periodSec > 0 ? tempo.periodSec * BEATS_PER_BAR : 0;
  const downbeat = !measured && tempo && barSec > 0 ? estimateDownbeat(
    lowEnvelope,
    hopSec,
    tempo.periodSec,
    ((beatOffset - envelopeStartSec) % tempo.periodSec + tempo.periodSec) % tempo.periodSec,
    BEATS_PER_BAR,
    chromaEnvelope
  ) : null;
  const tempoFrames = Math.round(OUTRO_TEMPO_SEC / hopSec);
  const outroTempo = partial || envelope.length <= tempoFrames ? null : estimateTempo(envelope.slice(-tempoFrames), hopSec);
  const headTempo = tempo && envelope.length > tempoFrames ? estimateTempo(envelope.slice(0, tempoFrames), hopSec) : null;
  const headDownbeat = !measured && tempo && headTempo && Math.abs(headTempo.periodSec / tempo.periodSec - 1) <= HEAD_TEMPO_TOLERANCE ? estimateDownbeat(
    lowEnvelope.slice(0, tempoFrames),
    hopSec,
    headTempo.periodSec,
    modulo((tempoFrames - 1 - headTempo.beatOffsetHops) * hopSec, headTempo.periodSec),
    BEATS_PER_BAR,
    chromaEnvelope.slice(0, tempoFrames)
  ) : null;
  const firstBin = Math.max(0, Math.floor(edges.leadIn / NOVELTY_BIN_SEC));
  const lastBin = Math.min(binCount, Math.ceil(edges.soundingEnd / NOVELTY_BIN_SEC));
  const overBins = (from, to, read) => {
    for (let index = Math.max(0, from); index < Math.min(binCount, to); index += 1) read(index);
  };
  const chromaOver = (from, to) => {
    const total = new Array(12).fill(0);
    overBins(from, to, (bin) => {
      for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        total[pitchClass] += sectionBins[bin][pitchClass];
      }
    });
    return keyFromChroma(total);
  };
  const toneOver = (from, to) => {
    const total = [0, 0, 0];
    overBins(from, to, (bin) => {
      for (let band = 0; band < 3; band += 1) total[band] += toneBins[bin][band];
    });
    const all = total[0] + total[1] + total[2];
    return all > 0 ? total.map((value) => value / all) : [1 / 3, 1 / 3, 1 / 3];
  };
  const endpointBins = ENDPOINT_CHROMA_SEC / NOVELTY_BIN_SEC;
  const toneWindow = EDGE_WINDOW_SEC / NOVELTY_BIN_SEC;
  const sections = findBoundaries(sectionBins, NOVELTY_BIN_SEC);
  return {
    version: TRACK_PROFILE_VERSION,
    partial,
    gridless: options.gridless === true,
    duration,
    leadIn: edges.leadIn,
    vocalStart: side ? firstSustained(centre, hopSec) : null,
    sectionStart: sections[0] ?? null,
    sections,
    leadOut: partial ? null : Math.max(0, duration - edges.soundingEnd),
    bodyOut: partial ? null : Math.max(0, duration - edges.bodyEnd),
    startsHot: edges.startsHot,
    endsHot: partial ? null : edges.endsHot,
    introSlope: edges.introSlope,
    outroSlope: partial ? null : edges.outroSlope,
    loudness: edges.loudness,
    headDb: edges.headDb,
    tailDb: partial ? null : edges.tailDb,
    introTone: toneOver(firstBin, firstBin + toneWindow),
    outroTone: partial ? null : toneOver(lastBin - toneWindow, lastBin),
    bpm: measured?.bpm ?? tempo?.bpm ?? null,
    outroBpm: measured ? measured.outroBpm : outroTempo?.bpm ?? null,
    beatOffset: measured?.beatOffset ?? beatOffset,
    downbeatOffset: measured ? measured.downbeatOffset : downbeat === null ? null : modulo(downbeat + envelopeStartSec, barSec),
    // Folded against the whole-track bar because that is the unit `barGrid` walks in. When the two
    // ends really do run at different tempos the fold can shift the answer by the difference between
    // the two bar lengths - a few hundredths of a second, against a walk of one or two bars.
    // ponytail: good enough at entry range; store the head period too if anything ever needs the
    // head grid further in than that.
    headDownbeatOffset: measured ? measured.headDownbeatOffset : headDownbeat === null ? null : modulo(headDownbeat + envelopeStartSec, barSec),
    beatsPerBar: measured?.beatsPerBar ?? BEATS_PER_BAR,
    key: key.key,
    major: key.major,
    keyConfidence: key.confidence,
    introKey: chromaOver(firstBin, firstBin + endpointBins),
    outroKey: partial ? null : chromaOver(lastBin - endpointBins, lastBin)
  };
};
