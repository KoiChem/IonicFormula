import {
  VARIANT_LABELS,
  answerFor,
  buildEndlessRound,
  buildWeakQuestionSet,
  buildTenQuestionSet,
  companionAnswerFor,
  compoundAnswerPresetForOptions,
  compoundOptionsForAnswerPreset,
  createFormulaEntry,
  evaluateAnswer,
  evaluateIonEntry,
  escapeHtml,
  explanationForCompound,
  formulaHtml,
  formulaText,
  hintFor,
  ionFormulaHtml,
  normalizeFormula,
  normalizeCompoundSelectionState,
  recordHistory,
  recordCompoundSelectionPresentation,
  formulaEntryValue,
  questionSkills,
  removeWeakHistoryItems,
  recordRecentPresentation,
  validateData,
  weakHistoryItems,
} from "./core.js";

const IS_CURRENT = document.body.dataset.build === "current";
const SOUND_LEVELS = ["off", "medium", "high"];
const SOUND_GAINS = { off: .0001, medium: .72, high: 1 };
const SOUND_LABELS = { off: "なし", medium: "中", high: "大" };

const STORAGE = {
  history: "ionicFormula.history.v2",
  recentPresentations: "ionicFormula.recentPresentations.v1",
  compoundSelection: "ionicFormula.compoundSelection.v1",
  preferences: "ionicFormula.preferences.v1",
  sessionSummaries: "ionicFormula.sessionSummaries.v1",
  legacyPreferences: "ionicFormula.beta0901.preferences.v1",
  legacySessionSummaries: "ionicFormula.beta0901.sessionSummaries.v1",
  adminData: "ionicFormula.adminData.v2",
};

const elements = Object.fromEntries([
  "app-header", "brand", "quiz-actions", "active-game-description", "setup-screen", "quiz-screen", "result-screen",
  "setup-form", "variant-label", "question-number", "question-total", "question-card",
  "question-prompt", "streak", "answer-form", "answer-label", "answer-input", "answer-composer", "formula-render", "both-answer-tabs",
  "input-message", "submit-answer", "submit-answer-text", "formula-keyboard", "number-keys",
  "letter-keys", "charge-keys", "name-shortcuts", "feedback", "feedback-title", "feedback-answer",
  "feedback-detail", "feedback-actions", "next-button", "hint-button", "pass-button", "quit-button",
  "result-first", "result-retry", "result-hint", "result-pass", "result-review", "result-review-list",
  "retry-session", "back-to-setup", "sound-toggle", "spark-layer",
  "start-button", "compound-options", "compound-option-message",
  "weak-review-button", "weak-review-count", "weak-review-dialog", "close-weak-review", "weak-review-list",
  "weak-review-empty", "start-weak-from-review", "clear-weak-review",
  "compound-answer-presets", "question-progress", "question-progress-bar", "question-progress-label",
  "feedback-companion-row", "feedback-companion", "feedback-companion-value", "feedback-companion-toggle",
  "result-first-rate", "result-comparison", "result-count-note", "result-review-companion-toggle",
].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

let data;
let ionById;
let compoundById;
let session = null;
let questionState = null;
let isComposing = false;
let compositionEndedAt = 0;
let keyboardUppercase = true;
let advanceTimer = null;
let audioContext = null;
let audioMasterGain = null;
let audioCompressor = null;
let audioPrimed = false;
let audioNoiseBuffer = null;
let touchStartX = null;
let promptFitFrame = null;

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app remains usable when private browsing or storage policy blocks localStorage.
  }
}

function recentPresentations() {
  return readLocal(STORAGE.recentPresentations, []);
}

function compoundSelectionState() {
  return normalizeCompoundSelectionState(readLocal(STORAGE.compoundSelection, {}));
}

function rememberPresentation(question) {
  writeLocal(STORAGE.recentPresentations, recordRecentPresentation(recentPresentations(), question));
  if (question.domain === "compound") {
    writeLocal(STORAGE.compoundSelection, recordCompoundSelectionPresentation(compoundSelectionState(), question));
  }
}

const preferences = {
  sound: true,
  showCompanionAnswer: true,
  compoundOptions: { promptFormula: true, promptName: true, answerFormula: true, answerName: true, answerBoth: false },
  ...readLocal(STORAGE.legacyPreferences, {}),
  ...readLocal(STORAGE.preferences, {}),
  // FX is part of the learning feedback, not a user-configurable setting.
  vfx: true,
};
preferences.soundLevel = SOUND_LEVELS.includes(preferences.soundLevel)
  ? preferences.soundLevel
  : preferences.sound === false ? "off" : "medium";
