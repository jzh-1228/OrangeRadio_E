// ============================================================
// 03-runtime-stubs.js — Automix 运行时环境适配
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): analysisOffThread.ts 回退路径 + audioCache 事件适配。
//
// 拍点模型与在盘状态的真实现见 22-beat-this.js（模型缺失时 canRunBeatThis
// 返回 false，profileService 走自研估计器——浏览器构建的正式链路）。
// ============================================================

async function analyseTrackOffThread(mid, sampleRate, options) {
  // analysisOffThread 的回退路径：worker 不可用时原地调 analyseTrack
  // （yieldToUi 按 8ms 预算分片让路主线程）。
  return analyseTrack(mid, sampleRate, options);
}
// Folia audioCache 的写后事件（"缓存此刻有字节了"的等待方通知，stems 加载时订阅）；
// 本项目无该缓存体系，no-op——接入媒体缓存体系时替换为真实事件。
const onAudioCached = () => { };
