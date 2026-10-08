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
  grid.innerHTML = order.map(function (i) {
    var p = presetMeta[i];
    var name = p.nameHtml || p.name;
    var desc = p.descHtml || p.desc;
    return '<div class="preset-card" data-preset="' + i + '" onclick="setPreset(' + i + ')">' +
      '<div class="pc-icon">' + presetIcons[i] + '</div>' +
      '<div class="pc-name">' + name + '</div>' +
      '<div class="pc-desc">' + desc + '</div>' +
      '</div>';
  }).join('') + buildFilmRadioPresetCard() + buildGraffitiPresetCard() + buildAuroraPresetCard() + buildRainyPresetCard() + buildStillPresetCard() + buildCladdaghPresetCard() + buildTiltPresetCard() + buildFumePresetCard() + buildClassicPresetCard() + buildPendoloPresetCard() + buildPartitaPresetCard() + buildCadenzaPresetCard() + buildLatticePresetCard();
  refreshPresetGrid();
}

/* 胶片电台：独立于数值预设之外的特殊卡片，点击切换全屏黑胶播放器 */
function buildFilmRadioPresetCard() {
  return '<div class="preset-card film-radio-card" data-film-radio="1" onclick="toggleFilmRadioMode()" title="胶片电台">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="M14.9 4.6a7.2 7.2 0 0 1 4.5 4.5"/></svg></div>' +
    '<div class="pc-name">胶片电台</div>' +
    '<div class="pc-desc">黑胶 · 居中歌词</div>' +
    '</div>';
}

/* 涂鸦墙：独立于数值预设之外的特殊卡片，满屏涂鸦歌词 · 暗夜墨光 */
function buildGraffitiPresetCard() {
  return '<div class="preset-card graffiti-card" data-graffiti="1" onclick="toggleGraffitiMode()" title="涂鸦墙">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c2-6 5-10 9-13"/><path d="M13 7l3 3"/><path d="M16 4l4 4-3 3-4-4z"/><path d="M6 18l2 2"/></svg></div>' +
    '<div class="pc-name">涂鸦墙</div>' +
    '<div class="pc-desc">满屏歌词 · 暗夜墨光</div>' +
    '</div>';
}

/* 流光：独立于数值预设之外的特殊卡片，封面极光氛围 · 逐字点亮歌词 */
function buildAuroraPresetCard() {
  return '<div class="preset-card aurora-card" data-aurora="1" onclick="toggleAuroraMode()" title="流光">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 14c2.5-4.5 5-7 8-8"/><path d="M8 18c3-6 7-10 13-12"/><path d="M13 18c2-3.5 4.5-6 8-7.5"/><circle cx="19" cy="19" r="1.6"/></svg></div>' +
    '<div class="pc-name">流光</div>' +
    '<div class="pc-desc">封面极光 · 逐字点亮</div>' +
    '</div>';
}

/* 雨夜车窗：独立于数值预设之外的特殊卡片，窗外霓虹雨夜 · 雾玻璃歌词 */
function buildRainyPresetCard() {
  return '<div class="preset-card rainy-card" data-rainy="1" onclick="toggleRainyMode()" title="雨夜车窗">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2.5"/><path d="M7 8.5c1.2 1.6 1.2 3.4 0 5"/><path d="M12.5 7.5c1.6 2.2 1.6 4.8 0 7"/><path d="M17.5 8.8c1 1.4 1 3 0 4.4"/><path d="M5 21h14"/></svg></div>' +
    '<div class="pc-name">雨夜车窗</div>' +
    '<div class="pc-desc">窗外霓虹 · 雾玻璃歌词</div>' +
    '</div>';
}

/* 静止：独立于数值预设之外的特殊卡片，静态三行歌词 · 径向暗角（移植自 Folia still 模式） */
function buildStillPresetCard() {
  return '<div class="preset-card still-card" data-still="1" onclick="toggleStillMode()" title="静止">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 7h9" opacity=".4"/><path d="M4 12h16"/><path d="M7.5 17h9" opacity=".4"/></svg></div>' +
    '<div class="pc-name">静止</div>' +
    '<div class="pc-desc">静态三行 · 暗角夜色</div>' +
    '</div>';
}

