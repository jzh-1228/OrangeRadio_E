// ---------- 模型在盘状态（modelAvailability 移植）----------
// 问题是"权重在不在盘"，不是"是不是 Electron"——两者只在权重随安装包分发时才同义。
// 初始 false（而非 unknown）：消费方把它画成给用户看的徽标，起始 true 是对一个空目录
// 承诺 stem 分离。下载落地后 presence 自愈，因此反复重问而非会话级闩锁。
const AUTOMIX_MODEL_ABSENT = Object.freeze({ beat_this: false, htdemucs: false });
let automixModelsPresent = AUTOMIX_MODEL_ABSENT;
const automixModelListeners = new Set();
function subscribeModelAvailability(listener) {
  if (typeof listener === 'function') automixModelListeners.add(listener);
  return () => { automixModelListeners.delete(listener); };
}
function modelsPresent() { return automixModelsPresent; }
function modelCanRun(name) { return !!automixModelsPresent[name]; }
async function refreshModelAvailability() {
  const ask = typeof window !== 'undefined' && window.electron ? window.electron.getAutomixModelsPresent : null;
  if (typeof ask !== 'function') return automixModelsPresent;
  let answer = null;
  try { answer = await ask(); } catch (error) {
    console.warn('[Automix] could not check which models are installed', error);
    return automixModelsPresent;
  }
  if (!answer) return automixModelsPresent;
  const next = { beat_this: answer.beat_this === true, htdemucs: answer.htdemucs === true };
  if (next.beat_this === automixModelsPresent.beat_this && next.htdemucs === automixModelsPresent.htdemucs) return automixModelsPresent;
  automixModelsPresent = Object.freeze(next);
  automixModelListeners.forEach((listener) => { try { listener(); } catch (e) { } });
  return automixModelsPresent;
}
async function noteModelFailed(name) {
  const stillThere = (await refreshModelAvailability())[name];
  if (!stillThere) console.warn('[Automix] ' + name + ' produced nothing and its weights are gone; will use it again if they come back');
}
// 加载即问一次：两次 existsSync 的一次 IPC 往返，没有理由推迟。
void refreshModelAvailability();

