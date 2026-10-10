import { SONNET_TRANSITION_KINDS, } from './types';
import { clamp01, easeSonnetInOut } from './sonnetMotion';
export const IDLE_SONNET_TRANSITION_FRAME = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    alpha: 1,
    blur: 0,
    glitch: 0,
    glitchSeed: 0,
};
const resolveBoundaryKind = (seed, boundaryIndex) => {
    const mixed = (seed ^ Math.imul(boundaryIndex + 1, 0x9e3779b1)) >>> 0;
    return SONNET_TRANSITION_KINDS[mixed % SONNET_TRANSITION_KINDS.length];
};
export const resolveSonnetTransitionEffectFrame = (kind, phase, progress, seed) => {
    const linear = clamp01(progress);
    const eased = easeSonnetInOut(linear);
    const amount = phase === 'exit' ? eased : 1 - eased;
    if (kind === 'fast-blur') {
        return {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            alpha: phase === 'exit' ? 1 - amount : 1 - amount * 0.82,
            blur: amount * 14,
            glitch: 0,
            glitchSeed: 0,
        };
    }
    if (kind === 'mono-glitch') {
        const step = Math.floor(linear * 14);
        return {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            alpha: phase === 'exit' && linear > 0.86
                ? 1 - (linear - 0.86) / 0.14
                : 1,
            blur: 0,
            glitch: amount,
            glitchSeed: seed * 0.0001 + step * 0.173,
        };
    }
    return {
        x: 0,
        y: 0,
        // Scene filters use a viewport-sized render surface, so transition scaling exposes its bounds.
        scale: 1,
        rotation: 0,
        alpha: phase === 'exit' ? 1 - amount : 1 - amount * 0.72,
        blur: 0,
        glitch: 0,
        glitchSeed: 0,
    };
};
export const resolveSonnetExitTransitionFrame = (paragraph, time, enabled, seed) => {
    const transition = paragraph.transitionOut;
    if (!enabled || !transition || time < transition.startTime)
        return IDLE_SONNET_TRANSITION_FRAME;
    const progress = (time - transition.startTime) / Math.max(transition.endTime - transition.startTime, 0.001);
    return resolveSonnetTransitionEffectFrame(transition.kind, 'exit', progress, seed);
};
export const resolveSonnetEnterTransitionFrame = (kind, timeSinceStart, duration, enabled, seed) => {
    if (!enabled || !kind || timeSinceStart < 0 || timeSinceStart > duration) {
        return IDLE_SONNET_TRANSITION_FRAME;
    }
    return resolveSonnetTransitionEffectFrame(kind, 'enter', timeSinceStart / Math.max(duration, 0.001), seed);
};
// Gives every layout boundary a short transition; paragraphs commonly contain several shots.
export const resolveSonnetShotTransitionFrame = (shots, activeShotIndex, time, enabled, seed) => {
    if (!enabled || shots.length < 2)
        return IDLE_SONNET_TRANSITION_FRAME;
    const current = shots[activeShotIndex];
    if (!current)
        return IDLE_SONNET_TRANSITION_FRAME;
    if (activeShotIndex > 0) {
        const previous = shots[activeShotIndex - 1];
        const duration = Math.min(0.24, Math.max(0.14, (current.startTime - previous.startTime) * 0.18));
        if (time <= current.startTime + duration) {
            return resolveSonnetEnterTransitionFrame(resolveBoundaryKind(seed, activeShotIndex - 1), time - current.startTime, duration, true, seed + activeShotIndex * 97);
        }
    }
    const next = shots[activeShotIndex + 1];
    if (!next)
        return IDLE_SONNET_TRANSITION_FRAME;
    const duration = Math.min(0.24, Math.max(0.14, (next.startTime - current.startTime) * 0.18));
    const transitionStart = next.startTime - duration;
    if (time < transitionStart)
        return IDLE_SONNET_TRANSITION_FRAME;
    return resolveSonnetTransitionEffectFrame(resolveBoundaryKind(seed, activeShotIndex), 'exit', (time - transitionStart) / duration, seed + (activeShotIndex + 1) * 97);
};
