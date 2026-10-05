// ============================================================
// 16-crossfade-graph.js — Automix 智能过渡引擎（原生 JS 移植）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/services/services/automix/crossfadeGraph.ts
// 本文件由 TS 去类型移植，模块间以全局符号互相引用（本项目无构建体系）。
// ============================================================
const MID_BELL_Q = 0.8;
const TONE_RESET_SEC = 0.12;
const CURVE_TAIL_GUARD_SEC = 6e-3;
const DEFAULT_THROW_DELAY_SEC = 0.25;
const THROW_FEEDBACK = 0.45;
const THROW_SEND = 0.6;
const THROW_OPEN_SEC = 0.15;
const connectAutomixDeck = (context, element, output) => {
  const source = context.createMediaElementSource(element);
  const replayGain = context.createGain();
  const trim = context.createGain();
  const fade = context.createGain();
  const band = (type, frequency, q) => {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.gain.value = 0;
    if (q !== void 0) filter.Q.value = q;
    return filter;
  };
  const tone = {
    low: band("lowshelf", TONE_EDGE_HZ[0]),
    mid: band("peaking", TONE_MID_HZ, MID_BELL_Q),
    high: band("highshelf", TONE_EDGE_HZ[1])
  };
  source.connect(replayGain).connect(trim).connect(tone.low).connect(tone.mid).connect(tone.high).connect(fade).connect(output);
  const send = context.createGain();
  send.gain.value = 0;
  const delay = context.createDelay(2);
  delay.delayTime.value = DEFAULT_THROW_DELAY_SEC;
  const feedback = context.createGain();
  feedback.gain.value = THROW_FEEDBACK;
  tone.high.connect(send).connect(delay).connect(output);
  delay.connect(feedback).connect(delay);
  return {
    source,
    replayGain,
    trim,
    tone,
    fade,
    throw: { send, delay, feedback },
    analyser: createDeckAnalyser(context, replayGain, output),
    output
  };
};
const releaseParam = (param, now) => {
  if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
  else param.cancelScheduledValues(now);
};
const rampGain = (context, gain, value, seconds = 0) => {
  const now = context.currentTime;
  releaseParam(gain.gain, now);
  if (seconds <= 0) {
    gain.gain.setValueAtTime(value, now);
    return;
  }
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(value, now + seconds);
};
const rampGainDb = (context, gain, db, seconds) => rampGain(context, gain, dbToGain(db), seconds);
const resetTone = (context, tone, seconds = 0.05) => {
  const now = context.currentTime;
  const span = Math.max(0.01, seconds);
  [tone.low, tone.mid, tone.high].forEach((filter) => {
    releaseParam(filter.gain, now);
    filter.gain.setValueAtTime(filter.gain.value, now);
    filter.gain.linearRampToValueAtTime(0, now + span);
  });
};
const resetThrow = (context, send, seconds = 0.05) => rampGain(context, send.send, 0, seconds);
const scheduleBandBlend = (context, outgoing, incoming, startAt, seconds, request) => {
  const curves = buildBandCurves(request);
  const bands = (stack) => [stack.low, stack.mid, stack.high];
  const begins = Math.max(startAt, context.currentTime);
  const resetAt = begins + seconds + CURVE_TAIL_GUARD_SEC;
  try {
    [[bands(outgoing), curves.out], [bands(incoming), curves.in]].forEach(
      ([filters, shapes]) => filters.forEach((filter, band) => {
        filter.gain.cancelScheduledValues(begins);
        filter.gain.setValueCurveAtTime(shapes[band], begins, seconds);
        filter.gain.setValueAtTime(shapes[band][shapes[band].length - 1], resetAt);
        filter.gain.linearRampToValueAtTime(0, resetAt + TONE_RESET_SEC);
      })
    );
    return true;
  } catch (error) {
    console.warn("[Automix] band shaping rejected by the audio engine, blending flat", error);
    resetTone(context, outgoing, 0.05);
    resetTone(context, incoming, 0.05);
    return false;
  }
};
const scheduleEchoThrow = (context, node, at, periodSec) => {
  const repeat = periodSec && periodSec > 0 ? Math.min(1, Math.max(0.08, periodSec / 2)) : DEFAULT_THROW_DELAY_SEC;
  const opensAt = Math.max(context.currentTime, at - THROW_OPEN_SEC);
  try {
    node.delay.delayTime.cancelScheduledValues(opensAt);
    node.delay.delayTime.setValueAtTime(repeat, opensAt);
    node.send.gain.cancelScheduledValues(opensAt);
    node.send.gain.setValueAtTime(0, opensAt);
    node.send.gain.linearRampToValueAtTime(THROW_SEND, Math.max(opensAt + 1e-3, at));
    node.send.gain.setValueAtTime(THROW_SEND, Math.max(opensAt + 1e-3, at));
    node.send.gain.linearRampToValueAtTime(0, Math.max(opensAt + 1e-3, at) + 0.03);
  } catch (error) {
    console.warn("[Automix] the echo throw was refused, cutting dry instead", error);
    node.send.gain.value = 0;
  }
};
const SPLICE_SEC = 8e-3;
const LIMIT_KNEE = 0.95;
const LIMIT_RANGE = 4;
const softLimit = (x) => {
  const level = x < 0 ? -x : x;
  if (level <= LIMIT_KNEE) return x;
  const room = 1 - LIMIT_KNEE;
  const held = LIMIT_KNEE + room * Math.tanh((level - LIMIT_KNEE) / room);
  return x < 0 ? -held : held;
};
const connectStemBus = (context, output) => {
  const points = 8192;
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i += 1) {
    curve[i] = softLimit((i / (points - 1) * 2 - 1) * LIMIT_RANGE);
  }
  const shaper = context.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = "none";
  const input = context.createGain();
  input.gain.value = 1 / LIMIT_RANGE;
  input.connect(shaper).connect(output);
  return {
    input,
    stop: () => {
      input.disconnect();
      shaper.disconnect();
    }
  };
};
const connectStemDeck = (context, stems, output, fromMediaTime, startAt, sweepPad) => {
  const gains = {};
  const sources = {};
  const changeover = context.createGain();
  changeover.gain.value = 0;
  changeover.connect(output);
  const sweep = context.createBiquadFilter();
  sweep.type = "highpass";
  sweep.frequency.value = OTHER_SWEEP_HZ[0];
  sweep.Q.value = 0.7;
  sweep.connect(changeover);
  const offset = Math.max(0, fromMediaTime - stems.from);
  const begins = Math.max(context.currentTime, startAt);
  for (const name of STEM_NAMES) {
    const gain = context.createGain();
    const source = context.createBufferSource();
    source.buffer = stems.buffers[name];
    source.connect(gain);
    gain.connect(sweepPad && name === "other" ? sweep : changeover);
    source.start(begins, offset);
    gains[name] = gain;
    sources[name] = source;
  }
  return {
    sources,
    gains,
    sweep,
    output: changeover,
    stop: () => {
      for (const name of STEM_NAMES) {
        try {
          sources[name].stop();
        } catch {
        }
        sources[name].disconnect();
        gains[name].disconnect();
      }
      sweep.disconnect();
      changeover.disconnect();
    }
  };
};
const connectExpansion = (context, channels, sampleRate, output, startAt, level) => {
  if (channels.length === 0 || channels[0].length === 0) return null;
  try {
    const buffer = context.createBuffer(channels.length, channels[0].length, sampleRate);
    for (let channel = 0; channel < channels.length; channel += 1) {
      buffer.getChannelData(channel).set(channels[channel]);
    }
    const gain = context.createGain();
    gain.gain.value = level;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(output);
    source.start(Math.max(context.currentTime, startAt));
    return () => {
      try {
        source.stop();
      } catch {
      }
      source.disconnect();
      gain.disconnect();
    };
  } catch {
    return null;
  }
};
const scheduleStemWindow = (context, chain, curves, element, startAt, seconds, direction) => {
  const begins = Math.max(startAt, context.currentTime);
  const ends = begins + seconds;
  try {
    for (const name of STEM_NAMES) {
      const param = chain.gains[name].gain;
      param.cancelScheduledValues(begins);
      param.setValueCurveAtTime(curves[name], begins, seconds);
    }
    if (direction === "out") {
      chain.sweep.frequency.cancelScheduledValues(begins);
      chain.sweep.frequency.setValueAtTime(OTHER_SWEEP_HZ[0], begins);
      chain.sweep.frequency.exponentialRampToValueAtTime(
        OTHER_SWEEP_HZ[1],
        begins + seconds * OTHER_SWEEP_END
      );
    }
    const changeover = chain.output.gain;
    changeover.cancelScheduledValues(begins);
    element.gain.cancelScheduledValues(begins);
    if (direction === "out") {
      changeover.setValueAtTime(0, begins);
      changeover.linearRampToValueAtTime(1, begins + SPLICE_SEC);
      element.gain.setValueAtTime(element.gain.value, begins);
      element.gain.linearRampToValueAtTime(0, begins + SPLICE_SEC);
    } else {
      changeover.setValueAtTime(0, context.currentTime);
      changeover.setValueAtTime(1, begins);
      changeover.setValueAtTime(1, ends - SPLICE_SEC);
      changeover.linearRampToValueAtTime(0, ends);
      element.gain.setValueAtTime(0, context.currentTime);
      element.gain.setValueAtTime(0, ends - SPLICE_SEC);
      element.gain.linearRampToValueAtTime(1, ends);
    }
    return true;
  } catch (error) {
    console.warn("[Automix] the stem gesture was refused, using the plain crossfade", error);
    chain.stop();
    rampGain(context, element, direction === "out" ? 0 : 1, 0.05);
    return false;
  }
};
const scheduleCrossfade = (context, outgoing, incoming, seconds, crossover = 0.5, hold = 0, together = 0) => {
  const curves = buildCrossfadeCurves(crossover, together);
  const now = context.currentTime;
  const startAt = now + Math.max(0, hold);
  try {
    outgoing.gain.cancelScheduledValues(now);
    incoming.gain.cancelScheduledValues(now);
    if (hold > 0) {
      outgoing.gain.setValueAtTime(1, now);
      incoming.gain.setValueAtTime(0, now);
    }
    outgoing.gain.setValueCurveAtTime(curves.out, startAt, seconds);
    incoming.gain.setValueCurveAtTime(curves.in, startAt, seconds);
    return true;
  } catch (error) {
    console.warn("[Automix] Crossfade rejected by the audio engine, cutting instead", error);
    rampGain(context, outgoing, 0, 0.05);
    rampGain(context, incoming, 1, 0.05);
    return false;
  }
};
