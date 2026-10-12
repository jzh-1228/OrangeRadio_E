// OrangeSea DIORAMA ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (THREE, env) {
"use strict";
// ======== types ========
const DEFAULT_CLASSIC_TUNING = {
    enableWordRotation: true,
    breathingFloatMultiplier: 1,
    useLegacyLayout: false,
    wordSpacing: 0.7,
};
const DEFAULT_CADENZA_TUNING = {
    fontScale: 1.12,
    widthRatio: 0.72,
    motionAmount: 1,
    glowIntensity: 1,
    beamIntensity: 0,
};
const DEFAULT_PARTITA_TUNING = {
    showGuideLines: true,
    useSemanticLayout: true,
    staggerMin: 20,
    staggerMax: 100,
};
const DEFAULT_FUME_TUNING = {
    hidePrintSymbols: false,
    disableGeometricBackground: true,
    backgroundObjectOpacity: 0.5,
    textHoldRatio: 1,
    cameraTrackingMode: 'smooth',
    cameraSpeed: 1,
    glowIntensity: 1,
    heroScale: 1,
};
const DEFAULT_CLADDAGH_TUNING = {
    focusScaleRatio: 0.65,
    radiusScale: 1.0,
    ellipseTiltDeg: 45,
    showAxisLine: true,
    letterSpacingOffset: 0,
};
const DEFAULT_CAPPELLA_TUNING = {
    showEmoMessages: true,
    emojiPackSource: 'builtin',
    avatarSource: 'cover',
};
const DEFAULT_TILT_TUNING = {
    splitProbability: 0.75,
    tiltStyleProbability: 0.35,
    colorScheme: 'default',
};
const DEFAULT_PENDOLO_TUNING = {
    arcRadius: 0.42,
    arcAngleDeg: 100,
    wheelCenterX: 0.0,
    wheelCenterY: 0.50,
    tickSnappiness: 2.0,
    activeScale: 1.25,
    showGearDecor: 'subtle',
    showCenterGradient: true,
    showCoverOnWatchFace: false,
    enableLineGlow: false,
};
const DEFAULT_SONNET_TUNING = {
    cameraIntensity: 1,
    typographyMotion: 1,
    mgDensity: 1,
    showOnlyText: false,
    showGuide: true,
    showBackgroundMg: true,
    showFixedGeo: true,
    showGiantDecorativeText: true,
    showBackgroundDecor: true,
    enableTransitions: true,
    outerFrameMode: 'full',
    textureResolution: 1.5,
    postProcessEnabled: false,
    postProcessGrain: 0.2,
    postProcessContrast: 0,
    postProcessRgbShift: 0,
    postProcessHalftone: 0,
    postProcessVignette: 0.85,
    postProcessLensDistortion: 0.3,
    postProcessLensDispersion: 0.6,
};
const TEMPERA_MAX_LAYER_IMAGES = 16;
const DEFAULT_TEMPERA_LAYER_IMAGE = {
    align: 'free',
    // Preserve the original character-art composition, which placed images low in the frame.
    verticalAlign: 'bottom',
    scale: 0.7,
    opacity: 1,
};
const DEFAULT_TEMPERA_TUNING = {
    cameraIntensity: 1,
    glyphMotion: 1,
    wholeLineLyrics: false,
    glyphSettleStretch: 0.5,
    colorMode: 'duo',
    showBlocks: true,
    showDecor: true,
    showCornerMarks: true,
    textInversion: true,
    layerImages: [],
    layerImageDepth: 'back',
    layerImageFrequency: 0.6,
    enableTransitions: true,
    textureResolution: 1.5,
    postProcessEnabled: true,
    postProcessTextureCompression: false,
    postProcessGrain: 0.2,
    postProcessContrast: 0,
    postProcessRgbShift: 0,
    postProcessVignette: 0.85,
    postProcessLensDistortion: 0.3,
};
const DEFAULT_LUMIERE_TUNING = {
    lightIntensity: 1,
    audioResponse: 1,
    fogDensity: 1,
    darkField: 0.75,
    moteAmount: 1,
    bloom: 1,
    textBloom: 1,
    unlitOpacity: 0.22,
    windowNeighbors: 2,
    decay: 1,
    echo: 1,
    fogOctaves: 5,
    lineArt: true,
    frontBokeh: true,
    trails: true,
    hideTrails: false,
    seamlessTransitions: true,
    overlayFrame: true,
    textOnly: false,
    keywordColors: true,
    themeIcons: true,
    themeColorMix: 0.3,
    renderQuality: 'full',
};
const DEFAULT_DIORAMA_GEOMETRY_VISIBILITY = {
    enabled: true,
    mode: 'clouds',
    strands: true,
    blobs: true,
    ribbons: true,
    rings: true,
};
const DIORAMA_PARTICLE_DENSITY_MIN = 96;
const DIORAMA_PARTICLE_DENSITY_MAX = 1536;
const DIORAMA_PARTICLE_DENSITY_STEP = 24;
// Background dust motes PER LINE of the resident window (see dioramaMoteField.ts). The motes sit in a
// shell around the flight axis, and the two axes are INDEPENDENT: 圆周 = motes around each ring, 径向 =
// how many layers across the shell's thickness (inner→outer). Motes-per-line = 圆周 x 径向; the window
// holds 8 lines, so MAX x MAX bounds the layer at 8*48*4 = 1536 points for low-end GPUs / OBS sources
// however far the sliders are dragged. Default 28 x 2 = 56 matches the old single-slider default.
const DIORAMA_MOTE_CIRCUMFERENCE_MIN = 4;
const DIORAMA_MOTE_CIRCUMFERENCE_MAX = 48;
const DIORAMA_MOTE_CIRCUMFERENCE_STEP = 2;
const DIORAMA_MOTE_RADIAL_MIN = 1;
const DIORAMA_MOTE_RADIAL_MAX = 4;
const DIORAMA_MOTE_RADIAL_STEP = 1;
const DIORAMA_PARTICLE_SCALE_MIN = 0.65;
const DIORAMA_PARTICLE_SCALE_MAX = 1.6;
const DIORAMA_PARTICLE_SCALE_STEP = 0.05;
// Compatibility aliases for the uncommitted tuning UI while it migrates from point size to cluster scale.
const DIORAMA_PARTICLE_SIZE_MIN = DIORAMA_PARTICLE_SCALE_MIN;
const DIORAMA_PARTICLE_SIZE_MAX = DIORAMA_PARTICLE_SCALE_MAX;
const DIORAMA_PARTICLE_SIZE_STEP = DIORAMA_PARTICLE_SCALE_STEP;
const DIORAMA_PARTICLE_GLOW_INTENSITY_MIN = 0.1;
const DIORAMA_PARTICLE_GLOW_INTENSITY_MAX = 1.5;
const DIORAMA_PARTICLE_GLOW_INTENSITY_STEP = 0.05;
const DEFAULT_DIORAMA_TUNING = {
    cameraSpeed: 1,
    motionAmount: 1,
    audioReactivity: 1,
    geometryVisibility: DEFAULT_DIORAMA_GEOMETRY_VISIBILITY,
    particleDensity: 576,
    particleScale: 1,
    particleGlowEnabled: true,
    particleGlowIntensity: 0.65,
    showParticles: true,
    backgroundParticleCircumference: 28,
    backgroundParticleRadial: 2,
    glowEnabled: true,
    glowIntensity: 1,
    soulEnabled: true,
    soulIntensity: 1,
    soulActiveEnabled: false,
    gradientEnabled: false,
    gradientIntensity: 1,
    keywordColoringEnabled: true,
};
const DEFAULT_MONET_BACKGROUND_TUNING = {
    backgroundSource: 'cover-derived',
    backgroundLayout: 'full-overlay',
    backgroundBlurPx: 6,
    backgroundOverlayOpacity: 0.74,
    backgroundGrayscale: 0,
    backgroundSaturation: 1.05,
    backgroundWash: 0.34,
    backgroundHalfPaneOffsetX: 0,
    backgroundWashColorMode: 'theme',
    backgroundWashCustomColor: '#8fb7ff',
    backgroundDriftEnabled: true,
    backgroundDriftStrength: 0.5,
    backgroundStreaksEnabled: true,
};
const DEFAULT_NOMAND_BACKGROUND_TUNING = {
    imageSource: 'cover-derived',
    effect: 'dithering',
    ditheringType: '8x8',
    size: 3,
    colorSteps: 4,
    originalColors: false,
    inverted: false,
    flutedGlassSize: 0.5,
    flutedGlassDistortion: 0.5,
    flutedGlassBlur: 0.08,
    paperTextureContrast: 0.32,
    paperTextureRoughness: 0.42,
    paperTextureFiber: 0.3,
    halftoneDotsSize: 0.5,
    halftoneDotsRadius: 1.25,
    halftoneDotsContrast: 0.4,
    halftoneDotsOriginalColors: false,
    halftoneDotsInverted: false,
    lensDistortionSpread: 0.45,
    lensDistortionBulge: 0.3,
    lensDistortionDispersion: 0.65,
    overlayEnabled: true,
    overlayOpacity: 0.35,
};
const DEFAULT_LATENT_BACKGROUND_TUNING = {
    displayMode: 'both',
    colorSource: 'cover-theme',
    dynamicOnlyInPlayer: true,
    enhancedBeatResponse: true,
    ditheringSpeed: 0.1,
    ditheringAudioSpeed: 1.2,
    ditheringSize: 2.5,
    ditheringOpacity: 0.55,
    meshSpeed: 0.3,
    meshAudioSpeed: 2,
    meshDistortion: 0.8,
    meshSwirl: 0.1,
    overlayEnabled: true,
    overlayOpacity: 0.35,
};
const DEFAULT_SORA_BACKGROUND_TUNING = {
    blank: false,
};
const DEFAULT_MONET_TUNING = {
    keywordColoringEnabled: true,
    showDescription: true,
    showAudioVisualization: true,
    audioStyle: 'bar',
    fontScale: 1.2,
    portraitSource: 'cover',
    portraitOffsetX: 0,
    portraitStyle: 'square',
    showPortraitDragHanger: true,
};
var PlayerState;
(function (PlayerState) {
    PlayerState["IDLE"] = "IDLE";
    PlayerState["PLAYING"] = "PLAYING";
    PlayerState["PAUSED"] = "PAUSED";
})(PlayerState || (PlayerState = {}));

// ======== components/visualizer/diorama/cameraPath ========
// src/components/visualizer/diorama/cameraPath.ts
// Pure helpers for a procedural 3D lyric flythrough. The stack of ideas:
//
// 1. A WINDING PATH (buildDioramaPath): a "turtle" walks forward one step per lyric line while its
//    heading yaws/pitches by seeded oscillations, so the corridor banks and snakes (never doubling
//    back). Each line gets a local FRAME (forward/right/up) that text, camera and geometry compose in.
//
// 2. FREE TEXT PLACEMENT (getDioramaTextPlacement): a lyric line is NOT pinned to the path centerline -
//    it gets a seeded offset off the path, its own scale, an in-plane roll and a slight yaw, plus a
//    compositional look-offset so it can sit off-centre in frame. The camera aims at wherever the line
//    actually landed and the formation is grown around it, so everything still frames the words - but
//    the corridor reads as staged typography in space, not a teleprompter.
//
// 3. SHOT LANGUAGE (getDioramaShot / resolveShotOffset): each line is assigned one cinematic move
//    (10 kinds: push-in / pull-back / orbit / track / crane / hold / swell / spiral / pendulum /
//    flyby) chosen from the line's own character (chorus, length, section, note lengths), expressed as
//    a camera offset in the line's local frame. The CameraRig SmoothDamps between shots, so the
//    techniques stay varied but the transitions stay smooth. Audio does NOT drive the camera - the
//    move curves stay clean; audio expresses itself in the geometry/light instead.
//
// 4. PROCEDURAL FORMATIONS (buildFormation): each line grows a deliberate geometric set-piece matched
//    to its shot (ring for orbit, gate pillars for push-in, colonnade for track, arch for crane, helix
//    for spiral, ...). Formation pieces share one primitive family per line (architectural consistency,
//    not primitive soup), get vertical stretch for pillars/rods, are pushed apart when they overlap,
//    keep a lateral clearance belt around the text, and always sit at/behind the text plane so they can
//    never cover the words. Deterministic per line/seed, like a game seeding a level.
//
// 5. LIFECYCLE (resolveShapeLifeOpacity): shapes are born out of the distance haze (fade in as they
//    approach) and gracefully dissolve if the camera flies too close - so there is no pop-in at the
//    window edge and never a mesh smearing across the lens during a pass-through.
//
// Kept free of Three.js objects so the math stays unit-testable; the R3F components consume these each
// frame. All motion scales come from DioramaMotionParams (tuning + theme sub-modes).

/** Distance advanced along the path per lyric line. */
const DIORAMA_STEP_DISTANCE = 8;
/** Max heading yaw / pitch (radians) the path bends by. Bounded so the corridor snakes smoothly and
 * always keeps moving forward (never a switchback), which keeps passed lines receding behind you. */
const DIORAMA_MAX_YAW = 0.5;
const DIORAMA_MAX_PITCH = 0.32;
/** Distance the camera trails behind the read-head (its hero framing distance). Below the step distance
 * so a line is passed once its move completes rather than staying stacked in front. */
const DIORAMA_HERO_DISTANCE = 5.2;
/** Base height the camera rides above the read-head (in the line's local up). */
const DIORAMA_CAMERA_LIFT = 0.5;
/** Fraction of the visible frame the camera may use to truck after the sung word while still keeping a
 * short line fully in view. */
const DIORAMA_SAFE_FRAME_FRACTION = 0.92;
/** Base amplitudes (world units) of the faint idle drift added ON TOP of the active shot as a hand-held
 * breath. Kept small - the distinct SHOT is the main motion. */
const DIORAMA_SWAY_AMP = 0.4;
const DIORAMA_LIFT_AMP = 0.4;
const DIORAMA_DIST_AMP = 0.5;
/** If the camera falls this far behind its pose (a seek jumps the read-head many lines), snap instead
 * of flying across the whole song to catch up. */
const DIORAMA_SNAP_DISTANCE = 24;
/** Per-line lyric text transform bounds (see getDioramaTextPlacement): lateral/vertical offset off the
 * path centerline, in-plane roll, slight yaw, and the off-centre compositional look offset. */
const DIORAMA_TEXT_OFFSET_R = 1.8;
const DIORAMA_TEXT_OFFSET_U = 1.2;
const DIORAMA_TEXT_ROLL = 0.2;
const DIORAMA_TEXT_YAW = 0.16;
const DIORAMA_TEXT_LOOK = 1.1;
/** Shape lifecycle distances (world units from the camera): born out of the haze between FADE_IN_END ->
 * FADE_IN_START, and dissolved between DISSOLVE_START -> DISSOLVE_END as the camera closes in, so a
 * near pass never shows a mesh clipping through the lens. */
const DIORAMA_SHAPE_FADE_IN_START = 20;
const DIORAMA_SHAPE_FADE_IN_END = 27;
const DIORAMA_SHAPE_DISSOLVE_START = 3.0;
const DIORAMA_SHAPE_DISSOLVE_END = 1.2;
const DEG_TO_RAD = Math.PI / 180;
const clamp01__1 = (value) => Math.min(1, Math.max(0, value));
const clamp__1 = (value, min, max) => Math.min(max, Math.max(min, value));
const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vcross = (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});
const vnorm = (a) => {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / len, y: a.y / len, z: a.z / len };
};
const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
// Deterministic pseudo-random in [0, 1) so a line index always maps to the same value - seeking never
// re-randomizes the corridor, the shots or the formations.
const seededUnit = (seed) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
};
const hashSeed = (seed) => {
    if (typeof seed === 'number')
        return seed;
    if (!seed)
        return 1;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
    }
    return hash || 1;
};
/**
 * Unity-style critically-damped SmoothDamp for one scalar. Unlike plain exponential lerp (which is
 * fastest the instant the target moves and only ever decelerates - "snap then coast"), this carries
 * velocity and eases both in and out, so a stepped target (the read-head jumping to the next line) is
 * followed as a smooth accelerate-then-settle move with no kink. The caller owns the per-axis velocity.
 */
const smoothDamp = (current, target, velocity, smoothTime, deltaSeconds) => {
    const t = Math.max(0.0001, smoothTime);
    const omega = 2 / t;
    const x = omega * deltaSeconds;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (velocity + omega * change) * deltaSeconds;
    const newVelocity = (velocity - omega * temp) * exp;
    const value = target + (change + temp) * exp;
    return { value, velocity: newVelocity };
};
/** World half-width visible at `distance` from a perspective camera (three.js `fov` is VERTICAL). */
const frameHalfWidth = (distance, verticalFovDeg, aspect) => distance * Math.tan((verticalFovDeg * DEG_TO_RAD) / 2) * aspect;
const DIORAMA_SUB_MODE_PRESETS = {
    normal: { move: 1, drift: 0.62, smooth: 0.42, audio: 1, weave: 1 },
    calm: { move: 0.6, drift: 0.4, smooth: 0.56, audio: 0.5, weave: 0.5 },
    chaotic: { move: 1.35, drift: 0.85, smooth: 0.33, audio: 1.35, weave: 1.35 },
};
/**
 * Resolve tuning + theme into the motion scale bundle every diorama component consumes. The camera
 * STYLE always follows the theme's animationIntensity - the same single state the player panel's
 * intensity chip cycles and AI themes set - exactly like every other visualizer style. Sliders
 * (cameraSpeed / motionAmount / audioReactivity) multiply on top.
 */
const resolveDioramaMotionParams = (tuning, themeIntensity) => {
    const t = tuning ?? DEFAULT_DIORAMA_TUNING;
    const mode = themeIntensity === 'calm' ? 'calm' : themeIntensity === 'chaotic' ? 'chaotic' : 'normal';
    const preset = DIORAMA_SUB_MODE_PRESETS[mode];
    const motion = clamp__1(t.motionAmount, 0.4, 1.6);
    const speed = clamp__1(t.cameraSpeed, 0.55, 1.85);
    const audio = clamp__1(t.audioReactivity, 0, 1.5);
    return {
        moveScale: preset.move * motion,
        driftScale: preset.drift * motion,
        smoothTime: preset.smooth / speed,
        audioLevel: preset.audio * audio,
        weaveScale: preset.weave * motion,
        subMode: mode,
    };
};
const WORLD_UP = { x: 0, y: 1, z: 0 };
const DEFAULT_FRAME = {
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
};
/**
 * Build the whole corridor once for a song: a turtle walks forward one step per line while its heading
 * yaws/pitches by bounded seeded oscillations. The heading's forward (-z) component stays negative, so
 * the path always advances. Each line then gets a local frame from the travel tangent (right = travel x
 * world-up so it matches the text's left-to-right reading direction; up completes the frame).
 */
