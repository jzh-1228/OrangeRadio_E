// ============================================================
// Omni Provider · Spotify（匹配播放：Spotify 元数据 → 本地可播源）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0) provider 协议；URL 拼参迁移自本项目播放链路。
// ============================================================

var omniSpotifyProvider = {
  id: 'spotify',
  displayName: 'Spotify',
  capabilities: {
    search: true,
    playback: true,
    lyrics: true,
    playlists: false,
    auth: true
  },
  search: {
    urlFor: function (query, limit, offset) {
      return '/api/spotify/search?keywords=' + encodeURIComponent(query) +
        '&limit=' + limit + '&offset=' + Math.max(0, Number(offset) || 0);
    }
  },
  playback: {
    urlFor: function (song, qualityParam) {
      song = song || {};
      return {
        url: '/api/spotify/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || song.spotifyId || '') +
          '&spotifyId=' + encodeURIComponent(song.spotifyId || '') +
          '&uri=' + encodeURIComponent(song.spotifyUri || song.uri || '') + (qualityParam || ''),
        timeoutMs: 9000
      };
    }
  },
  lyrics: {
    urlFor: function (song) {
      song = song || {};
      return '/api/spotify/lyric?id=' + encodeURIComponent(song.id || song.providerSongId || song.spotifyId || '');
    }
  }
};
registerOmniProvider(omniSpotifyProvider);