/* 环歌：独立于数值预设之外的特殊卡片，斜置椭圆环上逐字流转歌词（移植自 Folia claddagh 模式） */
function buildCladdaghPresetCard() {
  return '<div class="preset-card claddagh-card" data-claddagh="1" onclick="toggleCladdaghMode()" title="环歌">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14.2" rx="8.4" ry="3.5"/><path d="M12 9.4c.9-1.5 3.2-1.2 3.2.6 0 1.2-1.4 2.2-3.2 3.4-1.8-1.2-3.2-2.2-3.2-3.4 0-1.8 2.3-2.1 3.2-.6z"/><path d="M9.7 6.9l.7-1.2.9.9.7-1.3.7 1.3.9-.9.7 1.2"/></svg></div>' +
    '<div class="pc-name">环歌</div>' +
    '<div class="pc-desc">椭圆环 · 逐字流转</div>' +
    '</div>';
}

/* 斜排：独立于数值预设之外的特殊卡片，概率拆行 · 双字模交错（移植自 Folia tilt 模式） */
function buildTiltPresetCard() {
  return '<div class="preset-card tilt-card" data-tilt="1" onclick="toggleTiltMode()" title="斜排">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5.5l14-1.6" opacity=".45"/><path d="M4 12l16-1.8"/><path d="M5 18.5l11-1.2" opacity=".45"/><path d="M18.6 16.9l1.8-1" opacity=".45"/></svg></div>' +
    '<div class="pc-name">斜排</div>' +
    '<div class="pc-desc">概率拆行 · 大字交错</div>' +
    '</div>';
}

/* 烟纸：独立于数值预设之外的特殊卡片，歌词排成文章 · 相机逐句飞近（移植自 Folia fume 模式） */
function buildFumePresetCard() {
  return '<div class="preset-card fume-card" data-fume="1" onclick="toggleFumeMode()" title="烟纸">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 4h14" opacity=".45"/><path d="M4 8.5h9" opacity=".8"/><path d="M4 12.5h13" opacity=".55"/><path d="M4 16.5h8" opacity=".8"/><path d="M16.5 14.5l3.2 5.5M19.7 14.5l-3.2 5.5"/></svg></div>' +
    '<div class="pc-name">烟纸</div>' +
    '<div class="pc-desc">排版歌词 · 相机逐句</div>' +
    '</div>';
}

/* 流萤辉光：独立于数值预设之外的特殊卡片，词间飞散 · 逐字辉光（移植自 Folia classic 模式） */
function buildClassicPresetCard() {
  return '<div class="preset-card classic-card" data-classic="1" onclick="toggleClassicMode()" title="流萤辉光">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.7 5L19 9.7l-5.3 1.7L12 16.5l-1.7-5.1L5 9.7l5.3-1.7z"/><path d="M18.8 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg></div>' +
    '<div class="pc-name">流萤辉光</div>' +
    '<div class="pc-desc">词间飞散 · 逐字辉光</div>' +
    '</div>';
}

/* 钟摆：独立于数值预设之外的特殊卡片，擒纵钟表机械 · 弧形歌词环（移植自 Folia pendolo 模式） */
function buildPendoloPresetCard() {
  return '<div class="preset-card pendolo-card" data-pendolo="1" onclick="togglePendoloMode()" title="钟摆">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.6" r="2.1"/><path d="M12 6.7v8.2"/><path d="M12 14.9l-3.4 4.6"/><path d="M12 14.9l3.4 4.6"/><circle cx="12" cy="4.6" r="0.4" fill="currentColor"/></svg></div>' +
    '<div class="pc-name">钟摆</div>' +
    '<div class="pc-desc">钟表机械 · 弧形歌词</div>' +
    '</div>';
}

/* 云阶：独立于数值预设之外的特殊卡片，竖列错落词阶 · 逐字流光（移植自 Folia partita 模式） */
function buildPartitaPresetCard() {
  return '<div class="preset-card partita-card" data-partita="1" onclick="togglePartitaMode()" title="云阶">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="15" width="4.4" height="5" rx="1"/><rect x="9.8" y="10" width="4.4" height="10" rx="1"/><rect x="16.1" y="5" width="4.4" height="15" rx="1"/></svg></div>' +
    '<div class="pc-name">云阶</div>' +
    '<div class="pc-desc">竖列错落 · 逐字流光</div>' +
    '</div>';
}

