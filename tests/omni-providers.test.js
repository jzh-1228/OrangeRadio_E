'use strict';
/* Omni 音源抽象层：歌曲身份键 / 注册表路由 / provider URL 构建 / request generation。
   被测模块是无模块的全局脚本，按 index-loader 顺序在 vm 沙箱拼接加载。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.join(__dirname, '..', 'public', 'js', 'modules', '04-omni');
const loadOrder = [
  '00-omni-errors.js',
  '01-song-key.js',
  '02-provider-registry.js',
  '03-provider-netease.js',
  '04-provider-qq.js',
  '05-provider-kugou.js',
  '06-provider-qishui.js',
  '07-provider-spotify.js',
  '08-provider-local.js',
  '09-omni-facade.js',
  '10-resource-cache-keys.js',
];

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  setTimeout, clearTimeout, Promise, Map, Set, Math, JSON, String, Number, Boolean, Array, Object, Error, DOMException,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of loadOrder) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), sandbox, { filename: file });
}
const g = sandbox;

/* ---------- 歌曲身份键 ---------- */
{
  const cases = [
    [{ provider: 'qq', mid: '0039MnYB' }, 'online:qq:0039MnYB'],
    [{ type: 'qq', songmid: 'abc', id: 1 }, 'online:qq:abc'],
    [{ hash: 'FFABC123' }, 'online:kugou:FFABC123'],
    [{ source: 'kugou', fileHash: 'h2', id: 9 }, 'online:kugou:h2'],
    [{ type: 'qishui', id: 'qs1' }, 'online:qishui:qs1'],
    [{ spotifyId: 'sp1', id: 5 }, 'online:spotify:sp1'],
    [{ spotifyUri: 'spotify:track:xyz' }, 'online:spotify:spotify:track:xyz'],
    [{ localKey: 'L1' }, 'local:L1'],
    [{ type: 'local', localPath: 'D:/a.mp3' }, 'local:D:/a.mp3'],
    [{ type: 'podcast', programId: 77, id: 5 }, 'podcast:77'],
    [{ id: 12345 }, 'online:netease:12345'],
    [{}, 'online:netease:'],
  ];
  for (const [song, expected] of cases) {
    assert.equal(g.getPlaybackSongKey(song), expected, JSON.stringify(song));
  }
  // 判定优先级与 songProviderKey 语义一致：local 特征最前，netease 兜底。
  assert.equal(g.omniResolveProviderId({ localPath: 'x', provider: 'qq' }), 'local');
  assert.equal(g.omniResolveProviderId({}), 'netease');
  assert.equal(g.getPlaybackSongSource({ spotifyId: 'a' }), 'spotify');
  assert.ok(g.isSamePlaybackSong({ provider: 'qq', mid: 'm' }, { type: 'qq', songmid: 'm' }));
  assert.ok(!g.isSamePlaybackSong({ provider: 'qq', mid: 'm' }, { id: 'm' }));
  // sourceRef 显式携带时零推导，且 normalizePlaybackSongSource 幂等补写。
  const withRef = { id: 1, sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'zz' } };
  assert.equal(g.getPlaybackSongKey(withRef), 'online:qq:zz');
  const bare = { provider: 'qq', mid: 'mm' };
  g.normalizePlaybackSongSource(bare);
  assert.equal(bare.sourceRef.mediaId, 'mm');
  assert.ok(g.hasMixedPlaybackSources([{ id: 1 }, { provider: 'qq', mid: 'm' }]));
  assert.ok(!g.hasMixedPlaybackSources([{ id: 1 }, { id: 2 }]));
}

