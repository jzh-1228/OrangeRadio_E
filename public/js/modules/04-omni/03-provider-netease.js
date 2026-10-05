// ============================================================
// Omni Provider · 网易云音乐
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0) provider 协议；URL 拼参迁移自本项目播放链路。
// ============================================================

// 网易云跨源匹配查询：服务端用 name/artist/album/duration 在网易库内定位
// 对应曲目（外部平台歌曲在网易侧的可播代理）。excludeIds 用于失败重试时
// 排除已试过的候选，skipDirect 跳过直接命中走模糊匹配。
function neteasePlaybackMatchQuery(song, opts) {
  song = song || {};
  opts = opts || {};
  var excludeIds = Array.isArray(opts.excludeIds)
    ? opts.excludeIds.join(',')
    : String(opts.excludeIds || '');
  var artistId = song.artistId || song.artist_id || '';
  if (!artistId && Array.isArray(song.artists) && song.artists[0]) artistId = song.artists[0].id || '';
  if (!artistId && Array.isArray(song.ar) && song.ar[0]) artistId = song.ar[0].id || '';
  var artistRecords = Array.isArray(song.artists) && song.artists.length ? song.artists : (Array.isArray(song.ar) ? song.ar : []);
  var artistIds = artistRecords.map(function (artist) { return artist && artist.id || ''; }).filter(Boolean);
  var artistNames = artistRecords.map(function (artist) { return artist && artist.name || ''; }).filter(Boolean);
  if (!artistIds.length && artistId) artistIds = [artistId];
  if (!artistNames.length && (song.artist || song.artistName)) artistNames = [song.artist || song.artistName];
  var albumName = song.album || song.albumName || '';
  if (albumName && typeof albumName === 'object') albumName = albumName.name || '';
  return '&name=' + encodeURIComponent(song.name || song.title || '') +
    '&artist=' + encodeURIComponent(song.artist || song.artistName || '') +
    '&artistId=' + encodeURIComponent(artistId) +
    '&artistIds=' + encodeURIComponent(artistIds.join(',')) +
    '&artistNames=' + encodeURIComponent(artistNames.join('\u001f')) +
    '&album=' + encodeURIComponent(albumName) +
    '&duration=' + encodeURIComponent(song.durationMs || song.dt || song.duration || 0) +
    '&excludeIds=' + encodeURIComponent(excludeIds) +
    '&skipDirect=' + (opts.skipDirect ? '1' : '');
}

var omniNeteaseProvider = {
  id: 'netease',
  displayName: '网易云音乐',
  capabilities: {
    search: true,
    playback: true,
    lyrics: true,
    playlists: true,
    auth: true
  },
  search: {
    urlFor: function (query, limit, offset) {
      return '/api/search?keywords=' + encodeURIComponent(query) +
        '&limit=' + limit + '&offset=' + Math.max(0, Number(offset) || 0);
    }
  },
  playback: {
    urlFor: function (song, qualityParam, matchOpts) {
      song = song || {};
      return {
        url: '/api/song/url?id=' + encodeURIComponent(song.id || '') +
          neteasePlaybackMatchQuery(song, matchOpts) + (qualityParam || ''),
        timeoutMs: 14000
      };
    }
  },
  lyrics: {
    urlFor: function (song) {
      song = song || {};
      return '/api/lyric?id=' + encodeURIComponent(song.id != null ? song.id : '');
    }
  }
};
registerOmniProvider(omniNeteaseProvider);
