// ============================================================
// Omni 在线音乐抽象层 · 歌曲身份键
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/utils/appPlaybackGuards.ts → 原生 JS 移植
//
// getPlaybackSongKey 是一切缓存键 / 去重 / 队列身份的地基：
//   online:{providerId}:{mediaId}  local:{localKey}  podcast:{programId}
// 注意：既有 queueItemKey（09-queue-snapshot-autoplay.js）保持原实现不动，
// 它的键格式已被快照/去重路径依赖；本模块是 omni / 资源缓存 / automix
// 的新权威身份，两者并行，后续版本再统一。
// ============================================================

// 平台判定，语义与 songProviderKey（07-search.js）严格一致：
// local → spotify → qq → qishui → kugou → netease 兜底。
function omniResolveProviderId(song) {
  song = song || {};
  if (song.provider === 'local' || song.source === 'local' || song.type === 'local' || song.localPath) return 'local';
  if (song.provider === 'spotify' || song.source === 'spotify' || song.type === 'spotify' || song.spotifyId || song.spotifyUri) return 'spotify';
  if (song.provider === 'qq' || song.source === 'qq' || song.type === 'qq') return 'qq';
  if (song.provider === 'qishui' || song.source === 'qishui' || song.type === 'qishui') return 'qishui';
  if (song.provider === 'kugou' || song.source === 'kugou' || song.type === 'kugou' || song.hash || song.audioHash) return 'kugou';
  return 'netease';
}

// 平台媒体 ID 的取值链（与各消费点既有拼参顺序一致）。
function omniProviderMediaId(providerId, song) {
  song = song || {};
  switch (providerId) {
    case 'qq': return String(song.mid || song.songmid || song.id || '');
    case 'kugou': return String(song.hash || song.fileHash || song.audioHash || song.id || '');
    case 'qishui': return String(song.id || song.providerSongId || '');
    case 'spotify': return String(song.spotifyId || song.id || song.spotifyUri || song.uri || '');
    default: return String(song.id != null ? song.id : '');
  }
}

// 判别式来源引用。歌曲对象可携带显式 sourceRef（normalizePlaybackSongSource 写入后，
// 后续调用零推导成本）；否则按平台特征推导。
function getPlaybackSourceRef(song) {
  song = song || {};
  if (song.sourceRef && song.sourceRef.kind) return song.sourceRef;
  if (song.type === 'podcast' && song.programId) return { kind: 'podcast', mediaId: String(song.programId) };
  if (song.localKey) return { kind: 'local', mediaId: String(song.localKey) };
  if (song.provider === 'local' || song.source === 'local' || song.type === 'local' || song.localPath) {
    return { kind: 'local', mediaId: String(song.localKey || song.localPath || song.filePath || song.id || '') };
  }
  var providerId = omniResolveProviderId(song);
  return { kind: 'online', providerId: providerId, mediaId: omniProviderMediaId(providerId, song) };
}

// 在歌曲进入来源感知路径前补上 sourceRef（幂等）。
function normalizePlaybackSongSource(song) {
  song = song || {};
  if (!song) return song;
  if (!song.sourceRef) {
    try { song.sourceRef = getPlaybackSourceRef(song); } catch (e) { /* 保持透传 */ }
  }
  return song;
}

function getPlaybackSongKey(song) {
  if (!song) return '';
  var sourceRef = getPlaybackSourceRef(song);
  if (sourceRef.kind === 'online') return 'online:' + sourceRef.providerId + ':' + sourceRef.mediaId;
  return sourceRef.kind + ':' + sourceRef.mediaId;
}

function getPlaybackSongSource(song) {
  var sourceRef = getPlaybackSourceRef(song || {});
  return sourceRef.kind === 'online' ? sourceRef.providerId : sourceRef.kind;
}

function isSamePlaybackSong(first, second) {
  return Boolean(first && second && getPlaybackSongKey(first) === getPlaybackSongKey(second));
}

function hasMixedPlaybackSources(queue) {
  if (!Array.isArray(queue) || queue.length < 2) return false;
  var seen = {};
  var count = 0;
  for (var i = 0; i < queue.length; i++) {
    var source = getPlaybackSongSource(queue[i]);
    if (!seen[source]) { seen[source] = true; count++; }
  }
  return count > 1;
}