/* ---------- 注册表 ---------- */
{
  assert.equal(g.listOmniProviders().length, 6);
  assert.deepEqual(g.listOmniProviders().map(p => p.id).sort(),
    ['kugou', 'local', 'netease', 'qishui', 'qq', 'spotify']);
  assert.ok(g.getOmniProvider('qq').capabilities.playback);
  assert.ok(!g.getOmniProvider('local').capabilities.playback);
  assert.equal(g.getOmniProviderForSong({ provider: 'kugou', hash: 'h' }).id, 'kugou');
  assert.equal(g.getOmniProviderForSong({ localKey: 'L' }), null);
  // 订阅与版本
  let notified = 0;
  const unsub = g.subscribeOmniProviderRegistry(() => { notified++; });
  const v0 = g.getOmniRegistryVersion();
  g.registerOmniProvider({ id: 'test-extra', displayName: 'T', capabilities: {} });
  assert.equal(g.getOmniRegistryVersion(), v0 + 1);
  assert.equal(notified, 1);
  g.unregisterOmniProvider('test-extra');
  assert.equal(notified, 2);
  unsub();
  g.registerOmniProvider({ id: 'test-extra2', displayName: 'T2', capabilities: {} });
  assert.equal(notified, 2);
  g.unregisterOmniProvider('test-extra2');
  // 未注册 provider 抛 unavailable
  assert.throws(() => g.requireOmniProvider('nope'), err => err.code === 'unavailable');
}

/* ---------- 资源缓存键 ---------- */
{
  const qqSong = { provider: 'qq', mid: 'M1' };
  assert.equal(g.getSongResourceCacheKey('lyric', qqSong), 'lyric_online:qq:M1');
  assert.equal(g.getSongResourceCacheKey('cover', qqSong), 'cover_online:qq:M1');
  assert.equal(g.getSongResourceCacheKey('cover', { hash: 'H1' }), 'cover_v2_online:kugou:H1');
  assert.equal(g.getSongResourceCacheKey('profile', { id: 7 }), 'profile_online:netease:7');
}

/* ---------- provider URL 构建（对照迁移前实现期望值） ---------- */
{
  // QQ 播放：mid + mediaMid + 证据参数 + 音质
  const qqSong = { provider: 'qq', mid: 'MID1', mediaMid: 'MM1', vipRequired: true, fee: 8 };
  const qqBuilt = g.omniQqProvider.playback.urlFor(qqSong, '&quality=hires');
  assert.ok(qqBuilt.url.startsWith('/api/qq/song/url?mid=MID1&mediaMid=MM1&'), qqBuilt.url);
  assert.ok(qqBuilt.url.includes('vipRequired=1'));
  assert.ok(qqBuilt.url.includes('fee=8'));
  assert.ok(qqBuilt.url.endsWith('&quality=hires'));
  assert.equal(qqBuilt.timeoutMs, 15000);

  // 网易播放：跨源匹配参数
  const neSong = { name: '海', artist: 'A', artists: [{ id: 11, name: 'A' }], album: { name: 'X' }, dt: 210000 };
  const neBuilt = g.omniNeteaseProvider.playback.urlFor(neSong, '&quality=lossless');
  assert.ok(neBuilt.url.includes('/api/song/url?id='));
  assert.ok(neBuilt.url.includes('name=' + encodeURIComponent('海')));
  assert.ok(neBuilt.url.includes('artistIds=11'));
  assert.ok(neBuilt.url.includes('skipDirect='));
  assert.equal(neBuilt.timeoutMs, 14000);
  // excludeIds 透传
  const neRetry = g.omniNeteaseProvider.playback.urlFor(neSong, '', { excludeIds: [1, 2], skipDirect: true });
  assert.ok(neRetry.url.includes('excludeIds=1%2C2'));
  assert.ok(neRetry.url.includes('skipDirect=1'));

  // 酷狗播放：完整 hash 参数链
  const kgSong = { hash: 'HASH1', album_audio_id: 'AA1', hq_hash: 'HQ1', sq_hash: 'SQ1' };
  const kgBuilt = g.omniKugouProvider.playback.urlFor(kgSong, '&quality=exhigh');
  assert.ok(kgBuilt.url.startsWith('/api/kugou/song/url?hash=HASH1'));
  assert.ok(kgBuilt.url.includes('albumAudioId=AA1'));
  assert.ok(kgBuilt.url.includes('hqHash=HQ1'));
  assert.ok(kgBuilt.url.includes('sqHash=SQ1'));
  assert.equal(kgBuilt.timeoutMs, 9000);

  // 汽水播放复用 QQ 证据查询
  const qsBuilt = g.omniQishuiProvider.playback.urlFor({ type: 'qishui', id: 'Q1', fee: 1 }, '');
  assert.ok(qsBuilt.url.startsWith('/api/qishui/song/url?id=Q1&'));
  assert.ok(qsBuilt.url.includes('fee=1'));

  // Spotify 播放
  const spBuilt = g.omniSpotifyProvider.playback.urlFor({ spotifyId: 'SP1', uri: 'spotify:track:SP1' }, '');
  assert.ok(spBuilt.url.includes('id=SP1') && spBuilt.url.includes('spotifyId=SP1'));

  // 歌词端点
  assert.equal(g.omniQqProvider.lyrics.urlFor({ mid: 'M1', id: 123 }), '/api/qq/lyric?mid=M1&id=123');
  assert.equal(g.omniQqProvider.lyrics.urlFor({ mid: 'M1', id: 'abc' }), '/api/qq/lyric?mid=M1&id=');
  assert.equal(g.omniNeteaseProvider.lyrics.urlFor({ id: 9 }), '/api/lyric?id=9');
  assert.equal(g.omniLocalProvider.lyrics.urlFor({ localPath: 'D:/x.mp3' }), '/api/local/lyric?path=' + encodeURIComponent('D:/x.mp3'));

  // 搜索端点
  assert.equal(g.omni.searchUrlFor('kugou', '词', 30, 10), '/api/kugou/search?keywords=' + encodeURIComponent('词') + '&limit=30&offset=10');
  assert.equal(g.omni.searchUrlFor('local', 'q', 20, 0), '/api/local/search?keywords=q&limit=20&offset=0');
}