const buildDioramaPath = (count, seed) => {
    const base = hashSeed(seed);
    const n = Math.max(count, 1);
    // One extra position so the last real line still has a forward tangent (positions[i+1] - positions[i]).
    const positions = [];
    let pos = { x: 0, y: 0, z: 0 };
    for (let i = 0; i <= n; i += 1) {
        positions.push({ ...pos });
        const yaw = DIORAMA_MAX_YAW * (Math.sin(i * 0.23 + base * 0.017) * 0.62 + Math.sin(i * 0.11 + base * 0.041 + 1.3) * 0.38);
        const pitch = DIORAMA_MAX_PITCH * Math.sin(i * 0.17 + base * 0.029 + 0.7);
        const cp = Math.cos(pitch);
        const dir = { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
        pos = {
            x: pos.x + dir.x * DIORAMA_STEP_DISTANCE,
            y: pos.y + dir.y * DIORAMA_STEP_DISTANCE,
            z: pos.z + dir.z * DIORAMA_STEP_DISTANCE,
        };
    }
    const frames = [];
    for (let i = 0; i < n; i += 1) {
        const forward = vnorm(vsub(positions[i + 1], positions[i]));
        // right = forward x worldUp gives +x for a -z forward, matching the text's reading direction.
        // (pitch is bounded well under 90deg, so forward is never parallel to worldUp - cross is stable.)
        const right = vnorm(vcross(forward, WORLD_UP));
        const up = vnorm(vcross(right, forward));
        frames.push({ position: positions[i], forward, right, up });
    }
    return frames;
};
/** Safe frame lookup - clamps to range and falls back to a straight frame if the path is empty. */
const getFrame = (frames, index) => {
    if (frames.length === 0)
        return DEFAULT_FRAME;
    const i = Math.min(Math.max(index, 0), frames.length - 1);
    return frames[i] ?? DEFAULT_FRAME;
};
/**
 * Rigidly move a freshly-built corridor to a new world origin. Pure translation - only the anchor
 * positions shift; the per-line forward/right/up directions are unchanged - so the corridor keeps its
 * exact winding shape and upright bases, just placed elsewhere in the world. The diorama transition
 * spawns each new song's corridor at a deliberate OFFSET from the current one (see dioramaTransition.ts)
 * so the two scenes coexist in one space and the camera physically flies the gap between them.
 */
const translateFrames = (frames, offset) => frames.map((f) => ({ position: vadd(f.position, offset), forward: f.forward, right: f.right, up: f.up }));
/** Compose a local (right, up, depth) offset in a frame into a world point. Positive depth is ahead
 * along the path, away from the trailing camera and behind the text. */
const composeLocal = (frame, right, up, depth) => ({
    x: frame.position.x + frame.right.x * right + frame.up.x * up + frame.forward.x * depth,
    y: frame.position.y + frame.right.y * right + frame.up.y * up + frame.forward.y * depth,
    z: frame.position.z + frame.right.z * right + frame.up.z * up + frame.forward.z * depth,
});
/**
 * Lateral truck offset (along the frame's right) so the camera follows the sung word along a line. A
 * SMOOTH saturating curve (tanh), not a hard clamp: a short line that fits the frame saturates quickly
 * (only a gentle follow); a long line follows further to keep the sung word framed - with no derivative
 * kink at the limit (a hard clamp__1 corner is what reads as jerky).
 */
const resolveReadHeadTruck = (wordProgress, trackWidth, visibleHalfWidth) => {
    if (trackWidth <= 0)
        return 0;
    const wordOffset = (clamp01__1(wordProgress) - 0.5) * trackWidth;
    const allowed = Math.max(Math.abs(visibleHalfWidth - trackWidth / 2), 0.001);
    return allowed * Math.tanh(wordOffset / allowed);
};
/**
 * Where and how a lyric line sits relative to its path frame. Low-frequency sines of the index keep
 * consecutive lines flowing (the weave reads as intentional layout) with a seeded per-line jitter on
 * top; scale/roll/yaw/look are per-line seeded. All variety scales with `weave` (sub-mode/slider) and
 * is deterministic per line/seed. weave=0 collapses to a centered, straight, uniform layout.
 */
const getDioramaTextPlacement = (lineIndex, seed, weave = 1) => {
    const base = hashSeed(seed);
    const i = Math.max(lineIndex, 0);
    const jitterR = (seededUnit(base + i * 11 + 2) - 0.5) * 0.6;
    const jitterU = (seededUnit(base + i * 11 + 4) - 0.5) * 0.6;
    const wanderR = Math.sin(i * 0.47 + base * 0.019) * 0.7 + jitterR;
    const wanderU = Math.sin(i * 0.29 + base * 0.027 + 0.9) * 0.7 + jitterU;
    return {
        offsetR: wanderR * DIORAMA_TEXT_OFFSET_R * weave,
        offsetU: wanderU * DIORAMA_TEXT_OFFSET_U * weave,
        scale: 0.82 + seededUnit(base + i * 11 + 5) * 0.46,
        roll: (seededUnit(base + i * 11 + 6) - 0.5) * 2 * DIORAMA_TEXT_ROLL * weave,
        yaw: (seededUnit(base + i * 11 + 7) - 0.5) * 2 * DIORAMA_TEXT_YAW * weave,
        lookR: (seededUnit(base + i * 11 + 8) - 0.5) * 2 * DIORAMA_TEXT_LOOK * weave,
    };
};
const SHOT_KINDS = [
    'pushIn', 'pullBack', 'orbit', 'track', 'crane', 'hold', 'swell', 'spiral', 'pendulum', 'flyby',
    'arc', 'float', 'glide',
];
// Smoothstep 0..1 - eases a shot's arc in and out so even linear progress reads as a hand-operated move
// (accelerate off the mark, settle onto it) rather than a constant-velocity mechanical slide.
const easeInOut = (p) => {
    const c = clamp01__1(p);
    return c * c * (3 - 2 * c);
};
const CHORUS_PART = /chorus|hook|refrain|drop/i;
// The left/right handedness of a line's shot (which side an orbit swings, a flyby passes, ...). Shared
// by resolveShotOffset AND buildFormation so the set-piece is built on the side the camera will use.
const getShotDir = (lineIndex, seed) => seededUnit(hashSeed(seed) + lineIndex * 7 + 3) < 0.5 ? -1 : 1;
// Longest / average sung-note duration on a line, from its word timings. A long held note wants a grand
// slow move (swell/spiral); a run of short staccato notes wants a snappy track/flyby. Zeros when no
// per-word timing exists so note features stay neutral.
const getLineNoteProfile = (line) => {
    let maxNote = 0;
    let sum = 0;
    let noteCount = 0;
    for (const word of line?.words ?? []) {
        const d = word.endTime - word.startTime;
        if (d > 0) {
            maxNote = Math.max(maxNote, d);
            sum += d;
            noteCount += 1;
        }
    }
    return { maxNote, avgNote: noteCount > 0 ? sum / noteCount : 0, noteCount };
};
// Weight each archetype by the line's character so the KIND of move suits the moment. Never lets a
// weight hit zero, so every shot stays reachable - variety over rigid rules.
const computeShotWeights = (lineIndex, lines, subMode = 'normal') => {
    const line = lines[lineIndex];
    const prev = lineIndex > 0 ? lines[lineIndex - 1] : undefined;
    const wordCount = line?.words?.length ?? 0;
    const isChorus = !!line?.isChorus || CHORUS_PART.test(line?.songPart ?? '');
    const sectionStart = !!line && !!prev && (line.blockIndex !== prev.blockIndex || (line.songPart ?? '') !== (prev.songPart ?? ''));
    const { maxNote, avgNote, noteCount } = getLineNoteProfile(line);
    const hasLongNote = maxNote >= 1.3;
    const staccato = noteCount >= 4 && avgNote > 0 && avgNote <= 0.34;
    // Flatter base than before (rare shots raised) so no handful of archetypes dominates - combined with
    // the last-two anti-repetition below, every move gets meaningful screen time.
    const w = {
        pushIn: 1, pullBack: 1, orbit: 1, track: 1, crane: 1, hold: 1, swell: 0.85,
        spiral: 0.9, pendulum: 1, flyby: 0.9, arc: 1, float: 0.9, glide: 1,
    };
    if (isChorus) {
        w.orbit += 2.4;
        w.pushIn += 1.8;
        w.spiral += 1.2;
        w.crane += 0.8;
        w.flyby += 0.6;
        w.arc += 1.0;
        w.glide += 0.6;
        w.hold -= 0.6;
        w.track -= 0.2;
    }
    else {
        w.track += 1.1;
        w.crane += 0.9;
        w.hold += 0.9;
        w.pendulum += 0.8;
        w.float += 0.8;
        w.glide += 0.6;
        w.arc += 0.4;
    }
    if (wordCount >= 8) {
        w.track += 1.6;
        w.pullBack += 1;
        w.orbit -= 0.4;
        w.pushIn -= 0.3;
    }
    else if (wordCount <= 3) {
        w.pushIn += 1.4;
        w.orbit += 0.9;
        w.hold += 0.5;
        w.track -= 0.8;
    }
    if (sectionStart) {
        w.pullBack += 2.2;
        w.crane += 1.4;
        w.glide += 1.0;
        w.pushIn -= 0.4;
    }
    if (hasLongNote) {
        w.swell += 2.4;
        w.spiral += 1.0;
        w.float += 1.2;
        w.pendulum += 0.6;
        w.orbit += 0.8;
        w.arc += 0.6;
        w.hold += 0.3;
        w.track -= 0.5;
    }
    if (staccato) {
        w.track += 1.4;
        w.flyby += 1.5;
        w.pushIn += 0.8;
        w.swell -= 1.6;
        w.hold -= 0.8;
        w.crane -= 0.4;
    }
    // Sub-mode character: calm favours composed, gentle, near-still moves and damps the big spatial
    // swings; chaotic favours dynamic, spatial, varied moves and suppresses stillness (its larger
    // amplitude/quicker follow come from the motion presets). Standard leaves the character untouched.
    if (subMode === 'calm') {
        w.hold += 1.4;
        w.float += 1.3;
        w.swell += 0.9;
        w.glide += 0.8;
        w.arc += 0.5;
        w.crane += 0.4;
        w.orbit *= 0.4;
        w.spiral *= 0.35;
        w.flyby *= 0.3;
        w.pendulum *= 0.5;
        w.pushIn *= 0.7;
    }
    else if (subMode === 'chaotic') {
        w.orbit += 1.3;
        w.spiral += 1.3;
        w.flyby += 1.2;
        w.pendulum += 1.0;
        w.pushIn += 0.8;
        w.arc += 0.6;
        w.crane += 0.4;
        w.hold *= 0.35;
        w.float *= 0.55;
        w.swell *= 0.7;
    }
    SHOT_KINDS.forEach((key) => {
        w[key] = Math.max(0.05, w[key]);
    });
    return w;
};
const weightedPickShot = (weights, u) => {
    const total = SHOT_KINDS.reduce((sum, k) => sum + weights[k], 0);
    let acc = clamp01__1(u) * total;
    for (const k of SHOT_KINDS) {
        acc -= weights[k];
        if (acc <= 0)
            return k;
    }
    return 'hold';
};
const basePickShot = (lineIndex, lines, seed, subMode = 'normal') => {
    if (!lines[lineIndex])
        return 'hold';
    const u = seededUnit(hashSeed(seed) + lineIndex * 101 + 7);
    return weightedPickShot(computeShotWeights(lineIndex, lines, subMode), u);
};
// The shot archetype for a line: the weighted pick, but if it matches EITHER of the previous two lines'
// picks, bump to a different archetype - so the same few moves never cluster and the full vocabulary
// gets used. The dedupe only peeks at basePickShot(prev) - it never recurses into getDioramaShot - so it
// stays O(1). `subMode` (from the theme intensity) biases which archetypes the pick draws from.
const getDioramaShot = (lineIndex, lines, seed, subMode = 'normal') => {
    const pick = basePickShot(lineIndex, lines, seed, subMode);
    const prev1 = lineIndex > 0 ? basePickShot(lineIndex - 1, lines, seed, subMode) : null;
    const prev2 = lineIndex > 1 ? basePickShot(lineIndex - 2, lines, seed, subMode) : null;
    if (pick === prev1 || pick === prev2) {
        const others = SHOT_KINDS.filter((k) => k !== pick && k !== prev1 && k !== prev2);
        const pool = others.length > 0 ? others : SHOT_KINDS.filter((k) => k !== pick);
        const alt = seededUnit(hashSeed(seed) + lineIndex * 53 + 19);
        return pool[Math.floor(clamp01__1(alt) * pool.length) % pool.length];
    }
    return pick;
};
// Map a shot archetype + its progress to a camera offset in the line's LOCAL frame (right / up / back).
// The CameraRig composes it with the frame vectors, so a move like "orbit" swings through the path's
// actual local horizontal plane. The excursion away from the neutral trailing pose scales with
// moveScale, so sub-modes make the same shot language gentler or bolder without changing its grammar.
const resolveShotOffset = (kind, ctx) => {
    const { hero, lift, seed, lineIndex } = ctx;
    const e = easeInOut(ctx.progress);
    const dir = getShotDir(lineIndex, seed);
    let right = 0;
    let up = lift;
    let back = hero;
    switch (kind) {
        case 'pushIn':
            // Close the distance over the line so the text grows and fills the frame - intimacy / climax.
            back = hero * (1.5 - 0.8 * e);
            up = lift * (1.2 - 0.5 * e) + 0.15;
            break;
        case 'pullBack':
            // Retreat and rise, opening the surrounding formation into view - a reveal / section breath.
            back = hero * (0.85 + 1.15 * e);
            up = lift + 1.7 * e;
            break;
        case 'orbit': {
            // Arc around the line at a near-constant distance so the ring formation sweeps across behind
            // the centered text - the clearest "camera moving through a 3D world" move.
            const theta = dir * 0.55 * (2 * e - 1);
            right = hero * Math.sin(theta);
            back = hero * Math.cos(theta);
            up = lift + 0.4;
            break;
        }
        case 'track':
            // Slide with the sung word (the read-head already trucks with it) while leaning out to a
            // slight profile angle mid-line, so the colonnade streaks past - a dolly tracking shot.
            right = dir * hero * 0.34 * Math.sin(Math.PI * clamp01__1(ctx.wordProgress));
            back = hero * 1.06;
            up = lift + 0.12;
            break;
        case 'crane': {
            // Boom vertically past the line (low-angle look-up, or high look-down) under the arch, aim
            // held on the line so the framing tilts through the move.
            const from = dir > 0 ? -1.5 : 2.4;
            const to = dir > 0 ? 2.4 : -1.4;
            up = from + (to - from) * e;
            back = hero * 1.05;
            break;
        }
        case 'swell': {
            // A long sustained note: a slow grand glide that blooms over the whole note - a gentle arc
            // while craning up and easing back, the "held breath" move.
            const theta = dir * 0.4 * e;
            right = hero * Math.sin(theta) * 1.1;
            back = hero * (1.0 + 0.35 * e);
            up = lift + 1.2 * e + 0.3;
            break;
        }
        case 'spiral': {
            // A rising corkscrew: arc sideways like an orbit while climbing from below the line to above
            // it - the helix formation wraps past behind the text as the camera coils up.
            const theta = dir * 0.7 * (2 * e - 1);
            right = hero * Math.sin(theta) * 0.85;
            back = hero * (1.05 - 0.1 * e);
            up = lift - 0.8 + 2.4 * e;
            break;
        }
        case 'pendulum': {
            // A hanging-camera swing: sweep across the line while dipping through the bottom of the arc
            // at mid-line, high at both ends - reads as a cable-cam pass under the canopy formation.
            right = dir * hero * 0.45 * (2 * e - 1);
            up = lift + 0.9 - 0.9 * Math.sin(Math.PI * e);
            back = hero * 1.02;
            break;
        }
        case 'flyby': {
            // A close lateral fly-past: start off to one side slightly ahead, cross the line's face
            // closer than the hero distance, exit the other side - the rail formation streaks by.
            right = dir * hero * (0.7 - 1.4 * e);
            back = hero * (0.78 + 0.12 * Math.sin(Math.PI * e));
            up = lift + 0.05;
            break;
        }
        case 'arc': {
            // A wide, graceful lateral arc that swings out past the line and back, staying frontal and
            // composed - broader and gentler than an orbit, the elegant "sweep" move.
            const theta = dir * 0.5 * Math.sin(Math.PI * e);
            right = hero * Math.sin(theta) * 1.3;
            back = hero * (1.05 + 0.12 * (1 - Math.cos(theta)));
            up = lift + 0.5 * Math.sin(Math.PI * e);
            break;
        }
        case 'float': {
            // A dreamy suspended bob: a slow lissajous of gentle vertical and lateral drift that barely
            // translates, so the line seems to hang weightless - for long, held, floating moments.
            right = dir * hero * 0.16 * Math.sin(e * Math.PI * 2);
            up = lift + 0.6 + 0.5 * Math.sin(e * Math.PI * 2 + 1.0);
            back = hero * (1.05 + 0.06 * Math.sin(e * Math.PI));
            break;
        }
        case 'glide': {
            // An elegant ascending diagonal: cranes up while easing a touch closer, a composed rising
            // drift that opens a section or lifts into a line.
            right = dir * hero * 0.22 * e;
            up = lift + 1.4 * e;
            back = hero * (1.15 - 0.25 * e);
            break;
        }
        case 'hold':
        default:
            // A near-locked shot - deliberate stillness for contrast (variety includes NOT moving).
            up = lift + 0.3 * Math.sin(ctx.progress * Math.PI);
            back = hero;
            break;
    }
    // Scale the excursion away from the neutral trailing pose (right 0 / up lift / back hero), so sub-
    // modes soften or amplify every move uniformly without breaking its framing.
    const m = ctx.moveScale;
    return {
        right: right * m,
        up: lift + (up - lift) * m,
        back: hero + (back - hero) * m,
    };
};
/** How long a finished line is held before its shot starts resolving, and how long the resolve takes.
 *
 * 3s is not a taste number: `attachInterludes` fills every gap longer than 3s with an interlude line,
 * and the diorama holds the read-head through interludes instead of framing them. So a hold that
 * outlasts 3s is exactly a hold the lyric file itself calls a gap, and a shorter one cannot happen -
 * the next line is already on its way. Below the threshold this returns exactly 1, so ordinary
 * line-to-line playback is untouched to the pixel. */
const HOLD_SETTLE_DELAY = 3;
const HOLD_SETTLE_EASE = 5;
/**
 * How much of a line's READING COMPOSITION still applies, `secondsHeld` after its reading window
 * closed. 1 through the line and through any normal gap, easing to 0 once the camera has been parked
 * on a finished line longer than the shot language has anything to say.
 *
 * The composition is three things that all point the same way: the shot's excursion away from the
 * neutral trailing pose, the truck that follows the sung word out to the END of the line, and the
 * rule-of-thirds look offset that deliberately pushes the line off-centre. Each is right while the
 * line is live - the camera is moving and the next line is seconds away. Held through an instrumental
 * they stop being composition: `progress` is pinned at 1, so the shot freezes at its most extreme
 * pose and the two lateral offsets park the lyric hard against the edge of frame with nothing moving
 * to justify it. Measured over the shot language at default settings, 21.7% of held frames have an
 * end of the current line off screen, against 3.3% mid-line; releasing all three takes it to 0%
 * (test/manual/diorama_hold_framing.mts).
 */
const resolveHoldSettle = (secondsHeld) => {
    const t = clamp01__1((secondsHeld - HOLD_SETTLE_DELAY) / HOLD_SETTLE_EASE);
    return 1 - t * t * (3 - 2 * t);
};
/**
 * Faint continuous idle drift added on top of the shot as a hand-held breath, driven by slow layered
 * sines so even a locked shot is alive. Composed in the line's local frame by the CameraRig. `scale` is
 * the absolute drift amplitude (params.driftScale); the seed offsets the phases per song.
 */
const resolveCameraDrift = (time, seed, scale) => {
    const ph = hashSeed(seed) * 0.017;
    return {
        swayX: (Math.sin(time * 0.11 + ph) * 0.6 + Math.sin(time * 0.047 + ph * 1.7) * 0.4) * DIORAMA_SWAY_AMP * scale,
        swayY: Math.sin(time * 0.09 + ph * 0.7) * DIORAMA_SWAY_AMP * 0.5 * scale,
        lift: (Math.sin(time * 0.13 + ph * 1.3) * 0.6 + Math.sin(time * 0.061 + ph * 2.1) * 0.4) * DIORAMA_LIFT_AMP * scale,
        dist: Math.sin(time * 0.05 + ph * 1.1) * DIORAMA_DIST_AMP * scale,
    };
};
const DIORAMA_PARTICLE_AUDIO_SCALE_MAX = 1.44;
const getSpecClearanceRadius = (spec) => {
    const familyRadius = spec.kind === 'box'
        ? 0.5
        : spec.kind === 'sphere'
            ? 0.74
            : spec.kind === 'cone'
                ? 0.68
                : 0.9;
    return spec.scale * Math.max(familyRadius, spec.stretchY * 0.55);
};
// Push apart any two pieces closer than their visual footprints, then re-clamp__1 depth behind the text
// plane. The old scale-only radius underestimated torus/ribbon silhouettes and created nested highlights.
const separateSpecs = (specs) => {
    for (let iter = 0; iter < 6; iter += 1) {
        for (let a = 0; a < specs.length; a += 1) {
            for (let b = a + 1; b < specs.length; b += 1) {
                const A = specs[a];
                const B = specs[b];
                const minDist = (getSpecClearanceRadius(A) + getSpecClearanceRadius(B)) * 1.3;
                let dr = B.r - A.r;
                let du = B.u - A.u;
                let dd = B.d - A.d;
                let dist = Math.hypot(dr, du, dd);
                if (dist >= minDist)
                    continue;
                if (dist < 0.001) {
                    dr = 1;
                    du = 0.5;
                    dd = 0.25;
                    dist = Math.hypot(dr, du, dd);
                }
                const push = (minDist - dist) / 2 / dist;
                A.r -= dr * push;
                A.u -= du * push;
                A.d -= dd * push;
                B.r += dr * push;
                B.u += du * push;
                B.d += dd * push;
            }
        }
    }
    specs.forEach((s) => {
        s.d = Math.max(s.d, 1);
    });
};
// Keep a lateral clearance belt around the text row: any piece sitting at text height is pushed out
// past the longest line's half-width, so even a full-width line never visually collides with a pillar.
// Sized for the worst case: frame-fraction fit x the max per-line staging scale (~1.28) ~= 4.5 half
// width, plus margin - long lyrics stay readable instead of poking into gate pillars/colonnades.
const TEXT_CLEAR_LATERAL = 5.2;
const TEXT_CLEAR_VERTICAL = 1.4;
const enforceTextClearance = (specs) => {
    specs.forEach((s, i) => {
        const radius = getSpecClearanceRadius(s) * DIORAMA_PARTICLE_AUDIO_SCALE_MAX;
        if (Math.abs(s.u) - radius < TEXT_CLEAR_VERTICAL
            && Math.abs(s.r) - radius < TEXT_CLEAR_LATERAL) {
            const side = s.r === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(s.r);
            s.r = side * (TEXT_CLEAR_LATERAL + radius + 0.35);
        }
    });
};
// Keep the complete cloud footprint outside the camera/lyric rail, not only its anchor point.
const enforceRailClearance = (specs) => {
    specs.forEach((s, i) => {
        const radius = getSpecClearanceRadius(s) * DIORAMA_PARTICLE_AUDIO_SCALE_MAX;
        const minimum = 2.8 + radius;
        const distance = Math.hypot(s.r, s.u);
        if (distance >= minimum)
            return;
        const fallbackAngle = (i % 2 === 0 ? 1 : -1) * Math.PI * 0.16;
        const directionR = distance > 0.001 ? s.r / distance : Math.cos(fallbackAngle);
        const directionU = distance > 0.001 ? s.u / distance : Math.sin(fallbackAngle);
        s.r = directionR * minimum;
        s.u = directionU * minimum;
    });
};
/**
 * Grow a procedural geometric formation for a line, shaped to match its camera move so the geometry and
 * the shot perform together: a RING for an orbit to sweep around, GATE pillars for a push-in to fly
 * between, a COLONNADE for a track to streak past, an ARCH for a crane to rise under, a HELIX for a
 * spiral to coil past, a hanging CANOPY for a pendulum to swing beneath, a RAIL for a flyby to skim, a
 * TOTEM for a swell, a revealed CLUSTER for a pull-back, a sparse scatter for a hold. Each formation
 * sticks to one primitive family (architectural consistency), uses vertical stretch for pillars/rods,
 * runs overlap separation plus a text clearance belt, and keeps depth >= 0.25 (at/behind the text
 * plane, never between text and camera). Centered on the line's actual text placement offsets.
 */
const buildFormation = (lineIndex, seed, shot, frame, placement, volumeScale = 1) => {
    const salt = hashSeed(seed) + lineIndex * 97;
    const rnd = (k) => seededUnit(salt + k);
    const dir = getShotDir(lineIndex, seed);
    const specs = [];
    const safeVolumeScale = Math.min(1.6, Math.max(0.65, volumeScale));
    const add = (kind, r, u, d, scale, stretchY = 1, colorSlot) => {
        specs.push({ kind, r, u, d, scale: scale * safeVolumeScale, stretchY, upright: stretchY > 1.2, colorSlot });
    };
    const addPair = (kind, lateral, u, d, scale, stretchY = 1, colorSlot = 0) => {
        add(kind, -Math.abs(lateral), u, d, scale, stretchY, colorSlot);
        add(kind, Math.abs(lateral), u, d, scale, stretchY, colorSlot);
    };
    switch (shot) {
        case 'orbit': {
            // A sparse orbit of liquid beads with one ring accent; repeated rings read as nested glare.
            const count = 6;
            const radius = 4.4 + rnd(1) * 0.6;
            for (let j = 0; j < count; j += 1) {
                const a = (j / count) * Math.PI * 2 + rnd(2) * 0.6;
                add(j === 0 ? 'torus' : 'sphere', Math.cos(a) * radius, Math.sin(a) * radius, 0.6 + rnd(10 + j) * 1.4, 0.42 + rnd(20 + j) * 0.32);
            }
            break;
        }
        case 'pushIn': {
            // Two flanking gate pillars the push-in drives between, plus two taller far uprights.
            const gate = 4.3 + rnd(1) * 0.5;
            [-1, 1].forEach((side, idx) => {
                add('box', side * gate, -0.6, 0.5 + rnd(idx) * 0.5, 0.55 + rnd(2 + idx) * 0.2, 2.8 + rnd(6 + idx) * 0.8);
                add('box', side * (gate + 1.6), 0.6, 4.5 + rnd(3 + idx) * 2, 0.7 + rnd(4 + idx) * 0.3, 3.4);
            });
            break;
        }
        case 'track': {
            // A colonnade receding down both sides that a lateral track streaks past - even rhythm.
            for (let si = 0; si < 2; si += 1) {
                const side = si === 0 ? -1 : 1;
                for (let j = 0; j < 3; j += 1) {
                    add('box', side * (4.2 + rnd(si * 5 + j) * 0.4), -0.4 + (rnd(si * 7 + j) - 0.5) * 0.6, 0.5 + j * 2.4, 0.5 + rnd(si * 3 + j) * 0.15, 2.6 + rnd(si + j) * 0.6);
                }
            }
            break;
        }
        case 'crane': {
            // An overhead arch the crane rises under (kept above the text so it never covers it).
            const count = 5;
            const radius = 3.6 + rnd(1) * 0.5;
            for (let j = 0; j < count; j += 1) {
                const a = Math.PI * (0.15 + 0.7 * (j / (count - 1)));
                add('box', Math.cos(a) * radius, Math.abs(Math.sin(a)) * radius + 1.2, 0.6 + rnd(30 + j) * 0.8, 0.45 + rnd(40 + j) * 0.25, 1.4);
            }
            break;
        }
        case 'swell': {
            // Mirrored rising totems keep the swell grand without massing every cloud on one side.
            const lat = 4.2 + rnd(2) * 0.5;
            for (let j = 0; j < 2; j += 1) {
                addPair('box', lat, -1.5 + j * 2.1, 1 + j * 1.2, 0.48 - j * 0.06, 1.45, (j % 2));
            }
            addPair('sphere', lat, 2.65, 3.4, 0.5, 1, 0);
            break;
        }
        case 'spiral': {
            // A helix of beads coiling up behind the text, matching the corkscrew climb.
            const count = 7;
            const radius = 4.3;
            for (let j = 0; j < count; j += 1) {
                const frac = j / (count - 1);
                const a = dir * frac * Math.PI * 2.2 + rnd(1) * 0.5;
                add('sphere', Math.cos(a) * radius, -2.2 + frac * 5.2, 0.5 + frac * 2.2, 0.32 + rnd(20 + j) * 0.2);
            }
            break;
        }
        case 'pendulum': {
            // A hanging canopy of rods above the line the swing passes beneath.
            for (let j = 0; j < 4; j += 1) {
                add('box', -3.9 + j * 2.6 + (rnd(j) - 0.5) * 0.5, 3.0 + rnd(j * 2) * 1.2, 0.5 + rnd(j * 3) * 1.2, 0.3 + rnd(j * 4) * 0.12, 2.2 + rnd(j * 5) * 0.8);
            }
            break;
        }
        case 'flyby': {
            // Mirrored rails preserve a clear flight channel and a regular cadence on both sides.
            for (let j = 0; j < 3; j += 1) {
                addPair('box', 4.25 + rnd(j) * 0.25, -0.45 + j * 0.45, 1 + j * 2.1, 0.42 + rnd(j * 3) * 0.1, 2.2, (j % 2));
            }
            break;
        }
        case 'pullBack': {
            // A balanced deep reveal replaces the former one-sided pile and oversized hero blob.
            addPair('sphere', 5.8 + rnd(9) * 0.5, 1.25, 6.8 + rnd(11), 1.25 + rnd(12) * 0.25, 1, 0);
            for (let j = 0; j < 2; j += 1) {
                addPair(j === 0 ? 'box' : 'cone', 4.4 + j * 1.15, -1.4 + j * 2.2, 2.2 + j * 2.1, 0.58 + rnd(j * 4) * 0.18, j === 0 ? 1.5 : 1, 1);
            }
            break;
        }
        case 'arc': {
            // A shallow curved colonnade the wide arc sweeps past, spread across the far side.
            const count = 5;
            const radius = 5.2 + rnd(1) * 0.6;
            for (let j = 0; j < count; j += 1) {
                const a = (-0.5 + j / (count - 1)) * 1.5 * dir;
                add(j === Math.floor(count / 2) ? 'torus' : 'sphere', Math.sin(a) * radius, 0.3 + Math.cos(a) * 0.7, 1.0 + rnd(20 + j) * 1.6, 0.45 + rnd(30 + j) * 0.32);
            }
            break;
        }
        case 'float': {
            // Three mirrored orb rows feel weightless without random clumps around the lyric rail.
            for (let j = 0; j < 3; j += 1) {
                addPair('sphere', 4.1 + j * 0.85, -1.2 + j * 1.35, 1.2 + j * 1.55, 0.42 + rnd(j * 4) * 0.22, 1, (j % 2));
            }
            break;
        }
        case 'glide': {
            // Mirrored ascending pylons frame the glide instead of forming a single crowded wall.
            for (let j = 0; j < 3; j += 1) {
                addPair('box', 4.25 + rnd(j) * 0.3, -1.5 + j * 1.7, 1 + j * 1.7, 0.46 + rnd(j * 2) * 0.12, 1.85, (j % 2));
            }
            break;
        }
        case 'hold':
        default: {
            // A calm pair of rings and a nearer pair of beads make a quiet, ordered frame.
            addPair('torus', 5.6, 1.55, 7.2 + rnd(1), 1.05 + rnd(2) * 0.2, 1, 0);
            addPair('sphere', 4.45, -1.1, 2.1 + rnd(4), 0.58 + rnd(5) * 0.16, 1, 1);
            break;
        }
    }
    enforceRailClearance(specs);
    enforceTextClearance(specs);
    separateSpecs(specs);
    enforceRailClearance(specs);
    enforceTextClearance(specs);
    return specs.map((s, j) => ({
        kind: s.kind,
        position: composeLocal(frame, placement.offsetR + s.r, placement.offsetU + s.u, s.d),
        scale: s.scale,
        stretchY: s.stretchY,
        upright: s.upright,
        spinSpeed: 0.04 + rnd(j * 13 + 5) * 0.1,
        colorSlot: s.colorSlot ?? (j % 2),
        layer: s.d > 3.5 ? 'far' : 'near',
    }));
};
/**
 * Distance-based lifecycle opacity for a shape: 0 beyond the far haze (so newly mounted formations are
 * BORN invisible and fade in as they approach - no pop-in), 1 through the mid-range, and dissolving
 * back to 0 as the camera closes within the dissolve radius (so a near pass melts the shape away
 * instead of clipping through it). Both ends are smoothstepped.
 */
const resolveShapeLifeOpacity = (distanceToCamera) => {
    const farT = clamp01__1((DIORAMA_SHAPE_FADE_IN_END - distanceToCamera) / (DIORAMA_SHAPE_FADE_IN_END - DIORAMA_SHAPE_FADE_IN_START));
    const nearT = clamp01__1((distanceToCamera - DIORAMA_SHAPE_DISSOLVE_END) / (DIORAMA_SHAPE_DISSOLVE_START - DIORAMA_SHAPE_DISSOLVE_END));
    const farS = farT * farT * (3 - 2 * farT);
    const nearS = nearT * nearT * (3 - 2 * nearT);
    return farS * nearS;
};

// ======== components/visualizer/diorama/dioramaGeometry ========

const isKindVisible = (kind, visibility) => {
    if (kind === 'box')
        return visibility.strands;
    if (kind === 'sphere')
        return visibility.blobs;
    if (kind === 'cone')
        return visibility.ribbons;
    return visibility.rings;
};
const getClusterRadius = (shape) => {
    const familyRadius = shape.kind === 'box'
        ? 0.5
        : shape.kind === 'sphere'
            ? 0.74
            : shape.kind === 'cone'
                ? 0.68
                : 0.9;
    return shape.scale
        * Math.max(familyRadius, shape.stretchY * 0.55)
        * DIORAMA_PARTICLE_AUDIO_SCALE_MAX;
};
const distanceBetween = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
/**
 * How many lines apart two clusters can still collide. Lines sit DIORAMA_STEP_DISTANCE (8) apart and no
 * cluster's clearance comes close to 16 units, so a rival this far away can never block anything - which
 * is what makes the verdict below computable from a bounded neighbourhood.
 */
const DIORAMA_CLUSTER_COLLISION_LINE_SPAN = 2;
/**
 * Removes only cross-line cluster collisions, so a line's intentional multi-piece composition is never
 * thinned but neighbouring lines whose independently-placed clouds happen to converge in world space
 * don't pile into one bright knot.
 *
 * The verdict is a pure function of the song, NOT of the camera. Input must be sorted by sourceLine
 * ascending; the earlier line always wins, and a candidate is tested against every rival within
 * DIORAMA_CLUSTER_COLLISION_LINE_SPAN whether or not that rival itself survived. Those two rules together
 * mean a given cluster is kept-or-dropped identically forever: no chain of verdicts to unravel, and no
 * dependence on which line is current. (Ranking the input by distance from the current line - the old
 * "active line wins" rule - re-ran this greedy pass in a different order on EVERY line advance, so the
 * whole surrounding composition silently re-shuffled as the camera moved. That was the "everything
 * regenerates when the camera reaches the next lyric" bug.) A sliding mounted window can now only add or
 * remove clusters at its far edges, where the distance fade already hides them.
 */
const selectVisibleDioramaClusters = (shapes, visibility) => {
    if (!visibility.enabled || visibility.mode !== 'clouds')
        return [];
    const candidates = shapes.filter((shape) => isKindVisible(shape.kind, visibility));
    return candidates.filter((candidate, index) => {
        const candidateRadius = getClusterRadius(candidate);
        for (let rivalIndex = index - 1; rivalIndex >= 0; rivalIndex -= 1) {
            const rival = candidates[rivalIndex];
            if (candidate.sourceLine - rival.sourceLine > DIORAMA_CLUSTER_COLLISION_LINE_SPAN)
                break;
            if (rival.sourceLine === candidate.sourceLine)
                continue;
            const clearance = Math.max(1.8, (getClusterRadius(rival) + candidateRadius) * 1.18);
            if (distanceBetween(rival, candidate) < clearance)
                return false;
        }
        return true;
    });
};

// ======== components/visualizer/wordColoring ========
const CJK_REGEX = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
const isCJK = (text) => CJK_REGEX.test(text);
const normalizeWordColorToken = (text) => text.toLowerCase().replace(/[^\w]/g, '');
const resolveWordColorEntryText = (entry) => {
    if (!entry || typeof entry !== 'object' || !('word' in entry)) {
        return '';
    }
    const word = entry.word;
    return typeof word === 'string' ? word.trim() : '';
};
const resolveWordColorEntryColor = (entry) => {
    if (!entry || typeof entry !== 'object' || !('color' in entry)) {
        return '';
    }
    const color = entry.color;
    return typeof color === 'string' ? color : '';
};
const rangesOverlap = (a, b) => (a.startOffset < b.endOffset && b.startOffset < a.endOffset);
const selectNonOverlappingRanges = (ranges) => {
    const selected = [];
    const prioritySorted = [...ranges].sort((a, b) => (b.priority - a.priority
        || a.startOffset - b.startOffset
        || a.endOffset - b.endOffset));
    prioritySorted.forEach(range => {
        if (!selected.some(current => rangesOverlap(current, range))) {
            selected.push(range);
        }
    });
    return selected.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
};
const prepareWordColorMatchers = (wordColors, keywordColoringEnabled = true) => {
    if (!keywordColoringEnabled || !wordColors || wordColors.length === 0) {
        return [];
    }
    return wordColors.flatMap(entry => {
        const target = resolveWordColorEntryText(entry);
        if (!target) {
            return [];
        }
        const color = resolveWordColorEntryColor(entry);
        if (!color) {
            return [];
        }
        if (isCJK(target)) {
            return [{
                    color,
                    cjkPhrases: [target],
                    englishWords: [],
                    priority: target.length,
                }];
        }
        const englishWords = target
            .split(/\s+/)
            .map(normalizeWordColorToken)
            .filter(Boolean);
        if (englishWords.length === 0) {
            return [];
        }
        return [{
                color,
                cjkPhrases: [],
                englishWords,
                priority: Math.max(...englishWords.map(word => word.length)),
            }];
    });
};
/** Builds phrase color ranges once per line so token renderers can resolve colors with a single ordered pass. */
const buildWordColorRangesFromMatchers = (lineText, matchers) => {
    if (!lineText || matchers.length === 0) {
        return [];
    }
    const ranges = [];
    const englishColorByWord = new Map();
    matchers.forEach(matcher => {
        matcher.cjkPhrases.forEach(target => {
            let cursor = 0;
            while (cursor < lineText.length) {
                const startOffset = lineText.indexOf(target, cursor);
                if (startOffset < 0) {
                    break;
                }
                ranges.push({
                    startOffset,
                    endOffset: startOffset + target.length,
                    color: matcher.color,
                    priority: matcher.priority,
                });
                cursor = startOffset + Math.max(target.length, 1);
            }
        });
        matcher.englishWords.forEach(word => {
            const current = englishColorByWord.get(word);
            if (!current || matcher.priority > current.priority) {
                englishColorByWord.set(word, { color: matcher.color, priority: matcher.priority });
            }
        });
    });
    if (englishColorByWord.size > 0) {
        const wordRegex = /\w+/g;
        let match;
        while ((match = wordRegex.exec(lineText)) !== null) {
            const wordColor = englishColorByWord.get(normalizeWordColorToken(match[0]));
            if (wordColor) {
                ranges.push({
                    startOffset: match.index,
                    endOffset: match.index + match[0].length,
                    color: wordColor.color,
                    priority: wordColor.priority,
                });
            }
        }
    }
    return selectNonOverlappingRanges(ranges);
};
const buildWordColorRanges = (lineText, wordColors, keywordColoringEnabled = true) => (buildWordColorRangesFromMatchers(lineText, prepareWordColorMatchers(wordColors, keywordColoringEnabled)));
const resolveWordColor = (wordText, wordColors, fallbackColor, { keywordColoringEnabled = true, cjkMatchMode = 'target-contains-token', } = {}) => {
    if (!keywordColoringEnabled || !wordColors || wordColors.length === 0) {
        return fallbackColor;
    }
    const cleanCurrent = wordText.trim();
    if (!cleanCurrent) {
        return fallbackColor;
    }
    const matched = wordColors.find(entry => {
        const target = resolveWordColorEntryText(entry);
        if (!target) {
            return false;
        }
        if (isCJK(cleanCurrent)) {
            if (cjkMatchMode === 'exact') {
                return target === cleanCurrent;
            }
            if (cjkMatchMode === 'bidirectional-contains') {
                return target.includes(cleanCurrent) || cleanCurrent.includes(target);
            }
            return target.includes(cleanCurrent);
        }
        const targetWords = target
            .split(/\s+/)
            .map(normalizeWordColorToken)
            .filter(Boolean);
        const normalizedCurrent = normalizeWordColorToken(cleanCurrent);
        return Boolean(normalizedCurrent) && targetWords.includes(normalizedCurrent);
    });
    return resolveWordColorEntryColor(matched) || fallbackColor;
};
const resolveTokenColorMap = (tokens, ranges) => {
    const colors = new Map();
    let rangeIndex = 0;
    tokens.forEach(token => {
        if (!token.timed) {
            return;
        }
        while (rangeIndex < ranges.length && ranges[rangeIndex].endOffset <= token.startOffset) {
            rangeIndex += 1;
        }
        const range = ranges[rangeIndex];
        if (range && rangesOverlap(range, token)) {
            colors.set(token.key, range.color);
        }
    });
    return colors;
};

// ======== components/visualizer/diorama/dioramaMoteField ========


// src/components/visualizer/diorama/dioramaMoteField.ts
// The background mote field: fine dust drifting through the corridor, giving the flight something to
// parallax against.
//
// It is a SLIDING WINDOW, not a song. The field this replaced laid every line of the whole song out at
// once into one static buffer, which put the camera in the wrong place twice over: nothing was ever near
// it (six motes per 8-unit step, so ~5 in the whole 5-15 unit band), while the far end of the path -
// dozens of lines, hundreds of motes - stacked up behind perspective into a single bright knot. Both
// symptoms were the same buffer seen from its two ends.
//
// So: only a short window of lines around the read head is ever resident, in a RING BUFFER keyed by line
// index (slot = line mod WINDOW). As the read head advances, the line falling off the back is overwritten
// in place by the line entering at the front - that is the whole recycling mechanism, and it costs one
// line's worth of writes per line advance. Nothing outside the window exists to clump.
//
// The window's ends are chosen so that recycling is never SEEN: a line is born at +5 (40 units ahead,
// past the fog's 30-unit reach, so it fades up out of the haze) and retired at -3 (24 units behind the
// camera, out of frustum). Fog is load-bearing for that - see DioramaScene's scene.fog.
/** Lines of motes kept resident behind / ahead of the read head. */
const DIORAMA_MOTE_LINES_BEHIND = 2;
const DIORAMA_MOTE_LINES_AHEAD = 5;
const DIORAMA_MOTE_WINDOW_LINES = DIORAMA_MOTE_LINES_BEHIND + DIORAMA_MOTE_LINES_AHEAD + 1;
/** Worst-case points the layer can ever draw - the density cap's whole reason for existing. */
const DIORAMA_MOTE_MAX_POINTS = DIORAMA_MOTE_WINDOW_LINES
    * DIORAMA_MOTE_CIRCUMFERENCE_MAX * DIORAMA_MOTE_RADIAL_MAX;
/** Clamp a requested 圆周 count (motes around each ring) into its safe range. */
const resolveDioramaMoteCircumference = (requested) => Math.round(Math.min(DIORAMA_MOTE_CIRCUMFERENCE_MAX, Math.max(DIORAMA_MOTE_CIRCUMFERENCE_MIN, Number.isFinite(requested) ? requested : DEFAULT_DIORAMA_TUNING.backgroundParticleCircumference)));
/** Clamp a requested 径向 count (layers across the shell thickness) into its safe range. */
const resolveDioramaMoteRadial = (requested) => Math.round(Math.min(DIORAMA_MOTE_RADIAL_MAX, Math.max(DIORAMA_MOTE_RADIAL_MIN, Number.isFinite(requested) ? requested : DEFAULT_DIORAMA_TUNING.backgroundParticleRadial)));
/** Motes drawn per line = 圆周 x 径向, both already clamped. */
const resolveDioramaMoteCount = (circumference, radial) => resolveDioramaMoteCircumference(circumference) * resolveDioramaMoteRadial(radial);
/** Which ring-buffer slot a line owns. Consecutive lines always land in distinct slots. */
const dioramaMoteSlot = (line) => (((line % DIORAMA_MOTE_WINDOW_LINES) + DIORAMA_MOTE_WINDOW_LINES) % DIORAMA_MOTE_WINDOW_LINES);
// Motes sit in an elliptical shell around the path axis. The inner clearance is what keeps them off the
// lyrics and out of the camera's own rail - the camera flies down the axis and the text hangs near it, so
// an empty tube around it is the whole "don't obscure, don't sit dead ahead" rule. The outer radius stays
// inside the corridor's 7.4 wall, so in corridor mode the dust reads as air inside the tunnel.
const MOTE_INNER_RADIUS = 2.4;
const MOTE_RADIAL_SPAN = 5.2;
const MOTE_VERTICAL_SQUASH = 0.64;
/**
 * Radical inverse (van der Corput) - a low-discrepancy sequence that is stratified but NOT correlated
 * with the linear order of the index. Depth needs that: radius already ramps with `p`, so drawing depth
 * from `p` too would rake every line's motes into a visible helix instead of a cloud.
 */
const radicalInverse = (index, base) => {
    let result = 0;
    let fraction = 1 / base;
    let i = index;
    while (i > 0) {
        result += (i % base) * fraction;
        i = Math.floor(i / base);
        fraction /= base;
    }
    return result;
};
/**
 * Straight procedural extension of a path frame, `steps` lines past its own position. The path's frames
 * only exist where lyrics do; this carries the same heading onward so a field (or a tunnel) can keep
 * going past the last line instead of ending on a cut.
 */
const extendDioramaFrame = (frame, steps) => (steps === 0 ? frame : {
    position: {
        x: frame.position.x + frame.forward.x * DIORAMA_STEP_DISTANCE * steps,
        y: frame.position.y + frame.forward.y * DIORAMA_STEP_DISTANCE * steps,
        z: frame.position.z + frame.forward.z * DIORAMA_STEP_DISTANCE * steps,
    },
    forward: frame.forward,
    right: frame.right,
    up: frame.up,
});
/**
 * Writes one line's motes into that line's ring-buffer slot. Deterministic per (seed, line): the same
 * line always regenerates the same dust, so a loop or a re-entry into the window does not reshuffle it.
 *
 * The placement is a phyllotaxis disc crossed with a Hammersley depth: the golden angle spreads the
 * motes around the ring and keeps CONSECUTIVE lines out of phase with each other (the sample index runs
 * across the whole field, not per line), sqrt-stratified radius makes the shell area-uniform rather than
 * centre-heavy, and the radical inverse spreads depth across the step. Seeded jitter on each breaks the
 * lattice up so the regularity never reads as a pattern.
 */
const writeDioramaMoteLine = (out, frame, line, circumference, radial, seed) => {
    const base = hashSeed(seed);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const twoPi = Math.PI * 2;
    const phase = seededUnit(base + 991) * twoPi;
    const total = circumference * radial;
    let write = dioramaMoteSlot(line) * total * 3;
    // Two INDEPENDENT axes: `radial` layers across the shell thickness, `circumference` motes around each.
    // The layer index drives the radius (sqrt-stratified so the shell stays area-uniform, not centre-heavy);
    // the segment index drives the angle (evenly spaced round the ring). Decorrelation keeps it from ever
    // reading as a rigid grid: each LINE and each LAYER is rotated by the golden angle (so consecutive lines
    // and stacked layers never align into spokes), plus a seeded half-cell jitter on angle and radius.
    for (let ri = 0; ri < radial; ri += 1) {
        for (let ci = 0; ci < circumference; ci += 1) {
            const p = ri * circumference + ci;
            const s = base + line * 131 + p * 17;
            const stratum = (ri + 0.35 + seededUnit(s + 4) * 0.3) / radial;
            const radius = MOTE_INNER_RADIUS + Math.sqrt(stratum) * MOTE_RADIAL_SPAN;
            const angle = phase + (line + ri) * goldenAngle
                + (ci / circumference) * twoPi
                + (seededUnit(s + 3) - 0.5) * (twoPi / circumference);
            const depth = (radicalInverse(p + 1, 2) + (seededUnit(s + 2) - 0.5) / total - 0.5)
                * DIORAMA_STEP_DISTANCE;
            const point = composeLocal(frame, Math.cos(angle) * radius, Math.sin(angle) * radius * MOTE_VERTICAL_SQUASH, depth);
            out[write] = point.x;
            out[write + 1] = point.y;
            out[write + 2] = point.z;
            write += 3;
        }
    }
};

// ======== components/visualizer/diorama/dioramaSequencer ========
// src/components/visualizer/diorama/dioramaSequencer.ts
// The 3D camera-transition state machine for the diorama flythrough.
//
// The diorama used to be strictly per-song: one corridor built at world origin, and a song change /
// single-loop restart snapped the camera back to origin (masked by a flat fade overlay). That masked
// the cut instead of performing it. This sequencer instead keeps every song (and every loop-round) as a
// corridor SEGMENT living at its OWN place in one shared world: the transition controller spawns each new
// segment at a deliberate offset (dioramaTransition.ts) far from the current one, and the camera flies
// the gap. Line indices are GLOBAL across segments, so the mounted window can hold two segments at once -
// the outgoing scene receding into the fog behind while the incoming scene emerges from the fog ahead.
// No overlay, no black, no snapshot layer, the picture never hidden.
//
// This module is pure (no React, no three.js) so the whole state machine is unit-testable. The React
// orchestrator (VisualizerDiorama) owns one SequencerState in a ref, appends on transition edges, and
// hands the segments + a global index to CameraRig / DioramaScene, which resolve frames/lines through it.

const createSequencerState = () => ({ segments: [], nextGlobalStart: 0 });
/** The active (newest) segment - the one currently playing. Null before the first append. */
const activeSegment = (state) => state.segments[state.segments.length - 1] ?? null;
/**
 * Append a song/round as a new segment placed at `placementOrigin` (world position of its LOCAL line 0)
 * and make it active. The transition controller passes an origin offset well away from the outgoing
 * corridor so the two scenes coexist in one space and the camera flies the gap between them; the very
 * first song is placed at the world origin (unchanged first-song behaviour). Advances the global index
 * by at least one slot so even a lyric-less song occupies real space.
 */
const appendSegment = (state, input) => {
    const raw = buildDioramaPath(input.lines.length, input.seed);
    const frames = translateFrames(raw, input.placementOrigin);
    const span = Math.max(input.lines.length, 1);
    const segment = {
        key: `${String(input.seed)}#${input.round}`,
        seed: input.seed,
        round: input.round,
        lines: input.lines,
        frames,
        globalStart: state.nextGlobalStart,
        span,
        placementOrigin: input.placementOrigin,
        linesEpoch: 0,
    };
    state.segments.push(segment);
    state.nextGlobalStart += span;
    return segment;
};
/**
 * Rebuild the ACTIVE (newest) segment's lines/frames in place, at the SAME world origin, keeping its
 * globalStart. Used when a song's lyrics load AFTER its corridor was already spawned (online URL/lyric
 * fetch resolves a render or seconds later than the track switch) - the corridor keeps its identity and
 * place, so there is NO second corridor and NO camera snap; only its geometry catches up. The active
 * segment is the last one, so nextGlobalStart is just its globalStart + span; adjust it by the span delta.
 */
const updateActiveSegmentLines = (state, lines) => {
    const seg = state.segments[state.segments.length - 1];
    if (!seg)
        return;
    const raw = buildDioramaPath(lines.length, seg.seed);
    const span = Math.max(lines.length, 1);
    state.nextGlobalStart += span - seg.span;
    seg.lines = lines;
    seg.frames = translateFrames(raw, seg.placementOrigin);
    seg.span = span;
    seg.linesEpoch += 1;
};
/** Exclusive upper bound of the global index space (one past the last valid line). */
const totalGlobalLines = (state) => state.nextGlobalStart;
/** Resolve a global index to its segment/local line/world frame/lyric, or null if outside kept segments. */
const resolveGlobal = (state, globalIndex) => {
    for (const segment of state.segments) {
        const localIndex = globalIndex - segment.globalStart;
        if (localIndex >= 0 && localIndex < segment.span) {
            return {
                segment,
                localIndex,
                frame: getFrame(segment.frames, localIndex),
                line: segment.lines[localIndex] ?? null,
            };
        }
    }
    return null;
};
/**
 * Drop segments that lie entirely behind `keepFromGlobal` (the back edge of the mounted window) - the
 * camera has flown past them and their lines have long since unmounted. The active segment always spans
 * the current index, so it is never pruned. Keeps memory bounded across an endless session.
 */
const pruneSegments = (state, keepFromGlobal) => {
    if (state.segments.length <= 1)
        return;
    state.segments = state.segments.filter((segment) => segment.globalStart + segment.span - 1 >= keepFromGlobal);
};

// ======== components/visualizer/diorama/dioramaParticleCorridor ========



// src/components/visualizer/diorama/dioramaParticleCorridor.ts
// One line-local span of the always-on point tunnel. No audio triggers, no camera tracking, no morph:
// the corridor is a fixed cylinder threaded straight along the flight path, so it can never drift off
// centre or pop into a different shape. Rings are sampled from these spans in dioramaParticleModel.ts.
const DIORAMA_PARTICLE_CORRIDOR_RADIUS = 7.4;
/** Builds one line-local tunnel span; it never bridges across a song-segment transition gap. */
const buildDioramaParticleCorridorSpan = (frame, nextFrame, pathStart, enabled) => {
    const start = { ...frame.position };
    const end = nextFrame != null
        ? { ...nextFrame.position }
        : {
            x: start.x + frame.forward.x * DIORAMA_STEP_DISTANCE,
            y: start.y + frame.forward.y * DIORAMA_STEP_DISTANCE,
            z: start.z + frame.forward.z * DIORAMA_STEP_DISTANCE,
        };
    return {
        start,
        end,
        startRight: frame.right,
        endRight: nextFrame ? nextFrame.right : frame.right,
        startUp: frame.up,
        endUp: nextFrame ? nextFrame.up : frame.up,
        pathStart,
        enabled,
    };
};
/**
 * One continuous run of tunnel around `center`, built INSIDE that line's own segment and extended
 * procedurally past the segment's ends.
 *
 * Both of those matter, and both were bugs:
 *  - The window is NOT clamped to the lyric range. Clamping meant nothing existed to mount past a song's
 *    last line, so the tunnel stopped dead a few units in front of the camera and you looked straight out
 *    of its open end. Out past the lyrics the path simply keeps its heading, and the rings keep the same
 *    radius, spacing, wave phase and amplitude - the extension IS the same cylinder, just with no words in
 *    it, so there is nothing to taper and no seam where the lyric-bound section hands over.
 *  - Indices resolve against the window's OWN segment. During a song change the read head has already
 *    jumped to the new segment, so resolving globally walked the outgoing window's outer indices into the
 *    NEW corridor (TRANSITION_DISTANCE away) and the live window's lower indices back into the OLD one.
 *    Each tunnel now extends itself, and the two overlap in the fog instead of reaching into each other.
 */
const buildDioramaParticleCorridorWindow = (sequencer, center, behind, ahead) => {
    const anchor = resolveGlobal(sequencer, center);
    if (!anchor)
        return [];
    const { segment } = anchor;
    const first = segment.globalStart;
    const last = segment.globalStart + segment.span - 1;
    const frameAt = (index) => {
        const clamped = Math.min(Math.max(index, first), last);
        return extendDioramaFrame(getFrame(segment.frames, clamped - first), index - clamped);
    };
    const spans = [];
    for (let i = center - behind; i <= center + ahead; i += 1) {
        // frameAt(i + 1) rather than the raw next frame: it is the same straight continuation past the
        // ends, so every span's end is exactly the next span's start and the rings never gap.
        spans.push(buildDioramaParticleCorridorSpan(frameAt(i), frameAt(i + 1), i, true));
    }
    return spans;
};

// ======== components/visualizer/diorama/dioramaParticleSurfaces ========
const surfaceCache = new Map();
const TWO_PI = Math.PI * 2;
const BOX_HALF = 0.55;
const CYLINDER_RADIUS = 0.58;
const CYLINDER_HALF_HEIGHT = 0.75;
const TORUS_MAJOR = 0.68;
const TORUS_TUBE = 0.12;
const TETRA_VERTICES = [
    [0, 0.86, 0],
    [-0.81, -0.5, 0.47],
    [0.81, -0.5, 0.47],
    [0, -0.5, -0.94],
];
const TETRA_FACES = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];
const TETRA_CENTER = [0, -0.16, 0];
const push = (out, p, n) => {
    out.positions.push(p[0], p[1], p[2]);
    out.normals.push(n[0], n[1], n[2]);
};
const unit = (x, y, z) => {
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
};
/**
 * The outward direction for the flat-faced primitives (box, tetrahedron): straight out from the shape's
 * centre. It is the SMOOTHEST continuous field available, which is what matters - the direction is what
 * the shader displaces along, so how fast it turns between neighbours decides whether the lattice tears.
 * At a face centre it still equals the true face normal; toward an edge it leans over gradually, so a
 * swell inflates the shape elastically instead of sliding each face off on its own vector.
 *
 * A sharper superellipsoid normal (|p/half|^5) was tried to keep the faces flatter, and measurably tore:
 * it crams the whole turn into the last lattice step, leaving points either side of an edge 58 degrees
 * apart - at full swell that is ~2x the lattice spacing of relative motion, i.e. a visible split.
 */
