import { isSonnetEmphasisRole } from './sonnetTypographyLayout';
export const resolveSonnetGlyphMotionDuration = (window) => {
    const shotDuration = Math.max(0.001, window.endTime - window.startTime);
    const preferred = Math.min(1.8, Math.max(0.65, shotDuration * 0.42));
    return Math.min(preferred, shotDuration * 0.72);
};
export const buildSonnetGlyphLayout = (segment, placement, fontSize, measureGlyph, motionWindow) => {
    const fallbackChars = Array.from(segment.text);
    const graphemes = segment.graphemes.length
        ? segment.graphemes
        : fallbackChars.map((char, index) => ({
            char,
            startTime: segment.startTime
                + (segment.endTime - segment.startTime) * index / Math.max(1, fallbackChars.length),
            endTime: segment.startTime
                + (segment.endTime - segment.startTime) * (index + 1) / Math.max(1, fallbackChars.length),
        }));
    const advances = graphemes.map(item => (placement.vertical ? fontSize * 0.9 : Math.max(fontSize * 0.2, measureGlyph(item.char))));
    const totalAdvance = advances.reduce((sum, advance) => sum + advance, 0);
    const motionDuration = resolveSonnetGlyphMotionDuration(motionWindow);
    let cursor = -totalAdvance / 2;
    return graphemes.map((grapheme, index) => {
        const advance = advances[index];
        const localX = placement.vertical ? 0 : cursor + advance / 2;
        const localY = placement.vertical ? cursor + advance / 2 : 0;
        cursor += advance;
        const cosine = Math.cos(placement.rotation);
        const sine = Math.sin(placement.rotation);
        const stagger = index % 2 === 0 ? -1 : 1;
        const startTime = grapheme.startTime;
        const settleTime = startTime + motionDuration;
        return {
            char: grapheme.char,
            baseX: placement.x + localX * cosine - localY * sine,
            baseY: placement.y + localX * sine + localY * cosine,
            enterX: placement.enterX + (placement.vertical ? stagger * fontSize * 0.28 : 0),
            enterY: placement.enterY + (placement.vertical ? 0 : stagger * fontSize * 0.24),
            entryRotation: stagger * (isSonnetEmphasisRole(placement.role) ? 0.055 : 0.035),
            startTime,
            settleTime: Math.max(startTime, settleTime),
        };
    });
};
