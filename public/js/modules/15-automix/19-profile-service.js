// ============================================================
// 19-profile-service.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/profileService.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ------------------------------------------------------------
// MineRadio 适配层：Folia 侧的 db/audioCache/representation 依赖换成本项目等价物。
// - 分析键 = Omni 歌曲身份键（04-omni/01-song-key.js 的 getPlaybackSongKey）
// - 档案持久化 = localStorage JSON（每条几百字节，内存 LRU 200 条）
// - 字节来源 = 播放代理 URL（/api/audio?url=…，Range 透传）→ 前缀 1.5MB
// - 媒体字节缓存 / 转码 representation 本项目暂无，走 null 分支（后续接缓存体系）
const getPlaybackAnalysisKey = (song) => getPlaybackSongKey(song);
const getPlaybackRepresentation = () => null;
const getCachedSongAudioBlob = async () => null;
const saveAudioBlob = async () => { };
const PROFILE_STORE_PREFIX = 'orangesea-automix-profile-v1';
// 持久层与内存 LRU（MAX_PROFILES）对齐设上限：键空间此前只增不减，跨会话
// 永久累积最终顶满 localStorage 配额，新歌档案静默失败且挤掉同 origin 的
// fx 存档/听歌统计等其它写入。
const PROFILE_PERSIST_MAX = 200;
const getFromCache = async (key) => {
  try {
    const raw = localStorage.getItem(PROFILE_STORE_PREFIX + ':' + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};
const prunePersistedProfiles = () => {
  try {
    const prefix = PROFILE_STORE_PREFIX + ':automix_profile_';
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(prefix) !== 0) continue;
      let savedAt = 0;
      try { savedAt = Number(JSON.parse(localStorage.getItem(k) || '').savedAt) || 0; } catch (e) { savedAt = 0; }
      entries.push({ key: k, savedAt });
    }
    if (entries.length <= PROFILE_PERSIST_MAX) return;
    entries.sort((a, b) => a.savedAt - b.savedAt); // 无时间戳的旧档案（=0）最旧优先
    for (let i = 0; i < entries.length - PROFILE_PERSIST_MAX; i++) {
      try { localStorage.removeItem(entries[i].key); } catch (e) { }
    }
  } catch (e) { /* 清扫失败不影响写入路径 */ }
};
const saveToCache = async (key, value) => {
  const storeKey = PROFILE_STORE_PREFIX + ':' + key;
  const payload = JSON.stringify({ ...value, savedAt: Date.now() });
  try {
    localStorage.setItem(storeKey, payload);
  } catch (e) {
    /* 配额满：先按 savedAt 淘汰超预算旧档案再重试一次；仍失败则静默（内存 LRU 仍有效） */
    prunePersistedProfiles();
    try { localStorage.setItem(storeKey, payload); } catch (e2) { }
    return;
  }
  prunePersistedProfiles();
};
// ------------------------------------------------------------
const profiles = /* @__PURE__ */ new Map();
const psInFlight = /* @__PURE__ */ new Set();
const skipped = /* @__PURE__ */ new Map();
const MAX_PROFILES = 200;
let psQueue = Promise.resolve();
let psWanted = /* @__PURE__ */ new Set();
const setAnalysisScope = (songs) => {
  psWanted = new Set(songs.map(getPlaybackAnalysisKey));
};
const profilesSettled = () => psQueue;
const storageKey = (songKey) => `automix_profile_${songKey}`;
const psRemember = (songKey, profile) => {
  profiles.delete(songKey);
  profiles.set(songKey, profile);
  while (profiles.size > MAX_PROFILES) {
    const oldest = profiles.keys().next().value;
    if (oldest === void 0) break;
    profiles.delete(oldest);
  }
};
const needsGrid = (request, profile) => request.wantGrid && !!profile && profile.gridless !== false && canRunBeatThis();
const getTrackProfile = (song) => song ? profiles.get(getPlaybackAnalysisKey(song)) ?? null : null;
const toMidSide = (buffer) => {
  const left = buffer.getChannelData(0);
  if (buffer.numberOfChannels < 2) return { mid: Float32Array.from(left), side: null };
  const right = buffer.getChannelData(1);
  const mid = new Float32Array(buffer.length);
  const side = new Float32Array(buffer.length);
  for (let index = 0; index < mid.length; index += 1) {
    mid[index] = (left[index] + right[index]) / 2;
    side[index] = (left[index] - right[index]) / 2;
  }
  return { mid, side };
};
const decodeAtProfileRate = async (bytes) => {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) return null;
  try {
    return await new OfflineContext(1, 1, PROFILE_SAMPLE_RATE).decodeAudioData(bytes);
  } catch (error) {
    console.warn("[Automix] could not decode a track for analysis", error);
    return null;
  }
};
const PREFIX_BYTES = 1572864;
const readPrefix = async (audioUrl) => {
  const response = await fetch(audioUrl, { headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` } });
  if (response.status !== 206) {
    await response.body?.cancel();
    return { skipped: "the server would not serve a partial range, and a full download is not ours to spend" };
  }
  return { bytes: await response.arrayBuffer(), partial: true };
};
const readBytes = async ({ song, audioUrl, enableMediaCache }, hasStoredPartial) => {
  const representation = getPlaybackRepresentation(song);
  if (representation) {
    try {
      const response = await fetch(representation.url);
      if (!response.ok) throw new Error(`representation responded ${response.status}`);
      return { bytes: await response.arrayBuffer(), partial: false };
    } catch (error) {
      console.warn("[Automix] could not read the playback representation for analysis", error);
      return { skipped: "the playback representation could not be read" };
    }
  }
  const cached = await getCachedSongAudioBlob(song);
  if (cached) return { bytes: await cached.arrayBuffer(), partial: false };
  if (!audioUrl) return { skipped: "not cached yet and no URL to read it from" };
  const isLocal = audioUrl.startsWith("blob:") || audioUrl.startsWith("file:") || getPlaybackSourceRef(song).kind !== "online";
  try {
    if (!isLocal && !enableMediaCache) {
      if (hasStoredPartial) return { skipped: "" };
      return await readPrefix(audioUrl);
    }
    const blob = await (await fetch(audioUrl)).blob();
    if (!isLocal) {
      await saveAudioBlob(getSongResourceCacheKey("audio", song), blob);
    }
    return { bytes: await blob.arrayBuffer(), partial: false };
  } catch (error) {
    console.warn("[Automix] could not read a track for analysis", error);
    return { skipped: "the download failed" };
  }
};
const ensureTrackProfile = async (request) => {
  const songKey = getPlaybackAnalysisKey(request.song);
  if (psInFlight.has(songKey)) return;
  if (profiles.has(songKey) && !needsGrid(request, profiles.get(songKey))) return;
  psInFlight.add(songKey);
  psQueue = psQueue.then(async () => {
    try {
      if (!psWanted.has(songKey)) return;
      const stored = await getFromCache(storageKey(songKey));
      const usable = stored?.version === TRACK_PROFILE_VERSION ? stored : null;
      if (usable && !usable.partial && !needsGrid(request, usable)) {
        psRemember(songKey, usable);
        console.log(`[Automix] "${request.song.name}" was measured on an earlier run: ${usable.bpm ? `${Math.round(usable.bpm)} BPM` : "no tempo"}${usable.gridless === false ? " (Beat This!)" : ""}, ${usable.loudness.toFixed(1)} LUFS`);
        return;
      }
      const result = await readBytes(request, Boolean(usable?.partial));
      if ("skipped" in result) {
        if (usable) {
          psRemember(songKey, usable);
          return;
        }
        if (result.skipped && skipped.get(songKey) !== result.skipped) {
          skipped.set(songKey, result.skipped);
          console.log(`[Automix] not analysing "${request.song.name}": ${result.skipped}`);
        }
        return;
      }
      skipped.delete(songKey);
      if (!psWanted.has(songKey)) return;
      const buffer = await decodeAtProfileRate(result.bytes);
      const channels = buffer ? toMidSide(buffer) : null;
      const runModel = request.wantGrid && canRunBeatThis();
      const grid = channels && runModel ? await analyseBeatGrid(await melSpectrogramOffThread(channels.mid)) : null;
      const profile = buffer && channels ? await analyseTrackOffThread(channels.mid, buffer.sampleRate, {
        partial: result.partial,
        side: channels.side,
        grid,
        gridless: !runModel
      }) : null;
      psRemember(songKey, profile);
      if (profile) {
        await saveToCache(storageKey(songKey), profile);
        const at = (seconds) => seconds === null ? "none" : `${seconds.toFixed(2)}s`;
        console.log(
          `[Automix] analysed "${request.song.name}"${profile.partial ? ` (head only, ${profile.duration.toFixed(1)}s of it)` : ""}: ${profile.bpm ? `${Math.round(profile.bpm)} BPM (${grid ? "Beat This!" : "estimated"})` : ""}${profile.outroBpm && profile.bpm && Math.abs(profile.outroBpm - profile.bpm) > 1 ? ` (${Math.round(profile.outroBpm)} at the end)` : ""}${profile.bpm ? `, ${profile.downbeatOffset === null ? "no bar line found" : `bar line at ${profile.downbeatOffset.toFixed(2)}s`}` : ""}${profile.bpm && profile.headDownbeatOffset !== null ? ` (head ${profile.headDownbeatOffset.toFixed(2)}s)` : ""}${profile.bpm ? ", " : ""}${profile.loudness.toFixed(1)} LUFS, lead-in ${profile.leadIn.toFixed(2)}s, lead-out ${at(profile.leadOut)}, body ends ${at(profile.bodyOut)} early, section ${at(profile.sectionStart)} of ${profile.sections.length}, voice ${at(profile.vocalStart)}, ${profile.startsHot ? "starts hot" : "has an intro"}${profile.endsHot === null ? "" : `, ${profile.endsHot ? "ends hot" : "decays out"}`}`
        );
      }
    } catch (error) {
      console.warn("[Automix] track analysis failed", error);
      psRemember(songKey, null);
    } finally {
      psInFlight.delete(songKey);
    }
  });
  await psQueue;
};
const TAIL_MISS_TOLERANCE_SEC = 2;
const recordPlayedTail = (song, levels, hopSec, duration) => {
  const songKey = getPlaybackSongKey(song);
  const known = profiles.get(songKey);
  if (!known || !known.partial) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  if (Math.abs(levels.length * hopSec - duration) > TAIL_MISS_TOLERANCE_SEC) return;
  const edges = measureEdges(levels, hopSec);
  if (!edges) return;
  const profile = {
    ...known,
    partial: false,
    duration,
    leadOut: Math.max(0, duration - edges.soundingEnd),
    bodyOut: Math.max(0, duration - edges.bodyEnd),
    endsHot: edges.endsHot,
    outroSlope: edges.outroSlope,
    // Measured over the whole track rather than the head, so it supersedes the stored one.
    loudness: edges.loudness,
    tailDb: edges.tailDb,
    // Everything the tap cannot answer stays null rather than being filled with the head's
    // value. A level series says how loud the end was; it says nothing about what key it is in,
    // how bright it is or whether it slowed down, and a head-shaped guess at those would be
    // indistinguishable from a measurement to everything downstream.
    outroTone: null,
    outroKey: null,
    outroBpm: null
  };
  psRemember(songKey, profile);
  void saveToCache(storageKey(songKey), profile);
  console.log(
    `[Automix] heard out "${song.name}": ${edges.loudness.toFixed(1)} dBFS, lead-out ${profile.leadOut?.toFixed(2)}s, body ends ${profile.bodyOut?.toFixed(2)}s early, ${edges.endsHot ? "ends hot" : "decays out"} (${edges.outroSlope.toFixed(2)} dB/s)`
  );
};
const clearTrackProfileRuntime = () => {
  profiles.clear();
  psInFlight.clear();
  skipped.clear();
  psWanted = /* @__PURE__ */ new Set();
};
