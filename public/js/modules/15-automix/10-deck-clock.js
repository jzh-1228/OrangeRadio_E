// ============================================================
// 10-deck-clock.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/deckClock.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const fitClock = (samples) => {
  const count = samples.length;
  if (count < 4) return null;
  let meanX = 0;
  let meanY = 0;
  for (const sample of samples) {
    meanX += sample.context;
    meanY += sample.media;
  }
  meanX /= count;
  meanY /= count;
  let top = 0;
  let bottom = 0;
  for (const sample of samples) {
    const dx = sample.context - meanX;
    top += dx * (sample.media - meanY);
    bottom += dx * dx;
  }
  if (!(bottom > 0)) return null;
  const rate = top / bottom;
  const offset = meanY - rate * meanX;
  let squared = 0;
  for (const sample of samples) {
    squared += (sample.media - (offset + rate * sample.context)) ** 2;
  }
  return { offset, rate, error: Math.sqrt(squared / count), samples: count };
};
const WINDOW_SEC = 1.5;
const BREAK_SEC = 0.12;
const MAX_TRUSTED_ERROR_SEC = 0.05;
const createDeckClock = () => {
  let samples = [];
  let cached = null;
  const refit = () => {
    cached = fitClock(samples);
    return cached;
  };
  const trusted = () => {
    const fit = cached ?? refit();
    return fit && fit.error <= MAX_TRUSTED_ERROR_SEC && fit.rate > 0.1 ? fit : null;
  };
  return {
    sample: (media, context) => {
      if (!Number.isFinite(media) || !Number.isFinite(context)) return;
      const fit = cached;
      if (fit && Math.abs(media - (fit.offset + fit.rate * context)) > BREAK_SEC) {
        samples = [];
        cached = null;
      }
      samples.push({ media, context });
      while (samples.length && context - samples[0].context > WINDOW_SEC) samples.shift();
      refit();
    },
    positionAt: (contextTime) => {
      const fit = trusted();
      return fit ? fit.offset + fit.rate * contextTime : null;
    },
    reaches: (mediaPosition, notBefore) => {
      const fit = trusted();
      if (!fit) return null;
      const when = (mediaPosition - fit.offset) / fit.rate;
      return when >= notBefore ? when : null;
    },
    rate: () => trusted()?.rate ?? null,
    fit: () => cached,
    reset: () => {
      samples = [];
      cached = null;
    }
  };
};
