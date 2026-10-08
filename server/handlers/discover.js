/* =========================================================================
   OrangeSea · 发现页（discover）
   -------------------------------------------------------------------------
   从原 server.js 拆出：每日推荐歌曲映射与发现页聚合（home）。
   依赖 netease-mappers / netease-login-cache / context / NeteaseCloudMusicApi。
   ========================================================================= */
'use strict';

const {
  personalized,
  recommend_resource,
  recommend_songs,
  history_recommend_songs,
  history_recommend_songs_detail,
} = require('NeteaseCloudMusicApi');
const { getUserCookie } = require('../context');
const { mapSongRecord, mapDiscoverPlaylist } = require('./netease-mappers');
const { getLoginInfo } = require('./netease-login-cache');

function mapDailyRecommendationSongs(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(mapSongRecord)
    .filter(song => song && song.id && song.name);
}

async function handleDiscoverHome() {
  const userCookie = getUserCookie();
  const info = await getLoginInfo();
  const loggedIn = !!(info && info.loggedIn);
  if (!loggedIn) {
    return {
      loggedIn: false,
      user: null,
      dailySongs: [],
      dailySongTotal: 0,
      dailySongsComplete: true,
      playlists: [],
      podcasts: [],
      mode: 'starter',
      updatedAt: Date.now(),
    };
  }
  const tasks = [
    personalized({ limit: 8, cookie: userCookie, timestamp: Date.now() }),
    recommend_resource({ cookie: userCookie, timestamp: Date.now() }),
    recommend_songs({ cookie: userCookie, timestamp: Date.now() }),
  ];
  const result = await Promise.allSettled(tasks);

  const personalizedBody = result[0].status === 'fulfilled' && result[0].value && result[0].value.body || {};
  const publicPlaylists = (personalizedBody.result || personalizedBody.data || [])
    .map(pl => mapDiscoverPlaylist(pl, '推荐歌单'))
    .filter(pl => pl.id && pl.name)
    .slice(0, 8);

  let privatePlaylists = [];
  if (result[1].status === 'fulfilled' && result[1].value) {
    const body = result[1].value.body || {};
    const raw = body.recommend || body.data || [];
    privatePlaylists = (Array.isArray(raw) ? raw : [])
      .map(pl => mapDiscoverPlaylist(pl, '私人推荐'))
      .filter(pl => pl.id && pl.name)
      .slice(0, 6);
  }

  let dailySongs = [];
  if (result[2].status === 'fulfilled' && result[2].value) {
    const body = result[2].value.body || {};
    const raw = body.data && (body.data.dailySongs || body.data.recommend) || body.recommend || [];
    dailySongs = mapDailyRecommendationSongs(raw);
  }

  return {
    loggedIn,
    user: loggedIn ? { userId: info.userId, nickname: info.nickname || '', avatar: info.avatar || '' } : null,
    dailySongs,
    dailySongTotal: dailySongs.length,
    dailySongsComplete: true,
    playlists: privatePlaylists.concat(publicPlaylists).slice(0, 10),
    podcasts: [],
    updatedAt: Date.now(),
  };
}

async function handleDiscoverDailyHistory(date) {
  const userCookie = getUserCookie();
  const info = await getLoginInfo();
  const loggedIn = !!(info && info.loggedIn);
  const activeDate = String(date || '').trim();
  const base = { loggedIn, date: activeDate, dates: [], songs: [], songTotal: 0, updatedAt: Date.now() };
  if (!loggedIn) return Object.assign(base, { error: 'LOGIN_REQUIRED' });
  try {
    if (activeDate) {
      const detail = await history_recommend_songs_detail({ date: activeDate, cookie: userCookie, timestamp: Date.now() });
      const body = (detail && detail.body) || {};
      const raw = (body.data && Array.isArray(body.data) && body.data)
        || (body.data && body.data.dailySongs)
        || body.dailySongs
        || [];
      const songs = mapDailyRecommendationSongs(raw);
      return Object.assign(base, { songs, songTotal: songs.length });
    }
    const recent = await history_recommend_songs({ cookie: userCookie, timestamp: Date.now() });
    const body = (recent && recent.body) || {};
    const rawDates = body.data || [];
    const dates = (Array.isArray(rawDates) ? rawDates : [])
      .map(item => {
        if (typeof item === 'string') return item.trim();
        return String((item && (item.date || item.day)) || '').trim();
      })
      .filter(Boolean);
    return Object.assign(base, { dates });
  } catch (err) {
    console.error('[DiscoverDailyHistory]', err);
    return Object.assign(base, { error: (err && err.message) ? String(err.message) : 'DAILY_HISTORY_FAILED' });
  }
}

module.exports = {
  mapDailyRecommendationSongs,
  handleDiscoverHome,
  handleDiscoverDailyHistory,
};