const radialNormal = (p, center = [0, 0, 0]) => unit(p[0] - center[0], p[1] - center[1], p[2] - center[2]);
const countBoxShell = (across, tall) => (2 * (across * tall + tall * across + across * across) - 4 * (across + tall + across) + 8);
/** The largest shell that fits the budget and stays evenly spaced once the shader applies yStretch. */
const resolveBoxShell = (budget, stretchY) => {
    let best = [2, 2];
    for (let across = 2; across <= 96; across += 1) {
        const tall = Math.max(2, Math.round(1 + (across - 1) * stretchY));
        if (countBoxShell(across, tall) > budget)
            break;
        best = [across, tall];
    }
    return best;
};
/** One closed shell: every edge and corner point exists exactly once, shared by the faces that meet there. */
const buildBoxSurface = (budget, stretchY, out) => {
    const [across, tall] = resolveBoxShell(budget, stretchY);
    const axis = (index, steps) => (index / (steps - 1) - 0.5) * 2 * BOX_HALF;
    // The shell is sampled on a regular grid; the widest step is the coarsest of the three axes.
    out.spacing = (2 * BOX_HALF) / Math.max(1, Math.min(across, tall) - 1);
    for (let iy = 0; iy < tall; iy += 1) {
        for (let iz = 0; iz < across; iz += 1) {
            for (let ix = 0; ix < across; ix += 1) {
                const interior = ix > 0 && ix < across - 1
                    && iy > 0 && iy < tall - 1
                    && iz > 0 && iz < across - 1;
                if (interior)
                    continue;
                const p = [axis(ix, across), axis(iy, tall), axis(iz, across)];
                push(out, p, radialNormal(p));
            }
        }
    }
};
/** A ring grid: already welded (the angle wraps) and its radial normal is already continuous. */
const buildCylinderSurface = (budget, stretchY, out) => {
    // Aim for square cells on the STRETCHED wall: circumference vs the stretched height.
    const aspect = (TWO_PI * CYLINDER_RADIUS) / (2 * CYLINDER_HALF_HEIGHT * Math.max(0.2, stretchY));
    const rows = Math.max(2, Math.round(Math.sqrt(budget / Math.max(0.1, aspect))));
    const columns = Math.max(3, Math.floor(budget / rows));
    // Rows are spaced up the UNSTRETCHED wall (the field reads the unstretched position); columns by arc.
    out.spacing = Math.max((2 * CYLINDER_HALF_HEIGHT) / (rows - 1), (TWO_PI * CYLINDER_RADIUS) / columns);
    for (let row = 0; row < rows; row += 1) {
        const y = (row / (rows - 1) - 0.5) * 2 * CYLINDER_HALF_HEIGHT;
        for (let column = 0; column < columns; column += 1) {
            const angle = (column / columns) * TWO_PI;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            push(out, [cosine * CYLINDER_RADIUS, y, sine * CYLINDER_RADIUS], [cosine, 0, sine]);
        }
    }
};
/**
 * Barycentric lattices that INCLUDE each face's boundary, so the four faces land identical points along
 * their six shared edges. Those coincident points are left in place rather than deduplicated: the shader's
 * displacement is a pure function of position, so they always move as one and simply read as one point.
 */
const buildTetrahedronSurface = (budget, out) => {
    let steps = 1;
    while (TETRA_FACES.length * (((steps + 2) * (steps + 3)) / 2) <= budget)
        steps += 1;
    // Every edge of a regular tetrahedron with these vertices is ~1.63 long, cut into `steps` spans.
    out.spacing = Math.hypot(TETRA_VERTICES[0][0] - TETRA_VERTICES[1][0], TETRA_VERTICES[0][1] - TETRA_VERTICES[1][1], TETRA_VERTICES[0][2] - TETRA_VERTICES[1][2]) / steps;
    for (const [first, second, third] of TETRA_FACES) {
        const a = TETRA_VERTICES[first];
        const b = TETRA_VERTICES[second];
        const c = TETRA_VERTICES[third];
        for (let i = 0; i <= steps; i += 1) {
            for (let j = 0; j <= steps - i; j += 1) {
                const wa = i / steps;
                const wb = j / steps;
                const wc = 1 - wa - wb;
                const p = [0, 1, 2].map((axis) => (a[axis] * wa + b[axis] * wb + c[axis] * wc));
                push(out, p, radialNormal(p, TETRA_CENTER));
            }
        }
    }
};
/** Already welded (both angles wrap) and its tube normal is already a smooth field. */
const buildTorusSurface = (budget, out) => {
    const minor = Math.max(4, Math.round(Math.sqrt(budget / 4)));
    const major = Math.max(6, Math.floor(budget / minor));
    out.spacing = Math.max((TWO_PI * (TORUS_MAJOR + TORUS_TUBE)) / major, (TWO_PI * TORUS_TUBE) / minor);
    for (let i = 0; i < major; i += 1) {
        const majorAngle = (i / major) * TWO_PI;
        const majorCosine = Math.cos(majorAngle);
        const majorSine = Math.sin(majorAngle);
        for (let j = 0; j < minor; j += 1) {
            const minorAngle = (j / minor) * TWO_PI;
            const minorCosine = Math.cos(minorAngle);
            const minorSine = Math.sin(minorAngle);
            const radius = TORUS_MAJOR + TORUS_TUBE * minorCosine;
            push(out, [radius * majorCosine, TORUS_TUBE * minorSine, radius * majorSine], [minorCosine * majorCosine, minorSine, minorCosine * majorSine]);
        }
    }
};
const buildDioramaStructuredSurface = (kind, budget, stretchY = 1) => {
    // Bucket the stretch so a continuous slider still hits a small, stable set of cached lattices.
    const stretchKey = Math.round(Math.max(0.2, stretchY) * 4) / 4;
    const cacheKey = `${kind}:${budget}:${stretchKey}`;
    const cached = surfaceCache.get(cacheKey);
    if (cached)
        return cached;
    const out = { positions: [], normals: [], spacing: 0 };
    if (kind === 'box')
        buildBoxSurface(budget, stretchKey, out);
    else if (kind === 'sphere')
        buildCylinderSurface(budget, stretchKey, out);
    else if (kind === 'cone')
        buildTetrahedronSurface(budget, out);
    else
        buildTorusSurface(budget, out);
    const positions = Float32Array.from(out.positions);
    const normals = Float32Array.from(out.normals);
    const count = positions.length / 3;
    let total = 0;
    for (let index = 0; index < count; index += 1) {
        total += Math.hypot(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    }
    const radius = count > 0 ? total / count : 1;
    const surface = {
        positions,
        normals,
        radius,
        count,
        // Into the unit space the shader reads the field in (position / radius).
        spacing: out.spacing / radius,
    };
    surfaceCache.set(cacheKey, surface);
    return surface;
};

// ======== components/visualizer/diorama/dioramaParticleModel ========
var THREE = THREE;
// src/components/visualizer/diorama/dioramaParticleModel.ts
// Builds the deterministic point buffers for BOTH geometry modes (formation clouds and the path tunnel)
// against one shared attribute layout, and owns the shared audio-response shaping + performance cap.
// Keeping one layout means a single shader/material renders whichever mode is active.
const DIORAMA_MAX_PARTICLE_POINTS = 65536;
// Per-unit point counts are FIXED (they only follow the density slider), NOT divided by how many units
// are currently mounted. That is the fix for the abrupt re-tessellation on every line advance: a given
// cloud/tunnel-section tessellates identically no matter how many neighbours are on screen, so the
// overlapping region is pixel-identical frame to frame and the mounted window can slide without a jump.
const DIORAMA_MAX_CLOUD_POINTS_PER_CLUSTER = 1024;
const DIORAMA_MAX_CORRIDOR_POINTS_PER_SPAN = 2048;
const FAMILY_INDEX = {
    box: 0,
    sphere: 1,
    cone: 2,
    torus: 3,
};
const normalizeDensity = (density) => {
    const clamped = Math.min(DIORAMA_PARTICLE_DENSITY_MAX, Math.max(DIORAMA_PARTICLE_DENSITY_MIN, density));
    return Math.max(DIORAMA_PARTICLE_DENSITY_MIN, Math.floor(clamped / DIORAMA_PARTICLE_DENSITY_STEP) * DIORAMA_PARTICLE_DENSITY_STEP);
};
/**
 * The shortest wavelength a lattice of this spacing can carry, as a wavenumber (k = 2*PI/wavelength).
 * Four samples per wavelength is the practical floor: at two (true Nyquist) neighbouring points land on
 * opposite phases and a crest reads as scattered dots, which is exactly the artefact we must not produce.
 * Because it is derived from the ACTUAL lattice, the density slider now raises and lowers the detail
 * ceiling honestly instead of us hard-coding a number that only holds at one density.
 */
const resolveWaveNumberMax = (spacing) => ((Math.PI * 2) / Math.max(1e-4, spacing * 4));
const allocate = (pointCount, pointsPerUnit, spacing) => ({
    positions: new Float32Array(pointCount * 3),
    normals: new Float32Array(pointCount * 3),
    anchors: new Float32Array(pointCount * 3),
    scales: new Float32Array(pointCount * 3),
    phases: new Float32Array(pointCount),
    styles: new Float32Array(pointCount * 3),
    waves: new Float32Array(pointCount * 2),
    pointCount,
    pointsPerUnit,
    spacing,
});
const writeStyle = (data, index, family, colorSlot, isFar) => {
    const offset = index * 3;
    data.styles[offset] = family;
    data.styles[offset + 1] = colorSlot;
    data.styles[offset + 2] = isFar;
};
/** Expands each visible formation anchor into a deterministic surface lattice (the 'clouds' mode). */
const buildDioramaCloudGeometryData = (clusters, density) => {
    // The BUDGET stays count-independent (it only follows the density slider), but each welded lattice
    // lands on its own honest point count under it, so the buffer is sized from the surfaces themselves.
    const budget = normalizeDensity(Math.min(density, DIORAMA_MAX_CLOUD_POINTS_PER_CLUSTER));
    const surfaces = clusters.map((cluster) => (buildDioramaStructuredSurface(cluster.kind, budget, cluster.stretchY)));
    const pointCount = surfaces.reduce((sum, surface) => sum + surface.count, 0);
    // One shared buffer draws every cluster, so the detail ceiling has to satisfy the COARSEST lattice
    // present - a fine sphere must not be allowed to alias the tetrahedron drawn alongside it.
    const spacing = surfaces.reduce((widest, surface) => Math.max(widest, surface.spacing), 0);
    const data = allocate(pointCount, budget, spacing);
    let target = 0;
    clusters.forEach((cluster, clusterIndex) => {
        const surface = surfaces[clusterIndex];
        const seed = hashSeed(`${cluster.particleSeed}|${cluster.kind}`);
        // One shared phase keeps every vertex of a cluster inside the same coherent ripple field.
        const clusterPhase = seededUnit(seed + 31) * Math.PI * 2;
        const family = FAMILY_INDEX[cluster.kind];
        const isFar = cluster.layer === 'far' ? 1 : 0;
        for (let pointIndex = 0; pointIndex < surface.count; pointIndex += 1, target += 1) {
            const v = target * 3;
            const s = target * 3;
            const px = surface.positions[pointIndex * 3];
            const py = surface.positions[pointIndex * 3 + 1];
            const pz = surface.positions[pointIndex * 3 + 2];
            data.positions[v] = px;
            data.positions[v + 1] = py;
            data.positions[v + 2] = pz;
            data.normals[v] = surface.normals[pointIndex * 3];
            data.normals[v + 1] = surface.normals[pointIndex * 3 + 1];
            data.normals[v + 2] = surface.normals[pointIndex * 3 + 2];
            data.anchors[v] = cluster.position.x;
            data.anchors[v + 1] = cluster.position.y;
            data.anchors[v + 2] = cluster.position.z;
            data.scales[s] = cluster.scale;
            data.scales[s + 1] = cluster.stretchY;
            data.scales[s + 2] = surface.radius;
            data.phases[target] = clusterPhase;
            // Clouds no longer wave off this coordinate - their ripple field is a pure function of
            // position (see the shader). It survives only as the per-point seed the dissolve scatters by,
            // since aPhase alone is constant across a whole cluster.
            data.waves[target * 2] = clusterPhase + (px + pz * 0.6) * 2.2;
            data.waves[target * 2 + 1] = clusterPhase * 0.7 + py * 2.6;
            writeStyle(data, target, family, cluster.colorSlot, isFar);
        }
    });
    return data;
};
const normalizeVec = (x, y, z) => {
    const length = Math.hypot(x, y, z) || 1;
    return { x: x / length, y: y / length, z: z / length };
};
// Ring segment count grows with the per-span budget so the tunnel wall stays evenly tessellated at
// every density without ever exceeding it.
const resolveRingSegments = (pointsPerSpan) => (Math.max(12, Math.min(256, Math.round(Math.sqrt(pointsPerSpan * 2.4)))));
/**
 * Sweeps a regular ring grid straight along the mounted path spans (the 'corridor' mode). Ring centres
 * ride the exact path centres and the radius is constant, so the tunnel is a true cylinder that can
 * never drift, tilt off the path or morph. Deterministic: identical spans yield identical buffers.
 */
const buildDioramaCorridorGeometryData = (spans, density, radius = DIORAMA_PARTICLE_CORRIDOR_RADIUS) => {
    const activeSpans = spans.filter((span) => span.enabled);
    const spanCount = activeSpans.length;
    const pointsPerSpan = normalizeDensity(Math.min(density, DIORAMA_MAX_CORRIDOR_POINTS_PER_SPAN));
    const ringSegments = resolveRingSegments(pointsPerSpan);
    const rings = Math.max(1, Math.floor(pointsPerSpan / ringSegments));
    const perSpan = ringSegments * rings;
    const pointCount = spanCount * perSpan;
    // One span spans DIORAMA_STEP_DISTANCE of path; expressed in radius units (the field's space) that is
    // spanUnits, cut into `rings`. Around, the gap is the ring arc. The coarser of the two is the ceiling.
    const spanUnits = DIORAMA_STEP_DISTANCE / radius;
    const spacing = Math.max(spanUnits / Math.max(1, rings), (Math.PI * 2) / ringSegments);
    const data = allocate(pointCount, perSpan, spacing);
    let target = 0;
    activeSpans.forEach((span) => {
        for (let ring = 0; ring < rings; ring += 1) {
            // Depth along this span; a whole ring shares one centre and basis so it stays circular.
            const t = rings > 1 ? ring / (rings - 1) : 0.5;
            const cx = span.start.x + (span.end.x - span.start.x) * t;
            const cy = span.start.y + (span.end.y - span.start.y) * t;
            const cz = span.start.z + (span.end.z - span.start.z) * t;
            const right = normalizeVec(span.startRight.x + (span.endRight.x - span.startRight.x) * t, span.startRight.y + (span.endRight.y - span.startRight.y) * t, span.startRight.z + (span.endRight.z - span.startRight.z) * t);
            const up = normalizeVec(span.startUp.x + (span.endUp.x - span.startUp.x) * t, span.startUp.y + (span.endUp.y - span.startUp.y) * t, span.startUp.z + (span.endUp.z - span.startUp.z) * t);
            // ABSOLUTE longitudinal (global path coordinate), so the wave phase at a given world section is
            // identical no matter where the mounted window starts - the tunnel never rolls when it slides.
            const longitudinal = span.pathStart + t;
            for (let segment = 0; segment < ringSegments; segment += 1) {
                const angle = (segment / ringSegments) * Math.PI * 2;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const radial = normalizeVec(right.x * cos + up.x * sin, right.y * cos + up.y * sin, right.z * cos + up.z * sin);
                const v = target * 3;
                const s = target * 3;
                data.positions[v] = radial.x * radius;
                data.positions[v + 1] = radial.y * radius;
                data.positions[v + 2] = radial.z * radius;
                data.normals[v] = radial.x;
                data.normals[v + 1] = radial.y;
                data.normals[v + 2] = radial.z;
                data.anchors[v] = cx;
                data.anchors[v + 1] = cy;
                data.anchors[v + 2] = cz;
                data.scales[s] = 1;
                data.scales[s + 1] = 1;
                // The tunnel's own size, so its swell is the same fraction-of-radius the clouds get.
                data.scales[s + 2] = radius;
                // Phase carries NO angular term. It used to be `longitudinal * 1.7 + angle * 0.35`, and
                // since angle jumps 2*PI back to 0 at the seam, that alone stepped the phase by 2.2 rad
                // there - which the whole-body sway below then turned into a visible ring-wide offset. A
                // ring shares one phase now, so it sways as one rigid ring, which is what a tunnel does.
                data.phases[target] = longitudinal * 1.7;
                // Wave coordinate = (along the tunnel, angle around it), the tunnel's surface parameters.
                // `along` is in RADIUS UNITS so it is the same unit space the clouds' field lives in and
                // one set of ripple parameters drives both modes. The angle stays raw; the shader wraps it
                // (see corridorSurfaceDelta) rather than us baking a discontinuity into the buffer.
                data.waves[target * 2] = longitudinal * spanUnits;
                data.waves[target * 2 + 1] = angle;
                // A slow colour band alternates along the tunnel so loud regions read as coloured waves.
                // Keyed off the absolute path coordinate so the banding is stable as the window slides.
                writeStyle(data, target, 3, (Math.round(span.pathStart) + ring) % 2, 0);
                target += 1;
            }
        }
    });
    return data;
};
/** Single draw-call geometry for either mode; the owner disposes it when replaced or unmounted. */
const createDioramaBufferGeometry = (data) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('aNormal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('aAnchor', new THREE.BufferAttribute(data.anchors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(data.scales, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(data.phases, 1));
    geometry.setAttribute('aStyle', new THREE.BufferAttribute(data.styles, 3));
    geometry.setAttribute('aWave', new THREE.BufferAttribute(data.waves, 2));
    geometry.setDrawRange(0, data.pointCount);
    return geometry;
};
const stepDioramaEnvelope = (current, target, attack, release, delta) => current + (target - current) * (1 - Math.exp(-(target > current ? attack : release) * delta));
const clamp01__2 = (value) => Math.min(1, Math.max(0, value));
const createDioramaBandTracker = () => ({
    fast: 0, floor: 0, peak: 0, armed: false, primed: false,
});
const FAST_ATTACK = 22;
const FAST_RELEASE = 7;
/**
 * The floor's rise has to clear a real range: slow enough that a hit cannot drag it up to itself, fast
 * enough to SETTLE into the gaps of a dense band. Too slow and a continuous band (sustained hi-hats) never
 * lets the floor reach its valleys, the transient never falls back to the re-arm level, and the trigger
 * latches armed - measurably zero onsets in 40s at 0.35, against ~3.7/s at 2.0. A 2 Hz kick reads
 * identically either way (its gaps are long), so one value serves every band; 2.5 keeps margin over the
 * cliff between 1.4 and 2.0.
 */
const FLOOR_RISE = 2.5;
const FLOOR_FALL = 4;
const PEAK_RISE = 9;
const PEAK_FALL = 0.28;
/** Floors both denominators, so a silent or near-silent band can never be amplified into noise. */
const MIN_RANGE = 0.12;
const MIN_PEAK = 0.22;
/** Hysteresis. One ripple per hit: fire crossing HIGH, re-arm only after falling back under LOW. */
const TRIGGER_HIGH = 0.42;
const TRIGGER_LOW = 0.2;
const stepDioramaBandTracker = (state, level, delta) => {
    const safe = clamp01__2(level);
    if (!state.primed) {
        // Start ON the signal, not at zero: otherwise the first frames read a full-scale transient that
        // nothing later in the song can match.
        state.fast = safe;
        state.floor = safe;
        state.peak = safe;
        state.primed = true;
    }
    else {
        state.fast = stepDioramaEnvelope(state.fast, safe, FAST_ATTACK, FAST_RELEASE, delta);
        state.floor = stepDioramaEnvelope(state.floor, safe, FLOOR_RISE, FLOOR_FALL, delta);
        state.peak = stepDioramaEnvelope(state.peak, safe, PEAK_RISE, PEAK_FALL, delta);
    }
    const range = Math.max(MIN_RANGE, state.peak - state.floor);
    const transient = clamp01__2((state.fast - state.floor) / range);
    const sustained = clamp01__2(state.fast / Math.max(MIN_PEAK, state.peak));
    let onset = false;
    if (!state.armed && transient >= TRIGGER_HIGH) {
        state.armed = true;
        onset = true;
    }
    else if (state.armed && transient <= TRIGGER_LOW) {
        state.armed = false;
    }
    return { transient, sustained, onset };
};
/**
 * Each band spawns its OWN SCALE of ripple, so a track never reads as one size of bump at one speed:
 * bass throws slow, wide, long-wavelength swells across the whole shape; treble flicks small, fast, tight
 * ones. Widths and speeds are in units of the geometry's own radius, and the corridor's surface distance
 * is measured in the same units, so one set of numbers drives both modes.
 *
 * Strengths are stated BEFORE the packet's own envelopes, which measurably swallow ~80% of them (the
 * Gaussian width, the age decay and the distance decay all multiply in), so they read far higher than the
 * swell they actually produce - a peak here lands near a full-strength wavefront, not 4x one.
 *
 * Wavenumbers are a REQUEST, not a promise: the shader clamps each against the buffer's real lattice
 * spacing (uWaveNumberMax), because a wavelength under ~4 lattice steps puts neighbouring points on
 * opposite phases and the crest breaks into what reads as random scatter. The bands stay distinct through
 * speed, width and strength regardless, which is where the difference actually shows anyway.
 */
const RIPPLE_BANDS = [
    { band: 'bass', strength: 1.45, speed: 0.9, width: 0.66, wavenumber: 3.4 },
    { band: 'mid', strength: 0.9, speed: 1.6, width: 0.36, wavenumber: 5.5 },
    { band: 'treble', strength: 0.5, speed: 2.5, width: 0.22, wavenumber: 9 },
];
/**
 * Slots each band owns in the pool. Round-robin across ONE shared pool let a busy hi-hat evict a bass
 * swell that was still at full height - a pop. With a private range, a ripple can only ever be replaced
 * by the next ripple of its OWN band, so a bass wave lives ~3 kicks (well past its own decay) whatever
 * the treble is doing. This is also the cap on new sources per unit time that the geometry can carry.
 */
const RIPPLE_SLOTS_PER_BAND = 3;
/**
 * Live ripple sources carried at once. DERIVED, never written by hand: the shader's uniform array, the
 * material's uniform buffers and the CPU pool must all be this long, and a band spawning at slot
 * `bandIndex * RIPPLE_SLOTS_PER_BAND + cursor` indexes straight into it. A hand-written count that
 * disagreed with the bands would put a whole band's writes past the end of the Float32Array, where
 * TypedArrays swallow them silently - no error, no crash, just a band that stops moving the geometry.
 * Deriving it means adding a band or a slot cannot desynchronise anything.
 */
const DIORAMA_RIPPLE_COUNT = RIPPLE_BANDS.length * RIPPLE_SLOTS_PER_BAND;
const smoothstep = (edge0, edge1, value) => {
    const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
};
/**
 * The two whole-body behaviours, each fed by the signal that actually belongs to it: the tunnel's drift
 * rides SUSTAINED bass (a loud passage moves the world along), while the beat scale rides the TRANSIENT
 * (a kick is an event, not a level). Feeding the pulse a sustained value would hold it up through a loud
 * passage and erase the beat, which is the same mistake the old baseline made one layer down.
 */
const resolveDioramaParticleAudioResponse = (bass, mid) => ({
    flowSpeed: Math.min(1.55, 0.3 + clamp01__2(bass.sustained) * 1.25),
    // A gentle whole-body breath on the beat - deliberately small so the wave field, not an overall scale
    // pump, carries the motion (the previous 1.44 pump read as "too exaggerated").
    clusterPulse: Math.min(DIORAMA_PARTICLE_AUDIO_SCALE_MAX, 1 + smoothstep(0.1, 0.9, bass.transient) * 0.14 + smoothstep(0.15, 0.95, mid.transient) * 0.05),
});
/**
 * How much of the whole-body beat pulse the CORRIDOR keeps. The shader applies uPulse as
 * `displaced *= aScale.x * uPulse` - a uniform scale of every point's offset from its anchor, which on a
 * cylinder is exactly the radius. A cluster of clouds pulsing on the beat reads as a cluster breathing;
 * a tunnel doing it pumps its whole wall in and out at once, AROUND the camera, which reads as the
 * corridor mechanically contracting. Measured on this chain: the wall swung 9.2% of its radius per kick
 * at an audio response of 1.0, and 13.8% (1.02 world units) at 1.5.
 *
 * The corridor's amplitude belongs to its ripple field, which is local by construction. This keeps a
 * trace so the tunnel is not inert between hits, while leaving the MEAN radius effectively where it is -
 * the beat is carried by crests travelling across the wall, not by moving the wall.
 */
const DIORAMA_CORRIDOR_PULSE_SHARE = 0.12;
/**
 * The whole-body scale the beat asks for this frame, per mode. Kept whole for the clouds; on the
 * corridor only DIORAMA_CORRIDOR_PULSE_SHARE of it survives.
 */
const resolveDioramaPulseTarget = (clusterPulse, gain, isCorridor) => 1 + (clusterPulse - 1) * gain * (isCorridor ? DIORAMA_CORRIDOR_PULSE_SHARE : 1);
const createDioramaParticleElasticState = () => ({
    value: 1,
    velocity: 0,
});
/**
 * An under-damped spring so a beat lands as a bounce that overshoots and settles, not a stiff snap or a
 * dead value. The wide range (down to 0.9, up to the audio scale cap) is what restores the "elastic"
 * feel the previous over-clamped version had lost.
 */
const stepDioramaParticleElasticResponse = (state, target, delta) => {
    let remaining = Math.min(0.1, Math.max(0, delta));
    const safeTarget = Math.min(DIORAMA_PARTICLE_AUDIO_SCALE_MAX, Math.max(0.9, target));
    while (remaining > 0) {
        const step = Math.min(1 / 240, remaining);
        const acceleration = (safeTarget - state.value) * 150 - state.velocity * 15;
        state.velocity += acceleration * step;
        state.value += state.velocity * step;
        remaining -= step;
    }
    state.value = Math.min(DIORAMA_PARTICLE_AUDIO_SCALE_MAX, Math.max(0.9, state.value));
    return state.value;
};

// ======== components/visualizer/diorama/dioramaParticleShaders ========


// src/components/visualizer/diorama/dioramaParticleShaders.ts
// One self-lit soft-point shader shared by both geometry modes and both render layers (opaque contrast
// points + additive glow halo, via uGlowPass).
//
// DISPLACEMENT — EVERY displacement below is a fraction of `aScale.z`, the primitive's OWN radius, so
// uAmplitude means the same thing on a small cloud, a 3.4x pillar and the radius-7.4 tunnel. A world-
// constant throw is what erased the shapes: a ~2-unit offset is a wisp on the tunnel and total
// obliteration for a 0.7-unit cloud.
//
// Both modes share ONE shape of displacement - `basePos + normalDir * (swell * localRadius)` - where the
// swell is a SCALAR field. That shape is what makes sharp-edged geometry safe, on two conditions the
// lattice guarantees (see dioramaParticleSurfaces.ts): the field is a continuous function of position,
// and `normalDir` is a continuous function of position too. Two points either side of a cube's edge then
// read almost the same swell and almost the same direction, and two COINCIDENT points read exactly the
// same of both - so faces physically cannot separate, whatever the amplitude.
//
// BOTH MODES ARE NOW RIPPLE-DRIVEN, off the same sources and the same packet maths. Audio never deforms
// anything directly; it only spawns sources (see DioramaParticleField). Each live source contributes an
// expanding, oscillating, decaying packet centred on its origin, so one hit lifts a whole contiguous band
// of surface into a crest that spreads and settles - not a scatter of individual points sticking out.
// Because the motion after a spawn is autonomous (driven by uTime, not by this frame's band value), it
// physically cannot twitch. The packet's sin() inside a Gaussian envelope is the elasticity and inertia:
// the surface overshoots, rings, and falls back. The two modes differ ONLY in the space the distance to a
// source is measured in - 3D for a cloud, the tunnel's (along, around) surface for the corridor.
//
// THE CORRIDOR SEAM. The tunnel's angular coordinate runs 0..2*PI and then wraps back to 0. Any function
// that reads that raw angle must close on itself after one full turn, or the wall does not match up where
// the sampling wraps - which is a seam that exists with the audio muted, and reads exactly as "a plane
// rolled into a cylinder". The previous field did not: it used sin(w.y * 1.8) and sin(w.y * 2.3), and
// neither 1.8 nor 2.3 closes after 2*PI, so the wave value stepped by ~0.6 across the seam (about two
// world units of radial offset at the tunnel's radius). aPhase carried the same bug via `angle * 0.35`.
// Two rules fix it for good, and everything angular below obeys one of them:
//   1. Ripples measure the angular offset through corridorSurfaceDelta, which wraps it to [-PI, PI]. That
//      is exactly periodic, so the seam is not a place - the two sides are simply neighbours, as they
//      physically are on the wall.
//   2. The idle breath and the detail field use INTEGER harmonics of the angle only. An integer multiple
//      of a full turn is a full number of cycles, so the function closes on itself by construction.
//
// NYQUIST. uWaveNumberMax is derived from the buffer's ACTUAL lattice spacing (see resolveWaveNumberMax)
// and clamps every wavenumber here. It is not taste: a wavelength below ~4 lattice steps puts neighbouring
// points on opposite phases, and the crest stops reading as a surface and becomes the random scatter we
// are required not to produce. Detail therefore scales with the density slider, honestly, instead of being
// a constant that only holds at one density.
//
// Both modes feed one `d` (0..1 "how hard is the music pushing this point"). It is built from the AUDIO
// swell ONLY - the idle breath is deliberately excluded - so size, colour and glow track real audio energy
// and a still surface stays still and dark.
const DIORAMA_PARTICLE_VERTEX_SHADER = `
#define RIPPLE_COUNT ${DIORAMA_RIPPLE_COUNT}

attribute vec3 aNormal;
attribute vec3 aAnchor;
attribute vec3 aScale;   // (uniformScale, yStretch, localRadius = this primitive's own size)
attribute float aPhase;
attribute vec3 aStyle;
attribute vec2 aWave;    // corridor: (along the tunnel in radius units, angle around it). clouds: dissolve seed.

uniform float uTime;
uniform float uCorridor;      // 0 = formation clouds, 1 = path tunnel
uniform float uAmplitude;     // displacement per unit of swell, as a FRACTION of the primitive's own radius
uniform float uMaxSwell;      // the DISPLACEMENT that counts as full reach - normalises d. Reading d off
                              // the raw wave instead let a point glow while the amplitude held it
                              // perfectly still (audio response at 0: no motion, full halo).
uniform float uWaveNumberMax; // finest wavenumber this buffer's lattice can carry without aliasing
uniform float uDetail;        // 0..1 sustained treble: fine surface texture ON EXISTING CRESTS only
// Ripple sources. Audio writes these and nothing else; the surface motion is autonomous after.
//   clouds:   xyz = origin on the shape's unit sphere
//   corridor: xy  = origin as (along, angle) on the tunnel wall
uniform vec4 uRippleSource[RIPPLE_COUNT];  // origin, w = birth time
uniform vec4 uRippleShape[RIPPLE_COUNT];   // x = strength, y = speed, z = packet width, w = wavenumber
uniform float uOffsetGain;    // whole-body sway gain, driven by mid energy
uniform float uFlow;          // how much the corridor's idle breath travels on its own
uniform float uFormation;     // 1 = formed, 0 = fully scattered/dissolved (song-change dissolve)
uniform float uScatter;       // how far points fly out when dissolving
uniform float uPulse;         // gentle whole-body beat scale
uniform float uSpectralCentroid;
uniform float uViewportHeight;
uniform float uSizeBase;
uniform float uSizeGain;
uniform float uGlow;
uniform float uGlowPass;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform vec3 uSecondaryColor;

varying vec3 vColor;
varying float vAlpha;
varying float vReaction;

float hermite(float value) { return value * value * (3.0 - 2.0 * value); }
float hash11(float n) { return fract(sin(n) * 43758.5453123); }

float resolveLife(float distanceToCamera) {
    float farT = clamp((${DIORAMA_SHAPE_FADE_IN_END.toFixed(1)} - distanceToCamera) / ${(DIORAMA_SHAPE_FADE_IN_END - DIORAMA_SHAPE_FADE_IN_START).toFixed(1)}, 0.0, 1.0);
    float nearT = clamp((distanceToCamera - ${DIORAMA_SHAPE_DISSOLVE_END.toFixed(1)}) / ${(DIORAMA_SHAPE_DISSOLVE_START - DIORAMA_SHAPE_DISSOLVE_END).toFixed(1)}, 0.0, 1.0);
    return hermite(farT) * hermite(nearT);
}

/**
 * One ripple's contribution at distance r from its origin - the whole elastic behaviour, in four terms:
 *   dr   = how far this point is from the ring the wave has expanded to (age * speed)
 *   sin  = the crest/trough, so the surface overshoots and rings back (elasticity + inertia)
 *   exp  = the packet's width, then the decay in time and in distance (birth, spread, settle)
 * Every term is a smooth function of r, so neighbouring points - including across a cube's edge or the
 * tunnel's seam - move together as one wavefront. Shared by both modes: only r is measured differently.
 */
float ripplePacket(float r, float age, vec4 shape) {
    float dr = r - age * shape.y;
    float k = min(shape.w, uWaveNumberMax);
    float packet = exp(-(dr * dr) / (shape.z * shape.z)) * sin(dr * k);
    // The age decay has to outlast the wave's own travel, or it dies before it has visibly crossed the
    // surface - and the propagation is the entire point.
    return shape.x * packet * exp(-age * 1.15) * exp(-r * 0.35);
}

/** Clouds: sum of every live ripple, in the shape's own unit space. Each cluster spins the origin by its
 *  own phase, so neighbouring clouds are struck in the same instant but not at the same spot. */
float cloudRipples(vec3 unitPos, float phase) {
    float spin = cos(phase);
    float spun = sin(phase);
    float total = 0.0;
    for (int i = 0; i < RIPPLE_COUNT; i += 1) {
        vec4 source = uRippleSource[i];
        vec4 shape = uRippleShape[i];
        float age = uTime - source.w;
        if (shape.x <= 0.0 || age < 0.0) continue;
        vec3 origin = vec3(
            source.x * spin - source.z * spun,
            source.y,
            source.x * spun + source.z * spin
        );
        total += ripplePacket(distance(unitPos, origin), age, shape);
    }
    return total;
}

/**
 * Offset from a source to this point ON THE TUNNEL WALL, as (along, arc), both in radius units so the
 * result is directly comparable to a cloud's 3D distance and one set of ripple parameters drives both.
 * The angular term is wrapped to [-PI, PI] by atan(sin, cos), which is EXACTLY periodic - that is what
 * makes a ripple cross the seam without noticing it, and lets it spread round the circumference and meet
 * itself on the far side. See the seam note at the top of this file.
 */
vec2 corridorSurfaceDelta(vec2 w, vec2 origin) {
    float dAngle = w.y - origin.y;
    return vec2(w.x - origin.x, atan(sin(dAngle), cos(dAngle)));
}

/** Corridor: the same ripples, measured across the wall - so a hit lifts a contiguous patch of cylinder
 *  that then travels both round the ring and along the tunnel. */
float corridorRipples(vec2 w) {
    float total = 0.0;
    for (int i = 0; i < RIPPLE_COUNT; i += 1) {
        vec4 source = uRippleSource[i];
        vec4 shape = uRippleShape[i];
        float age = uTime - source.w;
        if (shape.x <= 0.0 || age < 0.0) continue;
        total += ripplePacket(length(corridorSurfaceDelta(w, source.xy)), age, shape);
    }
    return total;
}

// A slow continuous breath so a cloud is alive between hits. Still one smooth field of position, so it
// cannot separate anything; deliberately far below the ripples in scale, and excluded from d so it never
// lights the shape up.
float cloudIdle(vec3 unitPos) {
    return 0.11 * sin(unitPos.x * 1.7 + uTime * 0.5) * cos(unitPos.z * 1.4 - uTime * 0.37)
         + 0.06 * sin(unitPos.y * 2.1 - uTime * 0.66);
}

// The corridor's equivalent: a slow region envelope carrying finer travelling waves along the tunnel.
// Every ANGULAR term is an integer harmonic (2.0, 3.0) so it closes on itself after a full turn.
float corridorIdle(vec2 w) {
    float t = uTime * uFlow;
    float region = 0.6 + 0.4 * sin(w.x * 0.42 - t * 0.33);
    float ripple = 0.62 * sin(w.x * 1.25 - t * 1.15)
                 + 0.30 * sin(w.x * 0.8 + w.y * 2.0 - t * 0.8)
                 + 0.08 * sin(w.y * 3.0 + t * 0.5);
    return region * ripple;
}

// Fine surface texture for sustained treble. Products of sines beat together into diagonal components
// above the nominal frequency, so these run at 0.7 of the lattice ceiling to leave that headroom.
float cloudDetail(vec3 p) {
    float k = uWaveNumberMax * 0.7;
    return sin(p.x * k + uTime * 3.1)
         * sin(p.y * k - uTime * 2.6)
         * sin(p.z * k + uTime * 2.2);
}

// Same, on the wall. The angular harmonic is floored to an integer so it closes round the circle.
float corridorDetail(vec2 w) {
    float k = uWaveNumberMax * 0.7;
    float n = max(1.0, floor(k));
    return sin(w.x * k + uTime * 3.1) * sin(w.y * n - uTime * 2.4);
}

void main() {
    float colorSlot = aStyle.y;
    float isFar = aStyle.z;
    vec3 normalDir = normalize(aNormal);
    // How big this primitive actually is, in its own local units. Everything below moves by a fraction
    // of it, never by a world-constant number of units.
    float localRadius = aScale.z;

    // Stretch the base shape FIRST, then displace: scaling AFTER would multiply the displacement by
    // aScale.y too, and a tall pillar's caps would travel ~3.4x further than its sides.
    vec3 basePos = position;
    basePos.y *= aScale.y;

    // ONE scalar swell per mode, then ONE displacement shape for both. Nothing here is per-face.
    // The field is read from the UNSTRETCHED position in the shape's own unit space, so one set of ripple
    // parameters fits every primitive and a 3.4x pillar reads the same wavefront across its width as
    // along its length.
    vec3 unitPos = position / localRadius;
    bool corridor = uCorridor > 0.5;
    float audio = corridor ? corridorRipples(aWave) : cloudRipples(unitPos, aPhase);
    float idle = corridor ? corridorIdle(aWave) : cloudIdle(unitPos);

    // HIGH FREQUENCY. Gated by the swell that is ALREADY there, so sustained treble can only sharpen the
    // texture of a crest that exists - on a still surface the gate is 0 and it cannot manufacture noise.
    // It is a continuous field like everything else, so neighbours share it and it cannot flicker or
    // scatter; and it is deliberately a fraction of the low-frequency travel, so it layers on top of the
    // big swell instead of competing with it.
    float detail = uDetail * smoothstep(0.06, 0.45, abs(audio));
    audio += (corridor ? corridorDetail(aWave) : cloudDetail(unitPos)) * detail * 0.3;

    // Safety net only: several sources peaking together must not throw a point clear of its own body.
    float swell = clamp(audio + idle, -1.6, 1.6) * uAmplitude;
    vec3 displaced = basePos + normalDir * (swell * localRadius);
    // d = how far the music ACTUALLY moved this point, against a fixed full-reach displacement. Two things
    // it must not be: the raw wave (a point held still by a zero amplitude would still glow), or the total
    // swell (the idle breath would light the shape up with no music playing). Both were true before.
    float d = clamp(abs(clamp(audio, -1.6, 1.6) * uAmplitude) / max(uMaxSwell, 0.0001), 0.0, 1.0);

    // Whole-body sway on mid energy (the reference's offsetGain): a RIGID translation of the entire
    // cluster along a FIXED local axis, exactly as the reference does it (newpos.z += ...). Along
    // normalDir it would translate each face in its own direction - a per-face displacement, which is the
    // very thing that splits a cube open. On the corridor aPhase is now ring-constant, so a ring sways as
    // one rigid ring rather than shearing itself open at the seam.
    displaced.z += sin(uTime * 0.6 + aPhase) * 0.12 * uOffsetGain * localRadius;

    // Dissolve: as uFormation falls to 0 the points fly apart into the surroundings (and fade below), so a
    // corridor leaves by dispersing and arrives by gathering back in - never a flat alpha cut.
    float scatter = 1.0 - uFormation;
    if (scatter > 0.001) {
        float r1 = hash11(aPhase * 12.9898 + aWave.x * 78.233);
        float r2 = hash11(aPhase * 39.346 + aWave.y * 11.135 + 3.7);
        float r3 = hash11(r1 * 91.7 + r2 * 47.3);
        vec3 spread = normalize(normalDir * 0.75 + vec3(r1 - 0.5, r2 - 0.5, r3 - 0.5) * 1.6);
        displaced += spread * (scatter * scatter * uScatter * (0.55 + r3 * 0.9));
    }

    displaced *= aScale.x * uPulse;
    vec3 worldPosition = aAnchor + displaced;

    float life = resolveLife(distance(worldPosition, cameraPosition));
    vec4 mvPosition = viewMatrix * vec4(worldPosition, 1.0);

    // The reaching points GROW - in the reference this size gain, not the travel, is what reads as the
    // amplitude. Treble adds a further, smaller, SMOOTH size lift over its (continuous) detail region -
    // never a per-point random scale, which would read as the flicker we must avoid. The glow layer draws
    // the same points as wide soft haloes.
    float glowScale = mix(1.0, 1.9 + uGlow * 1.3, uGlowPass);
    float sizeWorld = (uSizeBase + (pow(d, 3.0) + detail * 0.35) * uSizeGain) * glowScale;
    float projected = sizeWorld * uViewportHeight * projectionMatrix[1][1] * 0.5 / max(-mvPosition.z, 0.1);
    gl_PointSize = clamp(projected, mix(1.4, 2.0, uGlowPass), mix(26.0, 64.0, uGlowPass));
    gl_Position = projectionMatrix * mvPosition;

    // Palette drift through primary/accent/secondary; reaching points re-tint toward the hot accent so
    // active regions read as coloured bands. Treble pushes its detail region further along that shift, so
    // a cymbal colours a continuous patch of surface that travels and fades with the ripple under it.
    float gradientPhase = (
        dot(basePos, vec3(0.2, 0.16, 0.13))
        + aPhase * 0.05
        + colorSlot * 0.5
        + uTime * 0.02
        + uSpectralCentroid * 0.3
    ) * 6.283;
    vec3 wgt = max(vec3(0.0), 0.5 + 0.5 * cos(gradientPhase - vec3(0.0, 2.094, 4.188)));
    wgt *= wgt; wgt /= max(wgt.x + wgt.y + wgt.z, 0.001);
    vec3 baseColor = uPrimaryColor * wgt.x + uAccentColor * wgt.y + uSecondaryColor * wgt.z;
    vec3 hotColor = mix(uAccentColor, uSecondaryColor, smoothstep(0.2, 0.9, uSpectralCentroid));
    float hot = min(1.0, smoothstep(0.1, 0.75, d) * 0.75 + detail * 0.3);
    vColor = mix(baseColor, hotColor, hot) * (0.92 + d * 0.5);

    float layerBase = mix(0.72, 0.5, isFar);
    // Contrast layer: a readable body plus a reach lift, so the geometry is legible even in silence.
    // Glow layer: bound to the DISPLACED region and nothing else. It starts at zero - a point the music is
    // not moving does not glow at all - and rises smoothly with d, which is itself a continuous field, so
    // the halo fades outward from a crest and travels and decays with it instead of blinking.
    float formed = smoothstep(0.0, 0.45, uFormation);
    vAlpha = formed * (uGlowPass > 0.5
        ? life * smoothstep(0.1, 0.8, d) * 1.15
        : life * min(1.0, layerBase + d * 0.28));
    vReaction = d;
}
`;
const DIORAMA_PARTICLE_FRAGMENT_SHADER = `
uniform float uGlow;
uniform float uGlowPass;

varying vec3 vColor;
varying float vAlpha;
varying float vReaction;

// three hands a ShaderMaterial its uniforms in the LINEAR working space and expects the sRGB conversion
// on the way out; for its own materials the colorspace_fragment chunk does it. That chunk is useless here
// - it expands to linearToOutputTexel(), which the ShaderMaterial prefix does not define, and including it
// compiles the shader to solid black (measured, not assumed). So this shader has to convert its own output,
// and until now it did not: it wrote linear values raw into an sRGB framebuffer and every point rendered
// far darker and more saturated than the theme colour it was handed - measured #c8783c -> #932f0c, a 3.1x
// drop in luminance, while an ordinary meshBasicMaterial on the same colour read back exactly #c8783c.
// That is what made the adaptive contrast in dioramaParticleMaterials.ts a guarantee about a colour that
// never reached the screen: it binary-searches the theme colour up to a >= 4.6 WCAG ratio, and then the
// point drew three times darker than the value it had just cleared.
vec3 dioramaLinearToSRGB(vec3 linear) {
    vec3 safe = max(linear, vec3(0.0));
    return mix(
        pow(safe, vec3(0.41666)) * 1.055 - vec3(0.055),
        safe * 12.92,
        vec3(lessThanEqual(safe, vec3(0.0031308)))
    );
}

void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float radius = length(point);

    if (uGlowPass > 0.5) {
        // Additive soft halo: a wide falloff whose strength rides the glow slider and the point's reach.
        // Hard-capped so several overlapping crests cannot stack into a blown-out white blob.
        float halo = pow(clamp(1.0 - radius * 2.0, 0.0, 1.0), 1.7);
        float alpha = min(0.5, halo * vAlpha * uGlow * 0.4);
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(dioramaLinearToSRGB(vColor * (1.0 + uGlow * 0.25)), alpha);
        return;
    }

    // Contrast layer: a soft-edged but near-opaque disc so the theme-adapted colour actually reads.
    float core = 1.0 - smoothstep(0.14, 0.48, radius);
    float alpha = core * vAlpha;
    if (alpha < 0.01) discard;
    float emission = 0.95 + vReaction * 0.22;
    gl_FragColor = vec4(dioramaLinearToSRGB(vColor * emission), alpha);
}
`;

// ======== components/visualizer/diorama/dioramaParticleMaterials ========
var THREE = THREE;
// WCAG's relative luminance IS this weighted sum of LINEAR channels. The spec spells out a
// linearisation step only because it starts from sRGB-encoded input; a THREE.Color is already linear
// (ColorManagement is on, so setHex/setStyle convert on the way in). So do NOT "restore" the missing
// sRGB round-trip here - encoding and then linearising the same value back is the identity, and it
// only costs a clone plus six Math.pow per call, inside a 10-iteration binary search.
const relativeLuminance = (color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
const getDioramaParticleContrastRatio = (foreground, background) => {
    const foregroundLuminance = relativeLuminance(foreground);
    const backgroundLuminance = relativeLuminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
};
// What the point shader ACTUALLY puts on screen for a calm point of this colour. Three transforms sit
// between the uniform and the pixel, and measuring the ratio without them is measuring a colour nobody
// ever sees - on a near-colour theme the "4.6" it certified landed as 1.28 on screen (1.0 being literally
// indistinguishable from the background):
//   - vColor carries a 0.92 floor at rest and the fragment adds a 0.95 rest emission.
//   - the contrast layer composites at vAlpha = layerBase = 0.72 for a near point at rest.
//   - the framebuffer is sRGB-encoded, so that blend runs on ENCODED values, not linear ones.
// All three are read from dioramaParticleShaders.ts. The case pinned here is the hardest one for
// legibility - a NEAR point in SILENCE - because reach only ever adds brightness and alpha on top, and
// the far layer is meant to sit back. Luminance is linear in RGB and the shader's gradient blend of
// primary/accent/secondary is a convex mix in linear space, so a mix of three colours that each clear the
// target clears it too; certifying the three individually certifies every point.
const CALM_EMISSION = 0.92 * 0.95;
const CONTRAST_LAYER_ALPHA = 0.72;
const asDisplayed = (color, background) => {
    const src = color.clone().multiplyScalar(CALM_EMISSION).convertLinearToSRGB();
    const dst = background.clone().convertLinearToSRGB();
    const blend = (s, d) => s * CONTRAST_LAYER_ALPHA + d * (1 - CONTRAST_LAYER_ALPHA);
    return new THREE.Color(blend(src.r, dst.r), blend(src.g, dst.g), blend(src.b, dst.b))
        .convertSRGBToLinear();
};
/**
 * The contrast ratio of the PIXEL a point of this colour becomes, against the background behind it. This
 * is the number that describes legibility; getDioramaParticleContrastRatio describes the uniform.
 */
const getDioramaParticleDisplayedContrastRatio = (color, background) => getDioramaParticleContrastRatio(asDisplayed(color, background), background);
/**
 * The "smart" contrast step: if a theme colour is already legible on the scene it is left alone; if it
 * is too close to the background it is nudged toward whichever of white/black the scene contrasts with
 * more (so dark scenes get brighter points, light scenes get darker ones) by the smallest amount that
 * clears the target ratio. Hue is preserved as far as possible, and the search still stops at the
 * SMALLEST correction that works, so the theme's palette is bent no further than legibility requires.
 */
const adaptColorToBackground = (color, background, minimumContrast) => {
    if (getDioramaParticleDisplayedContrastRatio(color, background) >= minimumContrast) {
        return color.clone();
    }
    const lightTarget = new THREE.Color(0xffffff);
    const darkTarget = new THREE.Color(0x050505);
    // Which way is further from the background is judged on the DISPLAYED pixel too: the composite pulls
    // every candidate 28% back toward the background, which is not symmetric between the two directions.
    const target = getDioramaParticleDisplayedContrastRatio(lightTarget, background)
        >= getDioramaParticleDisplayedContrastRatio(darkTarget, background)
        ? lightTarget
        : darkTarget;
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 10; iteration += 1) {
        const amount = (low + high) * 0.5;
        const candidate = color.clone().lerp(target, amount);
        if (getDioramaParticleDisplayedContrastRatio(candidate, background) >= minimumContrast) {
            high = amount;
        }
        else {
            low = amount;
        }
    }
    return color.clone().lerp(target, high);
};
// Higher targets than plain AA text: point clouds are small, so they need more separation from the scene
// than a glyph does. These are demanded of the DISPLAYED pixel (see getDioramaParticleDisplayedContrast-
// Ratio), so the layer's own transparency is already accounted for rather than guessed at.
const resolveDioramaParticleContrastColors = (colors, background) => ({
    primary: adaptColorToBackground(colors.primary, background, 4.6),
    accent: adaptColorToBackground(colors.accent, background, 4.1),
    secondary: adaptColorToBackground(colors.secondary, background, 4.6),
});
const buildUniforms = (colors, glowPass, glowIntensity) => ({
    uTime: { value: 0 },
    uCorridor: { value: 0 }, // 0 = clouds, 1 = corridor. Both are ripple-driven; only the space differs.
    uAmplitude: { value: 0.34 }, // displacement per unit of swell, as a FRACTION of the geometry's radius
    uMaxSwell: { value: 0.29 }, // displacement that counts as full reach; normalises d (set per frame)
    uWaveNumberMax: { value: 8 }, // lattice-derived detail ceiling (set per frame from the buffer)
    uDetail: { value: 0 }, // 0..1 sustained treble -> fine texture on existing crests
    // Live ripple sources, for BOTH modes. The field writes these; nothing else drives the displacement.
    uRippleSource: { value: new Float32Array(DIORAMA_RIPPLE_COUNT * 4) },
    uRippleShape: { value: new Float32Array(DIORAMA_RIPPLE_COUNT * 4) },
    uOffsetGain: { value: 0 }, // whole-body sway on mid energy
    uFlow: { value: 1 }, // self-travel of the corridor's idle breath
    uFormation: { value: 1 }, // 1 = formed, 0 = dispersed (song-change dissolve)
    uScatter: { value: 4 }, // how far points fly out while dispersing
    uSizeBase: { value: 0.052 }, // world point size of a calm point
    uSizeGain: { value: 0.3 }, // size a fully-reaching point gains - the reference's real "amplitude"
    uPulse: { value: 1 }, // gentle whole-body beat scale
    uSpectralCentroid: { value: 0.5 },
    uViewportHeight: { value: 1 },
    uGlow: { value: glowIntensity },
    uGlowPass: { value: glowPass },
    uPrimaryColor: { value: colors.primary.clone() },
    uAccentColor: { value: colors.accent.clone() },
    uSecondaryColor: { value: colors.secondary.clone() },
});
/** The opaque contrast layer: near-solid discs, normal blending, legible on any background. */
const createDioramaParticleMaterial = (colors) => new THREE.ShaderMaterial({
    vertexShader: DIORAMA_PARTICLE_VERTEX_SHADER,
    fragmentShader: DIORAMA_PARTICLE_FRAGMENT_SHADER,
    uniforms: buildUniforms(colors, 0, 0),
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
});
/** The glow halo layer: wide soft sprites, additive blending, strength driven by the glow slider. */
const createDioramaParticleGlowMaterial = (colors, glowIntensity) => new THREE.ShaderMaterial({
    vertexShader: DIORAMA_PARTICLE_VERTEX_SHADER,
    fragmentShader: DIORAMA_PARTICLE_FRAGMENT_SHADER,
    uniforms: buildUniforms(colors, 1, glowIntensity),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
});
const lerpDioramaParticleMaterialColors = (material, colors, amount) => {
    material.uniforms.uPrimaryColor.value.lerp(colors.primary, amount);
    material.uniforms.uAccentColor.value.lerp(colors.accent, amount);
    material.uniforms.uSecondaryColor.value.lerp(colors.secondary, amount);
};

// ======== components/visualizer/diorama/dioramaKeywordColor ========
var THREE = THREE;
// Generic WCAG ratio between two linear-space THREE.Colors. It lives in the particle module and is
// named for it, but the maths is plain WCAG and duplicating it here would be worse than the name.

// src/components/visualizer/diorama/dioramaKeywordColor.ts
// 关键字着色 for the diorama, reusing the shared keyword system every other visualizer draws from:
// the keywords and their colours are the theme's own `wordColors` - which the AI theme generates from
// the song's own lyrics - matched by prepareWordColorMatchers.
//
// What this module returns is a follow-sing TARGET per unit, not a colour anything is painted with at
// rest. The scene rests every glyph at the plain lyric colour and dyes it toward this only as that unit
// is sung. That is why the adaptation below is judged at the ACTIVE opacity: the sung instant is the
// only instant this colour is ever on screen.
//
// It resolves by RANGE (character offsets), the way Monet and Claddagh do, NOT by token text the way
// Fume does. Fume matches a token's text against the keyword with `bidirectional-contains`, which is
// safe there because Fume's tokens are whole words. The diorama splits every CJK line into ONE-CHARACTER
// units, and text matching on a single character bleeds: with a keyword 花火, the 火 of 火车 also matches
// and colours a character that is not part of any keyword. Ranges resolve by position, so only the real
// 花火 colours.
/** The unsung / sung opacities a unit's base material is drawn at (mirrors DioramaScene). */
const ACTIVE_LINE_OPACITY = 0.92;
// Legibility target for a keyword glyph against the scene, judged on the pixel it actually becomes.
const KEYWORD_MIN_BG_CONTRAST = 4.5;
// Below this Manhattan RGB distance from the ordinary lyric colour a keyword reads as ordinary text -
// the same metric and threshold DioramaScene already uses to detect a degenerate accent ~= primary.
// This one carries more weight now that the colour is a sung TARGET: the glyph is dyed FROM primary
// TOWARD it, so a target too close to primary means the dye does nothing and the keyword never shows.
const KEYWORD_MIN_PRIMARY_SEPARATION = 0.4;
const separationFromPrimary = (color, primary) => (Math.abs(color.r - primary.r) + Math.abs(color.g - primary.g) + Math.abs(color.b - primary.b));
/**
 * What a text glyph of this colour actually becomes on screen: the base material is a white raster
 * multiplied by the colour and composited at ACTIVE_LINE_OPACITY, and the framebuffer is sRGB-encoded
 * so that blend runs on ENCODED values. ACTIVE is the right - and now the only honest - opacity to judge
 * at: a keyword colour is a sung target, so the sung instant is the only instant it is ever on screen.
 * (The unsung 0.5 never shows this colour at all; judging there would demand more of a keyword than of
 * the plain text beside it and bleach every keyword toward white on dark themes.)
 *
 * meshBasicMaterial is one of three's OWN materials, so three encodes it; unlike the point cloud's
 * custom ShaderMaterial there is no colour-space bug to model here.
 */
const asDisplayedText = (color, background) => {
    const src = color.clone().convertLinearToSRGB();
    const dst = background.clone().convertLinearToSRGB();
    const blend = (s, d) => s * ACTIVE_LINE_OPACITY + d * (1 - ACTIVE_LINE_OPACITY);
    return new THREE.Color(blend(src.r, dst.r), blend(src.g, dst.g), blend(src.b, dst.b))
        .convertSRGBToLinear();
};
/** The contrast ratio of the PIXEL a keyword glyph of this colour becomes, against the scene behind it. */
const getDioramaKeywordDisplayedContrastRatio = (color, background) => wcagContrastRatio(asDisplayedText(color, background), background);
/** Smallest lerp toward `target` that clears `minimum`, or the full lerp if even that cannot. */
const nudgeUntil = (color, target, minimum, measure) => {
    if (measure(color) >= minimum)
        return color.clone();
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 10; iteration += 1) {
        const amount = (low + high) * 0.5;
        if (measure(color.clone().lerp(target, amount)) >= minimum)
            high = amount;
        else
            low = amount;
    }
    return color.clone().lerp(target, high);
};
/**
 * Bring a theme's keyword colour into the scene: distinguishable from the ordinary lyric colour, and
 * legible against the background - the smallest correction that achieves each, so a theme's palette is
 * bent no further than the two things a keyword must do.
 *
 * Order matters. Separation runs first and legibility second, so legibility always has the final say:
 * a keyword you cannot read is a worse failure than one that merely fails to stand out.
 *
 * That ordering has a known, measured cost. Legibility can undo separation, because on a light theme
 * every legible colour is dark and so is the lyric text: a keyword set to the background colour lands
 * at 0.32 separation, under the target. It stays legible and still reads as a different colour, and the
 * alternative - letting separation win - would mean an unreadable keyword. Only a theme that sets a
 * keyword to its own background reaches this, and no iteration is attempted for it: two corrections
 * chasing each other would oscillate for a case nobody configures on purpose.
 */
