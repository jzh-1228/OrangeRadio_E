// ============================================================
// Omni 在线音乐抽象层 · 资源缓存键
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/onlineMusic/resourceKeys.ts → 原生 JS 移植
//
// 键公式：{kind}_{playbackSongKey}，如 lyric_online:qq:0039MnYB0qYJ5x。
// 新增 kind 时必须同步在清缓存的分类表登记，否则条目会变成清不掉的孤儿。
// kind 语义化版本（cover_v2）用于封面规则变更后的失效重取。
// ============================================================

var OMNI_SONG_RESOURCE_KINDS = ['audio', 'lyric', 'cover', 'playUrl', 'replayGain', 'profile'];

function getSongResourceCacheKey(kind, song) {
  var sourceRef = getPlaybackSourceRef(song || {});
  var versionedKind = kind === 'cover' && sourceRef.kind === 'online' && sourceRef.providerId === 'kugou'
    ? 'cover_v2'
    : kind;
  return versionedKind + '_' + getPlaybackSongKey(song);
}
