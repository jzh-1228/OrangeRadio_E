// ============================================================
// Omni 在线音乐抽象层 · Provider 注册表
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/onlineMusic/providerRegistry.ts → 原生 JS 移植
//
// UI 不直接调具体 provider，一律经 omni 门面（09-omni-facade.js）。
// 注册表版本号 + 订阅通知：provider 集合运行时变化时 UI 能感知，
// 而不是持有一份过期列表。
// ============================================================

var omniProviders = new Map();
var omniRegistryVersion = 0;
var omniRegistryListeners = new Set();

function omniAnnounceRegistryChange() {
  omniRegistryVersion += 1;
  omniRegistryListeners.forEach(function (listener) {
    try { listener(); } catch (e) { /* 订阅方异常不阻断其它订阅方 */ }
  });
}

function registerOmniProvider(provider) {
  if (!provider || !provider.id) return;
  omniProviders.set(provider.id, provider);
  omniAnnounceRegistryChange();
}

function unregisterOmniProvider(providerId) {
  if (omniProviders.delete(providerId)) omniAnnounceRegistryChange();
}

function getOmniRegistryVersion() {
  return omniRegistryVersion;
}

// 返回取消订阅函数。
function subscribeOmniProviderRegistry(listener) {
  if (typeof listener !== 'function') return function () {};
  omniRegistryListeners.add(listener);
  return function () { omniRegistryListeners.delete(listener); };
}

function getOmniProvider(providerId) {
  return omniProviders.get(providerId) || null;
}

function listOmniProviders() {
  return Array.from(omniProviders.values());
}

function requireOmniProvider(providerId) {
  var provider = getOmniProvider(providerId);
  if (!provider) {
    throw OmniProviderError('unavailable', 'Online music provider is not registered: ' + providerId, providerId);
  }
  return provider;
}

function omniProviderSupports(provider, capability) {
  return Boolean(provider && provider.capabilities && provider.capabilities[capability]);
}

function getOmniProviderForSong(song) {
  var sourceRef = getPlaybackSourceRef(song);
  return sourceRef.kind === 'online' ? getOmniProvider(sourceRef.providerId) : null;
}

function requireOmniProviderForSong(song) {
  var sourceRef = getPlaybackSourceRef(song);
  if (sourceRef.kind !== 'online') {
    throw OmniProviderError('unsupported', 'Song is not from an online provider: ' + sourceRef.kind);
  }
  return requireOmniProvider(sourceRef.providerId);
}
