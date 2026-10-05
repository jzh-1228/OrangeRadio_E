// ============================================================
// Omni Provider · 酷狗音乐
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0) provider 协议；URL 拼参迁移自本项目播放链路。
// ============================================================

var omniKugouProvider = {
  id: 'kugou',
  displayName: '酷狗音乐',
  capabilities: {
    search: true,
    playback: true,
    lyrics: true,
    playlists: true,
    auth: true
  },
  search: {
    urlFor: function (query, limit, offset) {
      return '/api/kugou/search?keywords=' + encodeURIComponent(query) +
        '&limit=' + limit + '&offset=' + Math.max(0, Number(offset) || 0);
    }
  },
  playback: {
    // 酷狗按 hash 定位音频，多档音质各有独立 hash；专辑上下文字段
    // （albumAudioId/mixSongId）参与服务端的音质解锁判定。
    urlFor: function (song, qualityParam) {
      song = song || {};
      return {
        url: '/api/kugou/song/url?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
          '&albumId=' + encodeURIComponent(song.albumId || song.album_id || '') +
          '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
          '&mixSongId=' + encodeURIComponent(song.mixSongId || '') +
          '&hqHash=' + encodeURIComponent(song.hqHash || song.hq_hash || '') +
          '&sqHash=' + encodeURIComponent(song.sqHash || song.sq_hash || '') +
          '&resHash=' + encodeURIComponent(song.resHash || song.res_hash || '') +
          '&vipRequired=' + encodeURIComponent(song.vipRequired || song.needVip || song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
          '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
          '&fee=' + encodeURIComponent(song.fee || song.Fee || '') + (qualityParam || ''),
        timeoutMs: 9000
      };
    }
  },
  lyrics: {
    urlFor: function (song) {
      song = song || {};
      var duration = typeof playbackDurationFromSong === 'function'
        ? (playbackDurationFromSong(song) || '')
        : '';
      return '/api/kugou/lyric?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
        '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
        '&duration=' + encodeURIComponent(duration);
    }
  }
};
registerOmniProvider(omniKugouProvider);
