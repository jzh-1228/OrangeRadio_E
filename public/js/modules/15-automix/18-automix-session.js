// ============================================================
// 18-automix-session.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/automixSession.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const otherDeck = (deck) => deck === "A" ? "B" : "A";
const AUTOMIX_ARM_LEAD_SEC = 1;
const RELEASE_MARGIN_SEC = 0.25;
const FADE_CLEANUP_MARGIN_MS = 150;
const CUT_SECONDS = 0.05;
const BALANCE_INTERVAL_MS = 100;
const BALANCE_RAMP_SEC = 0.4;
const BALANCE_STEP_DB = 0.75;
const MAX_ALIGN_HOLD_SEC = 1;
const createAutomixSession = (ports) => {
  const clocks = { A: createDeckClock(), B: createDeckClock() };
  let activeDeck = "A";
  let phase = "idle";
  let plan = null;
  let plannedNextKey = null;
  let plannedFromKey = null;
  let plannedFrom = null;
  let plannedTo = null;
  let cleanupTimer = null;
  let balanceTimer = null;
  let releaseTimer = null;
  let holdingAutoplay = false;
  let appliedTrimDb = 0;
  const clearTimers = () => {
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    if (balanceTimer !== null) {
      clearInterval(balanceTimer);
      balanceTimer = null;
    }
    if (releaseTimer !== null) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
  };
  const setAutoplayHold = (held) => {
    if (holdingAutoplay === held) return;
    holdingAutoplay = held;
    ports.onAutoplayHoldChange(held);
  };
  const sampleDecks = (contextTime) => {
    ["A", "B"].forEach((deck) => {
      const element = ports.getElement(deck);
      if (!element || element.paused || !Number.isFinite(element.currentTime)) return;
      clocks[deck].sample(element.currentTime, contextTime);
    });
  };
  const waitToGrid = (grid, fromMedia, rate) => {
    if (!grid || !(grid.period > 0) || !(rate > 0)) return null;
    const next = grid.offset + Math.ceil((fromMedia - grid.offset) / grid.period) * grid.period;
    return (next - fromMedia) / rate;
  };
  const seekTo = (element, position) => {
    if (!(position > 0.05)) return;
    const apply = () => {
      if (Math.abs(element.currentTime - position) < 0.02) return;
      try {
        element.currentTime = position;
      } catch {
      }
    };
    if (element.readyState >= 1) apply();
    else element.addEventListener("loadedmetadata", apply, { once: true });
  };
  const startBalanceCorrection = (context, tailChain, activeChain, incomingReference) => {
    appliedTrimDb = 0;
    balanceTimer = setInterval(() => {
      const outgoingDb = referenceDb(plannedFrom, tailChain) ?? tailChain.analyser.loudnessDb();
      const incomingDb = incomingReference ?? activeChain.analyser.loudnessDb();
      if (outgoingDb === null || incomingDb === null) return;
      const target = trimForBalance(outgoingDb, incomingDb);
      if (target < appliedTrimDb + BALANCE_STEP_DB) return;
      appliedTrimDb = target;
      rampGainDb(context, tailChain.trim, -appliedTrimDb, BALANCE_RAMP_SEC);
    }, BALANCE_INTERVAL_MS);
  };
  const referenceDb = (profile, chain) => profile === null ? null : profile.loudness + 20 * Math.log10(Math.max(chain.replayGain.gain.value, 1e-6));
  let stemChains = [];
  let stemBus = null;
  let expansionStop = null;
  let expansionNote = null;
  const barSecOf = (profile) => profile?.bpm ? 60 / profile.bpm * (profile.beatsPerBar || 4) : null;
  const scheduleStemGesture = (args) => {
    const { context, fromStems, toStems, startMedia, wall } = args;
    const rate = fromStems.buffers.vocals.sampleRate;
    const offset = Math.round((startMedia - fromStems.from) * rate);
    const length = Math.round(wall * rate);
    const inOffset = Math.round((args.inAt - toStems.from) * rate);
    if (offset < 0 || inOffset < 0 || offset + length > fromStems.buffers.vocals.length || inOffset + length > toStems.buffers.vocals.length) {
      console.log(`[Automix] stems do not cover this ${wall.toFixed(2)}s window (${fromStems.duration.toFixed(0)}s separated, needing from ${(startMedia - fromStems.from).toFixed(2)}s out and ${(args.inAt - toStems.from).toFixed(2)}s in), using the master crossfade`);
      return false;
    }
    const slice = (buffer, at2) => Array.from(
      { length: buffer.numberOfChannels },
      (_, channel) => buffer.getChannelData(channel).subarray(at2, at2 + length)
    );
    const mixEnvelope = (stems, at2, span) => envelopeOf(
      Array.from(
        { length: stems.buffers.vocals.numberOfChannels },
        (_, channel) => {
          const out = new Float32Array(span);
          for (const name of ["vocals", "drums", "bass", "other"]) {
            const data = stems.buffers[name].getChannelData(channel);
            for (let i = 0; i < span; i += 1) out[i] += data[at2 + i];
          }
          return out;
        }
      ),
      rate
    );
    const vocals = envelopeOf(slice(fromStems.buffers.vocals, offset), rate);
    const mix = mixEnvelope(fromStems, offset, length);
    const stemFindsVoice = singsInWindow(
      envelopeOf(slice(toStems.buffers.vocals, inOffset), rate),
      mixEnvelope(toStems, 0, toStems.buffers.vocals.length)
    );
    const bars = [];
    const barLines = barGrid(
      args.outgoingBpm,
      args.outgoingDownbeat,
      args.outgoingBeatsPerBar ?? BEATS_PER_BAR
    );
    if (barLines) {
      const first = Math.ceil((startMedia - barLines.offset) / barLines.period);
      for (let k = first; ; k += 1) {
        const at2 = barLines.offset + k * barLines.period - startMedia;
        if (at2 > wall) break;
        if (at2 >= 0) bars.push(at2);
      }
    }
    const barSec = args.outgoingBarSec;
    const introAt = args.incomingSectionStart === null ? null : args.incomingSectionStart - args.inAt;
    const incomingSings = !(!stemFindsVoice && introAt !== null && introAt > wall);
    const handover = planStemHandover(
      wall,
      barSec,
      args.incomingBarSec,
      bars,
      vocals,
      mix,
      { keysClash: args.keysClash, sings: incomingSings }
    );
    const outCurves = outgoingCurves(wall, handover);
    const inCurves = incomingCurves(wall, handover);
    const expansion = args.expansion === null ? null : planExpansion(
      args.expansion,
      handover.swap,
      barSec,
      wall,
      args.outgoingBeatsPerBar ?? 4
    );
    if (args.expansion !== null) {
      expansionNote = expansion ? expansion.reason : `no room for a build before the swap at ${handover.swap.toFixed(2)}s`;
    }
    if (expansion) {
      const mask = expansionMask(wall, expansion);
      for (const name of expansion.stems) {
        for (let i = 0; i < outCurves[name].length; i += 1) outCurves[name][i] *= mask[i];
      }
    }
    const outLevel = args.tailChain.replayGain.gain.value;
    const inLevel = args.activeChain.replayGain.gain.value;
    for (const name of STEM_NAMES) {
      for (let i = 0; i < outCurves[name].length; i += 1) outCurves[name][i] *= outLevel;
      for (let i = 0; i < inCurves[name].length; i += 1) inCurves[name][i] *= inLevel;
    }
    const at = Math.max(context.currentTime, args.startAt);
    const late = Math.min(
      at - args.startAt,
      (fromStems.buffers.vocals.length - (offset + length)) / rate,
      (toStems.buffers.vocals.length - (inOffset + length)) / rate
    );
    stemBus = connectStemBus(context, args.tailChain.output);
    const outgoing = connectStemDeck(
      context,
      fromStems,
      stemBus.input,
      startMedia + late,
      at,
      true
    );
    const incoming = connectStemDeck(
      context,
      toStems,
      stemBus.input,
      args.inAt + late,
      at,
      false
    );
    stemChains = [outgoing, incoming];
    if (expansion) {
      const lateSamples = Math.round(late * rate);
      const rendered = expansion.stems.flatMap((name) => renderExpansion(
        slice(fromStems.buffers[name], offset + lateSamples),
        expansion,
        rate
      ).map((channel, index) => ({ name, index, channel })));
      const channels = Array.from(
        { length: fromStems.buffers.drums.numberOfChannels },
        (_, index) => {
          const parts = rendered.filter((part) => part.index === index);
          const out = new Float32Array(parts[0]?.channel.length ?? 0);
          for (const part of parts) {
            for (let i = 0; i < out.length; i += 1) out[i] += part.channel[i];
          }
          return out;
        }
      );
      expansionStop = connectExpansion(
        context,
        channels,
        rate,
        outgoing.output,
        at + expansion.from,
        outLevel
      );
      if (!expansionStop) expansionNote = `${expansion.reason}, but it could not be scheduled`;
    }
    const ok = scheduleStemWindow(
      context,
      outgoing,
      outCurves,
      args.tailChain.fade,
      at,
      wall,
      "out"
    ) && scheduleStemWindow(
      context,
      incoming,
      inCurves,
      args.activeChain.fade,
      at,
      wall,
      "in"
    );
    if (!ok) {
      console.log("[Automix] stems could not be scheduled, using the master crossfade");
      expansionStop?.();
      expansionStop = null;
      stemChains.forEach((chain) => chain.stop());
      stemChains = [];
      return false;
    }
    const vocalGap = handover.vocalIn - handover.exit.to;
    console.log(
      `[Automix] stems: voice ${{ rest: "cut in a rest", recede: "receding", release: "riding a held note out" }[handover.exit.kind]} ${handover.exit.from.toFixed(2)}-${handover.exit.to.toFixed(2)}s (quietest half-second ${handover.exit.loudDb.toFixed(0)}dB under the mix), drums at ${handover.swap.toFixed(2)}s${bars.length ? " on a bar line" : ""}, bass at ${handover.bassAt.toFixed(2)}s,` + (incomingSings ? ` next voice at ${handover.vocalIn.toFixed(2)}s` : " the next track does not sing in this window, so no deadline") + (handover.vocalIn > handover.dueAt + 5e-3 ? ` (held back from ${handover.dueAt.toFixed(2)}s to meet the note)` : "") + (vocalGap > 0 ? `, ${vocalGap.toFixed(2)}s with neither voice` : `, voices overlap by ${(-vocalGap).toFixed(2)}s`) + `, ${(wall - Math.max(handover.bassAt, handover.vocalIn)).toFixed(2)}s of blend after that` + (handover.exit.held === null ? ", not on a held note" : `, holding a ${(handover.exit.held.to - handover.exit.held.from).toFixed(2)}s note at ${handover.exit.held.holdDb.toFixed(0)}dB` + (handover.exit.held.to >= wall - 0.05 ? ", still holding when the window ends" : `, let go at ${handover.exit.held.to.toFixed(2)}s`)) + (late > 0.01 ? `, wired ${late.toFixed(2)}s late and lined up on that` : "")
    );
    return true;
  };
  const settle = (options) => {
    diagMark(`settle (pauseTail=${options.pauseTail})`);
    clearTimers();
    expansionStop?.();
    expansionStop = null;
    stemChains.forEach((chain) => chain.stop());
    stemChains = [];
    stemBus?.stop();
    stemBus = null;
    setAutoplayHold(false);
    const tailDeck = otherDeck(activeDeck);
    if (appliedTrimDb > 0) {
      console.log(`[Automix] held the outgoing track ${appliedTrimDb.toFixed(1)}dB down to keep it off the next one`);
      appliedTrimDb = 0;
    }
    if (options.pauseTail) {
      ports.getElement(tailDeck)?.pause();
    }
    const context = ports.getContext();
    if (context) {
      ["A", "B"].forEach((deck) => {
        const chain = ports.getChain(deck);
        if (!chain) return;
        rampGain(context, chain.fade, 1, 0.03);
        rampGain(context, chain.trim, 1, 0.03);
        resetTone(context, chain.tone);
        resetThrow(context, chain.throw);
        resetTempoBend(ports.getElement(deck));
      });
    }
    clocks[tailDeck].reset();
    phase = "idle";
    plan = null;
    plannedNextKey = null;
    plannedFromKey = null;
    plannedFrom = null;
    plannedTo = null;
    ports.onTailSrcChange(null, { harvest: options.harvest ?? true });
    announceTransition(null);
  };
  const requestTransition = (request) => {
    if (phase !== "idle") return null;
    const outgoingTempo = ports.getChain(activeDeck)?.analyser.tempo() ?? null;
    const outgoingStems = ports.getStems?.(request.fromKey, "tail") ?? null;
    const incomingStems = ports.getStems?.(request.nextKey, "head") ?? null;
    const extent = (stems) => outgoingStems && incomingStems && stems ? { from: stems.from, to: stems.from + stems.duration } : null;
    const outgoing = {
      ...request.from,
      separated: extent(outgoingStems),
      ...outgoingStems?.vocalEnd == null ? {} : { vocalEnd: outgoingStems.from + outgoingStems.vocalEnd }
    };
    const nextPlan = planForMode(
      request.settings,
      outgoing,
      { ...request.to, separated: extent(incomingStems) },
      // The offline profile measured the whole file; the live tap only heard the last few
      // seconds. Prefer the profile, fall back to the tap for anything never analysed.
      request.from.profile?.bpm ?? outgoingTempo?.bpm ?? null,
      // Where the track actually is. This function is not called on a schedule - it is
      // called when nothing else is blocking it, and the previous blend blocks it for its
      // whole length - so the first look at a track can land after its own handover point.
      request.time
    );
    if (nextPlan.kind !== "fade" || request.time < nextPlan.outStart - AUTOMIX_ARM_LEAD_SEC) {
      return nextPlan;
    }
    const context = ports.getContext();
    const incoming = otherDeck(activeDeck);
    const incomingElement = ports.getElement(incoming);
    const incomingChain = ports.getChain(incoming);
    if (!context || !incomingElement || !incomingChain || !ports.getChain(activeDeck)) {
      return nextPlan;
    }
    rampGain(context, incomingChain.fade, 0);
    seekTo(incomingElement, nextPlan.inStart);
    clocks[incoming].reset();
    phase = "armed";
    diagMark(`armed -> ${request.nextKey}`);
    plan = nextPlan;
    plannedNextKey = request.nextKey;
    plannedFromKey = request.fromKey;
    plannedFrom = request.from.profile ?? null;
    plannedTo = request.to.profile ?? null;
    activeDeck = incoming;
    ports.onTailSrcChange(request.audioSrc);
    ports.onActiveDeckChange(incoming);
    const startIn = nextPlan.outStart - request.time;
    if (startIn > RELEASE_MARGIN_SEC) {
      setAutoplayHold(true);
      releaseTimer = setTimeout(
        () => {
          seekTo(incomingElement, nextPlan.inStart);
          setAutoplayHold(false);
        },
        (startIn - RELEASE_MARGIN_SEC) * 1e3
      );
    }
    ports.advanceTrack();
    return nextPlan;
  };
  const handleActiveDeckPlaying = (currentKey) => {
    setAutoplayHold(false);
    const context = ports.getContext();
    const activeChain = ports.getChain(activeDeck);
    activeChain?.analyser.reset();
    clocks[activeDeck].reset();
    if (phase !== "armed") {
      if (context && activeChain) rampGain(context, activeChain.fade, 1, 0.02);
      return;
    }
    const tailDeck = otherDeck(activeDeck);
    const tailElement = ports.getElement(tailDeck);
    const tailChain = ports.getChain(tailDeck);
    if (!context || !plan || !activeChain || !tailChain || !tailElement) {
      settle({ pauseTail: true });
      return;
    }
    const soundingLeft = Math.min(tailElement.duration, plan.outStart + plan.overlap);
    const now = context.currentTime;
    const tailClock = clocks[tailDeck];
    const position = tailClock.positionAt(now) ?? tailElement.currentTime;
    const tailRate = tailClock.rate() ?? 1;
    const startMedia = Math.min(
      Math.max(position, Math.min(plan.outStart, soundingLeft)),
      position + MAX_ALIGN_HOLD_SEC
    );
    const remaining = soundingLeft - startMedia;
    const overlap = resolveOverlap(plan, remaining);
    const refusal = currentKey !== plannedNextKey ? "the queue moved after planning" : overlap <= 0 ? "the outgoing track ran out first" : null;
    phase = "fading";
    diagMark("fading");
    if (overlap > 0 && overlap < plan.overlap - 0.05) {
      const lateBy = position - plan.outStart;
      console.log(
        `[Automix] blend clipped to ${overlap}s of the planned ${plan.overlap}s: ` + (lateBy > 0.05 ? `the handover point went by ${lateBy.toFixed(2)}s before this deck spoke (its ${AUTOMIX_ARM_LEAD_SEC}s of lead started later than that)` : `the outgoing track stops ${(plan.outStart + plan.overlap - tailElement.duration).toFixed(2)}s earlier than the plan was built for`)
      );
    }
    if (refusal) {
      console.log(
        `[Automix] dropping blend, ${refusal}` + (currentKey === plannedNextKey ? "" : ` (deck has "${currentKey}", planned "${plannedNextKey}")`)
      );
      rampGain(context, tailChain.fade, 0, CUT_SECONDS);
      rampGain(context, activeChain.fade, 1, CUT_SECONDS);
      cleanupTimer = setTimeout(
        () => settle({ pauseTail: true }),
        CUT_SECONDS * 1e3 + 70
      );
      return;
    }
    const tempo = tailChain.analyser.tempo();
    const outgoingDb = tailChain.analyser.loudnessDb();
    const outgoingBpm = settledBpm(plannedFrom?.bpm, plannedFrom?.outroBpm);
    const periodSec = outgoingBpm ? 60 / outgoingBpm : tempo?.periodSec ?? null;
    const fromStems = ports.getStems?.(plannedFromKey, "tail") ?? null;
    const toStems = ports.getStems?.(plannedNextKey, "head") ?? null;
    const useStems = Boolean(fromStems && toStems) && plan.style !== "beatCut" && overlap >= AUTOMIX_MIN_OVERLAP_SEC;
    const stretch = plan.style === "beatCut" || overlap < AUTOMIX_MIN_OVERLAP_SEC || useStems ? 1 : plan.stretch;
    const applied = applyTempoBend(tailElement, stretch);
    const alignHold = Math.max(0, (startMedia - position) / (tailRate * applied));
    const steady = plannedFrom?.bpm && (plannedFrom.outroBpm === null || Math.abs((plannedFrom.outroBpm ?? 0) - plannedFrom.bpm) < 0.5);
    const beatGrid = steady && plannedFrom?.bpm ? { offset: plannedFrom.beatOffset % (60 / plannedFrom.bpm), period: 60 / plannedFrom.bpm } : null;
    const nextBeatIn = waitToGrid(beatGrid, startMedia, tailRate * applied) ?? tailChain.analyser.nextBeatIn(now + alignHold);
    const fade = planBlendShape({
      overlap,
      outgoingDb,
      nextBeatIn,
      periodSec,
      minOverlap: plan.minOverlap,
      maxOverlap: remaining
    });
    const shape = shapeBlend({
      style: plan.style,
      room: overlap,
      overlap: fade.overlap,
      crossover: fade.crossover,
      nextBeatIn,
      periodSec,
      incomingLeadIn: plannedTo?.leadIn ?? null
    });
    const hold = alignHold + shape.hold;
    const startAt = now + hold;
    const wall = shape.overlap / applied;
    const outgoingAt = clocks[tailDeck].positionAt(startAt) ?? startMedia + shape.hold * tailRate * applied;
    const incomingAt = clocks[activeDeck].positionAt(startAt) ?? (ports.getElement(activeDeck)?.currentTime ?? plan.inStart) + hold;
    expansionNote = null;
    const stemmed = useStems && fromStems && toStems && scheduleStemGesture({
      context,
      tailChain,
      activeChain,
      fromStems,
      toStems,
      startMedia: outgoingAt,
      inAt: incomingAt,
      startAt,
      wall,
      outgoingBarSec: barSecOf(plannedFrom),
      incomingBarSec: barSecOf(plannedTo),
      outgoingBpm: plannedFrom?.bpm ?? null,
      outgoingDownbeat: plannedFrom?.downbeatOffset ?? null,
      outgoingBeatsPerBar: plannedFrom?.beatsPerBar ?? null,
      keysClash: plan.relation === "clashing",
      incomingSectionStart: plannedTo?.sectionStart ?? null,
      expansion: plan.expansion ?? null
    });
    const snapBpm = periodSec ? 60 / periodSec : null;
    const gridBpm = plannedFrom?.bpm ?? null;
    const splitGrid = gridBpm !== null && snapBpm !== null && Math.abs(gridBpm - snapBpm) / snapBpm > RAW_RATE_LIMIT;
    const rendering = stemmed ? ", four stems" : fromStems && toStems ? `${shape.shapeBands ? ", three bands" : ""}` : `, no stems (${!fromStems && !toStems ? "neither end" : fromStems ? "the incoming end" : "the outgoing end"} is not separated yet)${shape.shapeBands ? ", three bands" : ""}`;
    console.log(
      `[Automix] ${shape.style}${shape.style === plan.style ? "" : ` (planned ${plan.style})`}:${hold > 0.01 ? ` waits ${hold.toFixed(2)}s, then` : ""} ${wall < 0.1 ? `${Math.round(wall * 1e3)}ms` : `${wall.toFixed(2)}s`} at ${Math.round(shape.crossover * 100)}%${shape.together > 0 ? `, both held for ${Math.round(shape.together * 100)}%` : ""}` + rendering + `${plan.expansion == null ? "" : `, ${expansionNote ?? `no build (no stem gesture on a ${shape.style})`}`}${shape.sweepOut && !stemmed ? ", swept out" : ""}${plan.echoThrow ? ", thrown" : ""}${applied === 1 ? "" : `, outgoing at ${applied.toFixed(3)}x`}${fade.snappedToBeat && shape.style === plan.style ? ` on a beat (${periodSec ? Math.round(60 / periodSec) : "?"} BPM)` : ""}${outgoingDb === null ? "" : `, outgoing ${outgoingDb.toFixed(1)} LUFS`}${splitGrid ? `, laid out on ${Math.round(gridBpm)} BPM but started on ${Math.round(snapBpm)}` : ""}${tailClock.fit() === null ? ", position estimated" : ""}`
    );
    announceTransition({
      seconds: hold + wall,
      crossover: hold + wall > 0 ? (hold + wall * shape.crossover) / (hold + wall) : 0,
      periodSec: periodSec === null ? null : periodSec / applied,
      ...shape.style === "plainBlend" ? { plain: true } : {}
    });
    if (stemmed) {
      cleanupTimer = setTimeout(
        () => settle({ pauseTail: true }),
        (hold + wall) * 1e3 + FADE_CLEANUP_MARGIN_MS
      );
      return;
    }
    if (shape.shapeBands) {
      scheduleBandBlend(context, tailChain.tone, activeChain.tone, startAt, wall, {
        crossover: shape.crossover,
        swapBass: true,
        sweepOut: shape.sweepOut,
        tiltDb: plan.tiltDb
      });
    }
    if (plan.echoThrow) {
      scheduleEchoThrow(
        context,
        tailChain.throw,
        startAt + (shape.style === "beatCut" ? 0 : wall * shape.crossover),
        periodSec
      );
    }
    scheduleCrossfade(
      context,
      tailChain.fade,
      activeChain.fade,
      wall,
      shape.crossover,
      hold,
      shape.together
    );
    if (shape.overlap >= AUTOMIX_MIN_OVERLAP_SEC) {
      startBalanceCorrection(
        context,
        tailChain,
        activeChain,
        referenceDb(plannedTo, activeChain)
      );
    }
    cleanupTimer = setTimeout(
      () => settle({ pauseTail: true }),
      (hold + wall) * 1e3 + FADE_CLEANUP_MARGIN_MS
    );
  };
  const handleTailEnded = () => {
    if (phase === "idle") return;
    if (phase === "fading") return;
    settle({ pauseTail: false });
  };
  const handleSongChanged = (key) => {
    if (phase === "idle" || key === plannedNextKey) return;
    if (phase === "armed" && key === plannedFromKey) return;
    console.log(`[Automix] transition dropped: the queue moved to "${key}" mid-blend`);
    diagMark(`dropped -> ${key}`);
    settle({ pauseTail: true });
  };
  const abort = (keepTail = false) => {
    if (phase === "idle") return false;
    const wasArmed = phase === "armed";
    if (keepTail) {
      const outgoing = otherDeck(activeDeck);
      activeDeck = outgoing;
      ports.onActiveDeckChange(outgoing);
      settle({ pauseTail: true, harvest: false });
      return wasArmed;
    }
    settle({ pauseTail: true });
    return wasArmed;
  };
  return {
    getActiveDeck: () => activeDeck,
    getPhase: () => phase,
    sampleDecks,
    requestTransition,
    handleActiveDeckPlaying,
    handleTailEnded,
    handleSongChanged,
    abort,
    /**
     * Tear the session down to a defined state. More than the timers: a transition in flight holds
     * stem chains, a stem bus, an expansion stopper, an autoplay hold and two attenuated decks, and
     * none of those is a timer - so a dispose mid-blend used to leave buffers playing to their end
     * and the decks at the wrong gain. `settle` stops all of it. When idle there is nothing running
     * and settle would only fire spurious state updates (it drives onTailSrcChange), so the timers
     * are the whole of the work then.
     */
    dispose: () => {
      if (phase === "idle") clearTimers();
      else settle({ pauseTail: true });
    }
  };
};
