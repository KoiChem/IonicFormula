import {
  PRACTICE_TYPE_LABELS,
  VARIANT_LABELS,
  answerFor,
  buildEndlessRound,
  buildWeakQuestionSet,
  buildTenQuestionSet,
  evaluateAnswer,
  escapeHtml,
  explanationForCompound,
  formulaHtml,
  formulaText,
  hintFor,
  ionFormulaHtml,
  ionInputHtml,
  normalizeFormula,
  recordHistory,
  validateData,
} from "./core.js";

const STORAGE = {
  history: "ionicFormula.history.v2",
  preferences: "ionicFormula.preferences.v1",
  adminData: "ionicFormula.adminData.v2",
};

const elements = Object.fromEntries([
  "app-header", "brand", "quiz-actions", "setup-screen", "quiz-screen", "result-screen",
  "setup-form", "variant-label", "question-number", "question-total", "question-card",
  "question-prompt", "streak", "answer-form", "answer-label", "answer-input",
  "input-message", "submit-answer", "submit-answer-text", "formula-keyboard", "number-keys",
  "letter-keys", "charge-keys", "name-shortcuts", "feedback", "feedback-title", "feedback-answer",
  "feedback-detail", "feedback-actions", "next-button", "hint-button", "pass-button", "quit-button",
  "result-first", "result-retry", "result-hint", "result-pass", "result-review", "result-review-list",
  "retry-session", "back-to-setup", "sound-toggle", "vfx-toggle", "spark-layer",
  "session-announcement", "start-button",
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
let touchStartX = null;

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

const preferences = { sound: true, vfx: true, ...readLocal(STORAGE.preferences, {}) };

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

function setMediaButton(button, enabled) {
  button.setAttribute("aria-pressed", String(enabled));
  button.setAttribute("aria-label", `${button.id === "sound-toggle" ? "効果音" : "画面演出"}を${enabled ? "オフ" : "オン"}にする`);
  button.classList.toggle("is-off", !enabled);
  button.querySelector(".toggle-state")?.replaceChildren(enabled ? "ON" : "OFF");
}

function showScreen(name) {
  for (const screen of [elements.setup_screen, elements.quiz_screen, elements.result_screen]) {
    screen.hidden = screen.id !== `${name}-screen`;
  }
  const quiz = name === "quiz";
  elements.brand.hidden = quiz;
  elements.quiz_actions.hidden = !quiz;
  elements.app_header.classList.toggle("quiz-header", quiz);
  elements.session_announcement.classList.toggle("static", !preferences.vfx);
  window.scrollTo({ top: 0, behavior: preferences.vfx ? "smooth" : "auto" });
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
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 11 6-6 6 6"/><path d="M12 5v14"/></svg>';
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
  const input = elements.answer_input;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus({ preventScroll: true });
}

function moveCaret(direction) {
  const input = elements.answer_input;
  const current = input.selectionStart ?? input.value.length;
  const next = Math.max(0, Math.min(input.value.length, current + direction));
  input.setSelectionRange(next, next);
  input.focus({ preventScroll: true });
}

function keyboardClick(event) {
  const button = event.target.closest("button");
  if (!button || elements.answer_input.disabled) return;
  const action = button.dataset.keyAction;
  if (action === "case") setKeyboardCase(!keyboardUppercase);
  else if (action === "left") moveCaret(-1);
  else if (action === "right") moveCaret(1);
  else if (action === "backspace") {
    const input = elements.answer_input;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (start !== end) input.setRangeText("", start, end, "end");
    else if (start > 0) input.setRangeText("", start - 1, start, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (action === "clear") {
    elements.answer_input.value = "";
    elements.answer_input.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (button.classList.contains("charge-key")) {
    const normalized = normalizeFormula(elements.answer_input.value).replace(/[1-8]?[+-]$/, "");
    elements.answer_input.value = `${normalized}${button.dataset.key}`;
    elements.answer_input.setSelectionRange(elements.answer_input.value.length, elements.answer_input.value.length);
    elements.answer_input.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (button.dataset.key) {
    replaceSelection(button.dataset.key);
  }
  elements.answer_input.focus({ preventScroll: true });
}

function previewFormulaHtml() {
  const normalized = normalizeFormula(elements.answer_input.value);
  if (!normalized) return "";
  if (questionState?.question.domain !== "ion") return formulaHtml(normalized);
  return ionInputHtml(normalized, data.ions);
}

function renderAnswerSubmit() {
  const formulaMode = questionState?.answer.type === "formula";
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
  const renderSide = (ion, style) => style === "name"
    ? `<span class="ion-name">${escapeHtml(ion.name)}</span>`
    : `<span class="formula-token">${ionFormulaHtml(ion)}</span>`;
  const hasName = styles.includes("name");
  const ionsHtml = hasName
    ? `<span class="ion-pair names"><span class="ion-pair-first">${renderSide(sides[0], styles[0])}<span class="ion-separator" aria-hidden="true">＆</span></span><span class="ion-pair-second">${renderSide(sides[1], styles[1])}</span></span>`
    : `<span class="ion-pair"><span>${renderSide(sides[0], styles[0])}</span><span class="ion-separator" aria-hidden="true">＆</span><span>${renderSide(sides[1], styles[1])}</span></span>`;
  return { html: ionsHtml, formula: !hasName };
}

function setQuizActionState(enabled) {
  elements.hint_button.disabled = !enabled;
  elements.pass_button.disabled = !enabled;
  if (!enabled) elements.feedback_actions.hidden = true;
}

function showSupportActions() {
  elements.feedback_actions.hidden = false;
  elements.hint_button.hidden = questionState?.usedHint ?? false;
  elements.pass_button.hidden = false;
  setQuizActionState(true);
}

function configureInput(answer, question) {
  const formulaMode = answer.type === "formula";
  const answerLabel = formulaMode ? (question.domain === "ion" ? "イオン式" : "組成式") : (question.domain === "ion" ? "イオン名" : "化合物名");
  elements.answer_label.textContent = answerLabel;
  elements.answer_input.value = "";
  elements.answer_input.disabled = false;
  elements.answer_input.setAttribute("aria-invalid", "false");
  elements.answer_input.inputMode = formulaMode ? "none" : "text";
  elements.answer_input.placeholder = answerLabel;
  elements.answer_input.autocapitalize = formulaMode ? "off" : "sentences";
  elements.formula_keyboard.hidden = !formulaMode;
  elements.formula_keyboard.classList.toggle("ion-entry", formulaMode && question.domain === "ion");
  elements.charge_keys.hidden = !(formulaMode && question.domain === "ion");
  elements.name_shortcuts.hidden = formulaMode;
  elements.name_shortcuts.querySelector('[data-key="イオン"]').hidden = question.domain !== "ion";
  elements.input_message.textContent = "";
  elements.submit_answer.disabled = false;
  elements.feedback_actions.hidden = true;
  elements.hint_button.hidden = false;
  elements.pass_button.hidden = false;
  setKeyboardCase(true);
  renderAnswerSubmit();
  setQuizActionState(true);
  setTimeout(() => elements.answer_input.focus({ preventScroll: true }), 30);
}

function nameShortcutClick(event) {
  const button = event.target.closest("button[data-key]");
  if (!button || elements.answer_input.disabled) return;
  replaceSelection(button.dataset.key);
}

function currentQuestion() {
  return session.questions[session.index];
}

function renderQuestion() {
  clearTimeout(advanceTimer);
  const question = currentQuestion();
  const item = itemFor(question);
  const answer = answerFor(question, item);
  questionState = { question, item, answer, hadWrong: false, usedHint: false, resolved: false };
  const prompt = promptFor(question, item);
  elements.variant_label.textContent = VARIANT_LABELS[question.variant];
  elements.question_number.textContent = String(session.absoluteIndex + 1);
  elements.question_total.textContent = session.endless ? " / ∞" : ` / ${session.questions.length}`;
  elements.question_prompt.innerHTML = prompt.html;
  elements.question_prompt.classList.toggle("formula", prompt.formula);
  elements.streak.textContent = session.streak >= 2 ? `${session.streak}問連続正解` : "";
  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";
  elements.next_button.hidden = true;
  configureInput(answer, question);
}

function looksComplete(value, question) {
  const normalized = normalizeFormula(value);
  if (!normalized || !/^[A-Za-z1-8()+-]+$/.test(normalized) || /^[1-8)+-]/.test(normalized)) return false;
  let depth = 0;
  for (const character of normalized) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }
  if (depth !== 0 || /\(\)|\($|[+-].+/.test(normalized)) return false;
  if (question.domain === "ion" && !/[1-8]?[+-]$/.test(normalized)) return false;
  if (question.domain === "compound" && /[+-]/.test(normalized)) return false;
  return true;
}

function answerDisplayFor(question, item, answer) {
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
  return `<article class="review-item"><div class="review-prompt">${prompt.html}</div><div class="review-answer">正解：${answerDisplayFor(review.question, item, answer)}</div><span class="review-status">${escapeHtml(review.status)}</span></article>`;
}

function ensureAudioOutput() {
  if (audioContext) return audioContext;
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (!Context) return null;
  audioContext = new Context({ latencyHint: "interactive" });
  audioMasterGain = audioContext.createGain();
  audioCompressor = audioContext.createDynamicsCompressor();
  audioMasterGain.gain.value = .72;
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
    if (kind === "correct") {
      playVoice(context, 1046.5, now, .075, .055);
      playVoice(context, 1318.5, now + .036, .095, .05);
    } else {
      playVoice(context, 196, now, .09, .035);
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
  recordHistory(history, questionState.question, {
    passed: result === "pass",
    usedHint: questionState.usedHint,
    hadWrong: questionState.hadWrong,
  });
  writeLocal(STORAGE.history, history);
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
  const value = elements.answer_input.value;
  if (questionState.answer.type === "formula" && !looksComplete(value, questionState.question)) {
    elements.input_message.textContent = questionState.question.domain === "ion" ? "式と右上の電荷まで入力してください。" : "式を完成させてください。";
    elements.answer_input.setAttribute("aria-invalid", "true");
    return;
  }
  const result = evaluateAnswer(value, questionState.answer);
  if (result.empty) {
    elements.input_message.textContent = "答えを入力してください。";
    return;
  }
  elements.input_message.textContent = "";
  if (!result.correct) {
    questionState.hadWrong = true;
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

  playTone("correct");
  resolveResult("correct");
  session.streak += 1;
  elements.answer_input.disabled = true;
  elements.submit_answer.disabled = true;
  elements.formula_keyboard.hidden = true;
  setQuizActionState(false);
  elements.feedback.hidden = false;
  elements.feedback.className = "feedback correct";
  elements.feedback_title.textContent = "✓ 正解！";
  elements.feedback_answer.innerHTML = answerDisplay(questionState.answer);
  elements.feedback_detail.textContent = result.note ?? "";
  animate("correct", session.streak);
  if (result.note) {
    elements.next_button.hidden = false;
    elements.next_button.focus({ preventScroll: true });
  } else {
    advanceTimer = setTimeout(nextQuestion, 850);
  }
}

function showHint() {
  if (questionState?.resolved) return;
  questionState.usedHint = true;
  elements.feedback.hidden = false;
  elements.feedback.className = "feedback";
  elements.feedback_title.textContent = "ヒント";
  elements.feedback_answer.innerHTML = "";
  elements.feedback_detail.textContent = hintFor(questionState.question, questionState.item, ionById);
  elements.hint_button.hidden = true;
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
  });
}

function startSession(settings = null) {
  const formData = new FormData(elements.setup_form);
  const questionCount = formData.get("question-count");
  const chosen = settings ?? {
    practiceType: formData.get("practice-type"),
    difficulty: formData.get("difficulty"),
    endless: questionCount === "endless",
    weakMode: questionCount === "weak",
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
  elements.session_announcement.textContent = PRACTICE_TYPE_LABELS[chosen.practiceType];
  elements.session_announcement.hidden = false;
  setTimeout(() => { elements.session_announcement.hidden = true; }, 880);
  renderQuestion();
}

function showResults() {
  elements.result_first.textContent = session.stats.first;
  elements.result_retry.textContent = session.stats.retry;
  elements.result_hint.textContent = session.stats.hint;
  elements.result_pass.textContent = session.stats.pass;
  elements.result_review.hidden = session.reviewItems.length === 0;
  elements.result_review_list.innerHTML = session.reviewItems.map(reviewHtml).join("");
  showScreen("result");
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
  });
  elements.answer_input.addEventListener("input", () => {
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
  }));
  elements.back_to_setup.addEventListener("click", () => showScreen("setup"));
  setMediaButton(elements.sound_toggle, preferences.sound);
  setMediaButton(elements.vfx_toggle, preferences.vfx);
  elements.sound_toggle.addEventListener("click", () => {
    preferences.sound = !preferences.sound;
    setMediaButton(elements.sound_toggle, preferences.sound);
    if (preferences.sound) primeAudio();
    writeLocal(STORAGE.preferences, preferences);
  });
  elements.vfx_toggle.addEventListener("click", () => {
    preferences.vfx = !preferences.vfx;
    setMediaButton(elements.vfx_toggle, preferences.vfx);
    elements.session_announcement.classList.toggle("static", !preferences.vfx);
    writeLocal(STORAGE.preferences, preferences);
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
    elements.start_button.disabled = false;
  } catch (error) {
    elements.setup_form.innerHTML = `<div class="feedback wrong"><strong>教材データを読み込めませんでした。</strong><p>${escapeHtml(String(error.message))}</p><p>このページはWebサーバーまたはGitHub Pagesから開いてください。</p></div>`;
  }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

initialize();
