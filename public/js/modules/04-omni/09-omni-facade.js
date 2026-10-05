// ============================================================
// Omni 在线音乐抽象层 · 门面（唯一公开入口）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/onlineMusic/omni.ts → 原生 JS 移植
//
// 分层纪律：UI / 模块不得直接调具体 provider，一律经本门面。
// 方法分两族：
//   active-provider 族（搜索会话视角）——带 request generation 防护，
//     切换平台 / 发起新搜索事务后，晚到的旧响应变成 AbortError 被丢弃；
//   song-aware 族（歌曲粒度）——按歌曲 sourceRef 路由到所属 provider，
//     与当前搜索平台无关。
// ============================================================

var omniActiveProviderId = 'netease';
var omniActiveRequestGeneration = 0;

function omniActiveProvider() {
  return requireOmniProvider(omniActiveProviderId);
}

function omniSetActiveProvider(providerId) {
  var normalized = omniResolveProviderId({ provider: providerId });
  if (normalized === 'local') normalized = 'netease';
  if (normalized === omniActiveProviderId) return omniActiveProviderId;
  omniActiveProviderId = normalized;
  return omniActiveProviderId;
}

function omniProviderForSong(song) {
  var sourceRef = getPlaybackSourceRef(song);
  if (sourceRef.kind !== 'online') return null;
  return getOmniProvider(sourceRef.providerId);
}

function omniRequireProviderForSong(song) {
  var sourceRef = getPlaybackSourceRef(song);
  if (sourceRef.kind !== 'online') {
    throw OmniProviderError('unsupported', 'Song is not owned by an online provider: ' + sourceRef.kind);
  }
  return requireOmniProvider(sourceRef.providerId);
}

// 拒绝切换事务开始后才返回的旧响应。不取消底层网络请求——只在响应
// 抵达时比对 generation，把过期结果变成 AbortError。
// 调用方不得自造第二套取消 / 晚到防护。
async function omniWithActiveProvider(run) {
  var providerId = omniActiveProviderId;
  var generation = omniActiveRequestGeneration;
  var result = await run(requireOmniProvider(providerId));
  if (generation !== omniActiveRequestGeneration || providerId !== omniActiveProviderId) {
    throw new DOMException('Active online provider changed', 'AbortError');
  }
  return result;
}

var omni = {
  invalidateActiveRequests: function () {
    omniActiveRequestGeneration += 1;
  },
  getActiveRequestGeneration: function () {
    return omniActiveRequestGeneration;
  },
  getActiveProviderId: function () {
    return omniActiveProviderId;
  },
  setActiveProvider: function (providerId) {
    var next = omniSetActiveProvider(providerId);
    this.invalidateActiveRequests();
    return next;
  },

  subscribeProviders: function (listener) {
    return subscribeOmniProviderRegistry(listener);
  },
  getProviderRegistryVersion: function () {
    return getOmniRegistryVersion();
  },
  getProviderSummaries: function () {
    return listOmniProviders().map(function (provider) {
      var status = typeof searchProviderStatus === 'function' ? searchProviderStatus(provider.id) : null;
      return {
        providerId: provider.id,
        displayName: provider.displayName,
        capabilities: provider.capabilities,
        loggedIn: Boolean(status && status.loggedIn)
      };
    });
  },
  getProviderLabel: function (providerId) {
    var provider = getOmniProvider(providerId);
    return provider ? provider.displayName : providerId;
  },
  providerSupports: function (providerId, capability) {
    return omniProviderSupports(getOmniProvider(providerId), capability);
  },

  // ---------- URL 构建（同步纯函数族，迁移自散布的平台 if/else） ----------

  searchUrlFor: function (providerId, query, limit, offset) {
    var provider = requireOmniProvider(omniResolveProviderId({ provider: providerId }));
    if (!omniProviderSupports(provider, 'search') || !provider.search) return null;
    return provider.search.urlFor(query, limit, offset);
  },

  // song-aware：按歌曲来源路由。qualityParam 形如 '&quality=xxx'（沿用既有拼参约定）。
  // matchOpts 透传给网易侧跨源匹配（excludeIds / skipDirect）。
  playbackUrlForSong: function (song, opts) {
    opts = opts || {};
    var provider = omniProviderForSong(song);
    if (!provider || !provider.playback) return null;
    var built = provider.playback.urlFor(song, opts.qualityParam || '', opts.matchOpts || null);
    if (!built) return null;
    return { url: built.url, timeoutMs: built.timeoutMs || 12000, providerId: provider.id };
  },

  lyricUrlForSong: function (song) {
    song = song || {};
    var sourceRef = getPlaybackSourceRef(song);
    // 播客（网易 DJ 节目）歌词沿用网易通道；本地歌走本地库路由。
    var providerId = (sourceRef.kind === 'online' || sourceRef.kind === 'podcast')
      ? omniResolveProviderId(song)
      : 'local';
    if (sourceRef.kind === 'podcast') providerId = 'netease';
    var provider = getOmniProvider(providerId);
    if (!provider || !provider.lyrics) return null;
    return provider.lyrics.urlFor(song);
  },

  // ---------- 数据方法（active-provider 族，带 generation 防护） ----------

  searchProviderSongs: function (providerId, query, opts) {
    opts = opts || {};
    var limit = Number(opts.limit) || 30;
    var offset = Math.max(0, Number(opts.offset) || 0);
    var url = this.searchUrlFor(providerId, query, limit, offset);
    if (!url) return Promise.resolve({ items: [], hasMore: false, nextOffset: offset });
    var timeoutMs = providerId === 'netease' ? 14000 : 9000;
    return omniWithActiveProvider(function () {
      return apiJson(url, { timeoutMs: timeoutMs });
    });
  },

  // ---------- 能力查询（song-aware） ----------

  canPlaySong: function (song) {
    var provider = omniProviderForSong(song);
    return Boolean(provider && omniProviderSupports(provider, 'playback') && provider.playback);
  },
  getSongPlaybackProviderId: function (song) {
    var sourceRef = getPlaybackSourceRef(song);
    return sourceRef.kind === 'online' ? sourceRef.providerId : sourceRef.kind;
  }
};
