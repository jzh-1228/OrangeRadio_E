/* 覆盖层模式卡片：由视觉模式注册表（90-visualizer-registry）的 icon/desc
   通用生成——此前 19 个 per-mode builder + refresh 里 19 段激活态 if 已收敛。
   卡片类名保留 per-id 特例（graffiti-card 的 fx-panel 特殊样式 / lattice-card-icon
   历史命名）经 entry.cardClass 承载；onclick 统一走 toggleVisualizerOverlay。 */
function buildOverlayPresetCard(entry) {
  var cardClass = 'preset-card ' + (entry.cardClass || (entry.id + '-card'));
  return '<div class="' + cardClass + '" data-overlay-id="' + entry.id + '" onclick="toggleVisualizerOverlay(\'' + entry.id + '\')" title="' + entry.label + '">' +
    '<div class="pc-icon">' + entry.icon + '</div>' +
    '<div class="pc-name">' + entry.label + '</div>' +
    '<div class="pc-desc">' + entry.desc + '</div>' +
    '</div>';
}

function buildPresetGrid() {
  var grid = document.getElementById('preset-grid');
  if (!grid) return;
  var seen = {};
  var order = presetDisplayOrder.filter(function (id) {
    var ok = id >= 0 && id < presetMeta.length && !seen[id];
    seen[id] = true;
    return ok;
  });
  presetMeta.forEach(function (_, id) {
    if (!seen[id]) order.push(id);
  });
  var html = '<div class="preset-section-title">场景预设 <span>3D 粒子场景</span></div>';
  html += order.map(function (i) {
    var p = presetMeta[i];
    var name = p.nameHtml || p.name;
    var desc = p.descHtml || p.desc;
    return '<div class="preset-card" data-preset="' + i + '" onclick="setPreset(' + i + ')">' +
      '<div class="pc-icon">' + presetIcons[i] + '</div>' +
      '<div class="pc-name">' + name + '</div>' +
      '<div class="pc-desc">' + desc + '</div>' +
      '</div>';
  }).join('');
  /* 覆盖层模式卡片：注册表按 order 排序输出（顺序与历史拼装一致） */
  if (typeof listVisualizerOverlayModes === 'function') {
    html += '<div class="preset-section-title">歌词模式 <span>全屏歌词视觉</span></div>';
    html += listVisualizerOverlayModes().map(buildOverlayPresetCard).join('');
  }
  grid.innerHTML = html;
  refreshPresetGrid();
}

