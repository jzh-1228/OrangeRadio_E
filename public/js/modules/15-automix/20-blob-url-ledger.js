// ============================================================
// 20-blob-url-ledger.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/playbackBlobUrls.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
let heldBlobUrls = [];
const isSoundingOnADeck = (url) => {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll("audio")).some((element) => element.getAttribute("src") === url || element.currentSrc === url);
};
const retireBlobUrl = (nextBlobUrl) => {
  heldBlobUrls = heldBlobUrls.filter((url) => {
    if (url === nextBlobUrl || isSoundingOnADeck(url)) return true;
    URL.revokeObjectURL(url);
    return false;
  });
  if (nextBlobUrl && !heldBlobUrls.includes(nextBlobUrl)) {
    heldBlobUrls.push(nextBlobUrl);
  }
};
