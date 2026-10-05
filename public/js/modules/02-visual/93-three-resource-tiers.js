// ============================================================
// 93-three-resource-tiers.js — THREE 资源分级释放
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): pixiDisplayResources 的 unload/destroy
// 两档释放思想移植到 THREE 对象树。
//
// 两档语义：
//   unload（detach）——从场景摘下，CPU/GPU 数据保留，回切零重建成本；
//     常规预设切换走这档（现状 visible=false 的强化版：不再参与遍历）。
//   dispose（destroy）——geometry/material/texture 真释放，回切需重建；
//     内存压力（RSS 水位）与深后台时才走这档。
// ============================================================

function detachThreeSubtree(root) {
  if (!root) return;
  if (root.parent) root.parent.remove(root);
}

function disposeThreeSubtree(root) {
  if (!root) return;
  var geometries = [];
  var materials = [];
  var textures = [];
  root.traverse(function (node) {
    if (node.geometry) geometries.push(node.geometry);
    var mat = node.material;
    if (!mat) return;
    (Array.isArray(mat) ? mat : [mat]).forEach(function (m) {
      if (materials.indexOf(m) >= 0) return;
      materials.push(m);
      // 材质自有贴图（map/normalMap 等）随材质释放；共享贴图由 owner 释放。
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'].forEach(function (slot) {
        if (m[slot] && textures.indexOf(m[slot]) < 0) textures.push(m[slot]);
      });
    });
  });
  geometries.forEach(function (g) { try { g.dispose(); } catch (e) { } });
  materials.forEach(function (m) {
    Object.keys(m).forEach(function (key) {
      var v = m[key];
      if (v && v.isTexture && textures.indexOf(v) < 0) textures.push(v);
    });
    try { m.dispose(); } catch (e) { }
  });
  textures.forEach(function (t) { try { t.dispose(); } catch (e) { } });
  if (root.parent) root.parent.remove(root);
}

// 内存压力钩子：各预设模块注册自己的重资源释放回调
// （骷髅点云/演唱会灯海/星河粒子在压力时 dispose，常规切换仍走 detach）。
var threeMemoryPressureHandlers = [];

function registerThreeMemoryPressureHandler(fn) {
  if (typeof fn === 'function') threeMemoryPressureHandlers.push(fn);
}

function runThreeMemoryPressureHandlers(reason) {
  var fired = 0;
  threeMemoryPressureHandlers.forEach(function (fn) {
    try { fn(reason); fired++; } catch (e) { }
  });
  if (fired) console.log('[ThreeTiers] memory pressure handlers fired: ' + fired + ' (' + (reason || '') + ')');
  return fired;
}
