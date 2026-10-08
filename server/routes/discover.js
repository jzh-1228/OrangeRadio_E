/* =========================================================================
   OrangeSea · 发现页 / 天气路由（discover）
   -------------------------------------------------------------------------
   /api/discover/home、/api/discover/daily-history、/api/weather/radio、/api/weather/ip-location。
   ========================================================================= */
'use strict';

const { sendJSON } = require('../utils');
const { handleDiscoverHome, handleDiscoverDailyHistory } = require('../handlers/discover');
const { buildWeatherRadio, fetchIpWeatherLocation } = require('../handlers/weather');

async function handle(req, res, url) {
  const pn = url.pathname;

  if (pn === '/api/discover/home') {
    try {
      sendJSON(res, await handleDiscoverHome());
    } catch (err) {
      console.error('[DiscoverHome]', err);
      sendJSON(res, { error: err.message, loggedIn: false, dailySongs: [], playlists: [], podcasts: [] }, 500);
    }
    return true;
  }

  if (pn === '/api/discover/daily-history') {
    try {
      sendJSON(res, await handleDiscoverDailyHistory(url.searchParams.get('date') || ''));
    } catch (err) {
      console.error('[DiscoverDailyHistoryRoute]', err);
      sendJSON(res, { loggedIn: false, date: '', dates: [], songs: [], error: err.message }, 500);
    }
    return true;
  }

  if (pn === '/api/weather/radio') {
    try {
      const data = await buildWeatherRadio({
        city: url.searchParams.get('city') || url.searchParams.get('q') || '',
        lat: url.searchParams.get('lat'),
        lon: url.searchParams.get('lon'),
        timezone: url.searchParams.get('timezone') || '',
      });
      sendJSON(res, data);
    } catch (err) {
      console.error('[WeatherRadio]', err);
      sendJSON(res, {
        ok: false,
        error: err.message,
        weather: null,
        radio: { title: '天气电台', subtitle: '天气暂时没有回来，可以先听今日推荐。', seedQueries: [], songs: [] },
      }, 500);
    }
    return true;
  }

  if (pn === '/api/weather/ip-location') {
    try {
      sendJSON(res, { ok: true, location: await fetchIpWeatherLocation() });
    } catch (err) {
      console.error('[WeatherIpLocation]', err);
      sendJSON(res, { ok: false, error: err.message, location: null }, 500);
    }
    return true;
  }

  return false;
}

module.exports = { handle };