preferences.sound = preferences.soundLevel !== "off";
preferences.compoundOptions = { promptFormula: true, promptName: true, answerFormula: true, answerName: true, answerBoth: false, ...(preferences.compoundOptions ?? {}) };
preferences.showCompanionAnswer = preferences.showCompanionAnswer !== false;

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}を読み込めませんでした。`);
  return response.json();
}

function normalizeBundle(bundle) {
  return {
    ...bundle,
    difficulty: {
      ...bundle.difficulty,
      variantWeights: {
        ...bundle.difficulty.variantWeights,
        random: {
          ...bundle.difficulty.variantWeights.random,
          mixedIonsToFormula: bundle.difficulty.variantWeights.random?.mixedIonsToFormula ?? 1,
          mixedIonsToName: bundle.difficulty.variantWeights.random?.mixedIonsToName ?? 1,
        },
      },
    },
    compounds: bundle.compounds.map((compound) => {
      const modes = compound.questionModes ?? {};
      return {
        ...compound,
        questionModes: {
          ...modes,
          ionNamesToFormula: modes.ionNamesToFormula ?? modes.ionsToFormula ?? false,
          ionNamesToName: modes.ionNamesToName ?? modes.ionsToName ?? false,
        },
      };
    }),
  };
}

async function loadData() {
  const [ions, compounds, difficulty] = await Promise.all([
    fetchJson("data/ions.json"),
    fetchJson("data/compounds.json"),
    fetchJson("data/difficulty.json"),
  ]);
  const published = normalizeBundle({ ions, compounds, difficulty });
  const localOverride = readLocal(STORAGE.adminData, null);
  const candidate = localOverride?.ions && localOverride?.compounds && localOverride?.difficulty
    ? normalizeBundle(localOverride)
    : published;
  const validation = validateData(candidate.ions, candidate.compounds, candidate.difficulty);
  if (!validation.valid) {
    if (localOverride) return published;
    throw new Error(`教材データに${validation.errors.length}件のエラーがあります。`);
  }
  return candidate;
}

function soundGain() {
  return SOUND_GAINS[preferences.soundLevel] ?? SOUND_GAINS.medium;
}

function renderSoundToggle() {
  const level = preferences.soundLevel;
  const nextLevel = SOUND_LEVELS[(SOUND_LEVELS.indexOf(level) + 1) % SOUND_LEVELS.length];
  elements.sound_toggle.dataset.soundLevel = level;
  elements.sound_toggle.setAttribute("aria-label", `効果音：${SOUND_LABELS[level]}。押すと${SOUND_LABELS[nextLevel]}`);
}

function applySoundLevel() {
  if (!audioContext || !audioMasterGain) return;
  const now = audioContext.currentTime;
  audioMasterGain.gain.cancelScheduledValues(now);
  audioMasterGain.gain.setTargetAtTime(soundGain(), now, .012);
}

function setSoundLevel(level) {
  preferences.soundLevel = SOUND_LEVELS.includes(level) ? level : "medium";
  preferences.sound = preferences.soundLevel !== "off";
  renderSoundToggle();
  applySoundLevel();
  if (preferences.sound) primeAudio();
  savePreferences();
}

function savePreferences() {
  writeLocal(STORAGE.preferences, preferences);
}

function refreshBetaCompoundPresets() {
  if (!IS_CURRENT || !elements.compound_answer_presets) return;
  const preset = compoundAnswerPresetForOptions(preferences.compoundOptions);
  for (const button of elements.compound_answer_presets.querySelectorAll("[data-compound-preset]")) {
    const active = button.dataset.compoundPreset === preset;
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function setBetaCompoundPreset(preset) {
  preferences.compoundOptions = compoundOptionsForAnswerPreset(preset, preferences.compoundOptions);
  savePreferences();
  refreshCompoundOptions();
}

function betaCompanion(question = questionState?.question, item = questionState?.item) {
  if (!IS_CURRENT || !questionState?.resolved) return null;
  return companionAnswerFor(question, item);
}

function companionValueHtml(companion) {
  return companion.type === "formula" ? formulaHtml(companion.canonical) : escapeHtml(companion.canonical);
}

function syncCompanionToggle(button, available) {
  if (!button) return;
  button.hidden = !available;
  if (!available) return;
  button.textContent = `関連解答も表示　${preferences.showCompanionAnswer ? "ON" : "OFF"}`;
  button.setAttribute("aria-pressed", String(preferences.showCompanionAnswer));
}

function renderBetaFeedbackCompanion() {
  if (!IS_CURRENT || !elements.feedback_companion_row) return;
  const companion = betaCompanion();
  const available = Boolean(companion);
  elements.feedback_companion_row.hidden = !available;
  if (!available) {
    elements.feedback_companion_value.innerHTML = "";
    return;
  }
  const revealed = questionState.companionRevealed === true;
  elements.feedback_companion_toggle.textContent = companion.label;
  elements.feedback_companion_toggle.disabled = revealed;
  elements.feedback_companion_toggle.setAttribute("aria-expanded", String(revealed));
  elements.feedback_companion.hidden = !revealed;
  elements.feedback_companion_value.innerHTML = companionValueHtml(companion);
}

function resetBetaFeedbackCompanion() {
  if (!IS_CURRENT || !elements.feedback_companion_row) return;
  elements.feedback_companion_row.hidden = true;
  elements.feedback_companion.hidden = true;
  elements.feedback_companion_toggle.disabled = false;
  elements.feedback_companion_toggle.setAttribute("aria-expanded", "false");
  elements.feedback_companion_toggle.textContent = "";
  elements.feedback_companion_value.innerHTML = "";
}

function renderBetaQuestionProgress() {
  if (!IS_CURRENT || !elements.question_progress) return;
  const visible = Boolean(session && !session.endless);
  elements.question_progress.hidden = !visible;
  if (!visible) return;
  const total = session.questions.length;
  const current = session.index + 1;
  const percent = total ? Math.round(current / total * 100) : 0;
  elements.question_progress.setAttribute("aria-valuemax", String(total));
  elements.question_progress.setAttribute("aria-valuenow", String(current));
  elements.question_progress.setAttribute("aria-valuetext", `${current} / ${total}`);
  elements.question_progress_bar.style.width = `${percent}%`;
  elements.question_progress_label.textContent = `${current} / ${total}`;
}

function betaGameDescription() {
  if (!IS_CURRENT || !session) return null;
  const difficulty = session.difficulty === "hard" ? "ややむず" : "やさしめ";
  if (session.practiceType !== "compound") return { difficulty, route: "" };
  const options = session.compoundOptions;
  const prompt = options.promptFormula && options.promptName
    ? "イオン式・イオン名"
    : options.promptFormula ? "イオン式" : "イオン名";
  const answer = options.answerBoth
    ? "組成式・化合物名"
    : options.answerFormula && options.answerName
      ? "組成式 or 化合物名"
      : options.answerFormula ? "組成式" : "化合物名";
  return { difficulty, route: `${prompt} → ${answer}` };
}

function renderBetaGameDescription(quiz) {
  if (!elements.active_game_description) return;
  const description = quiz ? betaGameDescription() : "";
  elements.active_game_description.replaceChildren();
  elements.active_game_description.hidden = !description;
  if (!description) return;
  const difficulty = document.createElement("span");
  difficulty.className = "active-game-difficulty";
  difficulty.textContent = description.difficulty;
  elements.active_game_description.append(difficulty);
  if (description.route) {
    const route = document.createElement("span");
    route.className = "active-game-route";
    route.textContent = description.route;
    elements.active_game_description.append(route);
  }
}

function showScreen(name) {
  for (const screen of [elements.setup_screen, elements.quiz_screen, elements.result_screen]) {
    screen.hidden = screen.id !== `${name}-screen`;
  }
  const quiz = name === "quiz";
  elements.brand.hidden = quiz;
  elements.quiz_actions.hidden = !quiz;
  renderBetaGameDescription(quiz);
  elements.app_header.classList.toggle("quiz-header", quiz);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function makeKey(label, value, className = "", action = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (value) button.dataset.key = value;
  if (action) button.dataset.keyAction = action;
  if (className) button.className = className;
  return button;
}

function makeShiftKey() {
  const button = makeKey("", "", "case-key", "case");
  button.setAttribute("aria-label", "小文字に切り替える");
  button.setAttribute("aria-pressed", "true");
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.7 11.2L12 3.8l7.3 7.4h-4v8.6H8.7v-8.6z"/></svg>';
  return button;
}

function initializeKeyboard() {
  for (const value of ["1", "2", "3", "4", "5", "6", "7", "8", "(", ")"]) {
    elements.number_keys.append(makeKey(value, value));
  }
  for (const row of ["QWERTYUIOP", "ASDFGHJKL"]) {
    const container = document.createElement("div");
    container.className = "key-row";
    for (const letter of row) container.append(makeKey(letter, letter));
    elements.letter_keys.append(container);
  }
  const lastRow = document.createElement("div");
  lastRow.className = "key-row";
  lastRow.append(makeShiftKey());
  for (const letter of "ZXCVBNM") lastRow.append(makeKey(letter, letter));
  lastRow.append(makeKey("⌫", "", "", "backspace"));
  elements.letter_keys.append(lastRow);
  for (const [label, value] of [["＋", "+"], ["2＋", "2+"], ["3＋", "3+"], ["－", "-"], ["2－", "2-"], ["3－", "3-"]]) {
    elements.charge_keys.append(makeKey(label, value, "charge-key"));
  }
  elements.formula_keyboard.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) event.preventDefault();
  });
  elements.formula_keyboard.addEventListener("click", keyboardClick);
}

function setKeyboardCase(uppercase) {
  keyboardUppercase = uppercase;
  const caseButton = elements.formula_keyboard.querySelector('[data-key-action="case"]');
  caseButton?.setAttribute("aria-pressed", String(uppercase));
  caseButton?.setAttribute("aria-label", uppercase ? "小文字に切り替える" : "大文字に切り替える");
  for (const button of elements.letter_keys.querySelectorAll("[data-key]")) {
    const letter = button.dataset.key.toUpperCase();
    button.dataset.key = uppercase ? letter : letter.toLowerCase();
    button.textContent = button.dataset.key;
  }
}

function replaceSelection(text) {
  if (isFormulaEntryMode()) {
    const field = activeFieldState();
    const entry = field.entry;
    entry.tokens.splice(entry.cursor, 0, ...text.split(""));
    entry.cursor += text.length;
    syncFormulaEntry();
    return;
  }
  const input = elements.answer_input;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus({ preventScroll: true });
}

function moveCaret(direction) {
  if (isFormulaEntryMode()) {
    const entry = activeFieldState().entry;
    entry.cursor = Math.max(0, Math.min(entry.tokens.length, entry.cursor + direction));
    syncFormulaEntry();
    return;
  }
  const input = elements.answer_input;
  const current = input.selectionStart ?? input.value.length;
  const next = Math.max(0, Math.min(input.value.length, current + direction));
  input.setSelectionRange(next, next);
  input.focus({ preventScroll: true });
}

function activeFieldState() {
  if (!questionState) return null;
  return questionState.answer.type === "both"
    ? questionState.fields[questionState.activeField]
    : questionState.fields.single;
}

function activeAnswer() {
  return activeFieldState()?.specification ?? null;
}

function isFormulaEntryMode() {
  return activeAnswer()?.type === "formula";
}

function formulaEntryHtml(entry, includeCaret = true) {
  if (!entry) return "";
  const pieces = [];
  for (let index = 0; index <= entry.tokens.length; index += 1) {
    if (includeCaret && index === entry.cursor) pieces.push('<i class="formula-caret"></i>');
    if (index < entry.tokens.length) {
      const token = entry.tokens[index];
      pieces.push(/[0-9]/.test(token) ? `<sub>${escapeHtml(token)}</sub>` : escapeHtml(token));
    }
  }
  if (entry.charge) {
    const magnitude = entry.charge.magnitude === 1 ? "" : entry.charge.magnitude;
    pieces.push(`<sup class="formula-charge">${magnitude}${entry.charge.sign === "+" ? "＋" : "－"}</sup>`);
  }
  return pieces.join("");
}

function syncFormulaEntry() {
  const field = activeFieldState();
  if (!field?.entry) return;
  elements.answer_input.value = formulaEntryValue(field.entry);
  elements.formula_render.innerHTML = formulaEntryHtml(field.entry);
  renderAnswerSubmit();
  elements.answer_input.setAttribute("aria-invalid", "false");
  elements.input_message.textContent = "";
}

function formulaBackspace() {
  const entry = activeFieldState()?.entry;
  if (!entry) return;
  if (entry.cursor === entry.tokens.length && entry.charge) entry.charge = null;
  else if (entry.cursor > 0) {
    entry.tokens.splice(entry.cursor - 1, 1);
    entry.cursor -= 1;
  }
  syncFormulaEntry();
}

function keyboardClick(event) {
  const button = event.target.closest("button");
  if (!button || elements.answer_input.disabled) return;
  const action = button.dataset.keyAction;
  if (action === "backspace") playInputSound("backspace");
  else if (action === "clear") playInputSound("clear");
  else if (action === "case" || action === "left" || action === "right") playInputSound("control");
  else if (button.classList.contains("charge-key")) playInputSound("charge");
  else if (button.dataset.key) playInputSound("key");
  if (action === "case") setKeyboardCase(!keyboardUppercase);
  else if (action === "left") moveCaret(-1);
  else if (action === "right") moveCaret(1);
  else if (action === "backspace") {
    if (isFormulaEntryMode()) {
      formulaBackspace();
      elements.answer_input.focus({ preventScroll: true });
      return;
    }
    const input = elements.answer_input;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (start !== end) input.setRangeText("", start, end, "end");
    else if (start > 0) input.setRangeText("", start - 1, start, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (action === "clear") {
    if (isFormulaEntryMode()) {
      activeFieldState().entry = createFormulaEntry();
      syncFormulaEntry();
    } else {
      elements.answer_input.value = "";
      elements.answer_input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } else if (button.classList.contains("charge-key")) {
    const match = button.dataset.key.match(/^([1-3]?)([+-])$/);
    if (isFormulaEntryMode() && match) {
      activeFieldState().entry.charge = { magnitude: Number(match[1] || 1), sign: match[2], source: "chargeButton" };
      syncFormulaEntry();
    }
  } else if (button.dataset.key) {
    replaceSelection(button.dataset.key);
  }
  elements.answer_input.focus({ preventScroll: true });
}

function previewFormulaHtml() {
  const entry = activeFieldState()?.entry;
  if (entry) return formulaEntryHtml(entry, false);
  const normalized = normalizeFormula(elements.answer_input.value);
  return normalized ? formulaHtml(normalized) : "";
}

function renderAnswerSubmit() {
  const formulaMode = activeAnswer()?.type === "formula";
  const preview = formulaMode ? previewFormulaHtml() : "";
  elements.submit_answer_text.innerHTML = preview || "✓";
  elements.submit_answer.classList.toggle("has-formula", Boolean(preview));
}

function itemFor(question) {
  return question.domain === "ion" ? ionById.get(question.itemId) : compoundById.get(question.itemId);
}

function promptFor(question, item) {
  const formulaClass = (html) => `<span class="formula">${html}</span>`;
  if (question.domain === "ion") {
    return question.variant === "ionNameToFormula"
      ? { html: escapeHtml(item.name), formula: false }
      : { html: formulaClass(ionFormulaHtml(item)), formula: true };
  }
  const cation = ionById.get(item.cation);
  const anion = ionById.get(item.anion);
  const cationFirst = question.promptOrder !== "anionFirst";
  const sides = cationFirst ? [cation, anion] : [anion, cation];
  const styles = question.promptStyle === "nameName" ? ["name", "name"]
    : question.promptStyle === "formulaName" ? ["formula", "name"]
      : question.promptStyle === "nameFormula" ? ["name", "formula"]
        : ["formula", "formula"];
  const renderSide = (ion, style) => {
    if (ion.compoundPromptDisplay === "formulaAndName") {
      return `<span class="ion-formula-name"><span class="formula-token">${ionFormulaHtml(ion)}</span><span class="ion-name">${escapeHtml(ion.name)}</span></span>`;
    }
    return style === "name"
      ? `<span class="ion-name">${escapeHtml(ion.name)}</span>`
      : `<span class="formula-token">${ionFormulaHtml(ion)}</span>`;
  };
  const hasName = styles.includes("name") || sides.some((ion) => ion.compoundPromptDisplay === "formulaAndName");
  const ionsHtml = hasName
    ? `<span class="ion-pair names"><span class="ion-pair-first">${renderSide(sides[0], styles[0])}<span class="ion-separator" aria-hidden="true">＆</span></span><span class="ion-pair-second">${renderSide(sides[1], styles[1])}</span></span>`
    : `<span class="ion-pair"><span>${renderSide(sides[0], styles[0])}</span><span class="ion-separator" aria-hidden="true">＆</span><span>${renderSide(sides[1], styles[1])}</span></span>`;
  return { html: ionsHtml, formula: !hasName };
}

function scheduleNamePromptFit() {
  cancelAnimationFrame(promptFitFrame);
  promptFitFrame = requestAnimationFrame(() => {
    const pair = elements.question_prompt.querySelector(".ion-pair.names");
    if (!pair) return;
    pair.classList.remove("is-two-lines");
    pair.classList.add("is-measuring");
    requestAnimationFrame(() => {
      pair.classList.toggle("is-two-lines", pair.scrollWidth > pair.clientWidth + 1);
      pair.classList.remove("is-measuring");
    });
  });
}

function setQuizActionState(enabled) {
  elements.hint_button.disabled = !enabled || elements.hint_button.classList.contains("is-used");
  elements.pass_button.disabled = !enabled;
  if (!enabled) elements.feedback_actions.hidden = true;
}

function showSupportActions() {
  elements.feedback_actions.hidden = false;
  const hintUsed = activeFieldState()?.usedHint ?? questionState?.usedHint ?? false;
  elements.hint_button.classList.toggle("is-used", hintUsed);
  elements.hint_button.setAttribute("aria-hidden", String(hintUsed));
  setQuizActionState(true);
}

function configureInput(answer, question, field) {
  const formulaMode = answer.type === "formula";
  const answerLabel = formulaMode ? (question.domain === "ion" ? "イオン式" : "組成式") : (question.domain === "ion" ? "イオン名" : "化合物名");
  elements.answer_label.textContent = answerLabel;
  elements.answer_input.value = formulaMode ? formulaEntryValue(field.entry) : field.value;
  elements.answer_input.disabled = false;
  elements.answer_input.setAttribute("aria-invalid", "false");
  elements.answer_input.inputMode = formulaMode ? "none" : "text";
  elements.answer_input.placeholder = answerLabel;
  elements.answer_input.autocapitalize = formulaMode ? "off" : "sentences";
  elements.answer_composer.classList.toggle("formula-mode", formulaMode);
  elements.formula_render.hidden = !formulaMode;
  if (formulaMode) elements.formula_render.innerHTML = formulaEntryHtml(field.entry);
  elements.formula_keyboard.hidden = !formulaMode;
  elements.formula_keyboard.classList.toggle("ion-entry", formulaMode && question.domain === "ion");
  elements.charge_keys.hidden = !(formulaMode && question.domain === "ion");
  elements.name_shortcuts.hidden = formulaMode;
  elements.name_shortcuts.querySelector('[data-key="イオン"]').hidden = question.domain !== "ion";
  elements.name_shortcuts.classList.toggle("compound-name-entry", !formulaMode && question.domain !== "ion");
  elements.name_shortcuts.classList.toggle("ion-name-entry", !formulaMode && question.domain === "ion");
  elements.input_message.textContent = "";
  elements.submit_answer.disabled = false;
  elements.feedback_actions.hidden = true;
  const hintUsed = field.usedHint;
  elements.hint_button.classList.toggle("is-used", hintUsed);
  elements.hint_button.setAttribute("aria-hidden", String(hintUsed));
  setKeyboardCase(true);
  renderAnswerSubmit();
  setQuizActionState(true);
  setTimeout(() => elements.answer_input.focus({ preventScroll: true }), 30);
}

function nameShortcutClick(event) {
  const button = event.target.closest("button");
  if (!button || elements.answer_input.disabled) return;
  if (button.dataset.keyAction === "clear") {
    playInputSound("clear");
    elements.answer_input.value = "";
    elements.answer_input.dispatchEvent(new Event("input", { bubbles: true }));
    elements.answer_input.focus({ preventScroll: true });
    return;
  }
  if (button.dataset.key) {
    playInputSound("key");
    replaceSelection(button.dataset.key);
  }
}

function currentQuestion() {
  return session.questions[session.index];
}

function makeAnswerField(specification) {
  return {
    specification,
    value: "",
    entry: specification.type === "formula" ? createFormulaEntry() : null,
    hadWrong: false,
    usedHint: false,
    lastWrongAnswer: "",
    correct: false,
  };
}

function renderBothTabs() {
  const isBoth = questionState?.answer.type === "both";
  elements.both_answer_tabs.hidden = !isBoth;
  if (!isBoth) return;
  for (const button of elements.both_answer_tabs.querySelectorAll("button")) {
    const field = questionState.fields[button.dataset.bothField];
    button.classList.toggle("is-active", questionState.activeField === button.dataset.bothField);
    button.classList.toggle("is-complete", field.correct);
    button.disabled = field.correct;
  }
}

function configureActiveInput() {
  const field = activeFieldState();
  configureInput(field.specification, questionState.question, field);
  renderBothTabs();
}

function switchBothField(fieldName) {
  if (questionState?.answer.type !== "both") return;
  const field = questionState.fields[fieldName];
  if (!field || field.correct) return;
  questionState.activeField = fieldName;
  configureActiveInput();
}

function renderQuestion() {
  clearTimeout(advanceTimer);
  elements.quiz_screen.classList.remove("is-both-complete");
  const question = currentQuestion();
  // This is deliberately recorded when shown rather than when answered, so
  // returning home mid-question cannot immediately repeat the same material.
  rememberPresentation(question);
  const item = itemFor(question);
  const answer = answerFor(question, item);
  const fields = answer.type === "both"
    ? { formula: makeAnswerField(answer.formula), name: makeAnswerField(answer.name) }
    : { single: makeAnswerField(answer) };
  questionState = {
    question, item, answer, fields,
    activeField: answer.type === "both" ? "formula" : "single",
    hadWrong: false, usedHint: false, lastWrongAnswer: "", resolved: false, companionRevealed: false,
  };
  const prompt = promptFor(question, item);
  elements.variant_label.textContent = VARIANT_LABELS[question.variant];
  elements.question_number.textContent = String(session.absoluteIndex + 1);
  elements.question_total.textContent = session.endless ? " / ∞" : ` / ${session.questions.length}`;
  renderBetaQuestionProgress();
  elements.question_prompt.innerHTML = prompt.html;
  elements.question_prompt.classList.toggle("formula", prompt.formula);
  scheduleNamePromptFit();
  elements.streak.textContent = session.streak >= 2 ? `${session.streak}問連続正解` : "";
  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";
  elements.next_button.hidden = true;
  resetBetaFeedbackCompanion();
  configureActiveInput();
}

function looksComplete(value, question, entry = null) {
  const normalized = normalizeFormula(value);
  if (!normalized || !/^[A-Za-z1-8()+-]+$/.test(normalized) || /^[1-8)+-]/.test(normalized)) return false;
  let depth = 0;
  for (const character of normalized) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }
  if (depth !== 0 || /\(\)|\($|[+-].+/.test(normalized)) return false;
  if (question.domain === "ion" && !entry?.charge) return false;
  if (question.domain === "compound" && /[+-]/.test(normalized)) return false;
  return true;
}

function answerDisplayFor(question, item, answer) {
  if (answer.type === "both") return `${formulaHtml(answer.formula.canonical)}<span class="answer-join">　/　</span>${escapeHtml(answer.name.canonical)}`;
  if (answer.type === "name") return escapeHtml(answer.canonical);
  if (question.domain === "ion") return ionFormulaHtml(item);
  return formulaHtml(answer.canonical);
}

function answerDisplay(answer) {
  return answerDisplayFor(questionState.question, questionState.item, answer);
}

function reviewStatus(result) {
  if (result === "pass") return "パス";
  if (questionState.usedHint) return "ヒント";
  return "再回答";
}

function recordReviewItem(result) {
  if (result !== "pass" && !questionState.usedHint && !questionState.hadWrong) return;
  session.reviewItems.push({
    question: { ...questionState.question },
    status: reviewStatus(result),
  });
}

function reviewHtml(review) {
  const item = itemFor(review.question);
  const answer = answerFor(review.question, item);
  const prompt = promptFor(review.question, item);
  const companion = IS_CURRENT && preferences.showCompanionAnswer ? companionAnswerFor(review.question, item) : null;
  const companionHtml = companion
    ? `<div class="review-companion"><span>${escapeHtml(companion.label)}：</span><strong>${companionValueHtml(companion)}</strong></div>`
    : "";
  return `<article class="review-item"><div class="review-prompt">${prompt.html}</div><div class="review-answer">正解：${answerDisplayFor(review.question, item, answer)}</div>${companionHtml}<span class="review-status">${escapeHtml(review.status)}</span></article>`;
}

function betaSessionSummaryKey() {
  if (!session) return "";
  const options = session.compoundOptions ?? preferences.compoundOptions;
  return JSON.stringify({
    practiceType: session.practiceType,
    difficulty: session.difficulty,
    questionCount: session.weakMode ? "weak" : (session.endless ? "endless" : "10"),
    answerPreset: session.practiceType === "compound" ? compoundAnswerPresetForOptions(options) : null,
    promptFormula: session.practiceType === "compound" ? Boolean(options.promptFormula) : null,
    promptName: session.practiceType === "compound" ? Boolean(options.promptName) : null,
  });
}

function betaReviewHasCompanion() {
  return Boolean(session?.reviewItems.some((review) => companionAnswerFor(review.question, itemFor(review.question))));
}

function renderBetaResultReview() {
  if (!IS_CURRENT || !elements.result_review_list) return;
  elements.result_review_list.innerHTML = session.reviewItems.map(reviewHtml).join("");
  syncCompanionToggle(elements.result_review_companion_toggle, betaReviewHasCompanion());
}

function renderBetaResultSummary() {
  if (!IS_CURRENT || !elements.result_first_rate) return;
  const total = session.questions.length;
  const firstTryRate = total ? Math.round(session.stats.first / total * 100) : 0;
  const summaries = { ...readLocal(STORAGE.legacySessionSummaries, {}), ...readLocal(STORAGE.sessionSummaries, {}) };
  const key = betaSessionSummaryKey();
  const previous = summaries[key];
  elements.result_first_rate.textContent = `初回正解率 ${firstTryRate}%`;
  if (!previous || !Number.isFinite(previous.firstTryRate)) {
    elements.result_comparison.textContent = "この設定ではじめての記録です。";
  } else {
    const difference = firstTryRate - previous.firstTryRate;
    if (difference === 0) {
      elements.result_comparison.textContent = `前回も ${previous.firstTryRate}% でした。`;
    } else if (difference > 0) {
      elements.result_comparison.textContent = `前回より＋${difference}ポイント`;
    } else {
      elements.result_comparison.textContent = `前回 ${previous.firstTryRate}% → 今回 ${firstTryRate}%`;
    }
  }
  summaries[key] = { firstTryRate, completedAt: Date.now() };
  writeLocal(STORAGE.sessionSummaries, summaries);
  elements.result_count_note.hidden = false;
}

function ensureAudioOutput() {
  if (audioContext) return audioContext;
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (!Context) return null;
  audioContext = new Context({ latencyHint: "interactive" });
  audioMasterGain = audioContext.createGain();
  audioCompressor = audioContext.createDynamicsCompressor();
  audioMasterGain.gain.value = soundGain();
  audioCompressor.threshold.value = -20;
  audioCompressor.knee.value = 12;
  audioCompressor.ratio.value = 8;
  audioCompressor.attack.value = .003;
  audioCompressor.release.value = .08;
  audioMasterGain.connect(audioCompressor).connect(audioContext.destination);
  return audioContext;
}

function primeAudio() {
  if (!preferences.sound) return;
  try {
    const context = ensureAudioOutput();
    if (!context) return;
    if (context.state !== "running") context.resume().catch(() => {});
    if (audioPrimed) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    gain.gain.value = 0;
    source.connect(gain).connect(audioMasterGain);
    source.start();
    audioPrimed = true;
  } catch {
    // Audio feedback is optional.
  }
}

function playVoice(context, frequency, startAt, duration, volume, type = "triangle") {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + .002);
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  oscillator.connect(gain).connect(audioMasterGain);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + .01);
}

function getAudioNoiseBuffer(context) {
  if (audioNoiseBuffer?.sampleRate === context.sampleRate) return audioNoiseBuffer;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .08), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  for (let index = 0; index < samples.length; index += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    samples[index] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  audioNoiseBuffer = buffer;
  return buffer;
}

function playClick(context, startAt, { frequency, duration, volume, q = 6, type = "bandpass" }) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = getAudioNoiseBuffer(context);
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, startAt);
  filter.Q.value = q;
  gain.gain.setValueAtTime(.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + .0015);
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  source.connect(filter).connect(gain).connect(audioMasterGain);
  source.start(startAt);
  source.stop(startAt + duration + .01);
}

function playInputSound(kind) {
  if (!preferences.sound) return;
  try {
    const context = ensureAudioOutput();
    if (!context) return;
    if (context.state !== "running") {
      context.resume().catch(() => {});
      return;
    }
    const now = context.currentTime + .003;
    if (kind === "backspace") {
      playClick(context, now, { frequency: 980, duration: .03, volume: .036, q: 5 });
      playVoice(context, 740, now, .03, .013);
    } else if (kind === "clear") {
      playClick(context, now, { frequency: 560, duration: .042, volume: .028, q: 2, type: "lowpass" });
      playVoice(context, 560, now, .045, .015);
    } else if (kind === "charge") {
      playClick(context, now, { frequency: 1950, duration: .028, volume: .033, q: 8 });
      playVoice(context, 1760, now + .006, .045, .018, "sine");
    } else if (kind === "control") {
      playClick(context, now, { frequency: 1450, duration: .018, volume: .024, q: 7 });
    } else {
      // Pure Keyboard: a short, hard high-frequency click with no lingering tail.
      playClick(context, now, { frequency: 2420, duration: .022, volume: .037, q: 9 });
      playVoice(context, 1580, now, .021, .014, "sine");
    }
  } catch {
    // Audio feedback is optional.
  }
}

function playTone(kind) {
  if (!preferences.sound) return;
  try {
    const context = ensureAudioOutput();
    if (!context) return;
    if (context.state !== "running") {
      context.resume().catch(() => {});
      return;
    }
    const now = context.currentTime + .003;
    if (kind === "partial") {
      playVoice(context, 1046.5, now, .075, .048);
    } else if (kind === "correct" || kind === "retry" || kind === "streak") {
      const volume = kind === "retry" ? .042 : .055;
      playVoice(context, 1046.5, now, .075, volume);
      playVoice(context, 1318.5, now + .036, .095, volume * .92);
      if (kind === "streak") playVoice(context, 1568, now + .074, .11, .04, "sine");
    } else if (kind === "finish") {
      playVoice(context, 523.25, now, .11, .048);
      playVoice(context, 659.25, now + .07, .12, .048);
      playVoice(context, 783.99, now + .14, .16, .052, "sine");
    } else if (kind === "wrong") {
      // The transient keeps this audible on a phone speaker without becoming harsh.
      playClick(context, now, { frequency: 380, duration: .05, volume: .036, q: 1.6, type: "lowpass" });
      playVoice(context, 196, now, .09, .055);
    }
  } catch {
    // Audio feedback is optional.
  }
}

function animate(kind, streak = 0) {
  if (!preferences.vfx) return;
  const milestone = kind === "correct" && [3, 5, 10].includes(streak);
  elements.question_card.classList.remove("shake", "pop", "milestone");
  void elements.question_card.offsetWidth;
  elements.question_card.classList.add(kind === "correct" ? (milestone ? "milestone" : "pop") : "shake");
  if (kind !== "correct" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = elements.question_card.getBoundingClientRect();
  const count = milestone ? 17 : 9;
  for (let index = 0; index < count; index += 1) {
    const spark = document.createElement("i");
    spark.className = "spark";
    spark.style.left = `${rect.left + rect.width / 2}px`;
    spark.style.top = `${rect.top + rect.height / 2}px`;
    spark.style.setProperty("--spark-x", `${(Math.random() - .5) * (milestone ? 230 : 180)}px`);
    spark.style.setProperty("--spark-y", `${(Math.random() - .7) * (milestone ? 180 : 150)}px`);
    elements.spark_layer.append(spark);
    setTimeout(() => spark.remove(), 700);
  }
}

function resolveResult(result) {
  const history = readLocal(STORAGE.history, {});
  for (const skill of questionSkills(questionState.question)) {
    const fieldName = skill.endsWith("ToFormula") ? "formula" : skill.endsWith("ToName") ? "name" : "single";
    const field = questionState.fields[fieldName] ?? questionState.fields.single;
    recordHistory(history, { ...questionState.question, skill }, {
      passed: result === "pass",
      usedHint: field?.usedHint ?? questionState.usedHint,
      hadWrong: field?.hadWrong ?? questionState.hadWrong,
    });
  }
  writeLocal(STORAGE.history, history);
  updateWeakReviewBadge();
  if (questionState.usedHint) session.stats.hint += 1;
  if (result === "pass") session.stats.pass += 1;
  else {
    if (!questionState.hadWrong && !questionState.usedHint) session.stats.first += 1;
    if (questionState.hadWrong) session.stats.retry += 1;
  }
  recordReviewItem(result);
  questionState.resolved = true;
}

function submitAnswer(event) {
  event.preventDefault();
  if (isComposing || Date.now() - compositionEndedAt < 80 || questionState?.resolved) return;
  const field = activeFieldState();
  const answer = field.specification;
  const value = answer.type === "formula" ? formulaEntryValue(field.entry) : elements.answer_input.value;
  if (answer.type === "formula" && !looksComplete(value, questionState.question, field.entry)) {
    elements.input_message.textContent = questionState.question.domain === "ion" ? "式と右上の電荷まで入力してください。" : "式を完成させてください。";
    elements.answer_input.setAttribute("aria-invalid", "true");
    return;
  }
  const result = questionState.question.domain === "ion" && answer.type === "formula"
    ? evaluateIonEntry(field.entry, questionState.item)
    : evaluateAnswer(value, answer);
  if (result.empty) {
    elements.input_message.textContent = "答えを入力してください。";
    return;
  }
  elements.input_message.textContent = "";
  if (!result.correct) {
    questionState.hadWrong = true;
    field.hadWrong = true;
    questionState.lastWrongAnswer = value;
    field.lastWrongAnswer = value;
    session.streak = 0;
    elements.answer_input.setAttribute("aria-invalid", "true");
    elements.feedback.hidden = false;
    elements.feedback.className = "feedback wrong";
    elements.feedback_title.textContent = "もう一度考えてみよう";
    elements.feedback_answer.innerHTML = "";
    elements.feedback_detail.textContent = "正答はまだ表示しません。入力を直して再挑戦できます。";
    showSupportActions();
    playTone("wrong");
    animate("wrong");
    elements.answer_input.focus({ preventScroll: true });
    return;
  }

  if (questionState.answer.type === "both") {
    field.correct = true;
    field.value = value;
    const remaining = questionState.fields.formula.correct ? "name" : "formula";
    if (!questionState.fields[remaining].correct) {
      playTone("partial");
      elements.feedback.hidden = false;
      elements.feedback.className = "feedback correct";
      elements.feedback_title.textContent = `${answer.type === "formula" ? "組成式" : "化合物名"}は正解！`;
      elements.feedback_answer.innerHTML = answer.type === "formula" ? formulaHtml(answer.canonical) : escapeHtml(answer.canonical);
      elements.feedback_detail.textContent = `次は${remaining === "formula" ? "組成式" : "化合物名"}を答えよう。`;
      switchBothField(remaining);
      return;
    }
  }

  const nextStreak = session.streak + 1;
  playTone([3, 5, 10].includes(nextStreak) ? "streak" : (questionState.hadWrong ? "retry" : "correct"));
  resolveResult("correct");
  session.streak = nextStreak;
  elements.answer_input.disabled = true;
  elements.submit_answer.disabled = true;
  elements.formula_keyboard.hidden = true;
  setQuizActionState(false);
  elements.feedback.hidden = false;
  elements.feedback.className = "feedback correct";
  elements.feedback_title.textContent = "✓ 正解！";
  elements.feedback_answer.innerHTML = answerDisplay(questionState.answer);
  elements.feedback_detail.textContent = result.note ?? "";
  renderBetaFeedbackCompanion();
  animate("correct", session.streak);
  const completedBothCompound = IS_CURRENT
    && questionState.question.domain === "compound"
    && questionState.answer.type === "both";
  elements.quiz_screen.classList.toggle("is-both-complete", completedBothCompound);
  const betaNeedsManualAdvance = IS_CURRENT
    && questionState.question.domain === "compound";
  if (result.note || betaNeedsManualAdvance) {
    elements.next_button.hidden = false;
    elements.next_button.focus({ preventScroll: true });
  } else {
    advanceTimer = setTimeout(nextQuestion, 850);
  }
}

function showHint() {
  if (questionState?.resolved) return;
  questionState.usedHint = true;
  const field = activeFieldState();
  field.usedHint = true;
  elements.feedback.hidden = false;
  elements.feedback.className = "feedback";
  elements.feedback_title.textContent = "ヒント";
  elements.feedback_answer.innerHTML = "";
  const hintQuestion = questionState.answer.type === "both"
    ? { ...questionState.question, variant: questionState.question.variant.replace("ToBoth", field.specification.type === "formula" ? "ToFormula" : "ToName") }
    : questionState.question;
  elements.feedback_detail.textContent = hintFor(hintQuestion, questionState.item, ionById, field.lastWrongAnswer || questionState.lastWrongAnswer);
  elements.hint_button.classList.add("is-used");
  elements.hint_button.setAttribute("aria-hidden", "true");
  elements.hint_button.disabled = true;
  elements.feedback_actions.hidden = false;
  elements.answer_input.focus({ preventScroll: true });
}

function passQuestion() {
  if (questionState?.resolved) return;
  resolveResult("pass");
  session.streak = 0;
  elements.answer_input.disabled = true;
  elements.submit_answer.disabled = true;
  elements.formula_keyboard.hidden = true;
  setQuizActionState(false);
  elements.feedback.hidden = false;
  elements.feedback.className = "feedback";
  elements.feedback_title.textContent = "正答";
  elements.feedback_answer.innerHTML = answerDisplay(questionState.answer);
  elements.feedback_detail.textContent = questionState.question.domain === "compound"
    ? explanationForCompound(questionState.item, ionById)
    : `${questionState.item.name}は ${formulaText(questionState.item.formula)}、電荷は${questionState.item.charge > 0 ? "＋" : "－"}${Math.abs(questionState.item.charge)}です。`;
  renderBetaFeedbackCompanion();
  elements.next_button.hidden = false;
  elements.next_button.focus({ preventScroll: true });
}

function nextQuestion() {
  clearTimeout(advanceTimer);
  if (!questionState?.resolved) return;
  session.index += 1;
  session.absoluteIndex += 1;
  if (session.index < session.questions.length) {
    renderQuestion();
    return;
  }
  if (!session.endless) {
    showResults();
    return;
  }
  const round = makeRound(true);
  session.questions = round.questions;
  session.plan = round;
  session.index = 0;
  renderQuestion();
}

function makeRound(endless) {
  const builder = session.weakMode ? buildWeakQuestionSet : (endless ? buildEndlessRound : buildTenQuestionSet);
  return builder({
    practiceType: session.practiceType,
    difficulty: session.difficulty,
    ions: data.ions,
    compounds: data.compounds,
    settings: data.difficulty,
    history: readLocal(STORAGE.history, {}),
    recentPresentations: recentPresentations(),
    selectionState: compoundSelectionState(),
    compoundOptions: session.compoundOptions,
  });
}

function selectedPracticeType() {
  return new FormData(elements.setup_form).get("practice-type");
}

function compoundOptionsValid(options = preferences.compoundOptions) {
  return Boolean(options.promptFormula || options.promptName)
    && Boolean(options.answerBoth || options.answerFormula || options.answerName);
}

function refreshCompoundOptions() {
  const compoundMode = selectedPracticeType() === "compound";
  elements.compound_options.hidden = !compoundMode;
  for (const button of elements.compound_options.querySelectorAll("[data-compound-toggle]")) {
    const enabled = Boolean(preferences.compoundOptions[button.dataset.compoundToggle]);
    button.classList.toggle("is-on", enabled);
    button.setAttribute("aria-pressed", String(enabled));
  }
  refreshBetaCompoundPresets();
  elements.compound_option_message.textContent = compoundMode && !compoundOptionsValid()
    ? "出題と解答をそれぞれ1つ以上選んでください。"
    : "";
  elements.start_button.disabled = !data || (compoundMode && !compoundOptionsValid());
}

function toggleCompoundOption(key) {
  const options = preferences.compoundOptions;
  if (IS_CURRENT && (key === "promptFormula" || key === "promptName") && options[key] && !options[key === "promptFormula" ? "promptName" : "promptFormula"]) {
    elements.compound_option_message.textContent = "イオン式またはイオン名を1つ以上選んでください。";
    return;
  }
  if (key === "answerBoth") {
    options.answerBoth = !options.answerBoth;
    if (options.answerBoth) {
      options.answerFormula = false;
      options.answerName = false;
    }
  } else {
    options[key] = !options[key];
    if (key === "answerFormula" || key === "answerName") options.answerBoth = false;
  }
  savePreferences();
  refreshCompoundOptions();
}

function startSession(settings = null) {
  const formData = new FormData(elements.setup_form);
  const questionCount = formData.get("question-count");
  const chosen = settings ?? {
    practiceType: formData.get("practice-type"),
    difficulty: formData.get("difficulty"),
    endless: questionCount === "endless",
    weakMode: questionCount === "weak",
    compoundOptions: { ...preferences.compoundOptions },
  };
  primeAudio();
  session = {
    ...chosen,
    questions: [],
    plan: null,
    index: 0,
    absoluteIndex: 0,
    streak: 0,
    stats: { first: 0, retry: 0, hint: 0, pass: 0 },
    reviewItems: [],
  };
  const round = makeRound(chosen.endless);
  if (!round.questions.length) {
    alert("この設定で出題できる問題がありません。管理画面でデータを確認してください。");
    session = null;
    return;
  }
  session.questions = round.questions;
  session.plan = round;
  showScreen("quiz");
  renderQuestion();
}

function showResults() {
  playTone("finish");
  elements.result_first.textContent = session.stats.first;
  elements.result_retry.textContent = session.stats.retry;
  elements.result_hint.textContent = session.stats.hint;
  elements.result_pass.textContent = session.stats.pass;
  elements.result_review.hidden = session.reviewItems.length === 0;
  elements.result_review_list.innerHTML = session.reviewItems.map(reviewHtml).join("");
  renderBetaResultSummary();
  renderBetaResultReview();
  showScreen("result");
}

function weakItemTitle(entry) {
  if (entry.domain === "ion") {
    return `<span class="weak-item-formula">${ionFormulaHtml(entry.item)}</span><span>${escapeHtml(entry.item.name)}</span>`;
  }
  const formula = entry.item.formula ? `<span class="weak-item-formula">${formulaHtml(entry.item.formula)}</span>` : "";
  return `${formula}<span>${escapeHtml(entry.item.name)}</span>`;
}

function weakSkillLabel(skill) {
  if (skill === "ionNameToFormula") return "イオン式";
  if (skill === "ionFormulaToName") return "イオン名";
  return skill.endsWith("ToFormula") ? "組成式" : "化合物名";
}

function weakReviewHtml(entry) {
  const labels = [...new Set(entry.skills.map(weakSkillLabel))];
  const rate = Math.round(entry.rate * 100);
  const deleteLabel = escapeHtml(`${entry.item.name}を苦手リストから削除`);
  return `<article class="weak-item"><button class="weak-item-delete" type="button" data-weak-domain="${escapeHtml(entry.domain)}" data-weak-item-id="${escapeHtml(entry.itemId)}" aria-label="${deleteLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button><div class="weak-item-title">${weakItemTitle(entry)}</div><div class="weak-item-meta"><span>初回正答率 ${rate}%</span>${labels.map((label) => `<span class="weak-skill">${escapeHtml(label)}</span>`).join("")}</div></article>`;
}