const resolveDioramaKeywordColor = (keyword, primary, accent, background) => {
    // 1. A keyword that looks like ordinary text is not a keyword. Nudge toward the theme's ACCENT -
    //    its own designated emphasis colour, and what Fume already falls back to for emphasis - rather
    //    than inventing a hue the theme never chose. If the accent is degenerate too this cannot help,
    //    and the colour is left as the theme set it rather than fabricated.
    const separated = nudgeUntil(keyword, accent, KEYWORD_MIN_PRIMARY_SEPARATION, (candidate) => separationFromPrimary(candidate, primary));
    // 2. Legibility against the scene, on the displayed pixel: toward whichever pole the background
    //    contrasts with more, so dark scenes brighten their keywords and light scenes darken them.
    const lightTarget = new THREE.Color(0xffffff);
    const darkTarget = new THREE.Color(0x050505);
    const pole = getDioramaKeywordDisplayedContrastRatio(lightTarget, background)
        >= getDioramaKeywordDisplayedContrastRatio(darkTarget, background)
        ? lightTarget
        : darkTarget;
    return nudgeUntil(separated, pole, KEYWORD_MIN_BG_CONTRAST, (candidate) => getDioramaKeywordDisplayedContrastRatio(candidate, background));
};
const prepareDioramaKeywordMatchers = (wordColors, enabled) => prepareWordColorMatchers(wordColors, enabled);
/**
 * Scene-ready keyword colour for each unit of a line, by unit index. Absent = an ordinary unit that
 * keeps the plain lyric colour. Empty whenever the toggle is off or the theme defines no keywords, so
 * the scene falls back to exactly its original colouring.
 */
const resolveDioramaKeywordUnitColors = (lineText, units, matchers, primary, accent, background) => {
    const resolved = new Map();
    if (!lineText || units.length === 0 || matchers.length === 0)
        return resolved;
    const ranges = buildWordColorRangesFromMatchers(lineText, matchers);
    if (ranges.length === 0)
        return resolved;
    const colorByKey = resolveTokenColorMap(units.map((unit, index) => ({
        key: String(index),
        timed: true,
        startOffset: unit.charStart,
        endOffset: unit.charEnd,
    })), ranges);
    // One adaptation per distinct keyword colour, not per unit: a line repeating a keyword resolves the
    // same hex to the same THREE.Color instead of running the search again for every character.
    const adapted = new Map();
    colorByKey.forEach((hex, key) => {
        let color = adapted.get(hex);
        if (!color) {
            color = resolveDioramaKeywordColor(new THREE.Color(hex), primary, accent, background);
            adapted.set(hex, color);
        }
        resolved.set(Number(key), color);
    });
    return resolved;
};

// ======== components/visualizer/diorama/dioramaTextRaster ========
var THREE = THREE;
// src/components/visualizer/diorama/dioramaTextRaster.ts
// Canvas-rasterised lyric text for the diorama's 3D planes.
//
// WHY canvas and not an SDF text engine: CJK fonts build glyphs from OVERLAPPING stroke contours
// (unified by the fill winding rule). troika's GPU SDF generator mishandles those overlaps, drawing
// visible seams and translucent slabs inside every dense glyph - unfixable by resolution. The
// browser's own canvas text rasteriser is the same engine that renders the DOM subtitles: perfect
// shaping for every script, and it consumes the project's full CSS font STACK (theme font style,
// weight, the user's uploaded custom font, per-glyph fallback) via resolveThemeFontStack - so the 3D
// lyrics inherit the shared subtitle font settings exactly, with no single-font-file limitation.
//
// Each unit (CJK char / latin word) is rasterised TWICE into one shared canvas geometry:
// - base: the plain glyph (white - tinted per-frame by the material colour), and
// - glow: the glyph lit with cadenza (心象)'s drawShadowGlowText recipe (three stacked blurred
//   copies, composited 'lighter'), also white so the theme accent tints it live.
// Both rasters use the same canvas size and draw position, so the glow registers on the strokes
// EXACTLY, by construction - centring/misalignment is impossible (this is what fixes the interlude
// dot ● glow sitting high: the glow IS the blurred dot).
const DIORAMA_RASTER_FONT_PX = 128;
const DEFAULT_FONT_WEIGHT = 700;
// Vertical band around the middle baseline (covers ascenders/descenders across fonts).
const LINE_BAND_EM = 1.4;
// Padding for the glow spread (must contain the widest shadow blur below plus ink overshoot).
const GLOW_PAD_EM = 0.7;
// Plain line rasters (neighbour lines, no glow) need only a small ink-overshoot pad.
const PLAIN_PAD_EM = 0.2;
// Stay under the guaranteed-safe texture edge for long lines.
const MAX_CANVAS_PX = 4096;
// Inner shadow blur as a fraction of the em; cadenza's 20/40/58px ladder scaled to the raster em.
const GLOW_BLUR_EM = 0.16;
// `fontStack` is the CSS font-family stack from resolveThemeFontStack(theme) - resolved by the
// caller so rasters only rebuild when the actual font selection changes, not on every theme tweak.
const buildDioramaFontSpec = (fontStack, fontWeight = DEFAULT_FONT_WEIGHT) => `${fontWeight} ${DIORAMA_RASTER_FONT_PX}px ${fontStack}`;
let measureCtx = null;
const getMeasureCtx = () => {
    if (!measureCtx) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        measureCtx = canvas.getContext('2d');
    }
    return measureCtx;
};
/** Advance width in raster px of `text` under the diorama font spec (kerning included). */
const measureDioramaText = (text, fontSpec) => {
    const ctx = getMeasureCtx();
    ctx.font = fontSpec;
    return ctx.measureText(text).width;
};
const makeTexture = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};
// Bakes a PURE HALO of the glyph (cadenza's blur ladder: tight core / mid halo / faint outer air) at
// FULL strength - live intensity/colour come from the additive material's opacity/colour per frame.
//
// Why not cadenza's exact fill alphas: a canvas shadow inherits its source shape's alpha, so
// cadenza's faint fills (0.11 x 0.86 shadow ≈ 0.09 alpha per pass) only work because the DOM canvas
// REDRAWS and accumulates them every frame. Baked once into a texture, that halo peaks near-invisible
// (~0.2 alpha, then multiplied by the runtime opacity). So here the glyph is drawn OFF-canvas with a
// large shadow offset - only its blurred shadow lands on the texture, at full source alpha - giving a
// strong, crisp-fill-free halo that spreads purely outward from the strokes.
const drawGlowGlyph = (ctx, text, x, y, blur) => {
    const OFFSCREEN = 10000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    const haloPass = (passBlur, alpha) => {
        ctx.shadowColor = `rgba(255,255,255,${alpha})`;
        ctx.shadowBlur = passBlur;
        ctx.shadowOffsetX = OFFSCREEN;
        ctx.shadowOffsetY = 0;
        ctx.fillText(text, x - OFFSCREEN, y);
    };
    haloPass(blur, 0.95);
    haloPass(blur, 0.85);
    haloPass(blur * 2, 0.55);
    haloPass(blur * 2.9, 0.3);
    ctx.restore();
};
/** Rasterise one lyric unit (base + glow layers share one canvas geometry). */
const rasterDioramaUnit = (text, fontSpec) => {
    const em = DIORAMA_RASTER_FONT_PX;
    const pad = Math.ceil(em * GLOW_PAD_EM);
    const advancePx = Math.max(1, Math.ceil(measureDioramaText(text, fontSpec)));
    const canvasWidthPx = advancePx + pad * 2;
    const canvasHeightPx = Math.ceil(em * LINE_BAND_EM) + pad * 2;
    const drawX = pad;
    const drawY = canvasHeightPx / 2;
    const draw = (paint) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidthPx;
        canvas.height = canvasHeightPx;
        const ctx = canvas.getContext('2d');
        ctx.font = fontSpec;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        paint(ctx);
        return makeTexture(canvas);
    };
    const baseTexture = draw((ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, drawX, drawY);
    });
    const glowTexture = draw((ctx) => {
        drawGlowGlyph(ctx, text, drawX, drawY, em * GLOW_BLUR_EM);
    });
    return { baseTexture, glowTexture, canvasWidthPx, canvasHeightPx, advancePx };
};
/** Rasterise a whole (neighbour) line as one plain white texture - no glow, small pad. */
const rasterDioramaLine = (text, fontStack, fontWeight = DEFAULT_FONT_WEIGHT) => {
    let fontPx = DIORAMA_RASTER_FONT_PX;
    let fontSpec = buildDioramaFontSpec(fontStack, fontWeight);
    let advancePx = Math.max(1, Math.ceil(measureDioramaText(text, fontSpec)));
    const pad = Math.ceil(fontPx * PLAIN_PAD_EM);
    if (advancePx + pad * 2 > MAX_CANVAS_PX) {
        const shrink = (MAX_CANVAS_PX - pad * 2) / advancePx;
        fontPx = Math.max(24, Math.floor(fontPx * shrink));
        fontSpec = `${fontWeight} ${fontPx}px ${fontStack}`;
        advancePx = Math.max(1, Math.ceil(measureDioramaText(text, fontSpec)));
    }
    const canvasWidthPx = advancePx + pad * 2;
    const canvasHeightPx = Math.ceil(fontPx * LINE_BAND_EM) + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidthPx;
    canvas.height = canvasHeightPx;
    const ctx = canvas.getContext('2d');
    ctx.font = fontSpec;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, pad, canvasHeightPx / 2);
    return { texture: makeTexture(canvas), canvasWidthPx, canvasHeightPx, advancePx, fontPx };
};

// ======== components/visualizer/diorama/dioramaTransition ========
// src/components/visualizer/diorama/dioramaTransition.ts
// Pure helpers for the diorama's cinematic "one-take" scene transition (切歌 / 单曲循环).
//
// The transition is performed entirely in-world: when a song changes, the next song's corridor is
// spawned at a deliberate world OFFSET from the current one (pickTransitionOffset) - far enough that it
// starts fully swallowed by the distance fog, i.e. invisible. The camera then flies one continuous eased
// arc (transitionEase + bezierArc) from where it is over to the new opening pose. As it approaches, the
// new scene's elements emerge from the fog while the old scene it is leaving recedes back into the fog -
// no cut, no fade overlay, the picture never hidden. These functions are pure (plain vectors) so the
// geometry is unit-testable; CameraRig consumes bezierArc/transitionEase each frame, VisualizerDiorama
// consumes pickTransitionOffset once per transition to place the incoming corridor.

/** Seconds the camera flight lasts. Long and gently eased so the move reads as a languid cinematic
 * push rather than a rushed dash across the gap. */
const TRANSITION_DURATION = 3.2;
/** World distance the incoming corridor is spawned from the outgoing one. Beyond the fog far plane (30),
 * so the new scene begins fully fogged/invisible and only reveals as the camera closes the gap. */
const TRANSITION_DISTANCE = 46;
/** Peak roll (radians) the camera banks into its arc mid-flight, like a craft leaning through a turn -
 * zero at both ends. Small: enough to feel alive, never a dutch-tilt. */
const TRANSITION_BANK = 0.14;
/** Fraction of the flight length the AIM point sweeps sideways at mid-flight (a graceful reframe/pan on
 * top of the bodily move), returning to the composed frame by the end. */
const TRANSITION_AIM_SWEEP = 0.14;
/** Unit perpendicular to the flight direction in the horizontal plane - the axis the arc bows along and
 * the aim sweeps toward. Shared by CameraRig's position bow, aim sweep and bank so they move together. */
const flightPerp = (from, to) => {
    const perp = { x: to.z - from.z, y: 0, z: -(to.x - from.x) };
    const l = Math.hypot(perp.x, perp.y, perp.z);
    return l < 1e-3 ? { x: 1, y: 0, z: 0 } : { x: perp.x / l, y: perp.y / l, z: perp.z / l };
};
/** Which side the arc bows / aim sweeps / camera banks - seeded per transition so consecutive moves vary. */
const flightSide = (seed, epoch) => seededUnit(hashSeed(seed) + epoch * 17) < 0.5 ? -1 : 1;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const scaleTo = (a, target) => {
    const l = len(a) || 1;
    return { x: (a.x / l) * target, y: (a.y / l) * target, z: (a.z / l) * target };
};
/**
 * A seeded world offset placing the next song's corridor away from the current one. Direction varies per
 * transition (azimuth swept full circle, elevation biased upward) so consecutive switches sweep the
 * camera in different directions - up, down, diagonal, lateral - while `z` stays negative so the new
 * scene sits generally ahead (the camera pushes IN to it rather than reversing).
 */
const pickTransitionOffset = (seed, epoch) => {
    const base = hashSeed(seed) + epoch * 131;
    const azimuth = seededUnit(base + 1) * Math.PI * 2;
    const elevation = (seededUnit(base + 2) - 0.35) * 1.3; // upward-biased vertical spread
    const ce = Math.cos(elevation);
    const dir = {
        x: Math.sin(azimuth) * ce,
        y: Math.sin(elevation),
        z: -Math.abs(Math.cos(azimuth) * ce) - 0.35,
    };
    return scaleTo(dir, TRANSITION_DISTANCE);
};
/** Smootherstep (6t^5-15t^4+10t^3): eases the flight in AND out, zero velocity at both ends, so the
 * camera accelerates off the old pose and settles onto the new one without a kink. */
const transitionEase = (t) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * c * (c * (c * 6 - 15) + 10);
};
/**
 * A control point that bows the straight `from -> to` line into a pronounced arc, so the flight clearly
 * sweeps through space (up and to one side) instead of sliding in a straight line. The bow is
 * perpendicular to the flight direction plus an upward lift, scaled by the flight length; the seed picks
 * which side it bows to.
 */
const bezierControl = (from, to, seed, epoch) => {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
    const flightLen = len({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }) || 1;
    const perp = flightPerp(from, to);
    const side = flightSide(seed, epoch);
    const bow = flightLen * 0.32;
    return {
        x: mid.x + perp.x * bow * side,
        y: mid.y + bow * 0.55, // always lift the arc's apex upward for a craning sweep
        z: mid.z + perp.z * bow * side,
    };
};
/** Quadratic Bézier point at parameter t (0..1) for the eased camera flight: from -> control -> to. */
const bezierArc = (from, control, to, t) => {
    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;
    return {
        x: a * from.x + b * control.x + c * to.x,
        y: a * from.y + b * control.y + c * to.y,
        z: a * from.z + b * control.z + c * to.z,
    };
};

// ======== components/visualizer/subtitleFontSizes ========
// src/components/visualizer/subtitleFontSizes.ts
// 底部字幕（译文 / 下一句预览）那两组 clamp 字号的**唯一来源**，此前在每个模式里各抄一份
// （classic / cadenza / diorama / tilt / 模组宿主），改一次字号要动五个文件。
//
// 两组都是 `clamp(min, preferred, max)`：下限防止窄屏上字被压到读不出，上限防止宽屏上
// 顶到屏沿。`vw` 中间值让它在常见比例下跟着画面缩放——写死 rem 会在大屏上偏小、
// 在小窗口里偏大。
const clampSize = (min, preferred, max, scale) => (`clamp(${(min * scale).toFixed(3)}rem, ${(preferred * scale).toFixed(3)}vw, ${(max * scale).toFixed(3)}rem)`);
/**
 * 译文 / 下一句预览的字号。`lyricsFontScale` 是宿主的歌词字号倍率，缺省 1。
 * 各模式之间这两个数必须完全一致，否则字幕会在换模式的那一下跳一下大小。
 */
const resolveSubtitleFontSizes = (lyricsFontScale = 1) => {
    const scale = Number.isFinite(lyricsFontScale) && lyricsFontScale > 0 ? lyricsFontScale : 1;
    return {
        translationFontSize: clampSize(1.125, 2.6, 1.25, scale),
        upcomingFontSize: clampSize(0.875, 2, 1, scale),
    };
};

