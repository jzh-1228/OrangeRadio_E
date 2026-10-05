// ============================================================
// 13-canvas-pool.js — 处理类 canvas 池
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0) 资源生命周期纪律（canvas backing store 复用）。
//
// 封面裁切/测宽这类高频短命 canvas（每次切歌 3~4 个）此前靠 GC 兜底——
// backing store 的分配与回收是渲染进程内存抖动的主源之一。按尺寸分桶池化：
// acquire 复用或新建，release 归还并清空；每桶上限 2、总上限 8 防膨胀。
// ============================================================

var processingCanvasPool = (function () {
  var buckets = {};   // size -> [canvas]
  var total = 0;
  var MAX_PER_BUCKET = 2;
  var MAX_TOTAL = 8;
  return {
    acquire: function (size) {
      size = Math.max(1, Number(size) || 1);
      var bucket = buckets[size];
      if (bucket && bucket.length) {
        var cv = bucket.pop();
        // total 语义是"当前在池数"：出池必须回减，否则累计入池数单调递增，
        // 撞到 MAX_TOTAL 后池永久失效（release 恒拒、acquire 再无复用）。
        total -= 1;
        cv.width = cv.height = size; // 重设尺寸同时清空内容
        return cv;
      }
      var fresh = document.createElement('canvas');
      fresh.width = fresh.height = size;
      return fresh;
    },
    release: function (cv) {
      if (!cv || !cv.width) return;
      var size = cv.width;
      var bucket = buckets[size] || (buckets[size] = []);
      if (bucket.length >= MAX_PER_BUCKET || total >= MAX_TOTAL) return; // 超限交给 GC
      var cx = cv.getContext('2d');
      if (cx) cx.clearRect(0, 0, size, size);
      bucket.push(cv);
      total += 1;
    },
    clear: function () {
      buckets = {};
      total = 0;
    },
    stats: function () { return { total: total, buckets: Object.keys(buckets).length }; }
  };
})();

function acquireProcessingCanvas(size) { return processingCanvasPool.acquire(size); }
function releaseProcessingCanvas(cv) { return processingCanvasPool.release(cv); }

// 本地歌曲 blob URL 台账：创建时登记，sweepLocalBlobUrls 定期清扫（不在队列且不出声即释放）。
var localBlobUrlRegistry = [];
function registerLocalBlobUrl(url) {
  if (typeof url === 'string' && url.indexOf('blob:') === 0 && localBlobUrlRegistry.indexOf(url) < 0) {
    localBlobUrlRegistry.push(url);
  }
  return url;
}