function currentWeakItems() {
  return weakHistoryItems(readLocal(STORAGE.history, {}), data?.ions ?? [], data?.compounds ?? []);
}

function updateWeakReviewBadge() {
  const count = currentWeakItems().length;
  elements.weak_review_count.hidden = count === 0;
  elements.weak_review_count.textContent = count > 99 ? "99+" : String(count);
}

function renderWeakReview() {
  const entries = currentWeakItems();
  elements.weak_review_list.innerHTML = entries.map(weakReviewHtml).join("");
  elements.weak_review_empty.hidden = entries.length > 0;
  elements.start_weak_from_review.hidden = entries.length === 0;
  elements.clear_weak_review.hidden = entries.length === 0;
  return entries;
}

function removeWeakReviewEntries(entries) {
  const history = readLocal(STORAGE.history, {});
  writeLocal(STORAGE.history, removeWeakHistoryItems(history, entries));
  updateWeakReviewBadge();
  renderWeakReview();
}

function openWeakReview() {
  renderWeakReview();
  if (!elements.weak_review_dialog.open) elements.weak_review_dialog.showModal();
}

function closeWeakReview() {
  if (elements.weak_review_dialog.open) elements.weak_review_dialog.close();
}

function bindEvents() {
  elements.setup_form.addEventListener("submit", (event) => {
    event.preventDefault();
    startSession();
  });
  elements.answer_form.addEventListener("submit", submitAnswer);
  elements.answer_input.addEventListener("compositionstart", () => { isComposing = true; });
  elements.answer_input.addEventListener("compositionend", () => {
    isComposing = false;
    compositionEndedAt = Date.now();
  });
  elements.answer_input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (isComposing || event.isComposing || event.keyCode === 229)) event.preventDefault();
    if (!isFormulaEntryMode()) return;
    if (event.key === "Enter") return;
    if (event.key === "Backspace") {
      event.preventDefault();
      playInputSound("backspace");
      formulaBackspace();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      playInputSound("control");
      moveCaret(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (/^[A-Za-z1-8()]$/.test(event.key)) {
      event.preventDefault();
      playInputSound("key");
      replaceSelection(event.key);
      return;
    }
    if (event.key === "+" || event.key === "-") {
      event.preventDefault();
      elements.input_message.textContent = "電荷は下の電荷ボタンで入力してください。";
      return;
    }
    if (event.key.length === 1) event.preventDefault();
  });
  elements.answer_input.addEventListener("input", () => {
    const field = activeFieldState();
    if (isFormulaEntryMode()) {
      elements.answer_input.value = formulaEntryValue(field.entry);
      return;
    }
    if (field) field.value = elements.answer_input.value;
    elements.answer_input.setAttribute("aria-invalid", "false");
    elements.input_message.textContent = "";
    renderAnswerSubmit();
  });
  elements.answer_input.addEventListener("touchstart", (event) => {
    primeAudio();
    touchStartX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  elements.answer_input.addEventListener("touchend", (event) => {
    const endX = event.changedTouches[0]?.clientX;
    if (touchStartX != null && endX != null && Math.abs(endX - touchStartX) >= 30) moveCaret(endX < touchStartX ? 1 : -1);
    touchStartX = null;
  }, { passive: true });
  elements.hint_button.addEventListener("click", showHint);
  elements.pass_button.addEventListener("click", passQuestion);
  elements.next_button.addEventListener("click", nextQuestion);
  elements.quit_button.addEventListener("click", () => {
    clearTimeout(advanceTimer);
    showScreen("setup");
  });
  elements.retry_session.addEventListener("click", () => startSession({
    practiceType: session.practiceType,
    difficulty: session.difficulty,
    endless: session.endless,
    weakMode: session.weakMode,
    compoundOptions: { ...session.compoundOptions },
  }));
  elements.back_to_setup.addEventListener("click", () => showScreen("setup"));
  elements.weak_review_button.addEventListener("click", openWeakReview);
  elements.close_weak_review.addEventListener("click", closeWeakReview);
  elements.weak_review_dialog.addEventListener("click", (event) => {
    if (event.target === elements.weak_review_dialog) closeWeakReview();
  });
  elements.weak_review_list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-weak-domain][data-weak-item-id]");
    if (!button) return;
    const entry = currentWeakItems().find((item) => item.domain === button.dataset.weakDomain && item.itemId === button.dataset.weakItemId);
    if (entry) removeWeakReviewEntries([entry]);
  });
  elements.clear_weak_review.addEventListener("click", () => {
    const entries = currentWeakItems();
    if (entries.length && confirm("苦手問題をすべて削除しますか？")) removeWeakReviewEntries(entries);
  });
  elements.start_weak_from_review.addEventListener("click", () => {
    closeWeakReview();
    elements.setup_form.querySelector('[name="question-count"][value="weak"]').checked = true;
    startSession();
  });
  elements.setup_form.addEventListener("change", (event) => {
    if (event.target.name === "practice-type") refreshCompoundOptions();
  });
  elements.compound_options.addEventListener("click", (event) => {
    const button = event.target.closest("[data-compound-toggle]");
    if (button) toggleCompoundOption(button.dataset.compoundToggle);
  });
  elements.compound_answer_presets?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-compound-preset]");
    if (button) setBetaCompoundPreset(button.dataset.compoundPreset);
  });
  elements.feedback_companion_toggle?.addEventListener("click", () => {
    if (!betaCompanion()) return;
    questionState.companionRevealed = true;
    renderBetaFeedbackCompanion();
  });
  const toggleResultCompanionAnswer = () => {
    preferences.showCompanionAnswer = !preferences.showCompanionAnswer;
    savePreferences();
    renderBetaResultReview();
  };
  elements.result_review_companion_toggle?.addEventListener("click", toggleResultCompanionAnswer);
  elements.both_answer_tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-both-field]");
    if (button) switchBothField(button.dataset.bothField);
  });
  renderSoundToggle();
  elements.sound_toggle.addEventListener("click", () => {
    const index = SOUND_LEVELS.indexOf(preferences.soundLevel);
    setSoundLevel(SOUND_LEVELS[(index + 1) % SOUND_LEVELS.length]);
  });
}

async function initialize() {
  initializeKeyboard();
  setKeyboardCase(true);
  elements.name_shortcuts.addEventListener("pointerdown", (event) => event.preventDefault());
  elements.name_shortcuts.addEventListener("click", nameShortcutClick);
  bindEvents();
  try {
    data = await loadData();
    ionById = new Map(data.ions.map((ion) => [ion.id, ion]));
    compoundById = new Map(data.compounds.map((compound) => [compound.id, compound]));
    refreshCompoundOptions();
    updateWeakReviewBadge();
    const resizeObserver = new ResizeObserver(scheduleNamePromptFit);
    resizeObserver.observe(elements.question_card);
    document.fonts?.ready?.then(scheduleNamePromptFit);
  } catch (error) {
    elements.setup_form.innerHTML = `<div class="feedback wrong"><strong>教材データを読み込めませんでした。</strong><p>${escapeHtml(String(error.message))}</p><p>このページはWebサーバーまたはGitHub Pagesから開いてください。</p></div>`;
  }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

initialize();
