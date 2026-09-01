const elements = {
  status: document.getElementById("audio-status"),
  presets: document.getElementById("preset-list"),
  volume: document.getElementById("volume"),
  volumeValue: document.getElementById("volume-value"),
  soundToggle: document.getElementById("sound-toggle"),
};

const state = {
  preset: "crisp",
  enabled: true,
  volume: .72,
  keyIndex: 0,
};

let audioContext = null;
let masterGain = null;
let compressor = null;
let noiseBuffer = null;
let audioWarmUntil = 0;
let primedContext = null;
let needsRecreate = false;
let recoveryTimer = null;

const PRESET_LABELS = {
  crisp: "Crisp Ion",
  pure: "Pure Keyboard",
  pop: "Puzzle Pop",
};

const CUE_LABELS = {
  key: "通常キー",
  backspace: "削除キー",
  charge: "電荷キー",
  clear: "クリア",
  sequence: "連続入力",
  partial: "片方正解",
  correct: "初回で正解",
  retry: "再挑戦で正解",
  streak: "5問連続正解",
  wrong: "もう一度",
  finish: "10問完了",
};

function setStatus(message) {
  elements.status.textContent = message;
}

function createAudioContext() {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    audioContext = new AudioContextClass({ latencyHint: "interactive" });
  } catch {
    try {
      audioContext = new AudioContextClass();
    } catch {
      audioContext = null;
    }
  }
  if (!audioContext) return null;

  masterGain = audioContext.createGain();
  compressor = audioContext.createDynamicsCompressor();
  masterGain.gain.value = state.enabled ? state.volume : .0001;
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 8;
  compressor.attack.value = .003;
  compressor.release.value = .09;
  masterGain.connect(compressor).connect(audioContext.destination);
  audioWarmUntil = audioContext.currentTime + .07;
  primedContext = null;
  noiseBuffer = null;
  const context = audioContext;
  context.addEventListener?.("statechange", () => {
    if (context !== audioContext) return;
    if (context.state === "closed") needsRecreate = true;
  });
  return context;
}

function discardAudioContext() {
  const staleContext = audioContext;
  audioContext = null;
  masterGain = null;
  compressor = null;
  noiseBuffer = null;
  primedContext = null;
  audioWarmUntil = 0;
  clearTimeout(recoveryTimer);
  recoveryTimer = null;
  if (!staleContext || staleContext.state === "closed") return;
  try {
    staleContext.close().catch(() => {});
  } catch {
    // A later trusted tap can still construct a new context.
  }
}

function currentAudioContext() {
  if (needsRecreate || audioContext?.state === "closed" || audioContext?.state === "interrupted") {
    discardAudioContext();
    needsRecreate = false;
  }
  return audioContext ?? createAudioContext();
}

function primeAudioOutput(context) {
  if (!context || primedContext === context) return;
  primedContext = context;
  audioWarmUntil = Math.max(audioWarmUntil, context.currentTime + .07);
  try {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .14), context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    source.start();
  } catch {
    // The actual cue remains optional if priming is unavailable.
  }
}

function resumeAudio(context) {
  if (!context || context.state === "running") return;
  let settled = false;
  try {
    Promise.resolve(context.resume())
      .then(() => { settled = true; })
      .catch(() => { settled = true; needsRecreate = true; });
  } catch {
    settled = true;
    needsRecreate = true;
  }
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    if (!settled && context === audioContext && context.state !== "running") needsRecreate = true;
  }, 1000);
}

function audioStartAt(context, delay = 0) {
  return Math.max(context.currentTime + .004, audioWarmUntil) + delay;
}

function scheduleAudio(task) {
  if (!state.enabled) {
    setStatus("SEはオフです。右上のSE ONで再開できます。");
    return;
  }
  const context = currentAudioContext();
  if (!context || !masterGain) {
    setStatus("このブラウザでは音声出力を利用できません。");
    return;
  }
  primeAudioOutput(context);
  const delay = context.state === "running" ? 0 : .07;
  try {
    task(context, audioStartAt(context, delay));
  } catch {
    // One cue must never make the audition controls unusable.
  }
  if (context.state !== "running") resumeAudio(context);
}

function getNoiseBuffer(context) {
  if (noiseBuffer?.sampleRate === context.sampleRate) return noiseBuffer;
  const frameCount = Math.ceil(context.sampleRate * .08);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x1f123bb5;
  for (let index = 0; index < samples.length; index += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    samples[index] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function playNoiseClick(context, startAt, { frequency, duration, volume, q = 5, type = "bandpass" }) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = getNoiseBuffer(context);
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, startAt);
  filter.Q.value = q;
  gain.gain.setValueAtTime(.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + .002);
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  source.connect(filter).connect(gain).connect(masterGain);
  source.start(startAt);
  source.stop(startAt + duration + .01);
}

function playTone(context, startAt, { frequency, endFrequency = frequency, duration, volume, type = "triangle" }) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startAt + duration);
  gain.gain.setValueAtTime(.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + Math.min(.004, duration * .18));
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + .01);
}

function playKey(context, startAt, preset) {
  const index = state.keyIndex;
  state.keyIndex += 1;
  if (preset === "pure") {
    playNoiseClick(context, startAt, { frequency: 1700 + (index % 2) * 80, duration: .018, volume: .027, q: 7 });
    playTone(context, startAt, { frequency: 1060, duration: .018, volume: .012, type: "sine" });
    return;
  }
  if (preset === "pop") {
    playNoiseClick(context, startAt, { frequency: 2050 + (index % 3) * 180, duration: .024, volume: .037, q: 6 });
    playTone(context, startAt, { frequency: [1240, 1390, 1560][index % 3], duration: .032, volume: .019, type: "triangle" });
    return;
  }
  playNoiseClick(context, startAt, { frequency: 1850 + (index % 3) * 70, duration: .022, volume: .032, q: 6 });
  playTone(context, startAt, { frequency: 1320, endFrequency: 1240, duration: .024, volume: .014, type: "triangle" });
}