function refreshPresetGrid() {
  // 覆盖层模式激活时，常规预设卡片不再显示激活态（经视觉模式注册表）
  var specialActive = !!(typeof activeVisualizerOverlay === 'function' && activeVisualizerOverlay());
  document.querySelectorAll('.preset-card[data-overlay-id]').forEach(function (el) {
    var entry = (typeof getVisualizerOverlayMode === 'function') ? getVisualizerOverlayMode(el.getAttribute('data-overlay-id')) : null;
    el.classList.toggle('active', !!(entry && typeof overlayModeIsActive === 'function' && overlayModeIsActive(entry)));
  });
  document.querySelectorAll('.preset-card[data-preset]').forEach(function (el) {
    el.classList.toggle('active', !specialActive && Number(el.dataset.preset) === fx.preset);
  });
}
function triggerPresetParticleTransition(fromPreset, toPreset) {
  presetTransition.active = true;
  presetTransition.start = uniforms.uTime.value;
  presetTransition.duration = toPreset === 5 ? 0.30 : 0.24;
  presetTransition.from = fromPreset;
  presetTransition.to = toPreset;
  var newVisual = toPreset >= 4;
  var wallpaperFlow = toPreset === 5;
  uniforms.uScatter.value = Math.max(uniforms.uScatter.value, fx.scatter + (newVisual ? (wallpaperFlow ? 0.008 : 0.024) : 0.12));
  uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, wallpaperFlow ? 0.05 : 0.15);
  camPunch = Math.max(camPunch, wallpaperFlow ? 0.04 : 0.12);
  for (var i = 0; i < 3; i++) {
    triggerRipple((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 3.4, 0.58 + Math.random() * 0.32);
  }
  var card = document.querySelector('.preset-card[data-preset="' + toPreset + '"]');
  if (card) {
    card.classList.remove('switching');
    void card.offsetWidth;
    card.classList.add('switching');
    setTimeout(function () { card.classList.remove('switching'); }, 760);
  }
}
function tickPresetTransition() {
  if (!presetTransition.active) return;
  var raw = (uniforms.uTime.value - presetTransition.start) / presetTransition.duration;
  var t = Math.max(0, Math.min(1, raw));
  var wave = Math.sin(t * Math.PI);
  var newVisual = presetTransition.to >= 4;
  var wallpaperFlow = presetTransition.to === 5;
  uniforms.uScatter.value = Math.max(uniforms.uScatter.value, fx.scatter + wave * (newVisual ? (wallpaperFlow ? 0.008 : 0.026) : 0.16));
  uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, wave * (wallpaperFlow ? 0.045 : (newVisual ? 0.12 : 0.15)));
  uniforms.uPointScale.value = fx.point * (1 + wave * (wallpaperFlow ? 0.016 : 0.048));
  if (raw >= 1) {
    presetTransition.active = false;
    syncFxUniforms();
  }
}
function setPreset(p, opts) {
  opts = opts || {};
  p = Math.max(0, Math.min(presetMeta.length - 1, Number(p) || 0));
  var prev = fx.preset;
  var changed = prev !== p;
  // 用户主动选择常规预设时退出全部覆盖层模式（经视觉模式注册表）。
  // 用 !opts.silent 而非 changed：即便预设号没变（如「星河 → 涂鸦墙 → 再点星河」），
  // 只要是用户点击（非 silent 恢复）且特殊模式在激活，就应退出，否则回不到原预设。
  if (!opts.silent && typeof exitAllVisualizerOverlays === 'function') {
    exitAllVisualizerOverlays({ save: true });
  }
  fx.preset = p;
  if (changed && prev === SKULL_PRESET_INDEX && p !== SKULL_PRESET_INDEX) clearSkullPresetResidue();
  if (p === SKULL_PRESET_INDEX) loadSkullParticleAsset();
  if (changed && window.OrangeseaSonicTopography) OrangeseaSonicTopography.onPresetChange(prev, p, { scene: scene, fx: fx });
  uniforms.uPreset.value = p;
  // 演唱会预设: 立即创建荧光棒灯海 (主循环可能被 vsync 跟随节流跳过, 导致灯海不出现)
  if (p === CONCERT_PRESET_INDEX && typeof updateConcertStage === 'function') {
    try { updateConcertStage(0.016); } catch (e) { if (typeof console !== 'undefined') console.warn('[concert] immediate build failed', e); }
  }
  refreshPresetGrid();
  if (typeof updateSonicSeriesControlVisibility === 'function') updateSonicSeriesControlVisibility();
  if (typeof updateRainyControlVisibility === 'function') updateRainyControlVisibility();
  if (typeof updateSonicWorkshopColorControls === 'function') updateSonicWorkshopColorControls();
  if (changed && !opts.skipTransition) triggerPresetParticleTransition(prev, p);
  // 每个预设对应的相机基线 (改 userOrbit)
  if (changed && !opts.preserveCamera) {
    if (p === 5) {
      captureCurrentOrbitAsBaseline();
      requestStageLyricCameraSnap(12);
    } else if (typeof applyPresetOrbitBaseline === 'function') {
      applyPresetOrbitBaseline(p);
    }
  }
  if (changed && !opts.silent) showToast('视觉预设: ' + presetMeta[p].name);
  var shouldCommitPlaybackPreset = !!opts.commitPlaybackPreset || !opts.noSave;
  if (shouldCommitPlaybackPreset) {
    playbackVisualPreset = p;
    startupVisualPreviewActive = false;
  }
  if (!opts.noSave) {
    saveLyricLayout({ user: !opts.silent, reason: 'preset' });
  }
}

function syncFxUniforms() {
  uniforms.uPreset.value = fx.preset;
  uniforms.uIntensity.value = fx.intensity;
  uniforms.uDepth.value = fx.depth;
  uniforms.uPointScale.value = fx.point;
  uniforms.uSpeed.value = fx.speed;
  uniforms.uTwist.value = fx.twist;
  uniforms.uColorBoost.value = fx.color;
  uniforms.uScatter.value = fx.scatter;
  uniforms.uCoverRes.value = normalizeCoverResolution(fx.coverResolution);
  uniforms.uBgFade.value = fx.bgFade;
  uniforms.uBloomStrength.value = fx.bloom ? fx.bloomStrength : 0;
  if (bloomParticles) bloomParticles.visible = fx.bloom && fx.bloomStrength > 0.01;
  uniforms.uEdgeEnabled.value = fx.edge ? 1 : 0;
  if (uniforms.uTintColor) uniforms.uTintColor.value.set(normalizeHexColor(fx.visualTintColor || '#ff9c6e'));
  if (uniforms.uTintStrength) uniforms.uTintStrength.value = fx.visualTintMode === 'custom' ? 0.42 : 0;
  syncSkullParticleColors();
}