// ======== utils/fontStacks ========
const MIN_FONT_WEIGHT = 100;
const MAX_FONT_WEIGHT = 900;
const FONT_WEIGHT_STEP = 10;
const normalizeFontWeight = (fontWeight) => {
    if (typeof fontWeight !== 'number' || !Number.isFinite(fontWeight))
        return null;
    const clamped = Math.min(MAX_FONT_WEIGHT, Math.max(MIN_FONT_WEIGHT, fontWeight));
    return Math.round(clamped / FONT_WEIGHT_STEP) * FONT_WEIGHT_STEP;
};
const resolveThemeFontWeight = (theme, fallback) => normalizeFontWeight(theme?.fontWeight) ?? fallback;
const SUGAR_SERIF_FAMILY = '"獅尾四季春加糖SC"';
const BUILTIN_FONT_STACKS = {
    sans: '"Inter", "Noto Sans CJK SC", "Noto Sans JP", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    serif: `${SUGAR_SERIF_FAMILY}, "Iowan Old Style", "Noto Serif CJK SC", "Noto Serif JP", "Source Han Serif SC", "Songti SC", "STSong", "Georgia", serif`,
    mono: '"IBM Plex Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "Noto Sans Mono", "SFMono-Regular", Consolas, monospace',
};
const TRANSLATION_FONT_STACKS = {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", Arial, "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans JP", "Source Han Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif',
    serif: `${SUGAR_SERIF_FAMILY}, "Folia Noto Serif SC", "Iowan Old Style", Georgia, "Times New Roman", "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", "Noto Serif JP", "Source Han Serif JP", "Yu Mincho", "MS PMincho", serif`,
    mono: 'Consolas, "IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, "Sarasa Mono SC", "Noto Sans Mono CJK SC", "SimHei", "DengXian", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans Mono CJK JP", "MS Gothic", monospace',
};
const CSS_GENERIC_FONT_FAMILIES = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong',
]);
const quoteFontFamily = (fontFamily) => `"${fontFamily.replace(/["\\]/g, '\\$&')}"`;
const normalizeFontFamilyName = (fontFamily) => fontFamily.trim().replace(/^['"]|['"]$/g, '').trim();
const formatFontFamily = (fontFamily) => {
    const normalized = normalizeFontFamilyName(fontFamily);
    if (!normalized)
        return null;
    return CSS_GENERIC_FONT_FAMILIES.has(normalized.toLowerCase())
        ? normalized
        : quoteFontFamily(normalized);
};
const normalizeFontFamilyStack = (fontFamilies) => {
    const seen = new Set();
    const stack = [];
    fontFamilies?.forEach(fontFamily => {
        const normalized = normalizeFontFamilyName(fontFamily ?? '');
        if (!normalized)
            return;
        const key = normalized.toLocaleLowerCase();
        if (seen.has(key))
            return;
        seen.add(key);
        stack.push(normalized);
    });
    return stack;
};
const buildCustomFontFamilyStack = (theme) => {
    const familiesToNormalize = [
        ...(theme.fontFamily ? [theme.fontFamily] : []),
        ...(theme.fontFamilyStack ?? []),
    ];
    if (familiesToNormalize.length === 0) {
        return [];
    }
    return normalizeFontFamilyStack(familiesToNormalize)
        .map(formatFontFamily)
        .filter((fontFamily) => Boolean(fontFamily));
};
const getBuiltinThemeFontStack = (fontStyle) => {
    return BUILTIN_FONT_STACKS[fontStyle] ?? BUILTIN_FONT_STACKS.sans;
};
const resolveThemeFontStack = (theme) => {
    const fallbackStack = getBuiltinThemeFontStack(theme.fontStyle);
    const customFontStack = buildCustomFontFamilyStack(theme);
    if (customFontStack.length === 0) {
        return fallbackStack;
    }
    return `${customFontStack.join(', ')}, ${fallbackStack}`;
};
const resolveThemeTranslationFontStack = (theme) => {
    const fallbackStack = TRANSLATION_FONT_STACKS[theme.fontStyle] ?? TRANSLATION_FONT_STACKS.sans;
    const customFontStack = buildCustomFontFamilyStack(theme);
    if (customFontStack.length === 0) {
        return fallbackStack;
    }
    return `${customFontStack.join(', ')}, ${fallbackStack}`;
};

// ======== utils/lyrics/graphemeTiming ========
const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const splitLyricGraphemes = (text) => {
    if (!text) {
        return [];
    }
    if (graphemeSegmenter) {
        return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
    }
    return Array.from(text);
};
const buildEvenGraphemeTimings = (text, startTime, endTime, wordIndex) => {
    const graphemes = splitLyricGraphemes(text);
    if (graphemes.length === 0) {
        return [];
    }
    const duration = Math.max(endTime - startTime, 0);
    const unitDuration = duration / graphemes.length;
    return graphemes.map((char, index) => ({
        char,
        startTime: startTime + unitDuration * index,
        endTime: index === graphemes.length - 1 ? endTime : startTime + unitDuration * (index + 1),
        ...(typeof wordIndex === 'number' ? { wordIndex } : {}),
    }));
};
const buildWordGraphemeTimings = (word, wordIndex) => {
    if (!word.syllables?.length) {
        return buildEvenGraphemeTimings(word.text, word.startTime, word.endTime, wordIndex);
    }
    return word.syllables.flatMap(syllable => buildEvenGraphemeTimings(syllable.text, syllable.startTime, syllable.endTime, wordIndex));
};
const findGraphemeSequence = (source, target, fromIndex) => {
    if (target.length === 0) {
        return fromIndex;
    }
    for (let index = fromIndex; index <= source.length - target.length; index += 1) {
        let matched = true;
        for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
            if (source[index + targetIndex] !== target[targetIndex]) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return index;
        }
    }
    return -1;
};
// Maps word-level timing back to the full displayed line, including spaces and
// punctuation that may not be present in parser words.
const buildLineGraphemeTimeline = (line) => {
    const lineGraphemes = splitLyricGraphemes(line.fullText);
    if (lineGraphemes.length === 0) {
        return [];
    }
    if (line.words.length === 0) {
        return buildEvenGraphemeTimings(line.fullText, line.startTime, line.endTime);
    }
    const timeline = [];
    let cursor = 0;
    let lastResolvedTime = line.startTime;
    line.words.forEach((word, wordIndex) => {
        const wordGraphemes = splitLyricGraphemes(word.text);
        if (wordGraphemes.length === 0) {
            return;
        }
        const matchedStart = findGraphemeSequence(lineGraphemes, wordGraphemes, cursor);
        const start = matchedStart >= 0 ? matchedStart : cursor;
        const end = Math.min(start + wordGraphemes.length, lineGraphemes.length);
        for (let gapIndex = cursor; gapIndex < start; gapIndex += 1) {
            timeline[gapIndex] = {
                char: lineGraphemes[gapIndex],
                startTime: word.startTime,
                endTime: word.startTime,
            };
        }
        const wordTimings = buildWordGraphemeTimings(word, wordIndex);
        for (let localIndex = 0; localIndex < end - start; localIndex += 1) {
            const timing = wordTimings[localIndex]
                ?? buildEvenGraphemeTimings(wordGraphemes[localIndex] ?? '', word.startTime, word.endTime, wordIndex)[0];
            if (!timing) {
                continue;
            }
            timeline[start + localIndex] = {
                ...timing,
                char: lineGraphemes[start + localIndex],
            };
            lastResolvedTime = Math.max(lastResolvedTime, timing.endTime);
        }
        cursor = Math.max(cursor, end);
    });
    for (let index = 0; index < lineGraphemes.length; index += 1) {
        if (timeline[index]) {
            continue;
        }
        timeline[index] = {
            char: lineGraphemes[index],
            startTime: lastResolvedTime,
            endTime: lastResolvedTime,
        };
    }
    return timeline;
};

// ======== utils/lyrics/renderHints ========
const MICRO_LINE_DURATION_THRESHOLD = 0.10;
const SHORT_LINE_DURATION_THRESHOLD = 0.18;
const MICRO_LINE_RENDER_FLOOR = 0.067;
const getLastWordEndTime = (line) => {
    const lastWord = line.words?.[line.words.length - 1];
    return lastWord?.endTime ?? line.endTime;
};
const getLineTransitionTiming = (rawDuration, lineTransitionMode, wordRevealMode) => {
    if (lineTransitionMode === 'none') {
        return {
            enterDuration: 0,
            exitDuration: 0,
            linePassHold: 0,
        };
    }
    if (lineTransitionMode === 'fast') {
        return {
            enterDuration: clamp__2(rawDuration * 0.45, 0.045, 0.06),
            exitDuration: clamp__2(rawDuration * 0.22, 0.03, 0.04),
            linePassHold: wordRevealMode === 'instant' ? 0 : 0.03,
        };
    }
    return {
        enterDuration: Math.min(0.42, Math.max(0.22, Math.max(rawDuration, 0.12) * 0.34)),
        exitDuration: Math.min(0.32, Math.max(0.18, Math.max(rawDuration, 0.12) * 0.18)),
        linePassHold: wordRevealMode === 'instant' ? 0 : 0.06,
    };
};
const getTimingClass = (rawDuration) => {
    if (rawDuration < MICRO_LINE_DURATION_THRESHOLD) {
        return 'micro';
    }
    if (rawDuration < SHORT_LINE_DURATION_THRESHOLD) {
        return 'short';
    }
    return 'normal';
};
const getLineTransitionMode = (timingClass) => {
    if (timingClass === 'micro') {
        return 'none';
    }
    if (timingClass === 'short') {
        return 'fast';
    }
    return 'normal';
};
const getWordRevealMode = (timingClass) => {
    if (timingClass === 'micro') {
        return 'instant';
    }
    if (timingClass === 'short') {
        return 'fast';
    }
    return 'normal';
};
const clamp__2 = (value, min, max) => Math.min(Math.max(value, min), max);
const buildLineRenderEndTime = (line, rawDuration, lineTransitionMode, wordRevealMode) => {
    // renderEndTime is the latest point a visualizer may keep this line on screen for
    // active/pass/exit polish after reveal has finished. It is not a guaranteed standalone
    // timeline: a later line may start earlier and force the current renderer to cut that
    // extra window short.
    if (lineTransitionMode === 'none') {
        return Math.max(line.endTime, line.startTime + MICRO_LINE_RENDER_FLOOR);
    }
    const transitionTiming = getLineTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode);
    const linePassStart = Math.max(getLastWordEndTime(line), line.startTime) + transitionTiming.linePassHold;
    const exitStart = lineTransitionMode === 'fast'
        ? Math.max(line.startTime + transitionTiming.enterDuration + 0.01, linePassStart, line.endTime - transitionTiming.exitDuration)
        : Math.max(linePassStart, line.endTime - transitionTiming.exitDuration);
    return Math.max(line.endTime, exitStart + transitionTiming.exitDuration);
};
function buildLineRenderHints(lineOrStart, endTime) {
    const line = typeof lineOrStart === 'number'
        ? { startTime: lineOrStart, endTime: endTime ?? lineOrStart }
        : lineOrStart;
    const rawDuration = Math.max(line.endTime - line.startTime, 0);
    const timingClass = getTimingClass(rawDuration);
    const lineTransitionMode = getLineTransitionMode(timingClass);
    const wordRevealMode = getWordRevealMode(timingClass);
    return {
        rawDuration,
        timingClass,
        renderEndTime: buildLineRenderEndTime(line, rawDuration, lineTransitionMode, wordRevealMode),
        lineTransitionMode,
        wordRevealMode,
    };
}
const getLineRenderHints = (line) => {
    if (!line) {
        return null;
    }
    return line.renderHints ?? buildLineRenderHints(line);
};
const getLineRenderEndTime = (line) => {
    if (!line) {
        return Number.NEGATIVE_INFINITY;
    }
    return getLineRenderHints(line)?.renderEndTime ?? line.endTime;
};
const hasExpectedRenderHints = (line, expected) => {
    const current = line.renderHints;
    return Boolean(current
        && current.rawDuration === expected.rawDuration
        && current.timingClass === expected.timingClass
        && current.renderEndTime === expected.renderEndTime
        && current.lineTransitionMode === expected.lineTransitionMode
        && current.wordRevealMode === expected.wordRevealMode);
};
const migrateLyricLinesRenderHints = (lines) => {
    let changed = false;
    const nextLines = lines.map(line => {
        const renderHints = buildLineRenderHints(line);
        if (hasExpectedRenderHints(line, renderHints)) {
            return line;
        }
        changed = true;
        return {
            ...line,
            renderHints,
        };
    });
    return {
        value: changed ? nextLines : lines,
        changed,
    };
};
const annotateLyricLines = (lines) => {
    return migrateLyricLinesRenderHints(lines).value;
};
const ensureLyricLinesRenderHints = (lines) => {
    return migrateLyricLinesRenderHints(lines).value;
};
function migrateLyricDataRenderHints(lyrics) {
    if (!lyrics) {
        return { value: null, changed: false };
    }
    const migration = migrateLyricLinesRenderHints(lyrics.lines);
    if (!migration.changed) {
        return { value: lyrics, changed: false };
    }
    return {
        value: {
            ...lyrics,
            lines: migration.value,
        },
        changed: true,
    };
}
const ensureLyricDataRenderHints = (lyrics) => {
    return migrateLyricDataRenderHints(lyrics).value;
};

// ======== manual: manual/mini-motion.js ========
/* =========================================================================
   mini-motion —— framer-motion 动画子集的忠实实现（无构建环境用）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：为 classic 等 React/framer-motion DOM 模式的
   渲染核心落地提供运动时。只实现 Folia 模式实际用到的 API 面：

     · mmApplyVariant(el, variants, name, custom)  —— variants 三态切换
       （variant 可为函数，收 custom；打断旧动画，从当前值续跑——framer 语义）
     · transition 支持：{duration, ease, delay, times, repeat: Infinity,
       type: 'spring', stiffness, damping, transitionEnd, <prop>: {...覆盖}}
       （per-prop 覆盖该 prop 的同名字段，其余继承顶层——framer 合并语义）
       ease 可为 easing 名 / 函数 / cubic-bezier 参数数组（framer 同接受）
     · 插值器：number / color(hex|rgb|rgba|transparent → rgba 串) / filter
       等复杂值（同名函数序列逐数值插值）/ 复合值 token 通道（box-shadow/
       text-shadow/drop-shadow 类「颜色+长度」多段值：文本骨架与值类型序列
       对齐时逐段插值；形状不对齐回退函数序列通道；再不行离散关键帧）
     · 'none' 零形态（framer 渐变语义）：关键帧序列中的 'none'/'auto'/'0'
       位按第一个含复杂数值的关键帧作模板推导零形态（长度全 0 保留单位、
       颜色保留 RGB 置 alpha=0）后整体渐变插值——motion-dom
       make-none-animatable + complex.getAnimatableNone 同构；仅形状无法
       对齐的值才离散跳变
     · spring：半隐式欧拉（v += (k*(t-x)-c*v)*dt，restSpeed/restDelta 0.01，
       dt 夹 1/30）——framer-motion spring 同构
     · ease：cubicBezier 求解；tween 缺省 easeOut（framer 默认），
       easeOut=(0,0,.58,1) / easeInOut=(.42,0,.58,1) / linear——与 framer
       easing 定义同参
     · transform 组装顺序 translateX translateY scale rotate（framer 默认序）
     · mmMotionValue(get)：{get, subscribe, emit}——useMotionValueEvent 的
       等价，由引擎核心每帧轮询 get() 派发 change

   设计取舍：独立 rAF 引擎，无活动动画即停（不空转）；classic 的全部
   transition 的关键参数均为显式（Folia 源码仅依赖「tween 缺省 easeOut」
   一处缺省），故行为可精确复刻。
   ========================================================================= */

var MM_EASE_LINEAR = function (t) { return t; };

/* cubic-bezier 求值（牛顿迭代 + 二分兜底），framer-motion easing 同参 */
function mmCubicBezier(x1, y1, x2, y2) {
  var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
  function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
  function sampleDX(t) { return (3 * ax * t + 2 * bx) * t + cx; }
  return function (progress) {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    var t = progress;
    for (var i = 0; i < 8; i++) {
      var x = sampleX(t) - progress;
      if (Math.abs(x) < 1e-6) return sampleY(t);
      var d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= x / d;
    }
    var lo = 0, hi = 1; t = progress;
    for (var j = 0; j < 20; j++) {
      var xv = sampleX(t);
      if (Math.abs(xv - progress) < 1e-6) break;
      if (xv < progress) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

var MM_EASE = {
  linear: MM_EASE_LINEAR,
  ease: mmCubicBezier(0.25, 0.1, 0.25, 1),
  easeIn: mmCubicBezier(0.42, 0, 1, 1),
  easeOut: mmCubicBezier(0, 0, 0.58, 1),
  easeInOut: mmCubicBezier(0.42, 0, 0.58, 1)
};

function mmResolveEase(ease) {
  if (!ease) return MM_EASE.easeOut;   /* framer tween 缺省 easeOut */
  if (typeof ease === 'function') return ease;
  /* framer 也接受 cubic-bezier 参数数组（如 claddagh 主容器 [0.16,1,0.3,1]） */
  if (Array.isArray(ease) && ease.length === 4) {
    return mmCubicBezier(ease[0], ease[1], ease[2], ease[3]);
  }
  return MM_EASE[ease] || MM_EASE_LINEAR;
}

/* ---------- 颜色解析/插值（hex|rgb|rgba|transparent → [r,g,b,a]） ---------- */

var MM_COLOR_CACHE = {};
function mmParseColor(css) {
  if (MM_COLOR_CACHE[css] !== undefined) return MM_COLOR_CACHE[css];
  var out = null, s = String(css == null ? '' : css).trim();
  if (s === 'transparent') out = [0, 0, 0, 0];
  else if (s.charAt(0) === '#') {
    var hex = s.slice(1);
    var p = function (v) { return parseInt(v, 16); };
    if (/^[0-9a-fA-F]{3}$/.test(hex)) out = [p(hex[0] + hex[0]), p(hex[1] + hex[1]), p(hex[2] + hex[2]), 1];
    else if (/^[0-9a-fA-F]{6}$/.test(hex)) out = [p(hex.slice(0, 2)), p(hex.slice(2, 4)), p(hex.slice(4, 6)), 1];
    else if (/^[0-9a-fA-F]{8}$/.test(hex)) out = [p(hex.slice(0, 2)), p(hex.slice(2, 4)), p(hex.slice(4, 6)), p(hex.slice(6, 8)) / 255];
  } else {
    var m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      var parts = m[1].split(/[,\/\s]+/).filter(function (x) { return x.length; });
      if (parts.length >= 3) {
        out = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]),
          parts.length > 3 && parts[3] != null ? (String(parts[3]).indexOf('%') >= 0 ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1];
        if (out.some(function (v) { return !isFinite(v); })) out = null;
      }
    }
  }
  MM_COLOR_CACHE[css] = out;
  return out;
}

function mmMixColor(a, b, k) {
  var ca = mmParseColor(a), cb = mmParseColor(b);
  if (!ca || !cb) return k >= 0.5 ? b : a;
  var r = Math.round(ca[0] + (cb[0] - ca[0]) * k);
  var g = Math.round(ca[1] + (cb[1] - ca[1]) * k);
  var bl = Math.round(ca[2] + (cb[2] - ca[2]) * k);
  var al = ca[3] + (cb[3] - ca[3]) * k;
  return 'rgba(' + r + ', ' + g + ', ' + bl + ', ' + Number(al.toFixed(3)) + ')';
}

function mmIsColor(v) { return typeof v === 'string' && mmParseColor(v) != null; }

/* ---------- filter 等复杂值：同名函数序列 + 数值列表 ---------- */

var MM_FUNC_RE = /([a-zA-Z-]+)\(([^)]*)\)/g;
function mmParseComplex(css) {
  var funcs = [], nums = [], m;
  MM_FUNC_RE.lastIndex = 0;
  while ((m = MM_FUNC_RE.exec(css)) != null) {
    funcs.push(m[1]);
    m[2].split(',').forEach(function (tok) {
      var n = parseFloat(tok);
      if (isFinite(n)) nums.push(n);
    });
  }
  return funcs.length ? { funcs: funcs, nums: nums } : null;
}

/* ---------- 复合值 token 通道：shadow 类「颜色+长度」逐段插值与 'none' 零形态 ----------
   原版依据（folia-major node_modules/motion-dom，AGPL-3.0 同仓）：
   · value/types/complex/index.mjs —— analyseComplexValue 用 complexRegex 把
     CSS 值拆成（颜色|数字）值序列 + 文本模板 split[]；getAnimatableNone 把
     数字→0、颜色→color.getAnimatableNone 后按模板重拼。
   · value/types/color/index.mjs —— color.getAnimatableNone：解析后 alpha=0
     再 transform 回串（RGB 通道保留，插值时颜色通道连续渐变）。
   · animation/keyframes/utils/make-none-animatable.mjs —— 关键帧序列里
     'none'/'auto'/'0'（invalidTemplates）位用第一个「含复杂数值」的关键帧
     作模板推导零形态替换（含末帧——终态写零形态而非 'none'，视觉等价）。
   覆盖范围按管线实际色域裁剪：颜色复用 mmParseColor（hex|rgb|rgba|
   transparent，不含 hsl）、不覆盖 CSS var()/calc 除数（管线无此用法）。 */

var MM_TOKEN_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|-?(?:\d+(?:\.\d+)?|\.\d+)/gi;

/* 'none' 等不可作模板的字面量（make-none-animatable invalidTemplates 同集） */
var MM_INVALID_TEMPLATES = { none: 1, auto: 1, '0': 1 };

/* token 化（analyseComplexValue 简化版，纯函数）：
   返回 { splits:[文本模板], vals:[颜色原文|数字], types:['num'|'color'],
          units:[num 的单位或 ''] }；无可插值值（无数字无颜色）返回 null。
   rgba(...) 整体先于裸数字被吃掉（正则分支序），嵌套括号不误切。 */
function mmParseTokens(css) {
  var s = String(css == null ? '' : css);
  var re = MM_TOKEN_RE; re.lastIndex = 0;
  var splits = [], vals = [], types = [], units = [], last = 0, m, found = false;
  while ((m = re.exec(s)) != null) {
    var tok = m[0], type = null, val = null, unit = '';
    if (tok.charAt(0) === '#' || /^rgba?\(/i.test(tok)) {
      if (!mmParseColor(tok)) continue;   /* 形似色但解析失败（越界 hex 等）→ 当文本 */
      type = 'color'; val = tok;
    } else {
      var n = parseFloat(tok);
      if (!isFinite(n)) continue;
      type = 'num'; val = n;
      var um = tok.match(/[a-z%]+/i);
      unit = um ? um[0] : '';
    }
    splits.push(s.slice(last, m.index));
    vals.push(val); types.push(type); units.push(unit);
    last = m.index + tok.length;
    found = true;
  }
  if (!found) return null;
  splits.push(s.slice(last));
  return { splits: splits, vals: vals, types: types, units: units };
}

/* 逐段插值（纯函数）：文本骨架/值类型/单位完全对齐才插值（安全方向——
   不对齐返回 null 走离散），对齐时数字逐位、颜色走既有颜色通道。 */
function mmMixTokens(a, b, k) {
  var ta = mmParseTokens(a), tb = mmParseTokens(b);
  if (!ta || !tb || ta.vals.length !== tb.vals.length) return null;
  var n = ta.vals.length, i;
  for (i = 0; i < n; i++) {
    if (ta.types[i] !== tb.types[i] || ta.splits[i] !== tb.splits[i]) return null;
    if (ta.types[i] === 'num' && ta.units[i] !== tb.units[i]) return null;
  }
  if (ta.splits[n] !== tb.splits[n]) return null;
  var out = '';
  for (i = 0; i < n; i++) {
    out += ta.splits[i];
    if (ta.types[i] === 'num') {
      var v = ta.vals[i] + (tb.vals[i] - ta.vals[i]) * k;
      out += String(Number(v.toFixed(3))) + ta.units[i];
    } else {
      out += mmMixColor(ta.vals[i], tb.vals[i], k);
    }
  }
  out += ta.splits[n];
  return out;
}

/* 零形态推导（complex.getAnimatableNone 同构，纯函数）：
   数字→0（保留单位）、颜色→保留 RGB 置 alpha=0、其余文本原样。 */
function mmZeroFormOf(template) {
  var t = mmParseTokens(template);
  if (!t) return null;
  var out = '';
  for (var i = 0; i < t.vals.length; i++) {
    out += t.splits[i];
    if (t.types[i] === 'color') {
      var c = mmParseColor(t.vals[i]);
      out += 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', 0)';
    } else {
      out += '0' + t.units[i];
    }
  }
  out += t.splits[t.vals.length];
  return out;
}

/* 关键帧 'none' 归一化（makeNoneKeyframesAnimatable 同构，纯函数）：
   找第一个非 'none'/'auto'/'0' 且可 token 化的字符串关键帧作模板，把所有
   invalid 字面量位替换为其零形态；无可作模板的返回原数组。返回拷贝，
   不改传入数组（variant 字面量可能被同变体多次复用）。 */
function mmMakeNoneKeyframesAnimatable(keyframes) {
  var template = null, i;
  for (i = 0; i < keyframes.length; i++) {
    var kf = keyframes[i];
    if (typeof kf === 'string' && !MM_INVALID_TEMPLATES[kf] && mmParseTokens(kf)) {
      template = kf; break;
    }
  }
  if (template == null) return keyframes;
  var out = null;
  for (i = 0; i < keyframes.length; i++) {
    var kf2 = keyframes[i];
    if (typeof kf2 === 'string' && kf2 !== template && MM_INVALID_TEMPLATES[kf2]) {
      var zf = mmZeroFormOf(template);
      if (zf != null) {
        if (!out) out = keyframes.slice();
        out[i] = zf;
      }
    }
  }
  return out || keyframes;
}

/* 单值对 'none' 规范化：任一端是 invalid 字面量时换成另一端的零形态 */
function mmNormalizePair(from, to) {
  if (from === to) return [from, to];
  if (MM_INVALID_TEMPLATES[from]) {
    var zf1 = mmZeroFormOf(to);
    if (zf1 != null) return [zf1, to];
  } else if (MM_INVALID_TEMPLATES[to]) {
    var zf2 = mmZeroFormOf(from);
    if (zf2 != null) return [from, zf2];
  }
  return [from, to];
}

function mmMixComplex(a, b, k) {
  var pa = mmParseComplex(a), pb = mmParseComplex(b);
  if (!pa || !pb || pa.funcs.length !== pb.funcs.length) return k >= 0.5 ? b : a;
  for (var i = 0; i < pa.funcs.length; i++) {
    if (pa.funcs[i] !== pb.funcs[i]) return k >= 0.5 ? b : a;
  }
  /* 数值按序插值，重新拼串（保留每段的原始单位与非数值 token） */
  var out = '', idx = 0, m, last = 0, re = /([a-zA-Z-]+)\(([^)]*)\)/g;
  while ((m = re.exec(a)) != null) {
    out += a.slice(last, m.index);
    var inner = '', toks = m[2].split(',');
    for (var t = 0; t < toks.length; t++) {
      var tok = toks[t], n = parseFloat(tok);
      if (isFinite(n) && idx < pb.nums.length) {
        var v = n + (pb.nums[idx] - n) * k;
        var unit = (String(tok).match(/px|deg|%| /) || [''])[0];
        inner += (t ? ',' : '') + String(Number(v.toFixed(3))) + unit;
        idx++;
      } else {
        inner += (t ? ',' : '') + tok;
      }
    }
    out += m[1] + '(' + inner + ')';
    last = m.index + m[0].length;
  }
  out += a.slice(last);
  return out;
}

/* ---------- 值插值分派（null = 不可插值 → 离散） ---------- */

function mmMixValue(from, to, k) {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * k;
  if (mmIsColor(from) && mmIsColor(to)) return mmMixColor(from, to, k);
  /* token 通道优先于函数序列通道：shadow 类复合值的 offset/blur 在
     func 外（mmParseComplex 提取不到，嵌套括号重拼也会误切），须逐段
     插值；对齐失败再回退 mmMixComplex（blur 等简单函数序列旧行为不变） */
  var mixed = mmMixTokens(from, to, k);
  if (mixed !== null) return mixed;
  if (mmParseComplex(from) && mmParseComplex(to)) return mmMixComplex(from, to, k);
  return null;
}

/* ---------- 元素动画状态 ---------- */

var MM_STATE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
var MM_LIVE = [];          /* 活动动画列表 */
var MM_RAF = 0;

function mmGetState(el) {
  var st = MM_STATE.get(el);
  if (!st) {
    st = { anim: {}, tf: { x: 0, y: 0, scale: 1, rotate: 0 } };
    MM_STATE.set(el, st);
  }
  return st;
}

function mmApplyTransform(el, st) {
  var tf = st.tf;
  el.style.transform = 'translateX(' + tf.x + 'px) translateY(' + tf.y + 'px) scale(' + tf.scale + ') rotate(' + tf.rotate + 'deg)';
}

/* 当前值读取（动画中取活动值，否则取内联样式/变换状态） */
function mmCurrent(el, st, prop) {
  var a = st.anim[prop];
  if (a && !a.dead) {
    if (a.cur != null && typeof a.cur === 'number') return a.cur;
  }
  if (prop === 'x' || prop === 'y' || prop === 'scale' || prop === 'rotate') return st.tf[prop];
  if (prop === 'opacity') return parseFloat(el.style.opacity || '1');
  if (prop === 'color' || prop === 'filter' || prop === 'textShadow') return el.style[prop] || '';
  return el.style[prop] || '';
}

/* ---------- 动画实例 ---------- */

function mmStartProp(el, st, prop, from, to, trans, onDone) {
  var old = st.anim[prop];
  if (old) old.dead = true;   /* 打断：新动画从各自当前值续跑（framer 语义） */

  var anim = {
    el: el, st: st, prop: prop, to: to,
    keyframes: Array.isArray(to) ? to : null,
    delay: ((trans.delay || 0) * 1000) || 0,
    duration: 0, ease: null, spring: false,
    repeat: trans.repeat || 0,
    t: 0, dead: false, cur: null,
    onDone: onDone || null, done: false
  };
  var cfg = trans[prop] || trans;   /* per-prop 覆盖，其余继承顶层 */

  if (anim.keyframes) {
    /* 'none' 关键帧先按模板归一为可插值零形态（framer makeNoneKeyframesAnimatable
       语义）——归一失败（无模板或形状不对齐）才落离散跳变 */
    anim.keyframes = mmMakeNoneKeyframesAnimatable(anim.keyframes);
    var n = anim.keyframes.length;
    var times = cfg.times || trans.times;
    if (times && times.length === n) anim.times = times.slice();
    else {
      anim.times = [];
      for (var i = 0; i < n; i++) anim.times.push(n === 1 ? 1 : i / (n - 1));
    }
    anim.duration = Math.max(((cfg.duration != null ? cfg.duration : trans.duration) || 0.3) * 1000, 1);
    anim.ease = mmResolveEase(cfg.ease != null ? cfg.ease : trans.ease);
    /* 不可插值属性（形状无法对齐的 textShadow 等）→ 离散关键帧 */
    anim.discrete = mmMixValue(anim.keyframes[0], anim.keyframes[Math.min(1, n - 1)], 0.5) === null;
  } else if (cfg.type === 'spring') {
    anim.spring = true;
    anim.from = typeof from === 'number' ? from : parseFloat(from) || 0;
    anim.stiffness = cfg.stiffness != null ? cfg.stiffness : (trans.stiffness != null ? trans.stiffness : 200);
    anim.damping = cfg.damping != null ? cfg.damping : (trans.damping != null ? trans.damping : 20);
  } else {
    var pair = mmNormalizePair(String(from), String(to));
    anim.from = typeof from === 'number' ? from : pair[0];
    anim.to = typeof to === 'number' ? to : pair[1];
    anim.duration = Math.max(((cfg.duration != null ? cfg.duration : trans.duration) || 0.3) * 1000, 1);
    anim.ease = mmResolveEase(cfg.ease != null ? cfg.ease : trans.ease);
    anim.discrete = mmMixValue(anim.from, anim.to, 0.5) === null;
  }

  st.anim[prop] = anim;
  MM_LIVE.push(anim);
  mmKick();
  return anim;
}

function mmSampleProp(anim, progress) {
  if (anim.spring) return anim.cur != null ? anim.cur : anim.from;
  if (anim.discrete) {
    var kf = anim.keyframes || [anim.from, anim.to];
    var tm = anim.times || [0, 1];
    if (progress >= 1) return kf[kf.length - 1];
    for (var i = tm.length - 1; i >= 0; i--) {
      if (progress >= tm[i]) return kf[Math.min(i, kf.length - 1)];
    }
    return kf[0];
  }
  if (anim.keyframes) {
    var kfs = anim.keyframes, times = anim.times;
    if (progress >= 1) return kfs[kfs.length - 1];
    var seg = 0;
    while (seg < times.length - 1 && progress >= times[seg + 1]) seg++;
    var t0 = times[seg], t1 = times[Math.min(seg + 1, times.length - 1)];
    var local = t1 > t0 ? (progress - t0) / (t1 - t0) : 1;
    return mmMixValue(kfs[seg], kfs[seg + 1], anim.ease(local));
  }
  return mmMixValue(anim.from, anim.to, anim.ease(progress));
}

function mmWriteProp(el, st, prop, value) {
  if (prop === 'x' || prop === 'y' || prop === 'scale' || prop === 'rotate') {
    st.tf[prop] = typeof value === 'number' ? value : (parseFloat(value) || 0);
    mmApplyTransform(el, st);
  } else if (prop === 'textShadow' || prop === 'filter' || prop === 'color' || prop === 'opacity' || prop === 'backgroundColor') {
    el.style[prop] = value;
  } else {
    try { el.style[prop] = value; } catch (e) { }
  }
}

function mmFinishAnim(anim) {
  var final = anim.keyframes ? anim.keyframes[anim.keyframes.length - 1] : anim.to;
  mmWriteProp(anim.el, anim.st, anim.prop, final);
  if (anim.st.anim[anim.prop] === anim) delete anim.st.anim[anim.prop];
  anim.dead = true;
  if (!anim.done) { anim.done = true; if (anim.onDone) anim.onDone(); }
}

/* ---------- 引擎循环 ---------- */

function mmKick() {
  if (!MM_RAF && typeof requestAnimationFrame === 'function') {
    MM_RAF = requestAnimationFrame(mmStep);
  }
}

function mmStep(now) {
  MM_RAF = 0;
  var dt = Math.min(now - (mmStep.last || now), 33);
  mmStep.last = now;
  var sdt = dt / 1000;

  for (var i = MM_LIVE.length - 1; i >= 0; i--) {
    var anim = MM_LIVE[i];
    if (anim.dead) { MM_LIVE.splice(i, 1); continue; }
    anim.t += dt;
    var elapsed = anim.t - anim.delay;
    if (elapsed < 0) continue;

    if (anim.spring) {
      if (anim.cur == null) { anim.cur = anim.from; anim.vel = 0; anim.life = 0; }
      anim.life += sdt;
      var steps = Math.max(1, Math.ceil(sdt / (1 / 120)));
      var h = sdt / steps;
      for (var s = 0; s < steps; s++) {
        var force = anim.stiffness * (anim.to - anim.cur) - anim.damping * anim.vel;
        anim.vel += force * h;
        anim.cur += anim.vel * h;
      }
      if ((Math.abs(anim.vel) < 0.01 && Math.abs(anim.to - anim.cur) < 0.01) || anim.life > 8) {
        mmFinishAnim(anim);
        MM_LIVE.splice(i, 1);
        continue;
      }
      mmWriteProp(anim.el, anim.st, anim.prop, anim.cur);
      continue;
    }

    var progress = elapsed / anim.duration;
    if (anim.repeat && anim.duration > 0) {
      progress = progress % 1;
    } else if (progress >= 1) {
      mmFinishAnim(anim);
      MM_LIVE.splice(i, 1);
      continue;
    }
    mmWriteProp(anim.el, anim.st, anim.prop, mmSampleProp(anim, progress));
  }

  if (MM_LIVE.length) mmKick();
  else mmStep.last = 0;
}

/* ---------- variants 应用（framer animate 变体切换语义） ---------- */

function mmResolveVariant(variant, custom) {
  if (typeof variant === 'function') return variant(custom);
  return variant;
}

/**
 * 把 variant 目标应用到元素：对每个目标属性建立/替换动画；
 * transitionEnd 在该变体的全部有限动画完成后写入（framer 语义：收尾状态）。
 * 缺席键不动（保持当前值）——wordGlow passed 分支注释所述「新 variant 缺席
 * 键回退 initial」的行为，classic 各变体均已显式补键，不依赖该语义。
 */
function mmApplyVariant(el, variants, name, custom) {
  var st = mmGetState(el);
  var variant = mmResolveVariant(variants && variants[name], custom);
  if (!variant) return null;

  var end = variant.transitionEnd || null;
  var trans = variant.transition || {};
  var pending = 0;
  var endApplied = false;

  var onPropDone = function () {
    pending--;
    if (pending <= 0 && end && !endApplied) {
      endApplied = true;
      for (var k in end) {
        if (Object.prototype.hasOwnProperty.call(end, k)) {
          var a = st.anim[k];
          if (a) { a.dead = true; delete st.anim[k]; }
          mmWriteProp(el, st, k, end[k]);
        }
      }
    }
  };

  for (var prop in variant) {
    if (!Object.prototype.hasOwnProperty.call(variant, prop)) continue;
    if (prop === 'transition' || prop === 'transitionEnd') continue;
    var to = variant[prop];
    var cfg = trans[prop] || trans;
    var infinite = (trans.repeat === Infinity) || (cfg.repeat === Infinity);
    var spring = cfg.type === 'spring';

    if (infinite || spring) {
      /* 无限循环/spring 不参与 transitionEnd 计数 */
    } else {
      pending++;
    }
    if (Array.isArray(to)) {
      mmStartProp(el, st, prop, null, to, trans, (!infinite && !spring) ? onPropDone : null);
    } else {
      mmStartProp(el, st, prop, mmCurrent(el, st, prop), to, trans, (!infinite && !spring) ? onPropDone : null);
    }
  }
  if (pending <= 0 && end && !endApplied) {
    endApplied = true;
    for (var k2 in end) {
      if (Object.prototype.hasOwnProperty.call(end, k2)) {
        var a2 = st.anim[k2];
        if (a2) { a2.dead = true; delete st.anim[k2]; }
        mmWriteProp(el, st, k2, end[k2]);
      }
    }
  }
  return variant;
}

/* 初值直达（initial，无动画；数组关键帧取首值） */
function mmSetInitial(el, variant, custom) {
  var st = mmGetState(el);
  var v = mmResolveVariant(variant, custom);
  if (!v) return;
  for (var prop in v) {
    if (!Object.prototype.hasOwnProperty.call(v, prop)) continue;
    if (prop === 'transition' || prop === 'transitionEnd') continue;
    var val = v[prop];
    if (Array.isArray(val)) val = val[0];
    if (typeof val === 'object' && !(typeof val === 'string')) continue;
    mmWriteProp(el, st, prop, val);
  }
}

/* ---------- MotionValue 等价（引擎核心每帧轮询 get 派发 change） ---------- */

