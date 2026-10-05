// ============================================================
// 06-transition-planner.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/transitionPlanner.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
// 间奏行判定（内联自 folia parserCore.ts，纯一行函数）
const INTERLUDE_FULL_TEXT = '......';
const isInterludeLine = (line) => line.fullText === INTERLUDE_FULL_TEXT;
const AUTOMIX_MAX_OVERLAP_SEC = 25;
const AUTOMIX_MIN_OVERLAP_SEC = 0.8;
const AUTOMIX_MIN_CUT_ROOM_SEC = 0.15;
const AUTOMIX_DEFAULT_OVERLAP_SEC = 5;
const AUTOMIX_DEFAULT_OVERLAP_BEATS = BEATS_PER_PHRASE * 2;
const GRID_SNAP_BEATS = 1;
const SECTION_SNAP_SEC = 2;
const MAX_TRIMMED_TAIL_SEC = 10;
const beatSec = (bpm) => bpm && Number.isFinite(bpm) && bpm > 0 ? 60 / bpm : null;
const endsOf = (track) => {
  const profile = track.profile && !track.profile.partial ? track.profile : null;
  const back = (seconds) => seconds !== null && seconds !== void 0 && seconds > 0 ? track.duration - Math.min(seconds, MAX_TRIMMED_TAIL_SEC) : track.duration;
  return { sounding: back(profile?.leadOut), body: back(profile?.bodyOut) };
};
const ENTRY_MARGIN_SEC = 0.1;
const barPhase = (grid, seconds) => ((grid.offset - seconds) % grid.period + grid.period) % grid.period;
const entryGrid = (bpm, beatOffset) => barGrid(bpm, beatOffset, 1);
const nearestWithin = (moments, target, tolerance, usable) => {
  let best = null;
  for (const moment of moments ?? []) {
    if (Math.abs(moment - target) > tolerance || !usable(moment)) continue;
    if (best === null || Math.abs(moment - target) < Math.abs(best - target)) best = moment;
  }
  return best;
};
const lastSungMoment = (lines) => {
  const sung = lines?.filter((line) => line.fullText.trim().length > 0 && !isInterludeLine(line));
  return sung?.length ? sung[sung.length - 1].endTime : null;
};
const hardCut = (reason) => ({
  kind: "hardCut",
  style: "plainBlend",
  relation: "unknown",
  tempo: "unknown",
  stretch: 1,
  tiltDb: [0, 0],
  echoThrow: false,
  outStart: 0,
  inStart: 0,
  overlap: 0,
  minOverlap: AUTOMIX_MIN_OVERLAP_SEC,
  reason
});
const tpRound = (seconds) => Math.round(seconds * 100) / 100;
const planTransition = (from, to, bpm = null, at = 0) => {
  if (!Number.isFinite(from.duration) || from.duration <= 0) {
    return hardCut("outgoing duration unknown, nothing to schedule a fade against");
  }
  const choice = chooseTransitionStyle({
    from: from.profile ?? null,
    to: to.profile ?? null
  });
  const { sounding: end, body } = endsOf(from);
  const left = Math.max(0, end - at);
  const trimmed = from.duration - end;
  const silence = trimmed > 0.05 ? `, skipped ${tpRound(trimmed)}s of silence at the end` : "";
  const decay = from.profile?.bodyOut ?? 0;
  const clipped = decay > MAX_TRIMMED_TAIL_SEC ? `, its last ${tpRound(decay)}s is decay but only ${MAX_TRIMMED_TAIL_SEC}s of that may be trimmed` : "";
  if (choice.style === "beatCut") {
    const placeable = to.profile ? to.profile.leadIn + HEAD_BUDGET_SEC : CUT_LEAD_SEC;
    const room = Math.min(CUT_LEAD_SEC, end / 4, placeable, left);
    if (room < AUTOMIX_MIN_CUT_ROOM_SEC) {
      return hardCut(room === left ? `only ${tpRound(left)}s of the outgoing track left to cut in` : `track too short to place a cut in (${tpRound(end)}s)`);
    }
    return {
      kind: "fade",
      style: choice.style,
      relation: choice.relation,
      tempo: choice.tempo.relation,
      // Nothing to lock to: a cut never has the two tracks sounding at once, so there is no
      // drift to remove and no reason to spend an artefact removing it.
      stretch: 1,
      tiltDb: [0, 0],
      echoThrow: choice.echoThrow,
      outStart: tpRound(end - room),
      // Deliberately not the incoming track's lead-in, which is what every other style skips.
      // Here that silence is not waste, it is the budget: waiting is the only way to place a
      // cut on a beat, and the wait can only be paid for out of it.
      inStart: 0,
      overlap: tpRound(room),
      minOverlap: AUTOMIX_MIN_CUT_ROOM_SEC,
      reason: `${choice.style} - ${choice.reason}${silence}`
    };
  }
  const beat = beatSec(bpm);
  const sungFrom = from.vocalEnd != null ? "the vocal stem" : "the lyric file";
  const lyricSung = lastSungMoment(from.lines);
  const lastSung = from.vocalEnd ?? lyricSung;
  const sungGap = from.vocalEnd != null && lyricSung !== null && Math.abs(from.vocalEnd - lyricSung) > 0.5 ? `, the lyric file said ${tpRound(lyricSung)}s` : "";
  const tail = lastSung === null ? null : Math.max(0, end - lastSung);
  const intro = to.profile?.sectionStart ?? null;
  const vouchFor = (window2) => window2 !== null && window2 >= AUTOMIX_MIN_OVERLAP_SEC ? window2 : null;
  const tailRoom = vouchFor(tail);
  const introRoom = vouchFor(intro);
  const voicesGated = Boolean(from.separated && to.separated);
  const singleVoiceRoom = tailRoom === null && introRoom === null ? Infinity : Math.max(tailRoom ?? 0, introRoom ?? 0);
  const entryFloor = Math.min(
    MAX_TRIMMED_TAIL_SEC,
    Math.max(0, (to.profile?.leadIn ?? 0) - ENTRY_MARGIN_SEC)
  );
  const gestureRoom = from.separated && to.separated ? Math.max(0, Math.min(
    end - from.separated.from,
    to.separated.to - entryFloor - (beat ?? 0)
  )) : Infinity;
  const wanted = (beat === null ? AUTOMIX_DEFAULT_OVERLAP_SEC : beat * AUTOMIX_DEFAULT_OVERLAP_BEATS) * choice.lengthScale;
  const ceiling = Math.min(
    AUTOMIX_MAX_OVERLAP_SEC,
    // Quarter-length cap so a very short track is not half crossfade.
    end / 4,
    singleVoiceRoom,
    // Only binds on a separated pair, and only because that pair asked for the long blend.
    gestureRoom,
    // Only ever binds when the planning itself was late - see `left`.
    left
  );
  const overlap = quantiseToMusic(Math.min(wanted, ceiling), beat, ceiling);
  if (overlap < AUTOMIX_MIN_OVERLAP_SEC) {
    const bound = ceiling === left ? `only ${tpRound(left)}s of the outgoing track left` : Number.isFinite(singleVoiceRoom) && singleVoiceRoom <= end / 4 ? singleVoiceRoom === tailRoom ? `only ${tpRound(singleVoiceRoom)}s after the outgoing track stops singing` : `only ${tpRound(singleVoiceRoom)}s before the next track sings` : `a ${tpRound(end)}s track leaves only ${tpRound(end / 4)}s to fade across`;
    return hardCut(`no room to fade - ${bound}`);
  }
  const outroMissing = from.lines?.length ? "nothing sung in the outgoing lyrics" : "no lyrics for the outgoing track";
  const introMissing = to.profile ? "nothing measurable at the start of the incoming track" : "the incoming track was never analysed";
  const window = tail === null ? outroMissing : intro === null ? introMissing : `outro ${tpRound(tail)}s, intro ${tpRound(intro)}s`;
  const length = `${beat === null ? "default" : `${tpRound(overlap / beat)} beats`}` + (overlap >= wanted - 0.05 ? "" : ceiling < wanted - 0.05 ? ceiling === left ? `, wanted ${tpRound(wanted)}s, capped by the ${tpRound(left)}s left of this track` : `, wanted ${tpRound(wanted)}s, capped by what the pair has room for (${tpRound(ceiling)}s)` : `, wanted ${tpRound(wanted)}s, rounded down to the grid`);
  const latest = end - overlap;
  const anchor = Math.min(latest, Math.max(body, lastSung ?? 0, at));
  const rode = latest - anchor;
  const fadeOut = rode > 0.05 ? `, started ${tpRound(rode)}s early to ride the fade-out` : "";
  const lowest = Math.min(anchor, latest);
  const withinRange = (value) => value >= lowest - 1e-6 && value <= latest + 1e-6;
  const boundary = nearestWithin(from.profile?.sections, anchor, SECTION_SNAP_SEC, withinRange);
  const grid = entryGrid(bpm, from.profile?.beatOffset);
  const snapped = snapToGrid(boundary ?? anchor, grid, beat === null ? 0 : beat * GRID_SNAP_BEATS);
  const outStart = withinRange(snapped) ? snapped : boundary ?? anchor;
  const placed = boundary !== null ? ", on a section edge" : Math.abs(outStart - anchor) > 0.01 ? ", on a beat" : "";
  const inStart = alignEntry(
    entryFloor,
    // The SAME phase estimator as the outgoing side above, and that is the whole point.
    //
    // A head-measured phase is a better description of the incoming track's first thirty seconds -
    // graded against Beat This! it is 18 of 28 inside an eighth of a beat against 13 of 30 for the
    // whole-track one extrapolated there. Substituting it here makes the ENTRY worse, 0.246 against
    // 0.118, and that is not a contradiction: `alignEntry` returns a DIFFERENCE between two grids, and
    // a difference is blind to any bias the two share. Two estimates made the same way carry the same
    // bias and it cancels; mixing in a better one on a single side breaks the cancellation and leaves
    // its bias behind. Same shape as the balance correction, which measured the incoming track with
    // one kind of loudness and the outgoing track with another. Both sides of a comparison have to be
    // the same measurement before either is allowed to be a good one.
    entryGrid(to.profile?.bpm, to.profile?.beatOffset),
    // In WALL seconds, not the outgoing track's own: if it is being bent to meet the incoming
    // tempo, its bars arrive that much sooner than its media clock says they will.
    grid === null ? null : barPhase(grid, outStart) / choice.tempo.stretch
  );
  const key = choice.relation === "unknown" ? "" : `, ${choice.relation} keys`;
  const outgoingTail = !from.profile ? ", outgoing never analysed" : from.profile.partial ? ", outgoing tail not analysed" : "";
  const apart = Math.round(Math.abs(choice.tempo.ratio - 1) * 100);
  const bend = choice.tempo.stretch !== 1 ? `, outgoing bent ${((choice.tempo.stretch - 1) * 100).toFixed(1)}% onto the next tempo` : choice.tempo.relation === "drifting" ? `, tempos ${apart}% apart, left to drift` : choice.tempo.relation === "far" ? `, tempos ${apart}% apart, too far to overlap` : "";
  const entry = inStart > 0.05 ? `, entering the next track at ${tpRound(inStart)}s` : "";
  const sung = lastSung === null ? ", nothing says where the singing stops" : `, sung to ${tpRound(lastSung)}s off ${sungFrom}${sungGap}`;
  const nextSings = intro !== null && inStart + overlap > intro;
  const outgoingSings = lastSung !== null && outStart < lastSung;
  const sungOver = voicesGated ? ", both voices held by the gesture" : nextSings && outgoingSings ? ", BOTH tracks sing inside this blend" : nextSings ? ", the next track sings over the outgoing instrumental" : outgoingSings ? ", the outgoing track sings over the next one's intro" : "";
  return {
    kind: "fade",
    style: choice.style,
    relation: choice.relation,
    tempo: choice.tempo.relation,
    stretch: choice.tempo.stretch,
    tiltDb: choice.tiltDb,
    echoThrow: choice.echoThrow,
    outStart: tpRound(outStart),
    inStart: tpRound(inStart),
    overlap: tpRound(overlap),
    minOverlap: AUTOMIX_MIN_OVERLAP_SEC,
    // The style's own reason, which used to be computed here and then dropped on this branch
    // only - so the log said how long a blend was and never why that length. The scales live in
    // the choice, so without it a 1.95s blend and a 5.85s one read as the same decision.
    reason: `${choice.style} ${tpRound(overlap)}s ${length} - ${choice.reason} (${window}${sungOver}${key}${outgoingTail}${sung}${silence}${clipped}${fadeOut}${placed}${bend}${entry})`
  };
};
const resolveOverlap = (plan, remainingSec) => {
  if (plan.kind !== "fade" || !Number.isFinite(remainingSec)) return 0;
  const overlap = Math.min(plan.overlap, remainingSec);
  return overlap >= plan.minOverlap ? tpRound(overlap) : 0;
};
