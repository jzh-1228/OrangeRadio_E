// ============================================================
// Omni Provider · 汽水音乐（抖音）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0) provider 协议；URL 拼参迁移自本项目播放链路。
// ============================================================

var omniQishuiProvider = {
  id: 'qishui',
  displayName: '汽水音乐',
  capabilities: {
    search: true,
    playback: true,
    lyrics: true,
    playlists: false,
    auth: true
  },
  search: {
    urlFor: function (query, limit, offset) {
      return '/api/qishui/search?keywords=' + encodeURIComponent(query) +
        '&limit=' + limit + '&offset=' + Math.max(0, Number(offset) || 0);
    }
  },
  playback: {
    urlFor: function (song, qualityParam) {
      song = song || {};
      return {
        url: '/api/qishui/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || '') +
          qqPlaybackEvidenceQuery(song) + (qualityParam || ''),
        timeoutMs: 9000
      };
    }
  },
  lyrics: {
    urlFor: function (song) {
      song = song || {};
      return '/api/qishui/lyric?id=' + encodeURIComponent(song.id || song.providerSongId || '');
    }
  }
};
registerOmniProvider(omniQishuiProvider);