function mmMotionValue(getter) {
  return {
    get: getter,
    subs: [],
    subscribe: function (fn) { this.subs.push(fn); },
    emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
  };
}

// ======== manual: manual/diorama-engine-core.js ========
/* =========================================================================
   diorama（镜台）渲染核心 —— Folia diorama 的无构建 three.js 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     components/visualizer/diorama/VisualizerDiorama.tsx（序列机/过渡飞行门控/器乐曲飞越）
     components/visualizer/diorama/CameraRig.tsx（SmoothDamp 跟随 + 13 种运镜手法 + 阅读回正 + 过渡弧线）
     components/visualizer/diorama/DioramaScene.tsx（歌词走廊：canvas 栅格文本/逐字三态/
       心象辉光/灵魂出窍/渐变跟唱/关键字着色/尘埃窗/雾/颜色阻尼）
     components/visualizer/diorama/DioramaParticleField.tsx（点云双 pass：涟漪池/频段
       谷峰追踪/编队聚散/弹性脉冲）
     components/visualizer/VisualizerSubtitleOverlay.tsx + runtime.ts
       （底部字幕翻译行/下一句预览 + activeLine/recentCompleted/nextLines）
     utils/appPlaybackHelpers.ts:21（findLatestActiveLineIndex 权威行索引语义）
   纯逻辑闭包（cameraPath/sequencer/transition/geometry/moteField/corridor/
   particleModel/surfaces/shaders/materials/keywordColor/textRaster + graphemeTiming/
   renderHints/fontStacks/wordColoring/subtitleFontSizes/types 常量）由管线 tsc
   自动落地——本文件只是 R3F 声明树的命令式宿主（每函数标注源文件行号）。

   结构对应（R3F/React → 无构建）：
     <Canvas camera dpr gl>  → THREE.WebGLRenderer({alpha:true,antialias:true}) +
                               PerspectiveCamera(55, aspect, 0.1, 1000)（R3F 缺省 near/far）
     scene fog（:846-852）   → scene.fog = THREE.Fog(bg, 12, 30)，颜色随 useFrame 阻尼
     useFrame ×3             → 单 rAF 循环按组件挂载序驱动：CameraRig → DioramaScene →
                               DioramaParticleField（与 R3F 同序，CameraRig 读到上一帧行宽）
     useMemo/重渲染          → 输入 key 缓存 + 脏检重建（挂载窗/点云簇/走廊段/栅格缓存）
     VisualizerShell         → 覆盖层壳（本项目 #diorama-overlay 自持背景，canvas 透明）
   MineRadio 宿主差异（数据源在桥，均已在桥内注明）：
     - tuning 固定 DEFAULT_DIORAMA_TUNING（types.ts:883-903 原值，与原版面板默认一致）
     - theme.animationIntensity='normal'、wordColors=[]（无 AI 词色表，关键字 matcher 空
       表 → 场景原样回退纯主色着色）
     - 无 romanization/alternateTexts → 底部字幕单 translation 轨（同 classic 试点口径）
     - three.js 走独立 0.185 ES 模块（window.THREE185），不影响应用内置 r128 全局
   ========================================================================= */

/* ---------- 手工纯函数的稳定导出名（tests/diorama.test.js 经 env 直达） ---------- */
var DioramaBuildActiveUnits = dioramaBuildActiveUnits;
var DioramaFindLineIndexAtTime = dioramaFindLineIndexAtTime;
var DioramaResolveGradientEnergy = dioramaResolveGradientEnergy;
var DioramaResolveTextLife = dioramaResolveTextLife;
var DioramaBuildPhantomLines = dioramaBuildInstrumentalPhantomLines;

/* ---------- R3F <Canvas> 缺省相机（VisualizerDiorama:404）与帧循环 ---------- */

/* tuning 缺省（types.ts:883-903 DEFAULT_DIORAMA_TUNING 原值，闭包 types 段落地）。
   manual 段在 alias 注入之前求值——顶层不能直接读 DIO_* 别名，首次取用时再展开。 */
var DioramaDefaults = null;
function dioramaEnsureDefaults() {
  if (DioramaDefaults) return DioramaDefaults;
  DioramaDefaults = {
    tuning: DIO_DEFAULT_TUNING,
    geometryVisibility: DIO_DEFAULT_GEOMETRY_VISIBILITY,
    particleDensity: DIO_DEFAULT_TUNING.particleDensity,
    particleScale: DIO_DEFAULT_TUNING.particleScale,
    particleGlowEnabled: DIO_DEFAULT_TUNING.particleGlowEnabled,
    particleGlowIntensity: DIO_DEFAULT_TUNING.particleGlowIntensity,
    showParticles: DIO_DEFAULT_TUNING.showParticles,
    backgroundParticleCircumference: DIO_DEFAULT_TUNING.backgroundParticleCircumference,
    backgroundParticleRadial: DIO_DEFAULT_TUNING.backgroundParticleRadial,
    /* 有效强度（VisualizerDiorama:444-454：开关关闭归 0） */
    glowIntensity: DIO_DEFAULT_TUNING.glowEnabled ? DIO_DEFAULT_TUNING.glowIntensity : 0,
    soulIntensity: DIO_DEFAULT_TUNING.soulEnabled ? DIO_DEFAULT_TUNING.soulIntensity : 0,
    soulActiveEnabled: DIO_DEFAULT_TUNING.soulEnabled && DIO_DEFAULT_TUNING.soulActiveEnabled,
    gradientIntensity: DIO_DEFAULT_TUNING.gradientEnabled ? DIO_DEFAULT_TUNING.gradientIntensity : 0,
    keywordColoringEnabled: DIO_DEFAULT_TUNING.keywordColoringEnabled
  };
  /* env 导出在加载期做了值快照——惰性展开后回写，宿主/测试读到同一对象 */
  if (typeof env !== 'undefined' && env) { try { env.DioramaDefaults = DioramaDefaults; } catch (e) { } }
  return DioramaDefaults;
}

/* resolveDioramaMotionParams 包装（VisualizerDiorama:138-141）：tuning 固定缺省 + 主题强度 */
function DioramaResolveMotionParams(themeIntensity) {
  dioramaEnsureDefaults();
  return DIO_resolveDioramaMotionParams(DIO_DEFAULT_TUNING, themeIntensity || 'normal');
}

/* =========================================================================
   DioramaScene.tsx 纯函数段（:219-359 / CameraRig.tsx:143-162 / runtime 派生）
   ========================================================================= */

/* smoothstep01（:227） */
function dioramaSmoothstep01(t) {
  var c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/* stepEnvelope（:224-225）：快攻慢释包络 */
function dioramaStepEnvelope(current, target, attack, release, delta) {
  return current + (target - current) * (1 - Math.exp(-(target > current ? attack : release) * delta));
}

/* GRADIENT_HOLD/TRAIL（:231-232）+ resolveGradientEnergy（:250-262） */
var DIO_GRADIENT_HOLD_SECONDS = 0.35;
var DIO_GRADIENT_TRAIL_SECONDS = 1.8;
function dioramaResolveGradientEnergy(now, unit) {
  if (now <= unit.startTime) return 0;
  if (now < unit.endTime) {
    var span = Math.max(unit.endTime - unit.startTime, 0.001);
    return dioramaSmoothstep01(Math.min(1, Math.max(0, (now - unit.startTime) / span)));
  }
  var sinceSung = now - unit.endTime;
  if (sinceSung <= DIO_GRADIENT_HOLD_SECONDS) return 1;
  return 1 - dioramaSmoothstep01(Math.min(1, Math.max(0, (sinceSung - DIO_GRADIENT_HOLD_SECONDS) / DIO_GRADIENT_TRAIL_SECONDS)));
}

/* resolveDioramaUnitFill（:275-280）：写 out，零分配 */
function dioramaResolveUnitFill(out, primary, target, progress) {
  return out.copy(primary).lerp(target, Math.min(1, Math.max(0, progress)));
}

/* shouldResetDioramaUnitState（:298-303） */
function dioramaShouldResetUnitState(prevGlobal, globalIndex, unitStateLength, unitCount) {
  return prevGlobal !== globalIndex || unitStateLength !== unitCount;
}

/* 文本生命周期常量（:181-192）+ resolveTextLife（:309-313） */
var DIO_TEXT_DISSOLVE_START = 2.0;
var DIO_TEXT_DISSOLVE_END = 0.9;
var DIO_TEXT_FADE_IN_START = 32;
var DIO_TEXT_FADE_IN_END = 40;
function dioramaResolveTextLife(distanceToCamera) {
  var farT = Math.min(1, Math.max(0, (DIO_TEXT_FADE_IN_END - distanceToCamera) / (DIO_TEXT_FADE_IN_END - DIO_TEXT_FADE_IN_START)));
  var nearT = Math.min(1, Math.max(0, (distanceToCamera - DIO_TEXT_DISSOLVE_END) / (DIO_TEXT_DISSOLVE_START - DIO_TEXT_DISSOLVE_END)));
  return (farT * farT * (3 - 2 * farT)) * (nearT * nearT * (3 - 2 * nearT));
}

/* 邻行/离场行不透明度（:150-163） */
function dioramaResolveNeighborLineOpacity(offset) {
  if (offset === -1) return 0.3;
  if (offset === -2) return 0.1;
  if (offset === 1) return 0.34;
  if (offset === 2) return 0.16;
  if (offset === 3) return 0.06;
  return 0;
}
function dioramaResolveOutgoingLineOpacity(offsetFromOutgoing) {
  return offsetFromOutgoing === 0 ? 0.7 : (Math.abs(offsetFromOutgoing) <= 2 ? 0.45 : 0.25);
}

/* 行字号/取景常量（:167-178） */
var DIO_LINE_FONT_SIZE = 0.62;
var DIO_TARGET_FRAME_WIDTH_FRACTION = 0.72;
var DIO_MIN_FIT_SCALE = 0.28;
var DIO_DEG_TO_RAD = Math.PI / 180;
var DIO_FOG_NEAR = 12;
var DIO_FOG_FAR = 30;
var DIO_COLOR_DAMP_RATE = 1.2;
/* 逐字三态常量（:201-217） */
var DIO_ACTIVE_LINE_OPACITY = 0.92;
var DIO_UNSUNG_UNIT_OPACITY = 0.5;
var DIO_UNIT_GLOW_MAX_OPACITY = 0.9;
var DIO_SOUL_MAX_OPACITY = 0.6;
var DIO_SOUL_ACTIVE_LIFT_EM = 0.06;
var DIO_SOUL_DETACH_LIFT_EM = 0.5;
var DIO_SOUL_ACTIVE_SWELL = 0.1;
var DIO_SOUL_DETACH_SWELL = 0.3;
var DIO_SOUL_HANDOFF_SECONDS = 0.5;
/* 挂载窗/走廊窗/栅格预算（:126-146） */
var DIO_LINES_AHEAD = 3;
var DIO_LINES_BEHIND = 2;
var DIO_OUTGOING_LINES_BEHIND = 2;
var DIO_OUTGOING_LINES_AHEAD = 1;
var DIO_CORRIDOR_LINES_AHEAD = 7;
var DIO_CORRIDOR_LINES_BEHIND = 6;
var DIO_NEIGHBOR_RASTER_BUDGET = 2;

/* resolveFrameFitScale（:317-327）：固定 HERO 距离取景适配 */
function dioramaResolveFrameFitScale(renderedWidth, distance, verticalFovDeg, aspect) {
  if (renderedWidth <= 0 || distance <= 0) return 1;
  var frameWidth = 2 * distance * Math.tan((verticalFovDeg * DIO_DEG_TO_RAD) / 2) * aspect;
  var targetWidth = frameWidth * DIO_TARGET_FRAME_WIDTH_FRACTION;
  return Math.min(1, Math.max(DIO_MIN_FIT_SCALE, targetWidth / renderedWidth));
}

/* frameQuaternion（:350-359）：+X→right, +Y→up, +Z→-forward 基旋转 + yaw/roll 后乘 */
var _dioBasisRight = null, _dioBasisUp = null, _dioBasisFwd = null, _dioBasisMatrix = null,
    _dioBasisQuat = null, _dioTiltQuat = null, _dioAxisY = null, _dioAxisZ = null;
function dioramaFrameQuaternion(THREE, frame, roll, yaw) {
  if (!_dioBasisMatrix) {
    _dioBasisRight = new THREE.Vector3(); _dioBasisUp = new THREE.Vector3(); _dioBasisFwd = new THREE.Vector3();
    _dioBasisMatrix = new THREE.Matrix4(); _dioBasisQuat = new THREE.Quaternion(); _dioTiltQuat = new THREE.Quaternion();
    _dioAxisY = new THREE.Vector3(0, 1, 0); _dioAxisZ = new THREE.Vector3(0, 0, 1);
  }
  _dioBasisRight.set(frame.right.x, frame.right.y, frame.right.z);
  _dioBasisUp.set(frame.up.x, frame.up.y, frame.up.z);
  _dioBasisFwd.set(-frame.forward.x, -frame.forward.y, -frame.forward.z);
  _dioBasisMatrix.makeBasis(_dioBasisRight, _dioBasisUp, _dioBasisFwd);
  _dioBasisQuat.setFromRotationMatrix(_dioBasisMatrix);
  if (yaw) _dioBasisQuat.multiply(_dioTiltQuat.setFromAxisAngle(_dioAxisY, yaw));
  if (roll) _dioBasisQuat.multiply(_dioTiltQuat.setFromAxisAngle(_dioAxisZ, roll));
  return [_dioBasisQuat.x, _dioBasisQuat.y, _dioBasisQuat.z, _dioBasisQuat.w];
}

/* CJK_GRAPHEME_RE（:393）：按码点逐字拆分（含 CJK/假名/私用区/间隔号/几何图形） */
var DIO_CJK_GRAPHEME_RE = /[\u2E80-\u9FFF\u3040-\u30FF\uF000-\uFADF\uFF66-\uFF9F\u2022\u00B7\u25A0-\u25FF]/;

/* isInterludeLine（parserCore.ts:56,119） */
function dioramaIsInterludeLine(line) {
  return !!line && line.fullText === '......';
}

/* buildInstrumentalPhantomLines（VisualizerDiorama:70-88）：器乐曲幻影行 */
var DIO_INSTRUMENTAL_FRAMES = 96;
var DIO_INSTRUMENTAL_SECONDS_PER_FRAME = 5;
function dioramaBuildInstrumentalPhantomLines() {
  var result = [];
  for (var i = 0; i < DIO_INSTRUMENTAL_FRAMES; i += 1) {
    var block = Math.floor(i / 4);
    var isChorus = block % 3 === 2;
    result.push({
      words: [],
      startTime: i * DIO_INSTRUMENTAL_SECONDS_PER_FRAME,
      endTime: (i + 1) * DIO_INSTRUMENTAL_SECONDS_PER_FRAME,
      fullText: '',
      blockIndex: block,
      songPart: isChorus ? 'chorus' : 'verse',
      isChorus: isChorus
    });
  }
  return result;
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-32）——权威行索引语义 */
function dioramaFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* getRecentCompletedLine / getUpcomingLines（runtime.ts:35-52 / :76-86） */
function dioramaGetRecentCompletedLine(lines, currentLineIndex, now) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (now > CM_getLineRenderEndTime(lines[i])) return lines[i];
  }
  return null;
}
function dioramaGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0 || !lines) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20） */
function dioramaHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* resolveWordProgress（CameraRig.tsx:143-162）：0..1 字素揭示比例（随活动字素内插） */
function dioramaResolveWordProgress(line, timeline, now) {
  if (timeline.length === 0) return 0;
  var renderEndTime = CM_getLineRenderEndTime(line);
  if (now >= renderEndTime) return 1;
  if (now <= line.startTime) return 0;
  var revealed = 0;
  for (var i = 0; i < timeline.length; i += 1) {
    var timing = timeline[i];
    if (now >= timing.endTime) {
      revealed = i + 1;
    } else if (now >= timing.startTime) {
      var span = Math.max(timing.endTime - timing.startTime, 0.001);
      revealed = i + Math.min(1, Math.max(0, (now - timing.startTime) / span));
      break;
    } else {
      break;
    }
  }
  return revealed / timeline.length;
}

/* 活动行拆字元（DioramaScene:381-401 LyricUnit + :658-701 activeLineUnits）：
   CJK 字素逐字一元，连续非 CJK 同词字素并作一元；空白只做间隔不进元。 */
function dioramaBuildActiveUnits(line, timeline) {
  if (!line || timeline.length === 0) return [];
  var graphemes = CM_splitLyricGraphemes(line.fullText);
  var charOffsets = [];
  var acc = 0;
  for (var g = 0; g < graphemes.length; g += 1) { charOffsets.push(acc); acc += graphemes[g].length; }
  var units = [];
  var pushUnit = function (from, to) {
    var text = graphemes.slice(from, to).join('');
    if (text.trim().length === 0) return;
    units.push({
      text: text,
      charStart: charOffsets[from] != null ? charOffsets[from] : 0,
      charEnd: (charOffsets[to - 1] != null ? charOffsets[to - 1] : 0) + (graphemes[to - 1] ? graphemes[to - 1].length : 1),
      startTime: timeline[from].startTime,
      endTime: timeline[to - 1].endTime
    });
  };
  var i = 0;
  while (i < timeline.length) {
    var g2 = graphemes[i] != null ? graphemes[i] : '';
    if (g2.trim().length === 0) { i += 1; continue; }
    if (DIO_CJK_GRAPHEME_RE.test(g2)) { pushUnit(i, i + 1); i += 1; continue; }
    var wordIndex = timeline[i].wordIndex;
    var j = i + 1;
    while (
      j < timeline.length
      && timeline[j].wordIndex === wordIndex
      && (graphemes[j] != null ? graphemes[j] : '').trim().length > 0
      && !DIO_CJK_GRAPHEME_RE.test(graphemes[j] != null ? graphemes[j] : '')
    ) {
      j += 1;
    }
    pushUnit(i, j);
    i = j;
  }
  return units;
}

/* =========================================================================
   CameraRig（CameraRig.tsx:164-436 命令式落地）
   ========================================================================= */
function DioramaCreateCameraRig(THREE) {
  /* refs（:175-197） */
  var flight = { flying: false, epoch: 0, start: 0, perp: new THREE.Vector3(), side: 1, flightLen: 1 };
  var posRef = new THREE.Vector3(0, 0.6, 9);
  var posVelRef = new THREE.Vector3(0, 0, 0);
  var lookRef = new THREE.Vector3(0, 0, -10);
  var lookVelRef = new THREE.Vector3(0, 0, 0);
  var alignRef = 0;
  var alignQuatRef = new THREE.Quaternion();
  var alignQuatInit = false;
  var orientRef = new THREE.Quaternion();
  var orientInit = false;

  /* 常量（:75-138） */
  var ALIGN_SHOT_CEILING = { hold: 0.9, pushIn: 0.85, track: 0.85, swell: 0.8, float: 0.78, glide: 0.72, crane: 0.7, pullBack: 0.7, arc: 0.62, pendulum: 0.6, orbit: 0.55, spiral: 0.5, flyby: 0.5 };
  var ALIGN_LEAD_IN = 0.6, ALIGN_SETTLE = 0.35, ALIGN_RELEASE = 1.0, ALIGN_RATE = 1.2, ALIGN_TURN_RATE = 2.6;
  var FRAME_KEEP_FRACTION = 0.7;
  var FLIGHT_SMOOTH_TIME = 1.1, FLIGHT_ARC_FRAC = 0.16;
  var ORIENT_FOLLOW_RATE = 4.2;
  var UP = new THREE.Vector3(0, 1, 0);

  /* memo 等价：resolved/timeline/shot/placement 随（globalIndex, linesEpoch, motion）重算（:202-215） */
  var cache = { key: null, resolved: null, line: null, timeline: [], shotKind: 'hold', placement: null };
  function resolveCtx(ctx) {
    var key = ctx.globalIndex + '|' + ctx.linesEpoch + '|' + ctx.weaveScale + '|' + ctx.subMode;
    if (key === cache.key) return cache;
    var resolved = DIO_resolveGlobal(ctx.sequencer, ctx.globalIndex);
    var line = resolved ? (resolved.line || null) : null;
    cache = {
      key: key,
      resolved: resolved,
      line: line,
      timeline: line ? CM_buildLineGraphemeTimeline(line) : [],
      shotKind: resolved ? DIO_getDioramaShot(resolved.localIndex, resolved.segment.lines, resolved.segment.seed, ctx.subMode) : 'hold',
      placement: DIO_getDioramaTextPlacement(resolved ? resolved.localIndex : 0, resolved ? resolved.segment.seed : undefined, ctx.weaveScale)
    };
    return cache;
  }

  /* 每帧临时对象（:111-131 等价，零分配） */
  var _alignRight = new THREE.Vector3(), _alignUp = new THREE.Vector3(), _alignFwd = new THREE.Vector3();
  var _alignMatrix = new THREE.Matrix4(), _alignQuat = new THREE.Quaternion(), _tiltQuat = new THREE.Quaternion();
  var _lookQuat = new THREE.Quaternion(), _AXIS_Y = new THREE.Vector3(0, 1, 0), _AXIS_Z = new THREE.Vector3(0, 0, 1);
  var _viewDir = new THREE.Vector3(), _camForward = new THREE.Vector3(), _targetQuat = new THREE.Quaternion();
  var _flightTo = new THREE.Vector3();

  function step(delta, elapsed, ctx) {
    var c = resolveCtx(ctx);
    var resolved = c.resolved, line = c.line, timeline = c.timeline, shotKind = c.shotKind, placement = c.placement;
    /* Frame-lock（:218-221）：解不出真帧时保持当前姿态 */
    if (!resolved) return;
    var now = ctx.now;
    var wordProgress = line ? dioramaResolveWordProgress(line, timeline, now) : 0;
    var progress = line ? 1 : 0;
    if (line) {
      var renderEndTime = CM_getLineRenderEndTime(line);
      var span = renderEndTime - line.startTime;
      progress = span > 0 ? Math.min(1, Math.max(0, (now - line.startTime) / span)) : (now >= line.startTime ? 1 : 0);
    }

    var camera = ctx.camera;
    var aspect = camera.isPerspectiveCamera ? camera.aspect : 1;
    var fov = camera.isPerspectiveCamera ? camera.fov : 55;
    var visibleHalf = DIO_frameHalfWidth(DIO_HERO_DISTANCE, fov, aspect) * 0.92; /* DIORAMA_SAFE_FRAME_FRACTION :50 */

    var frame = resolved.frame;
    var R = frame.right, U = frame.up, F = frame.forward;

    var settle = line ? DIO_resolveHoldSettle(now - CM_getLineRenderEndTime(line)) : 1;

    /* 读头 = 行真实文本位（路径锚 + 放置偏移）+ 逐词横移（:248-255） */
    var truck = DIO_resolveReadHeadTruck(wordProgress, ctx.activeLineWidth, visibleHalf) * settle;
    var headR = placement.offsetR + truck;
    var headU = placement.offsetU;
    var baseX = frame.position.x + R.x * headR + U.x * headU;
    var baseY = frame.position.y + R.y * headR + U.y * headU;
    var baseZ = frame.position.z + R.z * headR + U.z * headU;

    /* 运镜手法偏移 + 手持微漂（:257-276） */
    var shotSeed = resolved.segment.seed;
    var shot = DIO_resolveShotOffset(shotKind, {
      progress: progress,
      wordProgress: wordProgress,
      hero: DIO_HERO_DISTANCE,
      lift: DIO_CAMERA_LIFT,
      seed: shotSeed,
      lineIndex: resolved.localIndex,
      moveScale: ctx.moveScale * settle
    });
    var drift = DIO_resolveCameraDrift(now, shotSeed, ctx.driftScale);
    var offRight = shot.right + drift.swayX;
    var offUp = shot.up + drift.swayY + drift.lift;
    var offBack = shot.back + drift.dist;
    var poseX = baseX + R.x * offRight + U.x * offUp - F.x * offBack;
    var poseY = baseY + R.y * offRight + U.y * offUp - F.y * offBack;
    var poseZ = baseZ + R.z * offRight + U.z * offUp - F.z * offBack;

    /* 过渡飞行（:278-314）：抑制 seek-snap + 拉长 smooth-time + 衰减弧/侧倾/瞄准扫摆 */
    if (ctx.transitionEpoch !== flight.epoch && ctx.transitionEpoch > 0) {
      flight.epoch = ctx.transitionEpoch;
      flight.flying = true;
      flight.start = elapsed;
      _flightTo.set(poseX, poseY, poseZ);
      var perp = DIO_flightPerp({ x: posRef.x, y: posRef.y, z: posRef.z }, { x: _flightTo.x, y: _flightTo.y, z: _flightTo.z });
      flight.perp.set(perp.x, perp.y, perp.z);
      flight.side = DIO_flightSide(shotSeed, ctx.transitionEpoch);
      flight.flightLen = posRef.distanceTo(_flightTo);
    }
    var flying = false;
    var te = 1;
    if (flight.flying) {
      te = (elapsed - flight.start) / DIO_TRANSITION_DURATION;
      if (te >= 1) flight.flying = false;
      else flying = true;
    }
    var followSmooth = flying
      ? FLIGHT_SMOOTH_TIME + (ctx.smoothTime - FLIGHT_SMOOTH_TIME) * DIO_transitionEase(te)
      : ctx.smoothTime;
    var swayEnv = flying ? Math.sin(Math.PI * te) * Math.sin(Math.PI * te) : 0;
    var arcMag = swayEnv * flight.flightLen * FLIGHT_ARC_FRAC;
    var sweepMag = swayEnv * flight.flightLen * DIO_TRANSITION_AIM_SWEEP * flight.side;
    var bank = swayEnv * DIO_TRANSITION_BANK * flight.side;

    /* SmoothDamp 跟随（:316-330）：非飞行期大跳（seek）直接 snap */
    var posGap = Math.sqrt(
      (poseX - posRef.x) * (poseX - posRef.x) + (poseY - posRef.y) * (poseY - posRef.y) + (poseZ - posRef.z) * (poseZ - posRef.z)
    );
    var snapped = !flying && posGap > 24; /* DIORAMA_SNAP_DISTANCE :58 */
    if (snapped) {
      posRef.set(poseX, poseY, poseZ);
      posVelRef.set(0, 0, 0);
    } else {
      var sx = DIO_smoothDamp(posRef.x, poseX, posVelRef.x, followSmooth, delta);
      var sy = DIO_smoothDamp(posRef.y, poseY, posVelRef.y, followSmooth, delta);
      var sz = DIO_smoothDamp(posRef.z, poseZ, posVelRef.z, followSmooth, delta);
      posRef.set(sx.value, sy.value, sz.value);
      posVelRef.set(sx.velocity, sy.velocity, sz.velocity);
    }
    /* 弧线是衰减视觉偏移，不进 posRef（:331-337） */
    camera.position.set(
      posRef.x + flight.perp.x * arcMag,
      posRef.y + flight.perp.y * arcMag + arcMag * 0.5,
      posRef.z + flight.perp.z * arcMag
    );

    /* 瞄准点 = 读头 + 三分构图 look 偏移，同法 SmoothDamp；飞行期横扫（:339-356） */
    var lookOff = placement.lookR * settle;
    var lookX = baseX + R.x * lookOff + flight.perp.x * sweepMag;
    var lookY = baseY + R.y * lookOff + flight.perp.y * sweepMag;
    var lookZ = baseZ + R.z * lookOff + flight.perp.z * sweepMag;
    var lookGap = Math.sqrt(
      (lookX - lookRef.x) * (lookX - lookRef.x) + (lookY - lookRef.y) * (lookY - lookRef.y) + (lookZ - lookRef.z) * (lookZ - lookRef.z)
    );
    if (!flying && lookGap > 24) {
      lookRef.set(lookX, lookY, lookZ);
      lookVelRef.set(0, 0, 0);
    } else {
      var lx = DIO_smoothDamp(lookRef.x, lookX, lookVelRef.x, followSmooth, delta);
      var ly = DIO_smoothDamp(lookRef.y, lookY, lookVelRef.y, followSmooth, delta);
      var lz = DIO_smoothDamp(lookRef.z, lookZ, lookVelRef.z, followSmooth, delta);
      lookRef.set(lx.value, ly.value, lz.value);
      lookVelRef.set(lx.velocity, ly.velocity, lz.velocity);
    }

    /* lookAt 前复位 up（:358-361）：地平线保持水平 */
    camera.up.copy(UP);
    camera.lookAt(lookRef);

    /* 阅读回正（:363-385）：目标文本平面姿态跳变 → 相机追踪平滑四元数副本 */
    _alignRight.set(R.x, R.y, R.z);
    _alignUp.set(U.x, U.y, U.z);
    _alignFwd.set(-F.x, -F.y, -F.z);
    _alignMatrix.makeBasis(_alignRight, _alignUp, _alignFwd);
    _alignQuat.setFromRotationMatrix(_alignMatrix);
    if (placement.yaw !== 0) _alignQuat.multiply(_tiltQuat.setFromAxisAngle(_AXIS_Y, placement.yaw));
    if (placement.roll !== 0) _alignQuat.multiply(_tiltQuat.setFromAxisAngle(_AXIS_Z, placement.roll));
    if (snapped || !alignQuatInit) {
      alignQuatRef.copy(_alignQuat);
      alignQuatInit = true;
    } else {
      alignQuatRef.slerp(_alignQuat, 1 - Math.exp(-ALIGN_TURN_RATE * delta));
    }

    /* 连续阅读需求（:387-397）：唱窗两侧平滑斜坡 × 该运镜的对齐上限 */
    var readTarget = 0;
    if (line) {
      var renderEnd = CM_getLineRenderEndTime(line);
      var rampIn = dioramaSmoothstep01((now - (line.startTime - ALIGN_LEAD_IN)) / (ALIGN_LEAD_IN + ALIGN_SETTLE));
      var rampOut = 1 - dioramaSmoothstep01((now - renderEnd) / ALIGN_RELEASE);
      readTarget = Math.min(rampIn, rampOut) * (ALIGN_SHOT_CEILING[shotKind] != null ? ALIGN_SHOT_CEILING[shotKind] : 0.7);
    }
    alignRef += (readTarget - alignRef) * (1 - Math.exp(-ALIGN_RATE * delta));

    /* 姿态目标合成（:399-416）：lookAt 纯瞄准 → 回正混合 → 画框保持钳制 */
    _lookQuat.copy(camera.quaternion);
    _targetQuat.copy(_lookQuat).slerp(alignQuatRef, alignRef);

    _viewDir.subVectors(lookRef, camera.position).normalize();
    _camForward.set(0, 0, -1).applyQuaternion(_targetQuat);
    var offAxisAngle = _camForward.angleTo(_viewDir);
    var halfV = (fov * DIO_DEG_TO_RAD) / 2;
    var halfH = Math.atan(Math.tan(halfV) * aspect);
    var maxOffAxis = Math.min(halfV, halfH) * FRAME_KEEP_FRACTION;
    if (offAxisAngle > maxOffAxis) {
      _targetQuat.slerp(_lookQuat, 1 - maxOffAxis / offAxisAngle);
    }

    /* 姿态跟随器（:418-430）：唯一写 camera.quaternion 的地方 */
    if (snapped || !orientInit) {
      orientRef.copy(_targetQuat);
      orientInit = true;
    } else {
      orientRef.slerp(_targetQuat, 1 - Math.exp(-ORIENT_FOLLOW_RATE * delta));
    }
    camera.quaternion.copy(orientRef);
    if (bank !== 0) camera.rotateZ(bank);
    rigLast = {
      now: now, delta: delta, smoothTime: ctx.smoothTime, settle: settle,
      truck: truck, wordProgress: wordProgress, progress: progress,
      moveScale: ctx.moveScale, driftScale: ctx.driftScale,
      activeLineWidth: ctx.activeLineWidth,
      ctxKeys: Object.keys(ctx).join(','),
      pose: [poseX, poseY, poseZ],
      look: [lookX, lookY, lookZ],
      shotRight: shot.right, shotUp: shot.up, shotBack: shot.back
    };
  }

  var rigLast = null;
  return {
    step: step,
    __debug: function () {
      return {
        pos: posRef.toArray(),
        look: lookRef.toArray(),
        last: rigLast,
        alignRef: alignRef,
        flying: flight.flying,
        cacheShot: cache.shotKind,
        cacheLine: cache.line ? cache.line.startTime : null
      };
    }
  };
}

/* =========================================================================
   DioramaScene（DioramaScene.tsx:403-1267 命令式落地）
   ========================================================================= */