// ============================================================
// 22-beat-this.js — Automix 推理桥·拍点模型前处理（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/automix/beatThis.ts
// 前处理常数是模型契约（22050/n_fft 1024/hop 441/mel 30-11000/log1p(1000x)/
// 分块 1500/边界 6）——改任何一个模型不会报错，只会自信地答错。
// ============================================================
const BEAT_THIS_SAMPLE_RATE = 22050;
const N_FFT = 1024;
const BT_HOP = 441;
const BEAT_THIS_FPS = BEAT_THIS_SAMPLE_RATE / BT_HOP;
const N_MELS = 128;
const F_MIN = 30;
const F_MAX = 11e3;
const LOG_MULTIPLIER = 1e3;
const AMIN = 1e-10;
const hzToMel = (hz) => {
  const fSp = 200 / 3;
  if (hz < 1e3) return hz / fSp;
  return 1e3 / fSp + Math.log(hz / 1e3) / (Math.log(6.4) / 27);
};
const melToHz = (mel) => {
  const fSp = 200 / 3;
  const minLogMel = 1e3 / fSp;
  if (mel < minLogMel) return fSp * mel;
  return 1e3 * Math.exp(Math.log(6.4) / 27 * (mel - minLogMel));
};
const buildFilterbank = () => {
  const bins = N_FFT / 2 + 1;
  const melMin = hzToMel(F_MIN);
  const melMax = hzToMel(F_MAX);
  const corners = Array.from({ length: N_MELS + 2 }, (_, index) => melToHz(melMin + (melMax - melMin) * index / (N_MELS + 1)));
  return Array.from({ length: N_MELS }, (_, band) => {
    const row = new Float64Array(bins);
    const [left, centre, right] = [corners[band], corners[band + 1], corners[band + 2]];
    for (let bin = 0; bin < bins; bin += 1) {
      const hz = bin * BEAT_THIS_SAMPLE_RATE / N_FFT;
      const rising = centre === left ? 0 : (hz - left) / (centre - left);
      const falling = right === centre ? 0 : (right - hz) / (right - centre);
      row[bin] = Math.max(0, Math.min(rising, falling));
    }
    return row;
  });
};
let filterbank = null;
let hann = null;
const melSpectrogram = async (mono) => {
  if (!filterbank) filterbank = buildFilterbank();
  if (!hann) {
    hann = new Float64Array(N_FFT);
    for (let index = 0; index < N_FFT; index += 1) {
      hann[index] = 0.5 * (1 - Math.cos(2 * Math.PI * index / N_FFT));
    }
  }
  const pad = N_FFT / 2;
  const padded = new Float64Array(mono.length + 2 * pad);
  for (let index = 0; index < pad; index += 1) {
    padded[index] = mono[Math.min(pad - index, mono.length - 1)];
    padded[padded.length - 1 - index] = mono[Math.max(0, mono.length - 1 - (pad - index))];
  }
  padded.set(mono, pad);
  const frames = Math.floor((padded.length - N_FFT) / BT_HOP) + 1;
  if (frames <= 0) return { data: new Float32Array(0), frames: 0 };
  const data = new Float32Array(frames * N_MELS);
  const real = new Float64Array(N_FFT);
  const imag = new Float64Array(N_FFT);
  const magnitude = new Float64Array(N_FFT / 2 + 1);
  const scale = 1 / Math.sqrt(N_FFT);
  let yieldBy = performance.now() + YIELD_BUDGET_MS;
  for (let frame = 0; frame < frames; frame += 1) {
    if (performance.now() >= yieldBy) {
      await yieldToUi();
      yieldBy = performance.now() + YIELD_BUDGET_MS;
    }
    const start = frame * BT_HOP;
    for (let index = 0; index < N_FFT; index += 1) {
      real[index] = padded[start + index] * hann[index];
      imag[index] = 0;
    }
    fft(real, imag);
    for (let bin = 0; bin < magnitude.length; bin += 1) {
      magnitude[bin] = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]) * scale;
    }
    for (let band = 0; band < N_MELS; band += 1) {
      const row = filterbank[band];
      let energy = 0;
      for (let bin = 0; bin < magnitude.length; bin += 1) energy += magnitude[bin] * row[bin];
      data[frame * N_MELS + band] = Math.log1p(LOG_MULTIPLIER * Math.max(energy, AMIN));
    }
  }
  return { data, frames };
};
const deduplicate = (peaks, width) => {
  if (!peaks.length) return [];
  const merged = [];
  let mean = peaks[0];
  let count = 1;
  for (let index = 1; index < peaks.length; index += 1) {
    const peak = peaks[index];
    if (peak - mean <= width) {
      count += 1;
      mean += (peak - mean) / count;
    } else {
      merged.push(Math.round(mean));
      mean = peak;
      count = 1;
    }
  }
  merged.push(Math.round(mean));
  return merged;
};
const beatsFromLogits = (beatLogits, downbeatLogits, fps = BEAT_THIS_FPS) => {
  const pick = (logits) => {
    const peaks = [];
    for (let index = 0; index < logits.length; index += 1) {
      const value = logits[index];
      if (!(value > 0)) continue;
      let isPeak = true;
      for (let offset = -3; offset <= 3 && isPeak; offset += 1) {
        const other = index + offset;
        if (other >= 0 && other < logits.length && logits[other] > value) isPeak = false;
      }
      if (isPeak) peaks.push(index);
    }
    return deduplicate(peaks, 1);
  };
  const beats = pick(beatLogits).map((frame) => frame / fps);
  const downbeats = pick(downbeatLogits).map((frame) => frame / fps);
  if (!beats.length) return { beats, downbeats: [] };
  const snapped = downbeats.map((time) => {
    let best = beats[0];
    for (const beat of beats) {
      if (Math.abs(beat - time) < Math.abs(best - time)) best = beat;
    }
    return best;
  });
  return { beats, downbeats: [...new Set(snapped)].sort((a, b) => a - b) };
};
const MODEL_CHUNK_FRAMES = 1500;
const BORDER_FRAMES = 6;
const chunkStarts = (frames) => {
  const stride = MODEL_CHUNK_FRAMES - 2 * BORDER_FRAMES;
  const starts = [];
  for (let start = -BORDER_FRAMES; start < frames - BORDER_FRAMES; start += stride) {
    starts.push(start);
  }
  if (!starts.length) return [-BORDER_FRAMES];
  if (frames > stride) starts[starts.length - 1] = frames - (MODEL_CHUNK_FRAMES - BORDER_FRAMES);
  return starts;
};
const splitForModel = (mel) => {
  if (!mel.frames) return [];
  return chunkStarts(mel.frames).map((start) => {
    const from = Math.max(0, start);
    const to = Math.min(start + MODEL_CHUNK_FRAMES, mel.frames);
    const leftPad = Math.max(0, -start);
    const rightPad = Math.max(0, Math.min(BORDER_FRAMES, start + MODEL_CHUNK_FRAMES - mel.frames));
    const frames = leftPad + Math.max(0, to - from) + rightPad;
    const data = new Float32Array(frames * 128);
    if (to > from) data.set(mel.data.subarray(from * 128, to * 128), leftPad * 128);
    return { data, frames, start };
  });
};
const aggregateChunks = (predictions, frames) => {
  const beat = new Float32Array(frames).fill(-1e3);
  const downbeat = new Float32Array(frames).fill(-1e3);
  for (let index = predictions.length - 1; index >= 0; index -= 1) {
    const chunk = predictions[index];
    const wide = chunk.frames >= 2 * BORDER_FRAMES;
    const from = wide ? BORDER_FRAMES : 0;
    const to = wide ? chunk.frames - BORDER_FRAMES : chunk.frames;
    for (let offset = from; offset < to; offset += 1) {
      const target = chunk.start + offset;
      if (target < 0 || target >= frames) continue;
      beat[target] = chunk.beat[offset];
      downbeat[target] = chunk.downbeat[offset];
    }
  }
  return { beat, downbeat };
};
const OUTRO_WINDOW_SEC = 30;
const MIN_BEATS = 8;
const BT_MODULO = (value, span) => (value % span + span) % span;
const BT_MEDIAN = (values) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const intervals = (times) => {
  const out = [];
  for (let index = 1; index < times.length; index += 1) out.push(times[index] - times[index - 1]);
  return out;
};
const gridFromBeats = (grid, options = {}) => {
  if (grid.beats.length < MIN_BEATS) return null;
  const period = BT_MEDIAN(intervals(grid.beats));
  if (!Number.isFinite(period) || period <= 0) return null;
  const last = grid.beats[grid.beats.length - 1];
  const beatOffset = BT_MODULO(last, period);
  const spans = intervals(grid.downbeats).map((span) => Math.round(span / period));
  const perBar = Math.round(BT_MEDIAN(spans.filter((span) => span >= 2 && span <= 12)));
  const beatsPerBar = Number.isFinite(perBar) && perBar >= 2 ? perBar : 4;
  const barSec = period * beatsPerBar;
  const outroFrom = last - OUTRO_WINDOW_SEC;
  const outroBeats = grid.beats.filter((beat) => beat >= outroFrom);
  const outroPeriod = outroBeats.length >= MIN_BEATS ? BT_MEDIAN(intervals(outroBeats)) : NaN;
  return {
    bpm: 60 / period,
    // Null on a partial profile for the same reason every other tail field is: the end of a
    // truncated file describes the truncation.
    outroBpm: options.partial || !Number.isFinite(outroPeriod) || outroPeriod <= 0 ? null : 60 / outroPeriod,
    beatOffset,
    downbeatOffset: grid.downbeats.length ? BT_MODULO(grid.downbeats[grid.downbeats.length - 1], barSec) : null,
    headDownbeatOffset: grid.downbeats.length ? BT_MODULO(grid.downbeats[0], barSec) : null,
    beatsPerBar
  };
};
const canRunBeatThis = () => typeof window !== "undefined" && typeof window.electron?.runBeatThis === "function" && modelCanRun("beat_this");
const analyseBeatGrid = async (mel) => {
  const run = typeof window !== "undefined" ? window.electron?.runBeatThis : void 0;
  if (!canRunBeatThis() || typeof run !== "function") return null;
  const chunks = splitForModel(mel);
  if (!chunks.length) return null;
  const logits = await run(chunks.map(({ data, frames }) => ({ data, frames })));
  if (!logits || logits.beat.length !== chunks.length) {
    await noteModelFailed("beat_this");
    return null;
  }
  const predictions = chunks.map((chunk, index) => ({
    start: chunk.start,
    frames: chunk.frames,
    beat: logits.beat[index],
    downbeat: logits.downbeat[index]
  }));
  const track = aggregateChunks(predictions, mel.frames);
  return beatsFromLogits(track.beat, track.downbeat);
};
