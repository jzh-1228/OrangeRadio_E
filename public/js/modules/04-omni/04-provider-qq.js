// ============================================================
// Omni Provider · QQ 音乐
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0) provider 协议；URL 拼参迁移自本项目播放链路。
// ============================================================

// QQ 播放证据查询：把歌曲对象上散落的 VIP/权限字段汇成服务端判定参数，
// 服务端据此选择可播音质与降级策略。
function qqPlaybackEvidenceQuery(song) {
  song = song || {};
  var vipRequired = !!(song.vipRequired || song.needVip || song.need_vip || song.onlyVipPlayable || song.only_vip_playable);
  if (!vipRequired && typeof songRequiresVip === 'function') {
    try { vipRequired = songRequiresVip(song); } catch (e) { vipRequired = false; }
  }
  return '&vipRequired=' + encodeURIComponent(vipRequired ? '1' : '') +
    '&needVip=' + encodeURIComponent(song.needVip || song.need_vip ? '1' : '') +
    '&onlyVipPlayable=' + encodeURIComponent(song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
    '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
    '&fee=' + encodeURIComponent(song.fee || song.Fee || '');
}

var omniQqProvider = {
  id: 'qq',
  displayName: 'QQ 音乐',
  capabilities: {
    search: true,
    playback: true,
    lyrics: true,
    playlists: true,
    auth: true
  },
  search: {
    urlFor: function (query, limit, offset) {
      return '/api/qq/search?keywords=' + encodeURIComponent(query) +
        '&limit=' + limit + '&offset=' + Math.max(0, Number(offset) || 0);
    }
  },
  playback: {
    urlFor: function (song, qualityParam) {
      song = song || {};
      return {
        url: '/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') +
          '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') +
          qqPlaybackEvidenceQuery(song) + (qualityParam || ''),
        timeoutMs: 15000
      };
    }
  },
  lyrics: {
    urlFor: function (song) {
      song = song || {};
      var mid = song.mid || song.songmid || song.id || '';
      var qqId = song.qqId || (/^\d+$/.test(String(song.id || '')) ? song.id : '');
      return '/api/qq/lyric?mid=' + encodeURIComponent(mid) + '&id=' + encodeURIComponent(qqId);
    }
  }
};
registerOmniProvider(omniQqProvider);