function DioramaCreateDioramaScene(THREE, opts) {
  var theme = opts.theme;
  var tuning = opts.tuning || dioramaEnsureDefaults();
  var motion = opts.motion;
  var host = opts.host;
  var scene = opts.scene;
  var self = {
    corridorSpans: [],
    particleClusters: [],
    activeLineWidth: 0
  };

  /* useMemo colors/colorTargets（:460-473） */
  var colorTargets = {
    primary: new THREE.Color(theme.primaryColor),
    accent: new THREE.Color(theme.accentColor || theme.primaryColor),
    secondary: new THREE.Color(theme.secondaryColor),
    bg: new THREE.Color(theme.backgroundColor)
  };
  var damped = null; /* 首帧从 targets 克隆（:857-864） */

  /* 场景雾（:845-852）：命令式挂 scene.fog */
  scene.fog = new THREE.Fog(colorTargets.bg.getHex(), DIO_FOG_NEAR, DIO_FOG_FAR);

  /* 字体（:477-492）：fontsEpoch = document.fonts.ready 一次性 +1 */
  var fontsEpoch = 0;
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fontsEpoch += 1; fontDirty = true; }).catch(function () { });
  }
  var fontDirty = true;
  var fontStack = '';
  var fontWeight = CM_resolveThemeFontWeight(theme, 700);
  var fontSpec = '';
  function ensureFont() {
    if (!fontDirty) return;
    fontDirty = false;
    fontStack = CM_resolveThemeFontStack(theme);
    fontWeight = CM_resolveThemeFontWeight(theme, 700);
    fontSpec = DIO_buildFontSpec(fontStack, fontWeight);
    lineRasterFontRef = '';
    lineRasterEpochRef = -1;
    flushNeighborRasters();
  }

  /* refs（:432-458 等价） */
  var lineMeshes = new Map();          /* globalIndex -> {mesh, mat, geom} */
  var unitsGroup = null;               /* 活动行逐字元组 */
  var unitBaseMats = [];
  var unitGlowMats = [], unitGlowMeshes = [], unitSoulMats = [], unitSoulMeshes = [];
  var unitGeoms = [], unitKey = null;
  var unitLightVals = null, unitSoulVals = null, prevActiveGlobal = -1;
  var powerEnv = 0, trebleEnv = 0;
  var lineRasterCache = new Map();
  var lineRasterFontRef = '';
  var lineRasterEpochRef = -1;
  var activeUnitsRaster = null, activeUnitsRasterPrev = null;
  var activeUnitsUnits = [];
  var keywordMatchers = DIO_prepareKeywordMatchers(theme.wordColors, tuning.keywordColoringEnabled);
  var keywordUnitColors = new Map();

  /* 尘埃窗（:624-642 + :1121-1137 JSX → 命令式） */
  var moteCircumference = DIO_resolveMoteCircumference(tuning.backgroundParticleCircumference);
  var moteRadial = DIO_resolveMoteRadial(tuning.backgroundParticleRadial);
  var moteDensity = moteCircumference * moteRadial;
  var motePositions = new Float32Array(DIO_MOTE_WINDOW_LINES * moteDensity * 3);
  var moteWritten = [];
  var moteGeometry = new THREE.BufferGeometry();
  var moteAttr = new THREE.BufferAttribute(motePositions, 3);
  moteGeometry.setAttribute('position', moteAttr);
  var moteMat = new THREE.PointsMaterial({
    size: 0.03, sizeAttenuation: true, transparent: true, opacity: 0.2,
    depthWrite: false, color: new THREE.Color(theme.secondaryColor),
    blending: THREE.NormalBlending
  });
  var motePoints = new THREE.Points(moteGeometry, moteMat);
  motePoints.frustumCulled = false;
  if (tuning.showParticles) scene.add(motePoints);

  /* 挂载窗 memo（:508-546） */
  var winCache = { key: null, visibleLines: [] };
  function rebuildWindow(ctx) {
    var total = ctx.total;
    var seq = ctx.sequencer;
    var outgoing = ctx.transitionOutgoingIndex;
    var indices = new Set();
    var addWindow = function (center, behind, ahead) {
      var start = Math.max(center - behind, 0);
      var end = Math.min(center + ahead, total - 1);
      for (var i = start; i <= end; i += 1) indices.add(i);
    };
    addWindow(ctx.globalIndex, DIO_LINES_BEHIND, DIO_LINES_AHEAD);
    if (outgoing != null) addWindow(outgoing, DIO_OUTGOING_LINES_BEHIND, DIO_OUTGOING_LINES_AHEAD);
    var mountedIndices = Array.from(indices).sort(function (a, b) { return a - b; });

    var visibleLines = [];
    for (var v = 0; v < mountedIndices.length; v += 1) {
      var i2 = mountedIndices[v];
      var resolved = DIO_resolveGlobal(seq, i2);
      if (!resolved || !resolved.line) continue;
      var frame = resolved.frame;
      var placement = DIO_getDioramaTextPlacement(resolved.localIndex, resolved.segment.seed, ctx.weaveScale);
      var position = new THREE.Vector3(
        frame.position.x + frame.right.x * placement.offsetR + frame.up.x * placement.offsetU,
        frame.position.y + frame.right.y * placement.offsetR + frame.up.y * placement.offsetU,
        frame.position.z + frame.right.z * placement.offsetR + frame.up.z * placement.offsetU
      );
      visibleLines.push({
        index: i2,
        line: resolved.line,
        placement: placement,
        position: position,
        quaternion: dioramaFrameQuaternion(THREE, frame, placement.roll, placement.yaw),
        isOutgoing: outgoing != null && Math.abs(i2 - outgoing) <= Math.abs(i2 - ctx.globalIndex)
      });
    }
    winCache = { key: ctx.winKey, visibleLines: visibleLines };

    /* 离场行同步栅格（:829-835）：换场帧无缝由逐字元降为整行平面 */
    if (outgoing != null && !lineRasterCache.has(outgoing)) {
      for (var q = 0; q < visibleLines.length; q += 1) {
        if (visibleLines[q].index === outgoing && visibleLines[q].line.fullText) {
          lineRasterCache.set(outgoing, DIO_rasterLine(visibleLines[q].line.fullText, fontStack, fontWeight));
          break;
        }
      }
    }

    /* 走廊段（:558-577） */
    var geometryVisibility = DIO_DEFAULT_GEOMETRY_VISIBILITY;
    var geometryMode = geometryVisibility.mode || 'clouds';
    if (geometryVisibility.enabled && geometryMode === 'corridor') {
      var live = DIO_buildCorridorWindow(seq, ctx.globalIndex, DIO_CORRIDOR_LINES_BEHIND, DIO_CORRIDOR_LINES_AHEAD);
      if (outgoing == null) self.corridorSpans = live;
      else {
        var outSpans = DIO_buildCorridorWindow(seq, outgoing, DIO_CORRIDOR_LINES_BEHIND, DIO_CORRIDOR_LINES_AHEAD);
        self.corridorSpans = outSpans.concat(live);
      }
    } else {
      self.corridorSpans = [];
    }

    /* 云簇（:588-619）：升序 + 背后短边距参与碰撞投票，再按挂载窗过滤 */
    self.particleClusters = [];
    if (geometryMode === 'clouds') {
      var mounted = new Set(mountedIndices);
      var clusterIndices = new Set();
      for (var m = 0; m < mountedIndices.length; m += 1) {
        for (var back = 0; back <= DIO_CLUSTER_COLLISION_LINE_SPAN; back += 1) {
          if (mountedIndices[m] - back >= 0) clusterIndices.add(mountedIndices[m] - back);
        }
      }
      var sorted = Array.from(clusterIndices).sort(function (a, b) { return a - b; });
      var result = [];
      for (var c = 0; c < sorted.length; c += 1) {
        var res2 = DIO_resolveGlobal(seq, sorted[c]);
        if (!res2) continue;
        var placement2 = DIO_getDioramaTextPlacement(res2.localIndex, res2.segment.seed, ctx.weaveScale);
        var shot2 = DIO_getDioramaShot(res2.localIndex, res2.segment.lines, res2.segment.seed, ctx.subMode);
        var pieces = DIO_buildFormation(res2.localIndex, res2.segment.seed, shot2, res2.frame, placement2, tuning.particleScale);
        for (var p = 0; p < pieces.length; p += 1) {
          var piece = pieces[p];
          result.push({
            kind: piece.kind,
            position: new THREE.Vector3(piece.position.x, piece.position.y, piece.position.z),
            scale: piece.scale,
            stretchY: piece.stretchY,
            upright: piece.upright,
            spinSpeed: piece.spinSpeed,
            colorSlot: piece.colorSlot,
            layer: piece.layer,
            key: sorted[c] + '-' + p,
            sourceLine: sorted[c],
            particleSeed: (res2.segment.seed == null ? 'seed' : res2.segment.seed) + ':' + res2.localIndex + ':' + p + ':' + piece.kind,
            role: 'formation'
          });
        }
      }
      var visible = DIO_selectVisibleDioramaClusters(result, geometryVisibility);
      self.particleClusters = visible.filter(function (cluster) { return mounted.has(cluster.sourceLine); });
    }

    /* 邻行栅格缓存字体/epoch 失配清仓（:767-777 的等价：字体变化/歌词替换） */
    if (lineRasterFontRef !== fontSpec || lineRasterEpochRef !== ctx.linesEpoch) {
      flushNeighborRasters();
    }
  }

  function flushNeighborRasters() {
    lineRasterCache.forEach(function (raster) { raster.texture.dispose(); });
    lineRasterCache.clear();
    lineRasterFontRef = fontSpec;
    lineRasterEpochRef = -1;
  }

  /* 活动行逐字元栅格 + 布局（:729-745） */
  function rebuildActiveUnits(line, entry) {
    var units = activeUnitsUnits;
    var worldPerPx = DIO_LINE_FONT_SIZE / DIO_RASTER_FONT_PX;
    var full = line.fullText;
    var totalPx = DIO_measureText(full, fontSpec);
    var placed = [];
    for (var i = 0; i < units.length; i += 1) {
      var unit = units[i];
      var prefixPx = DIO_measureText(full.slice(0, unit.charStart), fontSpec);
      var raster = DIO_rasterUnit(full.slice(unit.charStart, unit.charEnd), fontSpec);
      placed.push({
        raster: raster,
        centerX: (-totalPx / 2 + prefixPx + raster.advancePx / 2) * worldPerPx,
        width: raster.canvasWidthPx * worldPerPx,
        height: raster.canvasHeightPx * worldPerPx
      });
    }
    /* 前一套纹理释放（:747-755 cleanup 语义） */
    if (activeUnitsRasterPrev) {
      for (var d = 0; d < activeUnitsRasterPrev.units.length; d += 1) {
        activeUnitsRasterPrev.units[d].raster.baseTexture.dispose();
        activeUnitsRasterPrev.units[d].raster.glowTexture.dispose();
      }
    }
    activeUnitsRasterPrev = activeUnitsRaster;
    activeUnitsRaster = { units: placed, lineWidth: totalPx * worldPerPx };
    buildUnitsGroup(entry);
  }

  /* 逐字元三平面组（:1200-1263 JSX → 命令式；key=globalIndex 换行全重建） */
  function buildUnitsGroup(entry) {
    disposeUnitsGroup();
    if (!activeUnitsRaster || !entry) { unitKey = null; return; }
    unitKey = entry.key;
    var group = new THREE.Group();
    group.position.copy(entry.position);
    group.quaternion.set(entry.quaternion[0], entry.quaternion[1], entry.quaternion[2], entry.quaternion[3]);
    var placed = activeUnitsRaster.units;
    for (var i = 0; i < placed.length; i += 1) {
      var p = placed[i];
      /* 辉光平面（:1210-1227）：additive 心象辉光栅格，renderOrder 17，z -0.01 */
      var glowGeom = new THREE.PlaneGeometry(p.width, p.height);
      var glowMat = new THREE.MeshBasicMaterial({
        map: p.raster.glowTexture, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        color: new THREE.Color(theme.accentColor || theme.primaryColor)
      });
      var glowMesh = new THREE.Mesh(glowGeom, glowMat);
      glowMesh.position.set(p.centerX, 0, -0.01);
      glowMesh.renderOrder = 17;
      glowMesh.visible = false;
      group.add(glowMesh);
      /* 灵魂出窍幽影（:1228-1247）：crisp base 栅格 additive，renderOrder 18，z -0.005 */
      var soulGeom = new THREE.PlaneGeometry(p.width, p.height);
      var soulMat = new THREE.MeshBasicMaterial({
        map: p.raster.baseTexture, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        color: new THREE.Color(theme.accentColor || theme.primaryColor)
      });
      var soulMesh = new THREE.Mesh(soulGeom, soulMat);
      soulMesh.position.set(p.centerX, 0, -0.005);
      soulMesh.renderOrder = 18;
      soulMesh.visible = false;
      group.add(soulMesh);
      /* 基底平面（:1248-1259）：renderOrder 19，z 0 */
      var baseGeom = new THREE.PlaneGeometry(p.width, p.height);
      var baseMat = new THREE.MeshBasicMaterial({
        map: p.raster.baseTexture, transparent: true, opacity: DIO_UNSUNG_UNIT_OPACITY,
        depthTest: false, depthWrite: false,
        color: new THREE.Color(theme.primaryColor)
      });
      var baseMesh = new THREE.Mesh(baseGeom, baseMat);
      baseMesh.position.set(p.centerX, 0, 0);
      baseMesh.renderOrder = 19;
      group.add(baseMesh);
      unitGlowMats.push(glowMat); unitGlowMeshes.push(glowMesh);
      unitSoulMats.push(soulMat); unitSoulMeshes.push(soulMesh);
      unitBaseMats.push(baseMat);
      unitGeoms.push(glowGeom, soulGeom, baseGeom);
    }
    scene.add(group);
    unitsGroup = group;
  }

  function disposeUnitsGroup() {
    if (unitsGroup) {
      scene.remove(unitsGroup);
      for (var i = 0; i < unitGeoms.length; i += 1) unitGeoms[i].dispose();
      for (var m = 0; m < unitBaseMats.length; m += 1) unitBaseMats[m].dispose();
      for (var g = 0; g < unitGlowMats.length; g += 1) unitGlowMats[g].dispose();
      for (var s = 0; s < unitSoulMats.length; s += 1) unitSoulMats[s].dispose();
    }
    unitsGroup = null;
    unitBaseMats = []; unitGlowMats = []; unitGlowMeshes = [];
    unitSoulMats = []; unitSoulMeshes = []; unitGeoms = [];
  }

  /* 渐变/ sung 色临时对象（:333-335） */
  var _sungTint = new THREE.Color(), _gradDeep = new THREE.Color(), _neutral = new THREE.Color();

  /* step（useFrame :854-1117 命令式） */
  function step(delta, elapsed, ctx) {
    ensureFont();
    /* 窗口/结构脏检（memo 依赖等价） */
    var winKey = ctx.globalIndex + '|' + ctx.transitionOutgoingIndex + '|' + ctx.total + '|' +
      ctx.linesEpoch + '|' + ctx.weaveScale;
    if (winKey !== winCache.key) rebuildWindow(ctx);
    var visibleLines = winCache.visibleLines;

    /* 颜色阻尼（:855-872） */
    if (!damped) {
      damped = {
        primary: colorTargets.primary.clone(), accent: colorTargets.accent.clone(),
        secondary: colorTargets.secondary.clone(), bg: colorTargets.bg.clone()
      };
    }
    var colorK = 1 - Math.exp(-DIO_COLOR_DAMP_RATE * delta);
    damped.primary.lerp(colorTargets.primary, colorK);
    damped.accent.lerp(colorTargets.accent, colorK);
    damped.secondary.lerp(colorTargets.secondary, colorK);
    damped.bg.lerp(colorTargets.bg, colorK);
    if (scene.fog) scene.fog.color.copy(damped.bg);

    /* 音频包络（:877-883）：音频只进几何/光，从不进相机 */
    var audioK = ctx.audioLevel;
    var treble01 = Math.min(1, ctx.treble / 255) * audioK;
    var power01 = Math.min(1, ctx.power / 255) * audioK;
    trebleEnv = dioramaStepEnvelope(trebleEnv, treble01, 14, 3.2, delta);
    powerEnv = dioramaStepEnvelope(powerEnv, power01, 18, 3.5, delta);
    var camPos = ctx.camera.position;

    /* 尘埃窗回收（:890-911） */
    if (tuning.showParticles) {
      var lastLine = Math.max(0, ctx.total - 1);
      var dirty = false;
      for (var line = ctx.globalIndex - DIO_MOTE_LINES_BEHIND; line <= ctx.globalIndex + DIO_MOTE_LINES_AHEAD; line += 1) {
        var slot = DIO_moteSlot(line);
        if (moteWritten[slot] === line) continue;
        var anchorLine = Math.min(Math.max(line, 0), lastLine);
        var resolved = DIO_resolveGlobal(ctx.sequencer, anchorLine);
        if (!resolved) continue;
        DIO_writeMoteLine(motePositions, DIO_extendDioramaFrame(resolved.frame, line - anchorLine), line,
          moteCircumference, moteRadial, ctx.activeSegSeed);
        moteWritten[slot] = line;
        dirty = true;
      }
      if (dirty) moteAttr.needsUpdate = true;
    }
    /* 尘埃漂移 + 材质（:914-924） */
    motePoints.position.set(
      Math.sin(elapsed * 0.17) * 0.12, Math.sin(elapsed * 0.11 + 1.7) * 0.09, Math.cos(elapsed * 0.13) * 0.12
    );
    moteMat.size = 0.03 * (1 + 0.42 * trebleEnv);
    moteMat.opacity = 0.16 + 0.18 * powerEnv;
    moteMat.color.copy(damped.secondary).lerp(damped.accent, 0.3);

    var aspect = ctx.camera.isPerspectiveCamera ? ctx.camera.aspect : 1;
    var fov = ctx.camera.isPerspectiveCamera ? ctx.camera.fov : 55;

    /* 邻行平面：栅格就绪的行补建 mesh（React bumpNeighborTick 等价），缺栅格按帧预算补栅（:763-812） */
    var wanted = new Set();
    for (var w = 0; w < visibleLines.length; w += 1) {
      if (visibleLines[w].line.fullText && visibleLines[w].index !== ctx.globalIndex) wanted.add(visibleLines[w].index);
    }
    lineRasterCache.forEach(function (raster, index) {
      if (!wanted.has(index)) {
        raster.texture.dispose();
        lineRasterCache.delete(index);
      }
    });
    var missing = [];
    wanted.forEach(function (index) { if (!lineRasterCache.has(index)) missing.push(index); });
    for (var mi = 0; mi < missing.length && mi < DIO_NEIGHBOR_RASTER_BUDGET; mi += 1) {
      for (var q2 = 0; q2 < visibleLines.length; q2 += 1) {
        if (visibleLines[q2].index === missing[mi] && visibleLines[q2].line.fullText && !lineRasterCache.has(missing[mi])) {
          lineRasterCache.set(missing[mi], DIO_rasterLine(visibleLines[q2].line.fullText, fontStack, fontWeight));
          break;
        }
      }
    }
    /* 邻行 fit/透明/着色（:929-954） */
    for (var v2 = 0; v2 < visibleLines.length; v2 += 1) {
      var entry = visibleLines[v2];
      if (entry.index === ctx.globalIndex) continue;
      var rec = lineMeshes.get(entry.index);
      var raster = lineRasterCache.get(entry.index);
      if (!entry.line.fullText) {
        if (rec) { removeLineMesh(entry.index); }
        continue;
      }
      if (!raster) { if (rec) removeLineMesh(entry.index); continue; }
      if (!rec) {
        var worldPerPx0 = DIO_LINE_FONT_SIZE / raster.fontPx;
        var geom = new THREE.PlaneGeometry(raster.canvasWidthPx * worldPerPx0, raster.canvasHeightPx * worldPerPx0);
        var mat = new THREE.MeshBasicMaterial({
          map: raster.texture, transparent: true, opacity: 0, depthWrite: false,
          color: new THREE.Color(theme.primaryColor)
        });
        var mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 0;
        scene.add(mesh);
        rec = { mesh: mesh, mat: mat, geom: geom };
        lineMeshes.set(entry.index, rec);
      }
      rec.mesh.position.copy(entry.position);
      rec.mesh.quaternion.set(entry.quaternion[0], entry.quaternion[1], entry.quaternion[2], entry.quaternion[3]);
      var worldWidth = raster.advancePx * (DIO_LINE_FONT_SIZE / raster.fontPx);
      var fit = dioramaResolveFrameFitScale(worldWidth, DIO_HERO_DISTANCE, fov, aspect) * entry.placement.scale * ctx.lyricsFontScale;
      rec.mesh.scale.setScalar(fit);
      var life = dioramaResolveTextLife(rec.mesh.position.distanceTo(camPos));
      if (entry.isOutgoing) {
        rec.mat.opacity = dioramaResolveOutgoingLineOpacity(entry.index - (ctx.transitionOutgoingIndex != null ? ctx.transitionOutgoingIndex : entry.index)) * life;
        rec.mat.color.copy(damped.primary);
      } else {
        var offset = entry.index - ctx.globalIndex;
        rec.mat.opacity = dioramaResolveNeighborLineOpacity(offset) * life;
        rec.mat.color.copy(offset < 0 ? damped.primary : damped.secondary);
      }
    }
    lineMeshes.forEach(function (rec2, index2) {
      if (!wanted.has(index2)) removeLineMesh(index2);
    });

    /* 活动行逐字元（:956-1116） */
    var activeEntry = null;
    for (var a = 0; a < visibleLines.length; a += 1) {
      if (visibleLines[a].index === ctx.globalIndex) { activeEntry = visibleLines[a]; break; }
    }
    var activeLine = ctx.activeLine;
    var units = activeLine ? dioramaBuildActiveUnitsCached(activeLine) : [];
    activeUnitsUnits = units;

    if (dioramaShouldResetUnitState(prevActiveGlobal, ctx.globalIndex, unitLightVals ? unitLightVals.length : undefined, units.length)) {
      prevActiveGlobal = ctx.globalIndex;
      unitLightVals = new Float32Array(units.length);
      unitSoulVals = new Float32Array(units.length);
      unitBaseMats.length = units.length;
      unitGlowMats.length = units.length;
      unitGlowMeshes.length = units.length;
      unitSoulMats.length = units.length;
      unitSoulMeshes.length = units.length;
    }
    /* 逐字元组重建（key=globalIndex→group 重建；本行词替换→只重栅格 :298-303 注） */
    if (activeLine && activeEntry && activeLine.fullText) {
      var unitsRasterKey = ctx.globalIndex + '|' + ctx.linesEpoch + '|' + fontSpec;
      if (unitKey !== unitsRasterKey || !activeUnitsRaster) {
        rebuildActiveUnits(activeLine, { position: activeEntry.position, quaternion: activeEntry.quaternion, key: unitsRasterKey });
      }
    } else {
      disposeUnitsGroup();
      unitKey = null;
      activeUnitsRaster = null;
      self.activeLineWidth = 0;
    }

    if (unitsGroup && activeUnitsRaster && activeEntry && activeLine) {
      var fit2 = dioramaResolveFrameFitScale(activeUnitsRaster.lineWidth, DIO_HERO_DISTANCE, fov, aspect)
        * activeEntry.placement.scale * ctx.lyricsFontScale;
      unitsGroup.scale.setScalar(fit2);
      self.activeLineWidth = activeUnitsRaster.lineWidth * fit2;   /* CameraRig 词跟踪宽（:983） */
      var life2 = dioramaResolveTextLife(unitsGroup.position.distanceTo(camPos));
      var now = ctx.now;
      var breath = 0.9 + 0.1 * Math.sin(elapsed * 1.9);
      var lightVals = unitLightVals, soulVals = unitSoulVals;

      var gradientStrength = Math.min(1.5, tuning.gradientIntensity);
      /* 唱色轴（:998-1011）：退化 accent→中性灰值偏移 */
      var tintSeparation = Math.abs(damped.accent.r - damped.primary.r)
        + Math.abs(damped.accent.g - damped.primary.g)
        + Math.abs(damped.accent.b - damped.primary.b);
      _sungTint.copy(damped.accent);
      if (tintSeparation < 0.4) {
        var deficit = 1 - tintSeparation / 0.4;
        var primaryLum = (damped.primary.r + damped.primary.g + damped.primary.b) / 3;
        var accentLum = (damped.accent.r + damped.accent.g + damped.accent.b) / 3;
        var targetLum = primaryLum > 0.5 ? accentLum * (1 - 0.5 * deficit) : accentLum + (1 - accentLum) * 0.55 * deficit;
        _neutral.setRGB(targetLum, targetLum, targetLum);
        _sungTint.lerp(_neutral, deficit);
      }
      var gradHot01 = Math.min(1, Math.max(0, (gradientStrength - 0.1) / 1.4));
      _gradDeep.copy(_sungTint).multiplyScalar(0.8 - 0.18 * gradHot01);

      for (var u = 0; u < units.length; u += 1) {
        var baseMat = unitBaseMats[u];
        if (!baseMat || !lightVals || !soulVals) continue;
        var unit = units[u];
        var isCurrent = now >= unit.startTime && now < unit.endTime;
        var sung = now >= unit.endTime;
        var span2 = Math.max(unit.endTime - unit.startTime, 0.001);
        var sungMix = sung ? 1 : (isCurrent ? Math.min(1, Math.max(0, (now - unit.startTime) / span2)) : 0);

        lightVals[u] = dioramaStepEnvelope(lightVals[u], isCurrent ? 1 : 0, 14, 4.5, delta);
        var gradientEnergy = dioramaResolveGradientEnergy(now, unit) * gradientStrength;

        baseMat.opacity = Math.min(1,
          (DIO_UNSUNG_UNIT_OPACITY + (DIO_ACTIVE_LINE_OPACITY - DIO_UNSUNG_UNIT_OPACITY) * sungMix + 0.08 * Math.min(1, gradientEnergy)) * life2
        );

        /* 统一唱色（:1044-1062）：一底一标一插值；关键字只改目标色 */
        var unitTarget = keywordUnitColors.get(u) != null ? keywordUnitColors.get(u)
          : (tuning.gradientIntensity > 0 ? _gradDeep : _sungTint);
        var unitProgress = tuning.gradientIntensity > 0 ? gradientEnergy : lightVals[u] * 1.15;
        dioramaResolveUnitFill(baseMat.color, damped.primary, unitTarget, unitProgress);

        /* 普通辉光（:1064-1079）：只读统一色；辉光平面永不缩放/移动 */
        var glowStrength = Math.min(1.5, tuning.glowIntensity);
        var glowLevel = lightVals[u] * life2 * breath * (0.6 + 0.4 * powerEnv) * glowStrength;
        var glowMat = unitGlowMats[u], glowMesh = unitGlowMeshes[u];
        if (glowMat) {
          glowMat.opacity = Math.min(1, DIO_UNIT_GLOW_MAX_OPACITY * glowLevel);
          glowMat.color.copy(baseMat.color);
        }
        if (glowMesh) glowMesh.visible = glowLevel > 0.012;

        /* 灵魂出窍（:1081-1112）：播放相位切两段——唱中注册幽影/唱毕离体飞行 */
        soulVals[u] = dioramaStepEnvelope(soulVals[u], isCurrent ? 1 : 0, 12, 2.2, delta);
        var soulMat = unitSoulMats[u], soulMesh = unitSoulMeshes[u];
        if (soulMat && soulMesh) {
          var soulStrength = Math.min(1.5, tuning.soulIntensity);
          var flightMix = sung ? dioramaSmoothstep01(Math.min(1, Math.max(0, (now - unit.endTime) / DIO_SOUL_HANDOFF_SECONDS))) : 0;
          var activeReach = tuning.soulActiveEnabled ? soulStrength : 0;
          var onGlyph = (1 - flightMix) * activeReach;
          var flown = flightMix * soulStrength;
          soulMat.color.copy(baseMat.color);
          soulMat.opacity = Math.min(1, DIO_SOUL_MAX_OPACITY * life2 * soulVals[u] * (onGlyph + flown));
          soulMesh.position.y = DIO_LINE_FONT_SIZE * (DIO_SOUL_ACTIVE_LIFT_EM * onGlyph + DIO_SOUL_DETACH_LIFT_EM * flown);
          var soulSwell = 1 + DIO_SOUL_ACTIVE_SWELL * onGlyph + DIO_SOUL_DETACH_SWELL * flown;
          soulMesh.scale.set(soulSwell, soulSwell, 1);
          soulMesh.visible = soulMat.opacity > 0.015;
        }
      }
    } else {
      self.activeLineWidth = 0;
    }
  }

  /* 关键字着色目标（:710-724）：行变化时按字符区间重解析 */
  var activeUnitsLineRef = null;
  function dioramaBuildActiveUnitsCached(line) {
    if (activeUnitsLineRef !== line) {
      activeUnitsLineRef = line;
      var timeline = CM_buildLineGraphemeTimeline(line);
      activeUnitsCache = dioramaBuildActiveUnits(line, timeline);
      keywordUnitColors = DIO_resolveKeywordUnitColors(
        line.fullText || '', activeUnitsCache, keywordMatchers,
        colorTargets.primary, colorTargets.accent, colorTargets.bg
      );
    }
    return activeUnitsCache;
  }
  var activeUnitsCache = [];

  function removeLineMesh(index) {
    var rec = lineMeshes.get(index);
    if (!rec) return;
    scene.remove(rec.mesh);
    rec.geom.dispose();
    rec.mat.dispose();
    lineMeshes.delete(index);
  }

  function setTheme(nextTheme) {
    theme = nextTheme;
    colorTargets.primary.set(nextTheme.primaryColor);
    colorTargets.accent.set(nextTheme.accentColor || nextTheme.primaryColor);
    colorTargets.secondary.set(nextTheme.secondaryColor);
    colorTargets.bg.set(nextTheme.backgroundColor);
    keywordMatchers = DIO_prepareKeywordMatchers(nextTheme.wordColors, tuning.keywordColoringEnabled);
    activeUnitsLineRef = null;
    fontDirty = true;
    moteMat.color.set(nextTheme.secondaryColor);
  }

  function setFontScale() {
    /* 字号进 ctx.lyricsFontScale（每帧读），行栅格与布局自动随 fit */
    activeUnitsLineRef = null;
  }

  function dispose() {
    disposeUnitsGroup();
    lineMeshes.forEach(function (rec, index) { removeLineMesh(index); });
    lineRasterCache.forEach(function (raster) { raster.texture.dispose(); });
    lineRasterCache.clear();
    if (activeUnitsRaster) {
      for (var d = 0; d < activeUnitsRaster.units.length; d += 1) {
        activeUnitsRaster.units[d].raster.baseTexture.dispose();
        activeUnitsRaster.units[d].raster.glowTexture.dispose();
      }
      activeUnitsRaster = null;
    }
    if (activeUnitsRasterPrev) {
      for (var d2 = 0; d2 < activeUnitsRasterPrev.units.length; d2 += 1) {
        activeUnitsRasterPrev.units[d2].raster.baseTexture.dispose();
        activeUnitsRasterPrev.units[d2].raster.glowTexture.dispose();
      }
      activeUnitsRasterPrev = null;
    }
    if (motePoints.parent) scene.remove(motePoints);
    moteGeometry.dispose();
    moteMat.dispose();
    if (scene.fog) scene.fog = null;
  }

  /* 方法挂回 self（activeLineWidth 等可变字段必须与返回对象同一实例） */
  self.step = step;
  self.dispose = dispose;
  self.setTheme = setTheme;
  self.setFontScale = setFontScale;
  self.getGeometryInputs = function () {
    return {
      mode: (DIO_DEFAULT_GEOMETRY_VISIBILITY.mode || 'clouds'),
      clusters: self.particleClusters,
      corridorSpans: self.corridorSpans,
      density: tuning.particleDensity,
      particleGlowEnabled: tuning.particleGlowEnabled,
      particleGlowIntensity: tuning.particleGlowIntensity,
      backgroundColor: theme.backgroundColor,
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor || theme.primaryColor,
      secondaryColor: theme.secondaryColor
    };
  };
  return self;
}

/* =========================================================================
   DioramaParticleField（DioramaParticleField.tsx:88-382 命令式落地）
   ========================================================================= */
function DioramaCreateParticleField(THREE, scene, getInputs) {
  /* 常量（:96-167） */
  var CORRIDOR_UNITS_PER_LINE = DIO_STEP_DISTANCE / DIO_CORRIDOR_RADIUS;
  var FORMATION_SETTLE_SECONDS = 0.4;
  var CLOUD_SWELL = 0.34;
  var CORRIDOR_MAX_SWELL = 0.45;
  var CORRIDOR_QUIET_SWELL = 0.1;
  var MAX_WAVE = 0.85;
  var CLOUD_MAX_SWELL = MAX_WAVE * CLOUD_SWELL;
  var CORRIDOR_MAX_SWELL_REACH = MAX_WAVE * CORRIDOR_MAX_SWELL;

  /* RipplePool（:74-93） */
  function createRipplePool() {
    return {
      sources: new Float32Array(DIO_RIPPLE_COUNT * 4),
      shapes: new Float32Array(DIO_RIPPLE_COUNT * 4),
      cursor: DIO_RIPPLE_BANDS.map(function () { return 0; }),
      spawned: 0
    };
  }

  /* spawnRipple（:104-143）：确定性伪随机变参 */
  function spawnRipple(pool, bandIndex, strength, now, corridor, readHeadAlong) {
    var seed = DIO_hashSeed('diorama-ripple:' + pool.spawned);
    var preset = DIO_RIPPLE_BANDS[bandIndex];
    var height = DIO_seededUnit(seed + 1);
    var spread = DIO_seededUnit(seed + 2);
    var pace = DIO_seededUnit(seed + 3);
    var cursor = pool.cursor[bandIndex];
    var offset = (bandIndex * DIO_RIPPLE_SLOTS_PER_BAND + cursor) * 4;
    if (corridor) {
      pool.sources[offset] = readHeadAlong + 0.4 + DIO_seededUnit(seed + 4) * 2.2;
      pool.sources[offset + 1] = DIO_seededUnit(seed + 5) * Math.PI * 2;
      pool.sources[offset + 2] = 0;
    } else {
      var up = DIO_seededUnit(seed + 4) * 2 - 1;
      var around = DIO_seededUnit(seed + 5) * Math.PI * 2;
      var ring = Math.sqrt(Math.max(0, 1 - up * up));
      pool.sources[offset] = ring * Math.cos(around);
      pool.sources[offset + 1] = up;
      pool.sources[offset + 2] = ring * Math.sin(around);
    }
    pool.sources[offset + 3] = now;
    pool.shapes[offset] = preset.strength * strength * (0.7 + height * 0.6);
    pool.shapes[offset + 1] = preset.speed * (0.8 + pace * 0.45);
    pool.shapes[offset + 2] = preset.width * (0.78 + spread * 0.5);
    pool.shapes[offset + 3] = preset.wavenumber;
    pool.cursor[bandIndex] = (cursor + 1) % DIO_RIPPLE_SLOTS_PER_BAND;
    pool.spawned += 1;
  }

  /* 材质一次创建（:209-216 lazy ref 等价）；点云几何按 key 重建（:190-199） */
  var material = null, glowMaterial = null, targetColors = null;
  var built = { key: null, geometry: null, waveNumberMax: 8 };
  var trackers = DIO_RIPPLE_BANDS.map(function () { return DIO_createBandTracker(); });
  var ripples = createRipplePool();
  var flowTime = 0;
  var previousPlaybackTime = null;
  var drawingBufferSize = null;
  var elasticState = DIO_createElasticState();
  var formation = 1;
  var lockedSeconds = FORMATION_SETTLE_SECONDS;
  var resetKeyCache = null;

  function ensureMaterials(inputs) {
    if (material) return;
    if (!drawingBufferSize) drawingBufferSize = new THREE.Vector2();
    targetColors = DIO_resolveContrastColors({
      primary: new THREE.Color(inputs.primaryColor),
      accent: new THREE.Color(inputs.accentColor),
      secondary: new THREE.Color(inputs.secondaryColor)
    }, new THREE.Color(inputs.backgroundColor));
    material = DIO_createParticleMaterial(targetColors);
    glowMaterial = DIO_createParticleGlowMaterial(targetColors, inputs.particleGlowIntensity);
  }

  function rebuildGeometryIfNeeded(inputs) {
    var key = inputs.mode + '|' + (inputs.mode === 'corridor'
      ? inputs.corridorSpans.map(function (s) { return s.pathStart; }).join(',') + '|' + inputs.corridorSpans.length
      : inputs.clusters.map(function (c) { return c.key; }).join(',')) + '|' + inputs.density;
    if (key === built.key) return;
    var data = inputs.mode === 'corridor'
      ? DIO_buildCorridorGeometryData(inputs.corridorSpans, inputs.density)
      : DIO_buildCloudGeometryData(inputs.clusters, inputs.density);
    if (built.geometry) built.geometry.dispose();
    built = {
      key: key,
      geometry: DIO_createBufferGeometry(data),
      waveNumberMax: DIO_resolveWaveNumberMax(data.spacing)
    };
    if (glowPoints) { glowPoints.geometry = built.geometry; }
    if (basePoints) { basePoints.geometry = built.geometry; }
  }

  /* 双 pass Points（:364-381 JSX → 命令式）：glow（renderOrder 3）+ 对比层（renderOrder 4） */
  var glowPoints = null, basePoints = null;
  function ensurePoints(inputs) {
    ensureMaterials(inputs);
    if (!basePoints) {
      basePoints = new THREE.Points(built.geometry, material);
      basePoints.frustumCulled = false;
      basePoints.renderOrder = 4;
      scene.add(basePoints);
    }
    if (inputs.particleGlowEnabled && !glowPoints) {
      glowPoints = new THREE.Points(built.geometry, glowMaterial);
      glowPoints.frustumCulled = false;
      glowPoints.renderOrder = 3;
      scene.add(glowPoints);
    } else if (!inputs.particleGlowEnabled && glowPoints) {
      scene.remove(glowPoints);
      glowPoints = null;
    }
  }

  function step(rawDelta, ctx) {
    var delta = Math.min(rawDelta, 0.1);
    var inputs = getInputs();
    rebuildGeometryIfNeeded(inputs);   /* 先建几何——ensurePoints 以 built.geometry 构造 Points */
    ensurePoints(inputs);
    var inputsKey = ctx.resetKey;
    if (inputsKey !== resetKeyCache) {
      resetKeyCache = inputsKey;
      previousPlaybackTime = null;
      elasticState = DIO_createElasticState();
      ripples = createRipplePool();
      trackers = DIO_RIPPLE_BANDS.map(function () { return DIO_createBandTracker(); });
    }

    /* 共享 0..255 频带归一（:256-262）：检测故意不乘 audioLevel（响度不变性注） */
    /* DioramaParticleField.tsx:256-258：MotionValue 经 .get() 取值（桥传入 MV duck-type） */
    var bassTarget = Math.min(1, ctx.bands.bass.get() / 255);
    var midTarget = Math.min(1, (ctx.bands.lowMid.get() * 0.5 + ctx.bands.mid.get() * 0.5) / 255);
    var trebleTarget = Math.min(1, ctx.bands.treble.get() / 255);
    var bass = DIO_stepBandTracker(trackers[0], bassTarget, delta);
    var mid = DIO_stepBandTracker(trackers[1], midTarget, delta);
    var treble = DIO_stepBandTracker(trackers[2], trebleTarget, delta);
    var bands = [bass, mid, treble];
    var response = DIO_resolveAudioResponse(bass, mid);
    var gain = Math.max(0, ctx.audioLevel);

    /* flow 时钟随播放推进（:270-286）：暂停冻结、seek/loop 跳变重建涟漪池 */
    var playbackTime = Math.max(0, ctx.now);
    var playbackDelta = previousPlaybackTime == null ? 0 : playbackTime - previousPlaybackTime;
    var playbackDiscontinuity = previousPlaybackTime == null || playbackDelta < -0.05 || playbackDelta > 0.5;
    if (playbackDiscontinuity) {
      flowTime = playbackTime * 0.28;
      ripples = createRipplePool();
    } else if (playbackDelta > 0) {
      flowTime += playbackDelta * response.flowSpeed;
    }
    previousPlaybackTime = playbackTime;

    /* 音频→几何唯一入口（:288-299）：阈值上升沿每击一涟漪 */
    var isCorridor = inputs.mode === 'corridor';
    var readHeadAlong = ctx.readHeadLine * CORRIDOR_UNITS_PER_LINE;
    if (gain > 0.001) {
      for (var b = 0; b < bands.length; b += 1) {
        if (!bands[b].onset) continue;
        spawnRipple(ripples, b, bands[b].transient, flowTime, isCorridor, readHeadAlong);
      }
    }

    /* 弹性脉冲（:302-309） */
    var elasticPulse = DIO_stepElasticResponse(
      elasticState,
      DIO_resolvePulseTarget(response.clusterPulse, gain, isCorridor),
      delta
    );
    ctx.renderer.getDrawingBufferSize(drawingBufferSize);
    var colorAmount = 1 - Math.exp(-1.2 * delta);

    /* 编队聚散（:313-319） */
    lockedSeconds = ctx.transitionActive
      ? 0
      : Math.min(FORMATION_SETTLE_SECONDS, lockedSeconds + delta);
    var formationTarget = (!ctx.transitionActive && lockedSeconds >= FORMATION_SETTLE_SECONDS) ? 1 : 0;
    formation = DIO_stepEnvelope(formation, formationTarget, 1.5, 3.2, delta);

    /* 双模式动态（:321-337） */
    var amplitude = gain * (isCorridor
      ? Math.min(CORRIDOR_MAX_SWELL, CORRIDOR_QUIET_SWELL + bass.sustained * 0.18 + mid.sustained * 0.08)
      : CLOUD_SWELL);
    var flow = isCorridor ? 1 : 0;
    var scatterDistance = isCorridor ? 6 : 1.4;
    var sizeBase = isCorridor ? 0.072 : 0.05;
    var sizeGain = isCorridor ? 0.34 : 0.3;
    var centroid = Math.min(1, 0.2 + treble.sustained * 0.8);
    var viewportHeight = drawingBufferSize.y;

    var targets = [material, glowMaterial];
    for (var t = 0; t < targets.length; t += 1) {
      var u = targets[t].uniforms;
      u.uTime.value = flowTime;
      u.uCorridor.value = isCorridor ? 1 : 0;
      u.uAmplitude.value = amplitude;
      u.uMaxSwell.value = isCorridor ? CORRIDOR_MAX_SWELL_REACH : CLOUD_MAX_SWELL;
      u.uWaveNumberMax.value = built.waveNumberMax;
      u.uDetail.value = Math.min(1, treble.sustained * gain);
      u.uRippleSource.value = ripples.sources;
      u.uRippleShape.value = ripples.shapes;
      u.uOffsetGain.value = mid.sustained * gain;
      u.uFlow.value = flow;
      u.uFormation.value = formation;
      u.uScatter.value = scatterDistance;
      u.uSizeBase.value = sizeBase;
      u.uSizeGain.value = sizeGain;
      u.uPulse.value = elasticPulse;
      u.uSpectralCentroid.value = centroid;
      u.uViewportHeight.value = viewportHeight;
      DIO_lerpParticleMaterialColors(targets[t], targetColors, colorAmount);
    }
  }

  function setGlowIntensity(v) {
    if (glowMaterial) glowMaterial.uniforms.uGlow.value = v;
  }

  function __geometry() { return built.geometry; }

  function dispose() {
    if (glowPoints) { scene.remove(glowPoints); glowPoints = null; }
    if (basePoints) { scene.remove(basePoints); basePoints = null; }
    if (built.geometry) { built.geometry.dispose(); built.geometry = null; built.key = null; }
    if (material) { material.dispose(); material = null; }
    if (glowMaterial) { glowMaterial.dispose(); glowMaterial = null; }
  }

  return { step: step, dispose: dispose, setGlowIntensity: setGlowIntensity, __geometry: __geometry, __material: function () { return material; } };
}

