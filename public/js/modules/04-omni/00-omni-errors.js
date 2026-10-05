// ============================================================
// Omni 在线音乐抽象层 · 错误契约
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/types/onlineMusic.ts → 原生 JS 移植
// ============================================================

// 语义化错误码。UI 按 code 给解释，而不是解析 message 文本。
// 'not-public' 与 'unsupported' 分开：前者是"这个后端没这项能力"，
// 后者是"集合存在但当前读取路径没资格读"，界面才能只在后者给「不是公开歌单」的说明。
var OMNI_PROVIDER_ERROR_CODES = [
  'auth-required',      // 需要登录后才能执行
  'unsupported',        // 该 provider 没有这项能力
  'not-public',         // 集合不公开，读取路径无资格
  'unavailable',        // provider 不可用（后端未配置 / 运行时不可达）
  'not-playable',       // 歌曲不可播放（下架 / 无版权）
  'preview-only',       // 仅试听
  'region-restricted',  // 地区限制
  'network',            // 网络失败
  'invalid-response'    // 响应结构不合法
];

function OmniProviderError(code, message, providerId, cause) {
  var err = new Error(message);
  err.name = 'OmniProviderError';
  err.code = code;
  err.providerId = providerId || null;
  err.cause = cause || null;
  return err;
}
