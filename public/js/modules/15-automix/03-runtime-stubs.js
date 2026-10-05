// ============================================================
// 03-model-stub.js — Automix 推理模型存根（2a 阶段）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): beatThis.ts / modelAvailability.ts 的无模型回退路径。
//
// 2a 纯 JS 引擎阶段：拍点模型（Beat This! ONNX）与人声分离（htdemucs）
// 尚未接入，本文件提供回退实现——canRunBeatThis() 恒 false 使
// profileService 走自研 estimateTempo/estimateDownbeat（浏览器构建的
// 正式链路，非降级 hack），TrackProfile.gridless 标记区分"模型没跑"。
// 2b 阶段接入 desktop/analysis 推理进程后替换本文件。
// ============================================================

const canRunBeatThis = () => false;
const modelCanRun = () => false;
async function analyseBeatGrid() { return null; }
async function melSpectrogramOffThread() { return null; }
// trackProfile 运行时引用（模型拍点 → 网格）；无模型时返回 null 走 gridless 路径。
function gridFromBeats() { return null; }
async function analyseTrackOffThread(mid, sampleRate, options) {
  // analysisOffThread 的回退路径：worker 不可用时原地调 analyseTrack
  // （yieldToUi 按 8ms 预算分片让路主线程）。
  return analyseTrack(mid, sampleRate, options);
}
// Folia audioCache 的写后事件（"缓存此刻有字节了"的等待方通知，stems 加载时订阅）；
// 本项目无该缓存体系，no-op——接入媒体缓存体系时替换为真实事件。
const onAudioCached = () => { };