/* 心象：独立于数值预设之外的特殊卡片，词云散布 · 三态漂移辉光（移植自 Folia cadenza 模式） */
function buildCadenzaPresetCard() {
  return '<div class="preset-card cadenza-card" data-cadenza="1" onclick="toggleCadenzaMode()" title="心象">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.4v2.2"/><path d="M12 18.4v2.2"/><path d="M3.4 12h2.2"/><path d="M18.4 12h2.2"/><path d="M5.9 5.9l1.6 1.6"/><path d="M16.5 16.5l1.6 1.6"/><path d="M18.1 5.9l-1.6 1.6"/><path d="M7.5 16.5l-1.6 1.6"/></svg></div>' +
    '<div class="pc-name">心象</div>' +
    '<div class="pc-desc">词云散布 · 三态辉光</div>' +
    '</div>';
}

/* 队列拼贴：独立于数值预设之外的特殊卡片，播放队列封面海报墙 + 正在播放卡片（移植自 Folia lattice） */
function buildLatticePresetCard() {
  return '<div class="preset-card lattice-card-icon" data-lattice="1" onclick="toggleLatticeMode()" title="队列拼贴">' +
    '<div class="pc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="7" height="7" rx="1.4"/><rect x="13.5" y="4" width="7" height="7" rx="1.4" opacity=".55"/><rect x="3.5" y="13" width="7" height="7" rx="1.4" opacity=".55"/><rect x="13.5" y="13" width="7" height="7" rx="1.4"/></svg></div>' +
    '<div class="pc-name">队列拼贴</div>' +
    '<div class="pc-desc">封面海报墙 · 正在播放</div>' +
    '</div>';
}

function refreshPresetGrid() {
  // 覆盖层模式激活时，常规预设卡片不再显示激活态（经视觉模式注册表）
  var specialActive = !!(typeof activeVisualizerOverlay === 'function' && activeVisualizerOverlay());
  document.querySelectorAll('.preset-card').forEach(function (el) {
    var filmRadio = el.getAttribute('data-film-radio');
    if (filmRadio) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('film-radio') && overlayModeIsActive(getVisualizerOverlayMode('film-radio'))));
      return;
    }
    var graffiti = el.getAttribute('data-graffiti');
    if (graffiti) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('graffiti') && overlayModeIsActive(getVisualizerOverlayMode('graffiti'))));
      return;
    }
    var aurora = el.getAttribute('data-aurora');
    if (aurora) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('aurora') && overlayModeIsActive(getVisualizerOverlayMode('aurora'))));
      return;
    }
    var rainy = el.getAttribute('data-rainy');
    if (rainy) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('rainy') && overlayModeIsActive(getVisualizerOverlayMode('rainy'))));
      return;
    }
    var still = el.getAttribute('data-still');
    if (still) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('still') && overlayModeIsActive(getVisualizerOverlayMode('still'))));
      return;
    }
    var claddagh = el.getAttribute('data-claddagh');
    if (claddagh) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('claddagh') && overlayModeIsActive(getVisualizerOverlayMode('claddagh'))));
      return;
    }
    var tiltAttr = el.getAttribute('data-tilt');
    if (tiltAttr) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('tilt') && overlayModeIsActive(getVisualizerOverlayMode('tilt'))));
      return;
    }
    var fumeAttr = el.getAttribute('data-fume');
    if (fumeAttr) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('fume') && overlayModeIsActive(getVisualizerOverlayMode('fume'))));
      return;
    }
    var classicAttr = el.getAttribute('data-classic');
    if (classicAttr) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('classic') && overlayModeIsActive(getVisualizerOverlayMode('classic'))));
      return;
    }
    var pendoloAttr = el.getAttribute('data-pendolo');
    if (pendoloAttr) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('pendolo') && overlayModeIsActive(getVisualizerOverlayMode('pendolo'))));
      return;
    }
    var partitaAttr = el.getAttribute('data-partita');
    if (partitaAttr) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('partita') && overlayModeIsActive(getVisualizerOverlayMode('partita'))));
      return;
    }
    var cadenzaAttr = el.getAttribute('data-cadenza');
    if (cadenzaAttr) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('cadenza') && overlayModeIsActive(getVisualizerOverlayMode('cadenza'))));
      return;
    }
    var latticeAttr = el.getAttribute('data-lattice');
    if (latticeAttr) {
      el.classList.toggle('active', !!(typeof overlayModeIsActive === 'function' && getVisualizerOverlayMode('lattice') && overlayModeIsActive(getVisualizerOverlayMode('lattice'))));
      return;
    }
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