/* =========================================================================
   VisualizerDiorama 宿主（VisualizerDiorama.tsx + Canvas + 字幕覆盖）
   ========================================================================= */
function DioramaDioramaEngine(options) {
  var host = options.host;
  var theme = options.theme;
  var pending = { seed: options.seed != null ? options.seed : 'diorama', lines: options.lines || [] };
  var committed = { seed: pending.seed, lines: pending.lines };
  var currentTime = options.currentTime;
  var audioPower = options.audioPower;
  var audioBands = options.audioBands;
  var lyricsFontScale = options.lyricsFontScale != null ? options.lyricsFontScale : 1;
  var showText = options.showText !== false;
  var destroyed = false;

  /* THREE 绑定（wrapper 形参在 ES module 异步加载期可能为 null——create 时补挂） */
  if (!THREE) THREE = (typeof window !== 'undefined' && window.THREE185) || null;
  if (!THREE) throw new Error('[DioramaEngine] three.js 0.185 未就绪（window.THREE185）');

  /* ---------- <Canvas>（VisualizerDiorama:402-457） ---------- */
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;background:transparent;';
  host.appendChild(canvas);
  var hostW = Math.max(host.clientWidth || 0, window.innerWidth || 0) || 1280;
  var hostH = Math.max(host.clientHeight || 0, window.innerHeight || 0) || 720;
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1), 2));   /* dpr:[1,2] */
  renderer.setSize(hostW, hostH, false);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, hostW / hostH, 0.1, 1000);
  camera.position.set(0, 0.6, 9);

  var motion = DioramaResolveMotionParams(theme.animationIntensity);

  /* ---------- 序列机 refs（:274-281） ---------- */
  var seq = DIO_createSequencerState();
  var lastLocalIndexRef = 0;
  var hasEverActive = false;
  var lastActiveKeyRef = null;
  var transitionEpoch = 0;
  var transition = null;               /* {epoch, outgoingIndex, startedAtMs} */
  var gateWatch = null;                /* 器乐曲/慢载提交闸（:179-192） */
  var instrumentalSeed = undefined;
  var activeLineWidth = 0;             /* DioramaScene 每帧写、CameraRig 读（:79-84） */

  /* ---------- 器乐曲幻影行缓存（按 seed 键控，:201-206） ---------- */
  var phantomCache = { seed: undefined, lines: null };
  function phantomLinesFor(seed) {
    if (phantomCache.seed !== seed) phantomCache = { seed: seed, lines: dioramaBuildInstrumentalPhantomLines() };
    return phantomCache.lines;
  }

  /* ---------- CameraRig / DioramaScene / DioramaParticleField ---------- */
  var cameraRig = DioramaCreateCameraRig(THREE);
  var dioramaScene = DioramaCreateDioramaScene(THREE, {
    theme: theme, tuning: dioramaEnsureDefaults(), motion: motion, host: host, scene: scene
  });
  var particleField = DioramaCreateParticleField(THREE, scene, function () {
    return dioramaScene.getGeometryInputs();
  });

  /* ---------- 等待占位（:388-392 + :460-473） ---------- */
  var waitingEl = document.createElement('div');
  waitingEl.style.cssText = 'position:absolute;left:0;right:0;bottom:18%;text-align:center;pointer-events:none;' +
    'opacity:0;transition:opacity .4s ease;font-weight:500;';
  waitingEl.style.color = theme.secondaryColor || theme.primaryColor;
  waitingEl.textContent = '等待音乐…';
  host.appendChild(waitingEl);

  /* ---------- 底部字幕（VisualizerSubtitleOverlay :48-215；MineRadio 单 translation 轨） ---------- */
  var subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);
  var subWrap = document.createElement('div');
  subWrap.style.cssText = 'position:absolute;left:0;right:0;bottom:28px;text-align:center;pointer-events:none;z-index:20;' +
    'padding:0 16px;opacity:0;';
  host.appendChild(subWrap);
  var subContent = null;
  var subtitleKey = null;

  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRender = showText;
    var translation = null;
    if (shouldRender) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i += 1) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && dioramaHasReadableText(text)) { translation = text; break; }
      }
    }
    var upcoming = [];
    if (shouldRender && !translation && activeLine) {
      upcoming = (nextLines || []).filter(function (l) { return dioramaHasReadableText(l.fullText); });
    }
    var key = translation ? 't:' + translation : (upcoming.length ? 'u:' + upcoming.map(function (l) { return l.startTime; }).join('|') : null);
    if (key === subtitleKey) return;

    /* AnimatePresence 容器（:134-146）：opacity/y 0.24s easeOut */
    if (!key) {
      subtitleKey = null;
      mmApplyVariant(subWrap, { exit: { opacity: 0, y: 20, transition: { duration: 0.24, ease: 'easeOut' } } }, 'exit', null);
      return;
    }
    subtitleKey = key;
    subWrap.innerHTML = '';
    subContent = document.createElement('div');
    subContent.style.cssText = 'position:relative;display:inline-block;padding:2px 6px;';
    /* subtitleOverlayBackground 辉光底（:122-129, :150-156） */
    var glowBg = document.createElement('div');
    glowBg.setAttribute('aria-hidden', 'true');
    glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(24px);' +
      'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.96) + ' 0%, ' +
      CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.78) + ' 62%, transparent 100%);';
    subContent.appendChild(glowBg);
    var inner = document.createElement('div');
    inner.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;';
    if (translation) {
      /* 翻译行（:157-186）：secondary 色 + 主题翻译字体栈 + 500 字重 + 文字阴影 */
      var transEl = document.createElement('div');
      transEl.style.cssText = 'color:' + (theme.secondaryColor || theme.primaryColor) +
        ';font-size:' + subtitleSizes.translationFontSize +
        ';font-family:' + CM_resolveThemeTranslationFontStack(theme) +
        ';font-weight:' + CM_resolveThemeFontWeight(theme, 500) +
        ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
      transEl.textContent = translation;
      inner.appendChild(transEl);
    } else {
      /* 下一句预览（:188-213）：truncate + blur 1px + 500ms 过渡 */
      for (var u = 0; u < upcoming.length; u += 1) {
        var p = document.createElement('p');
        p.style.cssText = 'margin:6px 0 0;max-width:42rem;margin-left:auto;margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .5s ease;filter:blur(1px);' +
          'color:' + (theme.secondaryColor || theme.primaryColor) +
          ';font-size:' + subtitleSizes.upcomingFontSize +
          ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) +
          ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
        p.textContent = upcoming[u].fullText;
        inner.appendChild(p);
      }
    }
    subContent.appendChild(inner);
    subWrap.appendChild(subContent);
    mmApplyVariant(subWrap, { enter: { opacity: 0.6, y: 0, transition: { opacity: { duration: 0.24, ease: 'easeOut' }, y: { duration: 0.24, ease: 'easeOut' } } } }, 'enter', null);
  }

  /* ---------- resize（R3F 自动等价） ---------- */
  function onResize() {
    if (destroyed) return;
    var w = Math.max(host.clientWidth || 0, 1);
    var h = Math.max(host.clientHeight || 0, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  /* ---------- 主循环（useFrame 序：CameraRig → Scene → Field） ---------- */
  var startWall = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var lastFrameWall = startWall;
  var subtitleTick = 0;

  function tick() {
    if (destroyed) return;
    var nowWall = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var delta = Math.max(0, (nowWall - lastFrameWall) / 1000);
    lastFrameWall = nowWall;
    var elapsed = (nowWall - startWall) / 1000;   /* state.clock.elapsedTime 等价 */
    var now = currentTime.get();
    var dirty = machineTick(now, nowWall);
    var st = machineState;

    /* 主题色目标更新（setTheme 时已换；此处只需引擎各 step） */
    cameraRig.step(delta, elapsed, {
      sequencer: seq,
      globalIndex: st.globalIndex,
      linesEpoch: st.linesEpoch,
      now: now,
      camera: camera,
      activeLineWidth: activeLineWidth,
      moveScale: motion.moveScale,
      driftScale: motion.driftScale,
      smoothTime: motion.smoothTime,
      subMode: motion.subMode,
      weaveScale: motion.weaveScale,
      transitionEpoch: transitionEpoch
    });

    var trebleVal = audioBands.treble ? audioBands.treble.get() : 0;
    var powerVal = audioPower ? audioPower.get() : 0;
    dioramaScene.step(delta, elapsed, {
      sequencer: seq,
      globalIndex: st.globalIndex,
      transitionOutgoingIndex: st.transitionOutgoingIndex,
      total: st.total,
      linesEpoch: st.linesEpoch,
      activeSegKey: st.activeSegKey,
      activeSegSeed: st.activeSegSeed,
      activeLine: st.activeLine,
      now: now,
      camera: camera,
      treble: trebleVal,
      power: powerVal,
      audioLevel: motion.audioLevel,
      weaveScale: motion.weaveScale,
      subMode: motion.subMode,
      lyricsFontScale: lyricsFontScale
    });
    activeLineWidth = dioramaScene.activeLineWidth;

    particleField.step(delta, {
      renderer: renderer,
      now: now,
      bands: audioBands,
      audioLevel: motion.audioLevel,
      readHeadLine: st.globalIndex,
      resetKey: st.activeSegKey,
      transitionActive: st.transitionOutgoingIndex != null
    });

    /* 等待占位 + 底部字幕（React 渲染层等价，10Hz 轮询足够） */
    subtitleTick += delta;
    if (subtitleTick >= 0.1) {
      subtitleTick = 0;
      waitingEl.style.opacity = (showText && !st.activeLine && !hasEverActive) ? '0.5' : '0';
      var rawIdx = dioramaFindLineIndexAtTime(committed.lines, now);
      var activeLineRaw = rawIdx >= 0 ? committed.lines[rawIdx] : null;
      var recent = dioramaGetRecentCompletedLine(committed.lines, rawIdx, now);
      renderSubtitle(activeLineRaw, recent, dioramaGetUpcomingLines(committed.lines, rawIdx, 2));
    }

    renderer.render(scene, camera);   /* R3F 每帧自动 render 的等价 */
    rafId = requestAnimationFrame(tick);
  }
  var rafId = requestAnimationFrame(tick);

  /* ---------- 序列机（VisualizerDiorama:163-378 每帧等价） ---------- */
  var machineState = { globalIndex: 0, transitionOutgoingIndex: null, total: 0, linesEpoch: 0, activeSegKey: 'x', activeSegSeed: undefined, activeLine: null };

  function machineTick(now, nowWall) {
    /* 提交闸（:163-195）：新歌待词 / 器乐曲播放确认 / 8s 墙钟保底 */
    var pendingSig = pending.lines.length === 0 ? '' : pending.lines.length + '|' + (pending.lines[0].fullText || '');
    var committedSig = committed.lines.length === 0 ? '' : committed.lines.length + '|' + (committed.lines[0].fullText || '');
    if (pending.seed === committed.seed) {
      if (pendingSig !== committedSig) { committed = { seed: pending.seed, lines: pending.lines }; }
      gateWatch = null;
    } else if (pendingSig !== '') {
      committed = { seed: pending.seed, lines: pending.lines };
      gateWatch = null;
    } else {
      if (!gateWatch) gateWatch = { startWall: nowWall, sawReset: false };
      var t = now;
      var capped = nowWall - gateWatch.startWall >= 8000;
      if (!gateWatch.sawReset && t < 1) gateWatch.sawReset = true;
      if ((gateWatch.sawReset && t >= 2) || capped) {
        committed = { seed: pending.seed, lines: pending.lines };
        gateWatch = null;
      }
      if (pending.seed !== committed.seed) {
        /* 未提交：维持旧场景（闸保持）——机器其余部分继续跑旧段 */
        return updateMachineState(now);
      }
    }
    return updateMachineState(now);
  }

  function updateMachineState(now) {
    var gatedSeed = committed.seed;
    var gatedLines = committed.lines;
    var isInstrumental = gatedLines.length === 0;
    var effectiveLines = isInstrumental ? phantomLinesFor(gatedSeed) : gatedLines;

    /* 器乐曲读头按播放时间推进（:208-247） */
    var instrumentalReadHead = 0;
    if (isInstrumental) {
      if (instrumentalSeed !== gatedSeed) { instrumentalSeed = gatedSeed; }
      instrumentalReadHead = Math.min(
        Math.max(Math.floor(now / DIO_INSTRUMENTAL_SECONDS_PER_FRAME), 0),
        DIO_INSTRUMENTAL_FRAMES - 1
      );
    }

    var rawLineIndex = dioramaFindLineIndexAtTime(gatedLines, now);
    var onInterlude = !isInstrumental && rawLineIndex >= 0 && dioramaIsInterludeLine(gatedLines[rawLineIndex]);
    var effectiveLineIndex = isInstrumental ? instrumentalReadHead : (onInterlude ? -1 : rawLineIndex);

    /* 过渡状态机（:283-378） */
    var outgoingSeg = DIO_activeSegment(seq);
    var outgoingLocal = outgoingSeg ? Math.min(Math.max(lastLocalIndexRef, 0), outgoingSeg.span - 1) : 0;
    var outgoingGlobal = outgoingSeg ? outgoingSeg.globalStart + outgoingLocal : 0;

    var isNewSong = !outgoingSeg || outgoingSeg.seed !== gatedSeed;
    var lyricsChanged = !isNewSong && !!outgoingSeg && outgoingSeg.lines !== effectiveLines;
    var isLoopRestart = !!outgoingSeg && !isNewSong && effectiveLineIndex >= 0 && effectiveLineIndex <= 1
      && lastLocalIndexRef > effectiveLineIndex;

    if (isNewSong) {
      var placementOrigin = { x: 0, y: 0, z: 0 };
      if (outgoingSeg) {
        var anchor = DIO_getFrame(outgoingSeg.frames, outgoingLocal).position;
        var off = DIO_pickTransitionOffset(gatedSeed == null ? 'diorama' : gatedSeed, transitionEpoch + 1);
        placementOrigin = { x: anchor.x + off.x, y: anchor.y + off.y, z: anchor.z + off.z };
      }
      DIO_appendSegment(seq, {
        seed: gatedSeed == null ? 'diorama' : gatedSeed,
        lines: effectiveLines,
        round: 0,
        placementOrigin: placementOrigin
      });
    } else if (lyricsChanged) {
      DIO_updateActiveSegmentLines(seq, effectiveLines);
    }

    var activeSeg = DIO_activeSegment(seq);
    var keyChanged = activeSeg.key !== lastActiveKeyRef;
    var hadPrevious = lastActiveKeyRef !== null;
    if (keyChanged) {
      lastActiveKeyRef = activeSeg.key;
      lastLocalIndexRef = 0;
      hasEverActive = false;
    }
    if (isLoopRestart) {
      lastLocalIndexRef = 0;
      hasEverActive = false;
    }
    var startingTransition = (keyChanged && hadPrevious) || isLoopRestart;
    if (startingTransition) {
      transitionEpoch += 1;
      transition = { epoch: transitionEpoch, outgoingIndex: outgoingGlobal, startedAtMs: lastFrameWall };
    }
    if (effectiveLineIndex >= 0) {
      lastLocalIndexRef = effectiveLineIndex;
      hasEverActive = true;
    }
    var rawLocalIndex = effectiveLineIndex >= 0 ? effectiveLineIndex : lastLocalIndexRef;
    var localPositionIndex = Math.min(Math.max(rawLocalIndex, 0), Math.max(activeSeg.span - 1, 0));
    var globalIndex = activeSeg.globalStart + localPositionIndex;
    var activeOutgoingIndex = startingTransition ? outgoingGlobal : (transition ? transition.outgoingIndex : null);
    var pruneFrom = activeOutgoingIndex != null ? Math.min(globalIndex, activeOutgoingIndex) : globalIndex;
    DIO_pruneSegments(seq, pruneFrom - 4);   /* PRUNE_MARGIN_BEHIND :47 */

    if (transition && nowWall - transition.startedAtMs >= DIO_TRANSITION_DURATION * 1000) {
      transition = null;   /* 飞行结束（:382-386） */
    }

    /* useVisualizerRuntime（runtime.ts:124-157）：字幕层用 raw 行索引 */
    var activeLineRaw = rawLineIndex >= 0 ? gatedLines[rawLineIndex] : null;
    machineState = {
      globalIndex: globalIndex,
      transitionOutgoingIndex: transition ? transition.outgoingIndex : null,
      total: DIO_totalGlobalLines(seq),
      linesEpoch: activeSeg.linesEpoch,
      activeSegKey: activeSeg.key,
      activeSegSeed: activeSeg.seed,
      activeLine: activeLineRaw
    };
    return machineState;
  }

  /* ---------- 桥 API（数据形状换歌/主题/字号） ---------- */
  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      particleField.dispose();
      dioramaScene.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (waitingEl.parentNode) waitingEl.parentNode.removeChild(waitingEl);
      if (subWrap.parentNode) subWrap.parentNode.removeChild(subWrap);
    },
    setSong: function (seed, lines) {
      pending = { seed: seed != null ? seed : 'diorama', lines: lines || [] };
    },
    setTheme: function (nextTheme) {
      theme = nextTheme;
      motion = DioramaResolveMotionParams(theme.animationIntensity);
      dioramaScene.setTheme(theme);
      waitingEl.style.color = theme.secondaryColor || theme.primaryColor;
      subtitleKey = null;
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);
      dioramaScene.setFontScale(lyricsFontScale);
      subtitleKey = null;
    },
    /* 内省钩子（测试/探针用）：场景树与机器状态快照 */
    __debug: function () {
      var rigDbg = cameraRig.__debug ? cameraRig.__debug() : null;
      return {
        rig: rigDbg,
        sceneChildren: scene.children.length,
        childTypes: scene.children.map(function (c) {
          return {
            type: c.type, ro: c.renderOrder,
            visible: c.visible,
            geomPos: c.geometry && c.geometry.attributes && c.geometry.attributes.position ? c.geometry.attributes.position.count : -1,
            drawRange: c.geometry ? c.geometry.drawRange.count : -1,
            posSample: (function () {
              if (!c.geometry || !c.geometry.attributes || !c.geometry.attributes.position) return null;
              var a = c.geometry.attributes.position.array;
              return [a[0], a[1], a[2], a[3], a[4], a[5]];
            })()
          };
        }),
        cameraPos: camera.position.toArray().map(function (v) { return Math.round(v * 100) / 100; }),
        cameraFov: camera.fov,
        globalIndex: machineState.globalIndex,
        total: machineState.total,
        transition: machineState.transitionOutgoingIndex,
        clusters: dioramaScene.getGeometryInputs().clusters.length,
        corridorSpans: dioramaScene.getGeometryInputs().corridorSpans.length,
        mode: dioramaScene.getGeometryInputs().mode,
        activeLineWidth: dioramaScene.activeLineWidth,
        drawInfo: (function () { var i = renderer.info.render; return { calls: i.calls, points: i.points, triangles: i.triangles }; })(),
        uniformScan: (function () {
          var out = {};
          var m = particleField && particleField.__material ? particleField.__material() : null;
          if (m) {
            for (var k in m.uniforms) {
              var v = m.uniforms[k].value;
              if (typeof v === 'number') out[k] = (v === v && isFinite(v)) ? Math.round(v * 1000) / 1000 : 'NAN_OR_INF';
              else if (v && v.isColor) out[k] = 'color';
              else if (v && v.length !== undefined) out[k] = 'arr:' + v.length;
              else out[k] = typeof v;
            }
          }
          return out;
        })(),
        attrScan: (function () {
          var g = particleField && particleField.__geometry ? particleField.__geometry() : null;
          if (!g) return null;
          var out = {};
          ['position', 'aNormal', 'aAnchor', 'aScale', 'aPhase', 'aStyle', 'aWave'].forEach(function (name) {
            var a = g.attributes[name];
            if (!a) { out[name] = 'MISSING'; return; }
            var bad = 0;
            for (var i = 0; i < a.array.length; i += 1) { var v = a.array[i]; if (!(v === v) || !isFinite(v)) bad += 1; }
            out[name] = a.array.length + ' vals, bad=' + bad;
          });
          return out;
        })(),
        geomPoints: (function () { var g = particleField && particleField.__geometry ? particleField.__geometry() : null; return g ? g.attributes.position.count : -1; })()
      };
    }
  };
}

var DIO_buildDioramaPath = buildDioramaPath;
env.DIO_buildDioramaPath = DIO_buildDioramaPath;
var DIO_getFrame = getFrame;
env.DIO_getFrame = DIO_getFrame;
var DIO_translateFrames = translateFrames;
env.DIO_translateFrames = DIO_translateFrames;
var DIO_composeLocal = composeLocal;
env.DIO_composeLocal = DIO_composeLocal;
var DIO_seededUnit = seededUnit;
env.DIO_seededUnit = DIO_seededUnit;
var DIO_hashSeed = hashSeed;
env.DIO_hashSeed = DIO_hashSeed;
var DIO_smoothDamp = smoothDamp;
env.DIO_smoothDamp = DIO_smoothDamp;
var DIO_frameHalfWidth = frameHalfWidth;
env.DIO_frameHalfWidth = DIO_frameHalfWidth;
var DIO_resolveDioramaMotionParams = resolveDioramaMotionParams;
env.DIO_resolveDioramaMotionParams = DIO_resolveDioramaMotionParams;
var DIO_getDioramaTextPlacement = getDioramaTextPlacement;
env.DIO_getDioramaTextPlacement = DIO_getDioramaTextPlacement;
var DIO_getDioramaShot = getDioramaShot;
env.DIO_getDioramaShot = DIO_getDioramaShot;
var DIO_resolveShotOffset = resolveShotOffset;
env.DIO_resolveShotOffset = DIO_resolveShotOffset;
var DIO_resolveHoldSettle = resolveHoldSettle;
env.DIO_resolveHoldSettle = DIO_resolveHoldSettle;
var DIO_resolveCameraDrift = resolveCameraDrift;
env.DIO_resolveCameraDrift = DIO_resolveCameraDrift;
var DIO_resolveReadHeadTruck = resolveReadHeadTruck;
env.DIO_resolveReadHeadTruck = DIO_resolveReadHeadTruck;
var DIO_buildFormation = buildFormation;
env.DIO_buildFormation = DIO_buildFormation;
var DIO_resolveShapeLifeOpacity = resolveShapeLifeOpacity;
env.DIO_resolveShapeLifeOpacity = DIO_resolveShapeLifeOpacity;
var DIO_STEP_DISTANCE = DIORAMA_STEP_DISTANCE;
env.DIO_STEP_DISTANCE = DIO_STEP_DISTANCE;
var DIO_HERO_DISTANCE = DIORAMA_HERO_DISTANCE;
env.DIO_HERO_DISTANCE = DIO_HERO_DISTANCE;
var DIO_CAMERA_LIFT = DIORAMA_CAMERA_LIFT;
env.DIO_CAMERA_LIFT = DIO_CAMERA_LIFT;
var DIO_PARTICLE_AUDIO_SCALE_MAX = DIORAMA_PARTICLE_AUDIO_SCALE_MAX;
env.DIO_PARTICLE_AUDIO_SCALE_MAX = DIO_PARTICLE_AUDIO_SCALE_MAX;
var DIO_createSequencerState = createSequencerState;
env.DIO_createSequencerState = DIO_createSequencerState;
var DIO_activeSegment = activeSegment;
env.DIO_activeSegment = DIO_activeSegment;
var DIO_appendSegment = appendSegment;
env.DIO_appendSegment = DIO_appendSegment;
var DIO_updateActiveSegmentLines = updateActiveSegmentLines;
env.DIO_updateActiveSegmentLines = DIO_updateActiveSegmentLines;
var DIO_totalGlobalLines = totalGlobalLines;
env.DIO_totalGlobalLines = DIO_totalGlobalLines;
var DIO_resolveGlobal = resolveGlobal;
env.DIO_resolveGlobal = DIO_resolveGlobal;
var DIO_pruneSegments = pruneSegments;
env.DIO_pruneSegments = DIO_pruneSegments;
var DIO_flightPerp = flightPerp;
env.DIO_flightPerp = DIO_flightPerp;
var DIO_flightSide = flightSide;
env.DIO_flightSide = DIO_flightSide;
var DIO_pickTransitionOffset = pickTransitionOffset;
env.DIO_pickTransitionOffset = DIO_pickTransitionOffset;
var DIO_transitionEase = transitionEase;
env.DIO_transitionEase = DIO_transitionEase;
var DIO_bezierControl = bezierControl;
env.DIO_bezierControl = DIO_bezierControl;
var DIO_bezierArc = bezierArc;
env.DIO_bezierArc = DIO_bezierArc;
var DIO_TRANSITION_DURATION = TRANSITION_DURATION;
env.DIO_TRANSITION_DURATION = DIO_TRANSITION_DURATION;
var DIO_TRANSITION_DISTANCE = TRANSITION_DISTANCE;
env.DIO_TRANSITION_DISTANCE = DIO_TRANSITION_DISTANCE;
var DIO_TRANSITION_BANK = TRANSITION_BANK;
env.DIO_TRANSITION_BANK = DIO_TRANSITION_BANK;
var DIO_TRANSITION_AIM_SWEEP = TRANSITION_AIM_SWEEP;
env.DIO_TRANSITION_AIM_SWEEP = DIO_TRANSITION_AIM_SWEEP;
var DIO_selectVisibleDioramaClusters = selectVisibleDioramaClusters;
env.DIO_selectVisibleDioramaClusters = DIO_selectVisibleDioramaClusters;
var DIO_CLUSTER_COLLISION_LINE_SPAN = DIORAMA_CLUSTER_COLLISION_LINE_SPAN;
env.DIO_CLUSTER_COLLISION_LINE_SPAN = DIO_CLUSTER_COLLISION_LINE_SPAN;
var DIO_MOTE_LINES_BEHIND = DIORAMA_MOTE_LINES_BEHIND;
env.DIO_MOTE_LINES_BEHIND = DIO_MOTE_LINES_BEHIND;
var DIO_MOTE_LINES_AHEAD = DIORAMA_MOTE_LINES_AHEAD;
env.DIO_MOTE_LINES_AHEAD = DIO_MOTE_LINES_AHEAD;
var DIO_MOTE_WINDOW_LINES = DIORAMA_MOTE_WINDOW_LINES;
env.DIO_MOTE_WINDOW_LINES = DIO_MOTE_WINDOW_LINES;
var DIO_MOTE_MAX_POINTS = DIORAMA_MOTE_MAX_POINTS;
env.DIO_MOTE_MAX_POINTS = DIO_MOTE_MAX_POINTS;
var DIO_resolveMoteCircumference = resolveDioramaMoteCircumference;
env.DIO_resolveMoteCircumference = DIO_resolveMoteCircumference;
var DIO_resolveMoteRadial = resolveDioramaMoteRadial;
env.DIO_resolveMoteRadial = DIO_resolveMoteRadial;
var DIO_moteSlot = dioramaMoteSlot;
env.DIO_moteSlot = DIO_moteSlot;
var DIO_extendDioramaFrame = extendDioramaFrame;
env.DIO_extendDioramaFrame = DIO_extendDioramaFrame;
var DIO_writeMoteLine = writeDioramaMoteLine;
env.DIO_writeMoteLine = DIO_writeMoteLine;
var DIO_CORRIDOR_RADIUS = DIORAMA_PARTICLE_CORRIDOR_RADIUS;
env.DIO_CORRIDOR_RADIUS = DIO_CORRIDOR_RADIUS;
var DIO_buildCorridorSpan = buildDioramaParticleCorridorSpan;
env.DIO_buildCorridorSpan = DIO_buildCorridorSpan;
var DIO_buildCorridorWindow = buildDioramaParticleCorridorWindow;
env.DIO_buildCorridorWindow = DIO_buildCorridorWindow;
var DIO_MAX_PARTICLE_POINTS = DIORAMA_MAX_PARTICLE_POINTS;
env.DIO_MAX_PARTICLE_POINTS = DIO_MAX_PARTICLE_POINTS;
var DIO_resolveWaveNumberMax = resolveWaveNumberMax;
env.DIO_resolveWaveNumberMax = DIO_resolveWaveNumberMax;
var DIO_buildCloudGeometryData = buildDioramaCloudGeometryData;
env.DIO_buildCloudGeometryData = DIO_buildCloudGeometryData;
var DIO_buildCorridorGeometryData = buildDioramaCorridorGeometryData;
env.DIO_buildCorridorGeometryData = DIO_buildCorridorGeometryData;
var DIO_createBufferGeometry = createDioramaBufferGeometry;
env.DIO_createBufferGeometry = DIO_createBufferGeometry;
var DIO_stepEnvelope = stepDioramaEnvelope;
env.DIO_stepEnvelope = DIO_stepEnvelope;
var DIO_createBandTracker = createDioramaBandTracker;
env.DIO_createBandTracker = DIO_createBandTracker;
var DIO_stepBandTracker = stepDioramaBandTracker;
env.DIO_stepBandTracker = DIO_stepBandTracker;
var DIO_RIPPLE_BANDS = RIPPLE_BANDS;
env.DIO_RIPPLE_BANDS = DIO_RIPPLE_BANDS;
var DIO_RIPPLE_SLOTS_PER_BAND = RIPPLE_SLOTS_PER_BAND;
env.DIO_RIPPLE_SLOTS_PER_BAND = DIO_RIPPLE_SLOTS_PER_BAND;
var DIO_RIPPLE_COUNT = DIORAMA_RIPPLE_COUNT;
env.DIO_RIPPLE_COUNT = DIO_RIPPLE_COUNT;
var DIO_resolveAudioResponse = resolveDioramaParticleAudioResponse;
env.DIO_resolveAudioResponse = DIO_resolveAudioResponse;
var DIO_CORRIDOR_PULSE_SHARE = DIORAMA_CORRIDOR_PULSE_SHARE;
env.DIO_CORRIDOR_PULSE_SHARE = DIO_CORRIDOR_PULSE_SHARE;
var DIO_resolvePulseTarget = resolveDioramaPulseTarget;
env.DIO_resolvePulseTarget = DIO_resolvePulseTarget;
var DIO_createElasticState = createDioramaParticleElasticState;
env.DIO_createElasticState = DIO_createElasticState;
var DIO_stepElasticResponse = stepDioramaParticleElasticResponse;
env.DIO_stepElasticResponse = DIO_stepElasticResponse;
var DIO_buildStructuredSurface = buildDioramaStructuredSurface;
env.DIO_buildStructuredSurface = DIO_buildStructuredSurface;
var DIO_PARTICLE_VERTEX_SHADER = DIORAMA_PARTICLE_VERTEX_SHADER;
env.DIO_PARTICLE_VERTEX_SHADER = DIO_PARTICLE_VERTEX_SHADER;
var DIO_PARTICLE_FRAGMENT_SHADER = DIORAMA_PARTICLE_FRAGMENT_SHADER;
env.DIO_PARTICLE_FRAGMENT_SHADER = DIO_PARTICLE_FRAGMENT_SHADER;
var DIO_getContrastRatio = getDioramaParticleContrastRatio;
env.DIO_getContrastRatio = DIO_getContrastRatio;
var DIO_getDisplayedContrastRatio = getDioramaParticleDisplayedContrastRatio;
env.DIO_getDisplayedContrastRatio = DIO_getDisplayedContrastRatio;
var DIO_resolveContrastColors = resolveDioramaParticleContrastColors;
env.DIO_resolveContrastColors = DIO_resolveContrastColors;
var DIO_createParticleMaterial = createDioramaParticleMaterial;
env.DIO_createParticleMaterial = DIO_createParticleMaterial;
var DIO_createParticleGlowMaterial = createDioramaParticleGlowMaterial;
env.DIO_createParticleGlowMaterial = DIO_createParticleGlowMaterial;
var DIO_lerpParticleMaterialColors = lerpDioramaParticleMaterialColors;
env.DIO_lerpParticleMaterialColors = DIO_lerpParticleMaterialColors;
var DIO_getKeywordDisplayedContrastRatio = getDioramaKeywordDisplayedContrastRatio;
env.DIO_getKeywordDisplayedContrastRatio = DIO_getKeywordDisplayedContrastRatio;
var DIO_resolveKeywordColor = resolveDioramaKeywordColor;
env.DIO_resolveKeywordColor = DIO_resolveKeywordColor;
var DIO_prepareKeywordMatchers = prepareDioramaKeywordMatchers;
env.DIO_prepareKeywordMatchers = DIO_prepareKeywordMatchers;
var DIO_resolveKeywordUnitColors = resolveDioramaKeywordUnitColors;
env.DIO_resolveKeywordUnitColors = DIO_resolveKeywordUnitColors;
var DIO_RASTER_FONT_PX = DIORAMA_RASTER_FONT_PX;
env.DIO_RASTER_FONT_PX = DIO_RASTER_FONT_PX;
var DIO_buildFontSpec = buildDioramaFontSpec;
env.DIO_buildFontSpec = DIO_buildFontSpec;
var DIO_measureText = measureDioramaText;
env.DIO_measureText = DIO_measureText;
var DIO_rasterUnit = rasterDioramaUnit;
env.DIO_rasterUnit = DIO_rasterUnit;
var DIO_rasterLine = rasterDioramaLine;
env.DIO_rasterLine = DIO_rasterLine;
var CM_resolveWordColor = resolveWordColor;
env.CM_resolveWordColor = CM_resolveWordColor;
var CM_prepareWordColorMatchers = prepareWordColorMatchers;
env.CM_prepareWordColorMatchers = CM_prepareWordColorMatchers;
var CM_buildWordColorRangesFromMatchers = buildWordColorRangesFromMatchers;
env.CM_buildWordColorRangesFromMatchers = CM_buildWordColorRangesFromMatchers;
var CM_resolveTokenColorMap = resolveTokenColorMap;
env.CM_resolveTokenColorMap = CM_resolveTokenColorMap;
var CM_buildLineRenderHints = buildLineRenderHints;
env.CM_buildLineRenderHints = CM_buildLineRenderHints;
var CM_getLineRenderHints = getLineRenderHints;
env.CM_getLineRenderHints = CM_getLineRenderHints;
var CM_getLineRenderEndTime = getLineRenderEndTime;
env.CM_getLineRenderEndTime = CM_getLineRenderEndTime;
var CM_MICRO_LINE_DURATION_THRESHOLD = MICRO_LINE_DURATION_THRESHOLD;
env.CM_MICRO_LINE_DURATION_THRESHOLD = CM_MICRO_LINE_DURATION_THRESHOLD;
var CM_SHORT_LINE_DURATION_THRESHOLD = SHORT_LINE_DURATION_THRESHOLD;
env.CM_SHORT_LINE_DURATION_THRESHOLD = CM_SHORT_LINE_DURATION_THRESHOLD;
var CM_buildWordGraphemeTimings = buildWordGraphemeTimings;
env.CM_buildWordGraphemeTimings = CM_buildWordGraphemeTimings;
var CM_buildLineGraphemeTimeline = buildLineGraphemeTimeline;
env.CM_buildLineGraphemeTimeline = CM_buildLineGraphemeTimeline;
var CM_splitLyricGraphemes = splitLyricGraphemes;
env.CM_splitLyricGraphemes = CM_splitLyricGraphemes;
var CM_resolveThemeFontStack = resolveThemeFontStack;
env.CM_resolveThemeFontStack = CM_resolveThemeFontStack;
var CM_resolveThemeTranslationFontStack = resolveThemeTranslationFontStack;
env.CM_resolveThemeTranslationFontStack = CM_resolveThemeTranslationFontStack;
var CM_resolveThemeFontWeight = resolveThemeFontWeight;
env.CM_resolveThemeFontWeight = CM_resolveThemeFontWeight;
var CM_resolveSubtitleFontSizes = resolveSubtitleFontSizes;
env.CM_resolveSubtitleFontSizes = CM_resolveSubtitleFontSizes;
var DIO_DEFAULT_TUNING = DEFAULT_DIORAMA_TUNING;
env.DIO_DEFAULT_TUNING = DIO_DEFAULT_TUNING;
var DIO_DEFAULT_GEOMETRY_VISIBILITY = DEFAULT_DIORAMA_GEOMETRY_VISIBILITY;
env.DIO_DEFAULT_GEOMETRY_VISIBILITY = DIO_DEFAULT_GEOMETRY_VISIBILITY;
var DIO_PARTICLE_DENSITY_MAX = DIORAMA_PARTICLE_DENSITY_MAX;
env.DIO_PARTICLE_DENSITY_MAX = DIO_PARTICLE_DENSITY_MAX;
var DIO_MOTE_CIRCUMFERENCE_MAX = DIORAMA_MOTE_CIRCUMFERENCE_MAX;
env.DIO_MOTE_CIRCUMFERENCE_MAX = DIO_MOTE_CIRCUMFERENCE_MAX;
env.DioramaDioramaEngine = (typeof DioramaDioramaEngine !== "undefined") ? DioramaDioramaEngine : null;
env.DioramaResolveMotionParams = (typeof DioramaResolveMotionParams !== "undefined") ? DioramaResolveMotionParams : null;
env.DioramaDefaults = (typeof DioramaDefaults !== "undefined") ? DioramaDefaults : null;
env.DioramaBuildActiveUnits = (typeof DioramaBuildActiveUnits !== "undefined") ? DioramaBuildActiveUnits : null;
env.DioramaFindLineIndexAtTime = (typeof DioramaFindLineIndexAtTime !== "undefined") ? DioramaFindLineIndexAtTime : null;
env.DioramaResolveGradientEnergy = (typeof DioramaResolveGradientEnergy !== "undefined") ? DioramaResolveGradientEnergy : null;
env.DioramaResolveTextLife = (typeof DioramaResolveTextLife !== "undefined") ? DioramaResolveTextLife : null;
env.DioramaBuildPhantomLines = (typeof DioramaBuildPhantomLines !== "undefined") ? DioramaBuildPhantomLines : null;
})(typeof THREE185 !== "undefined" ? THREE185 : null, typeof window !== "undefined" ? window : this);