function playCue(cue) {
  if (!state.enabled) {
    setStatus("SEはオフです。右上のSE ONで再開できます。");
    return;
  }
  scheduleAudio((context, startAt) => {
    const preset = state.preset;
    if (cue === "key") {
      playKey(context, startAt, preset);
      return;
    }
    if (cue === "backspace") {
      playNoiseClick(context, startAt, { frequency: preset === "pop" ? 950 : 780, duration: .032, volume: .032, q: 4 });
      playTone(context, startAt, { frequency: 760, endFrequency: 610, duration: .032, volume: .012, type: "triangle" });
      return;
    }
    if (cue === "charge") {
      playNoiseClick(context, startAt, { frequency: preset === "pure" ? 1880 : 2350, duration: .03, volume: .032, q: 8 });
      playTone(context, startAt + .007, { frequency: preset === "pop" ? 2093 : 1865, endFrequency: 2217, duration: .055, volume: .026, type: "sine" });
      return;
    }
    if (cue === "clear") {
      playNoiseClick(context, startAt, { frequency: 560, duration: .045, volume: .025, q: 2, type: "lowpass" });
      playTone(context, startAt, { frequency: 610, endFrequency: 380, duration: .055, volume: .018, type: "triangle" });
      return;
    }
    if (cue === "sequence") {
      for (let index = 0; index < 7; index += 1) playKey(context, startAt + index * .055, preset);
      return;
    }
    if (cue === "partial") {
      playTone(context, startAt, { frequency: 1046.5, duration: .075, volume: preset === "pop" ? .065 : .048 });
      return;
    }
    if (cue === "correct" || cue === "retry" || cue === "streak") {
      const retry = cue === "retry";
      const lively = preset === "pop";
      const volume = retry ? .039 : (lively ? .068 : .055);
      playTone(context, startAt, { frequency: 1046.5, duration: .075, volume });
      playTone(context, startAt + .036, { frequency: 1318.5, duration: .095, volume: volume * .92 });
      if (cue === "streak") playTone(context, startAt + .074, { frequency: lively ? 1760 : 1568, duration: .11, volume: volume * .72, type: "sine" });
      return;
    }
    if (cue === "wrong") {
      playNoiseClick(context, startAt, { frequency: 300, duration: .05, volume: .023, q: 1.4, type: "lowpass" });
      playTone(context, startAt, { frequency: 196, endFrequency: preset === "pop" ? 156 : 170, duration: .085, volume: .028, type: "triangle" });
      return;
    }
    if (cue === "finish") {
      const volume = preset === "pop" ? .065 : .048;
      playTone(context, startAt, { frequency: 523.25, duration: .11, volume });
      playTone(context, startAt + .07, { frequency: 659.25, duration: .12, volume });
      playTone(context, startAt + .14, { frequency: 783.99, duration: .16, volume: volume * 1.05, type: "sine" });
    }
  });
  setStatus(`${PRESET_LABELS[state.preset]}：${CUE_LABELS[cue]}を試聴中`);
}

function setPreset(preset) {
  state.preset = preset;
  for (const button of elements.presets.querySelectorAll("[data-preset]")) {
    const selected = button.dataset.preset === preset;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  setStatus(`${PRESET_LABELS[preset]}を選択しました。入力音か正解音を試してください。`);
}

function updateVolume() {
  state.volume = Number(elements.volume.value) / 100;
  const label = `${Math.round(state.volume * 100)}%`;
  elements.volumeValue.value = label;
  elements.volumeValue.textContent = label;
  elements.volume.setAttribute("aria-valuetext", `${Math.round(state.volume * 100)}パーセント`);
  if (audioContext && masterGain) masterGain.gain.setTargetAtTime(state.enabled ? state.volume : .0001, audioContext.currentTime, .012);
}

function toggleSound() {
  state.enabled = !state.enabled;
  elements.soundToggle.textContent = state.enabled ? "SE ON" : "SE OFF";
  elements.soundToggle.setAttribute("aria-pressed", String(state.enabled));
  if (audioContext && masterGain) masterGain.gain.setTargetAtTime(state.enabled ? state.volume : .0001, audioContext.currentTime, .012);
  setStatus(state.enabled ? "SEをオンにしました。好きな音を試してください。" : "SEをオフにしました。");
}

function flashButton(button) {
  button.classList.remove("is-playing");
  requestAnimationFrame(() => button.classList.add("is-playing"));
  setTimeout(() => button.classList.remove("is-playing"), 130);
}

elements.presets.addEventListener("click", (event) => {
  const button = event.target.closest("[data-preset]");
  if (button) setPreset(button.dataset.preset);
});
elements.volume.addEventListener("input", updateVolume);
elements.soundToggle.addEventListener("click", toggleSound);
document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-cue]")) {
    const context = currentAudioContext();
    if (context) {
      primeAudioOutput(context);
      resumeAudio(context);
    }
  }
}, { passive: true });
document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.closest?.("[data-cue]")) {
    const context = currentAudioContext();
    if (context) {
      primeAudioOutput(context);
      resumeAudio(context);
    }
  }
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cue]");
  if (!button) return;
  flashButton(button);
  playCue(button.dataset.cue);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && audioContext) needsRecreate = true;
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && audioContext) needsRecreate = true;
});

updateVolume();
