// ============================================================
// Omni Provider · 本地音乐库
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0) provider 协议；URL 拼参迁移自本项目播放链路。
// 本地播放不走 /api 播放 URL（文件直连/blob），playback 能力为 false；
// 搜索与歌词走本地库路由。
// ============================================================

var omniLocalProvider = {
  id: 'local',
  displayName: '本地音乐',
  capabilities: {
    search: true,
    playback: false,
    lyrics: true,
    playlists: false,
    auth: false
  },
  search: {
    urlFor: function (query, limit, offset) {
      return '/api/local/search?keywords=' + encodeURIComponent(query) +
        '&limit=' + limit + '&offset=' + Math.max(0, Number(offset) || 0);
    }
  },
  playback: {
    urlFor: function () { return null; }
  },
  lyrics: {
    urlFor: function (song) {
      song = song || {};
      return '/api/local/lyric?path=' + encodeURIComponent(song.localPath || song.filePath || song.id || '');
    }
  }
};
registerOmniProvider(omniLocalProvider);