/* ---------- 门面：路由与超时 ---------- */
{
  const built = g.omni.playbackUrlForSong({ provider: 'qq', mid: 'M1' }, { qualityParam: '&quality=hires' });
  assert.equal(built.providerId, 'qq');
  assert.equal(built.timeoutMs, 15000);
  assert.ok(built.url.includes('/api/qq/song/url'));
  // 本地歌无播放 URL
  assert.equal(g.omni.playbackUrlForSong({ localKey: 'L' }, {}), null);
  // 歌词路由：各平台 + podcast 回落网易
  assert.ok(g.omni.lyricUrlForSong({ type: 'kugou', hash: 'H' }).includes('/api/kugou/lyric'));
  assert.ok(g.omni.lyricUrlForSong({ type: 'podcast', programId: 5 }).includes('/api/lyric'));
  assert.ok(g.omni.lyricUrlForSong({ localPath: 'x' }).includes('/api/local/lyric'));
  assert.ok(g.omni.lyricUrlForSong({ id: 3 }).includes('/api/lyric'));
  assert.ok(g.omni.lyricUrlForSong({ spotifyId: 's' }).includes('/api/spotify/lyric'));
  // 能力查询
  assert.ok(g.omni.canPlaySong({ provider: 'qq', mid: 'm' }));
  assert.ok(!g.omni.canPlaySong({ localKey: 'L' }));
  assert.equal(g.omni.getSongPlaybackProviderId({ hash: 'h' }), 'kugou');
}

/* ---------- request generation：晚到响应拒 AbortError ---------- */
{
  (async () => {
    g.omni.setActiveProvider('qq');
    const gen0 = g.omni.getActiveRequestGeneration();
    let lateReject = null;
    // 注入可控的 apiJson：响应挂起 → 中途切换平台（generation+1）→ 响应返回 → 应抛 AbortError
    let resolveApi = null;
    g.apiJson = () => new Promise((res) => { resolveApi = res; });
    const pending = g.omni.searchProviderSongs('qq', 'x', { limit: 5 }).then(
      () => { throw new Error('should have been aborted'); },
      (err) => { lateReject = err; }
    );
    await Promise.resolve();
    g.omni.setActiveProvider('netease');
    resolveApi({ songs: [1], code: 0 });
    await pending;
    assert.ok(lateReject instanceof Error, 'rejects');
    assert.equal(lateReject && lateReject.name, 'AbortError');
    assert.ok(g.omni.getActiveRequestGeneration() > gen0);
    assert.equal(g.omni.getActiveProviderId(), 'netease');
    // 正常路径：事务内返回的响应放行
    g.apiJson = async () => ({ songs: [1], code: 0 });
    const ok = await g.omni.searchProviderSongs('qq', 'x', { limit: 5 }).catch(() => 'aborted');
    assert.deepEqual(ok, { songs: [1], code: 0 });
    console.log('OK omni-providers');
  })().catch((err) => { console.error(err); process.exit(1); });
}
