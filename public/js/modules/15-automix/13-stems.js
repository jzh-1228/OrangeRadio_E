// ============================================================
// 13-stems.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/stems.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const STEM_NAMES = ["drums", "bass", "other", "vocals"];
const STEM_SAMPLE_RATE = 44100;
const STEM_WINDOW_SEC = 30;
const PCM_FULL_SCALE = 32767;
const peakOf = (left, right) => {
  let peak = 1;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] < 0 ? -left[i] : left[i];
    if (l > peak) peak = l;
    const r = right[i] < 0 ? -right[i] : right[i];
    if (r > peak) peak = r;
  }
  return peak;
};
const toPcm = (left, right, gain = 1) => {
  const length = left.length;
  const scale = PCM_FULL_SCALE / gain;
  const out = new Int16Array(length * 2);
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(left[i] * scale)));
    out[length + i] = Math.max(-32768, Math.min(32767, Math.round(right[i] * scale)));
  }
  return out;
};
const toBuffer = (pcm, length, gain) => {
  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: STEM_SAMPLE_RATE });
  const channel = new Float32Array(length);
  for (let c = 0; c < 2; c += 1) {
    const base = c * length;
    for (let i = 0; i < length; i += 1) channel[i] = pcm[base + i] / PCM_FULL_SCALE * gain;
    buffer.copyToChannel(channel, c);
  }
  return buffer;
};
const view = (window2) => {
  let buffers = null;
  return {
    from: window2.from,
    duration: window2.duration,
    role: window2.role,
    vocalEnd: window2.vocalEnd,
    get buffers() {
      if (!buffers) {
        const built = {};
        for (const name of STEM_NAMES) {
          built[name] = toBuffer(window2.pcm[name], window2.length, window2.gain[name]);
        }
        buffers = built;
      }
      return buffers;
    }
  };
};
const canSeparateStems = () => typeof window !== "undefined" && typeof window.electron?.separateStems === "function" && modelCanRun("htdemucs");
const cache = /* @__PURE__ */ new Map();
const inFlight = /* @__PURE__ */ new Set();
const MAX_WINDOWS = 4;
const keyOf = (song, role) => `${getPlaybackAnalysisKey(song)}:${role}`;
const explained = /* @__PURE__ */ new Set();
const explainOnce = (key, message) => {
  if (explained.has(key)) return;
  explained.add(key);
  console.log(message);
};
let queue = Promise.resolve();
let wanted = /* @__PURE__ */ new Set();
const parked = /* @__PURE__ */ new Map();
onAudioCached((cacheKey) => {
  for (const [key, request] of [...parked]) {
    if (getSongResourceCacheKey("audio", request.song) !== cacheKey) continue;
    parked.delete(key);
    if (request.stillWanted && !request.stillWanted()) continue;
    void ensureStems(request);
  }
});
const stemWindowKey = (song, role) => keyOf(song, role);
const setWantedStems = (keys) => {
  wanted = new Set(keys);
  for (const key of [...parked.keys()]) {
    if (!wanted.has(key)) parked.delete(key);
  }
};
const pickStemVictim = (keys, stillWanted, arriving) => arriving !== void 0 && !stillWanted.has(arriving) ? arriving : keys.find((key) => !stillWanted.has(key)) ?? keys[0];
const announced = /* @__PURE__ */ new Set();
const remember = (key, value) => {
  cache.delete(key);
  cache.set(key, value);
  announced.delete(key);
  while (cache.size > MAX_WINDOWS) {
    const victim = pickStemVictim([...cache.keys()], wanted, key);
    if (victim === void 0) break;
    cache.delete(victim);
    if (victim === key) break;
  }
};
const touch = (key) => {
  const found = cache.get(key);
  if (!found) return null;
  cache.delete(key);
  cache.set(key, found);
  return found;
};
const getStemsByKey = (key, role) => {
  const found = key ? touch(`${key}:${role}`) : null;
  return found ? view(found) : null;
};
const readLocalBytes = async (request) => {
  const { song, audioUrl } = request;
  const representation = getPlaybackRepresentation(song);
  if (representation) {
    try {
      const response = await fetch(representation.url);
      if (!response.ok) throw new Error(`representation responded ${response.status}`);
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  }
  const cached = await getCachedSongAudioBlob(song);
  if (cached) return cached.arrayBuffer();
  if (audioUrl) {
    const isLocalUrl = audioUrl.startsWith("blob:") || audioUrl.startsWith("file:") || getPlaybackSourceRef(song).kind !== "online";
    if (!isLocalUrl) return null;
    try {
      return await (await fetch(audioUrl)).arrayBuffer();
    } catch {
      return null;
    }
  }
  if (request.readBytes) return request.readBytes();
  return null;
};
const cutWindow = async (bytes, role) => {
  const OfflineContext = window.OfflineAudioContext;
  if (!OfflineContext) return null;
  let decoded;
  try {
    decoded = await new OfflineContext(1, 1, STEM_SAMPLE_RATE).decodeAudioData(bytes);
  } catch (error) {
    console.warn("[Automix] could not decode a track for separation", error);
    return null;
  }
  const total = decoded.length;
  const windowLength = Math.min(total, Math.round(STEM_WINDOW_SEC * STEM_SAMPLE_RATE));
  const start = role === "tail" ? total - windowLength : 0;
  const left = decoded.getChannelData(0).slice(start, start + windowLength);
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1).slice(start, start + windowLength) : left.slice();
  return { left, right, start };
};
const ensureStems = async (request) => {
  if (!canSeparateStems()) return;
  const key = keyOf(request.song, request.role);
  if (inFlight.has(key)) return;
  if (cache.has(key)) {
    if (!announced.has(key)) {
      announced.add(key);
      console.log(`[Automix] the ${request.role} of "${request.song.name}" is already separated`);
    }
    return;
  }
  inFlight.add(key);
  console.log(`[Automix] separating the ${request.role} of "${request.song.name}"`);
  const ahead = queue;
  let release = () => {
  };
  queue = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await ahead;
    await profilesSettled();
    const started = performance.now();
    const bytes = await readLocalBytes(request);
    if (!bytes) {
      if (getPlaybackSourceRef(request.song).kind === "local") {
        explainOnce(key, `[Automix] cannot separate the ${request.role} of "${request.song.name}": its local file is not accessible`);
        return;
      }
      explainOnce(key, `[Automix] waiting to separate the ${request.role} of "${request.song.name}": the file is not in the media cache yet`);
      parked.set(key, request);
      return;
    }
    const cut = await cutWindow(bytes, request.role);
    if (!cut) return;
    const { left, right, start } = cut;
    const windowLength = left.length;
    const separate = window.electron?.separateStems;
    if (!separate) return;
    if (request.stillWanted && !request.stillWanted()) {
      console.log(`[Automix] dropped the ${request.role} of "${request.song.name}": no longer the pair a transition is coming for`);
      return;
    }
    const modelStarted = performance.now();
    const parts = await separate({ left, right });
    if (!parts) {
      await noteModelFailed("htdemucs");
      return;
    }
    const pcm = {};
    const gain = {};
    const store = (name, l, r) => {
      gain[name] = peakOf(l, r);
      pcm[name] = toPcm(l, r, gain[name]);
    };
    for (const name of ["drums", "bass", "vocals"]) {
      store(name, parts[name].left, parts[name].right);
    }
    const otherL = new Float32Array(windowLength);
    const otherR = new Float32Array(windowLength);
    for (let i = 0; i < windowLength; i += 1) {
      otherL[i] = left[i] - parts.drums.left[i] - parts.bass.left[i] - parts.vocals.left[i];
      otherR[i] = right[i] - parts.drums.right[i] - parts.bass.right[i] - parts.vocals.right[i];
    }
    store("other", otherL, otherR);
    const vocalEnd = request.role !== "tail" ? null : lastVocalMoment(
      envelopeOf([parts.vocals.left, parts.vocals.right], STEM_SAMPLE_RATE),
      envelopeOf([left, right], STEM_SAMPLE_RATE)
    );
    remember(key, {
      from: start / STEM_SAMPLE_RATE,
      duration: windowLength / STEM_SAMPLE_RATE,
      role: request.role,
      vocalEnd,
      length: windowLength,
      pcm,
      gain
    });
    const modelSec = (performance.now() - modelStarted) / 1e3;
    const totalSec = (performance.now() - started) / 1e3;
    const sung = request.role !== "tail" ? "" : vocalEnd === null ? ", no singing anywhere in it" : `, still singing at ${(start / STEM_SAMPLE_RATE + vocalEnd).toFixed(2)}s`;
    console.log(`[Automix] separated the ${request.role} of "${request.song.name}" (${(windowLength / STEM_SAMPLE_RATE).toFixed(1)}s from ${(start / STEM_SAMPLE_RATE).toFixed(1)}s) - ${modelSec.toFixed(1)}s in the model, ${totalSec.toFixed(1)}s with the decode${sung}`);
  } catch (error) {
    console.warn("[Automix] separation failed", error);
  } finally {
    inFlight.delete(key);
    release();
  }
};
const transitionCapabilities = () => {
  const beatGrid = canRunBeatThis();
  const stems = canSeparateStems();
  const desktop = typeof window !== "undefined" && typeof window.electron?.separateStems === "function";
  return { beatGrid, stems, full: beatGrid && stems, desktop };
};
