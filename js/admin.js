import { PRACTICE_TYPE_LABELS, compoundCategory, validateData } from "./core.js?v=20261002-complex-input-v1";
import { composePublishedBundle, migrateBundle } from "./data-migrations.js?v=20261002-complex-input-v1";
import { searchMatches } from "./admin-search.js?v=20261002-complex-input-v1";
import { INITIAL_PASSWORD_RECORD, currentPasswordRecord, verifyPassword, changeAdminPassword } from "./admin-lock.js?v=20261002-complex-input-v1";

const STORAGE_KEY = "ionicFormula.adminData.v2";
const BACKUP_KEY = `${STORAGE_KEY}.preComplexBackup`;
const CATEGORY_LABELS = {
  simple11: "simple11",
  simpleRatio: "simpleRatio",
  polyatomic: "polyatomic",
  variableOx: "variableOx",
};

const elements = {
  lockScreen: document.getElementById("admin-lock-screen"),
  editor: document.getElementById("admin-editor"),
  unlockForm: document.getElementById("unlock-form"),
  unlockPassword: document.getElementById("unlock-password"),
  unlockStatus: document.getElementById("unlock-status"),
  lockButton: document.getElementById("lock-button"),
  changePasswordForm: document.getElementById("change-password-form"),
  changePasswordStatus: document.getElementById("change-password-status"),
  importFile: document.getElementById("import-file"),
  exportBundle: document.getElementById("export-bundle"),
  exportCurrent: document.getElementById("export-current"),
  validateButton: document.getElementById("validate-button"),
  saveLocal: document.getElementById("save-local"),
  resetLocal: document.getElementById("reset-local"),
  saveStatus: document.getElementById("save-status"),
  validation: document.getElementById("validation-panel"),
  tabs: document.querySelector(".admin-tabs"),
  listControls: document.getElementById("list-controls"),
  search: document.getElementById("search-input"),
  searchFields: document.getElementById("search-fields"),
  enabledFilter: document.getElementById("enabled-filter"),
  addRow: document.getElementById("add-row"),
  rowCount: document.getElementById("row-count"),
  ionsPanel: document.getElementById("ions-panel"),
  compoundsPanel: document.getElementById("compounds-panel"),
  difficultyPanel: document.getElementById("difficulty-panel"),
  ionsTable: document.getElementById("ions-table"),
  compoundsTable: document.getElementById("compounds-table"),
  difficultyEditor: document.getElementById("difficulty-editor"),
};

let publishedData;
let pack;
let state;
let activeTab = "ions";
let searchField = "id";
let validationTimer;
let eventsBound = false;

const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}を読み込めません。`);
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

function readOverride() {
  const value = localStorage.getItem(STORAGE_KEY);
  return value ? { raw: value, bundle: JSON.parse(value) } : null;
}

function persistMigration(original, migrated) {
  if ((original.bundle.migrationVersion ?? 0) < migrated.migrationVersion && localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, original.raw);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
}

function showStatus(message, error = false) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.style.color = error ? "var(--wrong)" : "var(--primary)";
}

function input({ value = "", field, index, type = "text", checked = false, extra = "" }) {
  if (type === "checkbox") {
    return `<input type="checkbox" data-index="${index}" data-field="${field}" ${checked ? "checked" : ""} ${extra}>`;
  }
  const escaped = escapeHtml(value);
  return `<input type="${type}" value="${escaped}" data-index="${index}" data-field="${field}" ${extra}>`;
}

function select({ value, field, index, options }) {
  return `<select data-index="${index}" data-field="${field}">${options.map((option) => {
    const entry = typeof option === "string" ? { value: option, label: option } : option;
    return `<option value="${escapeHtml(entry.value)}" ${entry.value === value ? "selected" : ""}>${escapeHtml(entry.label)}</option>`;
  }).join("")}</select>`;
}

function matchesFilters(item) {
  const enabled = elements.enabledFilter.value;
  if (enabled === "enabled" && !item.enabled) return false;
  if (enabled === "disabled" && item.enabled) return false;
  return searchMatches(item, elements.search.value, searchField);
}

function renderIons() {
  const headers = ["id", "式", "電荷", "名称", "種類", "原子数", "酸化数", "教材区分", "課程", "対象難易度", "イオン問題", "化合物で式＋名", "有効", "操作"];
  elements.ionsTable.tHead.innerHTML = `<tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>`;
  const visible = state.ions.map((item, index) => ({ item, index })).filter(({ item }) => matchesFilters(item));
  elements.ionsTable.tBodies[0].innerHTML = visible.map(({ item: ion, index }) => `<tr>
    <td>${input({ value: ion.id, field: "id", index })}</td>
    <td>${input({ value: ion.formula, field: "formula", index })}</td>
    <td>${input({ value: ion.charge, field: "charge", index, type: "number", extra: 'step="1"' })}</td>
    <td>${input({ value: ion.name, field: "name", index })}</td>
    <td>${select({ value: ion.type, field: "type", index, options: [{ value: "cation", label: "陽イオン" }, { value: "anion", label: "陰イオン" }] })}</td>
    <td>${select({ value: ion.atomicity, field: "atomicity", index, options: [{ value: "monatomic", label: "単原子" }, { value: "polyatomic", label: "多原子" }] })}</td>
    <td class="check-cell">${input({ type: "checkbox", field: "requiresOxidationNumeral", index, checked: ion.requiresOxidationNumeral })}</td>
    <td>${select({ value: ion.chemistryClass ?? "", field: "chemistryClass", index, options: [{ value: "", label: "通常" }, { value: "complex", label: "錯イオン" }] })}</td>
    <td>${select({ value: ion.curriculumLevel ?? "", field: "curriculumLevel", index, options: [{ value: "", label: "—" }, { value: "standard", label: "標準" }, { value: "advanced", label: "発展" }] })}</td>
    <td>${select({ value: ion.difficulty ?? "", field: "difficulty", index, options: [{ value: "", label: "両方" }, { value: "normal", label: "やさしめ" }, { value: "hard", label: "ややむず" }] })}</td>
    <td class="check-cell">${input({ type: "checkbox", field: "ionQuestionEnabled", index, checked: ion.ionQuestionEnabled !== false })}</td>
    <td>${select({ value: ion.compoundPromptDisplay ?? "", field: "compoundPromptDisplay", index, options: [{ value: "", label: "通常" }, { value: "formulaAndName", label: "式＋名" }] })}</td>
    <td class="check-cell">${input({ type: "checkbox", field: "enabled", index, checked: ion.enabled })}</td>
    <td class="action-cell"><button type="button" data-action="duplicate" data-index="${index}">複製</button><button class="delete-row" type="button" data-action="delete" data-index="${index}">削除</button></td>
  </tr>`).join("");
  elements.rowCount.textContent = `${visible.length} / ${state.ions.length}件`;
}

function aliasesText(compound) {
  return (compound.acceptedFormulaVariants ?? []).map((entry) => `${entry.formula}|${entry.note ?? ""}`).join(" ; ");
}

function renderCompounds() {
  const headers = ["id", "陽イオン", "陰イオン", "組成式", "名称", "自動カテゴリ", "教材区分", "課程", "対象難易度", "実在確認URL", "別表記 formula|注記", "固体色", "色注記", "イオン式→式", "イオン式→名", "イオン名→式", "イオン名→名", "有効", "操作"];
  elements.compoundsTable.tHead.innerHTML = `<tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>`;
  const ionById = new Map(state.ions.map((ion) => [ion.id, ion]));
  const cations = state.ions.filter((ion) => ion.type === "cation").map((ion) => ({ value: ion.id, label: `${ion.id} (${ion.name})` }));
  const anions = state.ions.filter((ion) => ion.type === "anion").map((ion) => ({ value: ion.id, label: `${ion.id} (${ion.name})` }));
  const visible = state.compounds.map((item, index) => ({ item, index })).filter(({ item }) => matchesFilters(item));
  elements.compoundsTable.tBodies[0].innerHTML = visible.map(({ item: compound, index }) => `<tr>
    <td>${input({ value: compound.id, field: "id", index })}</td>
    <td>${select({ value: compound.cation, field: "cation", index, options: cations })}</td>
    <td>${select({ value: compound.anion, field: "anion", index, options: anions })}</td>
    <td>${input({ value: compound.formula ?? "", field: "formula", index })}</td>
    <td>${input({ value: compound.name, field: "name", index })}</td>
    <td class="category-cell">${CATEGORY_LABELS[compoundCategory(compound, ionById)] ?? "—"}</td>
    <td>${select({ value: compound.chemistryClass ?? "", field: "chemistryClass", index, options: [{ value: "", label: "通常" }, { value: "complex", label: "錯塩" }] })}</td>
    <td>${select({ value: compound.curriculumLevel ?? "", field: "curriculumLevel", index, options: [{ value: "", label: "—" }, { value: "standard", label: "標準" }, { value: "advanced", label: "発展" }] })}</td>
    <td>${select({ value: compound.difficulty ?? "", field: "difficulty", index, options: [{ value: "", label: "両方" }, { value: "normal", label: "やさしめ" }, { value: "hard", label: "ややむず" }] })}</td>
    <td>${input({ value: compound.referenceUrl ?? "", field: "referenceUrl", index, type: "url" })}</td>
    <td>${input({ value: aliasesText(compound), field: "acceptedFormulaVariants", index })}</td>
    <td>${input({ value: compound.solidColor ?? "", field: "solidColor", index })}</td>
    <td>${input({ value: compound.solidColorNote ?? "", field: "solidColorNote", index })}</td>
    ${["ionsToFormula", "ionsToName", "ionNamesToFormula", "ionNamesToName"].map((mode) => `<td class="check-cell">${input({ type: "checkbox", field: `questionModes.${mode}`, index, checked: compound.questionModes?.[mode] })}</td>`).join("")}
    <td class="check-cell">${input({ type: "checkbox", field: "enabled", index, checked: compound.enabled })}</td>
    <td class="action-cell"><button type="button" data-action="duplicate" data-index="${index}">複製</button><button class="delete-row" type="button" data-action="delete" data-index="${index}">削除</button></td>
  </tr>`).join("");
  elements.rowCount.textContent = `${visible.length} / ${state.compounds.length}件`;
}

function percentLabel(weights) {
  const sum = Object.values(weights).reduce((total, value) => total + Number(value || 0), 0);
  if (!sum) return "合計0：出題できません";
  return Object.entries(weights).map(([key, value]) => `${key} ${(Number(value) / sum * 100).toFixed(0)}%`).join(" ／ ");
}

function weightBlock(domain, title) {
  const labels = domain === "ion"
    ? { ionSimple: "単原子", ionPolyatomic: "多原子", ionVariableOx: "酸化数区別" }
    : { simple11: "simple11", simpleRatio: "simpleRatio", polyatomic: "polyatomic", variableOx: "variableOx" };
  const difficulties = { normal: "やさしめ", hard: "ややむず" };
  return `<section class="difficulty-block"><h2>${title}</h2><p>0は完全除外です。合計値ではなく相対的な重みとして扱います。</p>
    <div class="weight-grid" style="grid-template-columns:140px repeat(${Object.keys(labels).length}, minmax(100px, 1fr))">
      <span class="heading">難易度</span>${Object.values(labels).map((label) => `<span class="heading">${label}</span>`).join("")}
      ${Object.entries(difficulties).map(([difficulty, label]) => {
        const weights = state.difficulty.categoryWeights[domain][difficulty];
        return `<strong>${label}</strong>${Object.keys(labels).map((key) => `<label>${key}<input type="number" min="0" step="1" data-scope="category" data-domain="${domain}" data-difficulty="${difficulty}" data-key="${key}" value="${weights[key]}"></label>`).join("")}<span></span><span class="ratio-preview" style="grid-column: span ${Object.keys(labels).length}">${percentLabel(weights)}</span>`;
      }).join("")}
    </div>
  </section>`;
}

function renderDifficulty() {
  const variantBlocks = Object.entries(state.difficulty.variantWeights).map(([practiceType, weights]) => `
    <div class="weight-grid" style="margin-top:12px;grid-template-columns:140px repeat(${Object.keys(weights).length}, minmax(130px, 1fr))">
      <strong>${PRACTICE_TYPE_LABELS[practiceType] ?? practiceType}</strong>${Object.entries(weights).map(([key, value]) => `<label>${key}<input type="number" min="0" step="1" data-scope="variant" data-practice-type="${practiceType}" data-key="${key}" value="${value}"></label>`).join("")}
      <span></span><span class="ratio-preview" style="grid-column:span ${Object.keys(weights).length}">${percentLabel(weights)}</span>
    </div>`).join("");
  elements.difficultyEditor.innerHTML = `${weightBlock("ion", "イオン：カテゴリ比率")}${weightBlock("compound", "化合物：カテゴリ比率")}
    <section class="difficulty-block"><h2>出題タイプ比率</h2><p>0は完全除外です。ランダムで出された問題は、実際の出題形式ごとに苦手履歴を共有します。</p>${variantBlocks}</section>
    <section class="difficulty-block"><h2>苦手問題</h2><p>履歴は「問題ID＋実際の出題形式」ごとに端末へ保存します。</p>
      <div class="weight-grid">
        <strong>10問セット</strong><label>目標数<input type="number" min="0" max="10" step="1" data-scope="weak" data-key="ten" value="${state.difficulty.weakQuestionTarget.ten}"></label>
        <strong>エンドレス</strong><label>10問あたり<input type="number" min="0" max="10" step="1" data-scope="weak" data-key="endlessPerTen" value="${state.difficulty.weakQuestionTarget.endlessPerTen}"></label>
      </div>
    </section>`;
}

function renderActive() {
  elements.ionsPanel.hidden = activeTab !== "ions";
  elements.compoundsPanel.hidden = activeTab !== "compounds";
  elements.difficultyPanel.hidden = activeTab !== "difficulty";
  elements.listControls.hidden = activeTab === "difficulty";
  for (const button of elements.tabs.querySelectorAll("button")) button.classList.toggle("active", button.dataset.tab === activeTab);
  if (activeTab === "ions") renderIons();
  else if (activeTab === "compounds") renderCompounds();
  else renderDifficulty();
}

function scheduleValidation() {
  clearTimeout(validationTimer);
  validationTimer = setTimeout(validateAndShow, 180);
}

function validateAndShow() {
  const result = validateData(state.ions, state.compounds, state.difficulty);
  elements.validation.className = `validation-panel ${result.valid ? "valid" : "invalid"}`;
  const headline = result.valid ? "✓ データ検証に合格しました。" : `✕ ${result.errors.length}件のエラーがあります。`;
  const errors = result.errors.length ? `<ul>${result.errors.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>` : "";
  const warnings = result.warnings.length ? `<div class="validation-warning"><strong>確認事項 ${result.warnings.length}件</strong><ul>${result.warnings.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul></div>` : "";
  elements.validation.innerHTML = `<strong>${headline}</strong>${errors}${warnings}`;
  return result;
}

function parseAliases(value) {
  return value.split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [formula, ...note] = entry.split("|");
    return { formula: formula.trim(), note: note.join("|").trim() || null };
  });
}

function tableChange(event) {
  const control = event.target.closest("[data-index][data-field]");
  if (!control) return;
  const collection = activeTab === "ions" ? state.ions : state.compounds;
  const item = collection[Number(control.dataset.index)];
  const field = control.dataset.field;
  let value = control.type === "checkbox" ? control.checked : control.value;
  if (control.type === "number") value = Number(value);
  if (["formula", "solidColor", "solidColorNote"].includes(field) && value === "") value = null;
  if (["difficulty", "compoundPromptDisplay", "referenceUrl", "chemistryClass", "curriculumLevel"].includes(field) && value === "") {
    delete item[field];
    showStatus("未保存の変更があります。");
    scheduleValidation();
    return;
  }
  if (field === "acceptedFormulaVariants") {
    const aliases = parseAliases(value ?? "");
    if (aliases.length) item.acceptedFormulaVariants = aliases;
    else delete item.acceptedFormulaVariants;
  } else if (field.startsWith("questionModes.")) {
    item.questionModes[field.split(".")[1]] = value;
  } else {
    item[field] = value;
  }
  showStatus("未保存の変更があります。");
  if (activeTab === "compounds" && ["cation", "anion"].includes(field)) renderCompounds();
  scheduleValidation();
}

function tableAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const collection = activeTab === "ions" ? state.ions : state.compounds;
  const index = Number(button.dataset.index);
  if (button.dataset.action === "duplicate") {
    const duplicate = clone(collection[index]);
    duplicate.id = `${duplicate.id}_copy`;
    collection.splice(index + 1, 0, duplicate);
  } else if (button.dataset.action === "delete") {
    if (!confirm(`「${collection[index].id}」を編集データから削除しますか？`)) return;
    collection.splice(index, 1);
  }
  showStatus("未保存の変更があります。");
  renderActive();
  scheduleValidation();
}

function addRow() {
  if (activeTab === "ions") {
    state.ions.push({ id: "new_ion", formula: "X", charge: 1, name: "新しいイオン", type: "cation", atomicity: "monatomic", requiresOxidationNumeral: false, enabled: false });
  } else if (activeTab === "compounds") {
    const cation = state.ions.find((ion) => ion.type === "cation")?.id ?? "";
    const anion = state.ions.find((ion) => ion.type === "anion")?.id ?? "";
    state.compounds.push({ id: "new_compound", cation, anion, formula: null, name: "新しい化合物", solidColor: null, solidColorNote: null, enabled: false, questionModes: { ionsToFormula: false, ionsToName: false, ionNamesToFormula: false, ionNamesToName: false } });
  }
  renderActive();
  showStatus("末尾に行を追加しました。IDを変更してください。");
  scheduleValidation();
}

function difficultyChange(event) {
  const inputElement = event.target.closest("input[data-scope]");
  if (!inputElement) return;
  const value = Number(inputElement.value);
  if (inputElement.dataset.scope === "category") {
    state.difficulty.categoryWeights[inputElement.dataset.domain][inputElement.dataset.difficulty][inputElement.dataset.key] = value;
  } else if (inputElement.dataset.scope === "variant") {
    state.difficulty.variantWeights[inputElement.dataset.practiceType][inputElement.dataset.key] = value;
  } else {
    state.difficulty.weakQuestionTarget[inputElement.dataset.key] = value;
  }
  showStatus("未保存の変更があります。");
  renderDifficulty();
  scheduleValidation();
}

function download(filename, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function importJson(file) {
  try {
    const value = JSON.parse(await file.text());
    if (!Array.isArray(value.ions) || !Array.isArray(value.compounds) || !value.difficulty?.variantWeights || !value.difficulty?.categoryWeights || !value.difficulty?.weakQuestionTarget) throw new Error("Bundle Export形式（ions・compounds・difficulty）が必要です。");
    const candidate = normalizeBundle(migrateBundle(value, pack));
    const check = validateData(candidate.ions, candidate.compounds, candidate.difficulty);
    if (!check.valid) throw new Error(`検証エラー ${check.errors.length}件：${check.errors[0]}`);
    state = candidate;
    renderActive();
    validateAndShow();
    showStatus("JSONを読み込みました。保存前に内容を確認してください。");
  } catch (error) {
    showStatus(`Import失敗：${error.message}`, true);
  } finally {
    elements.importFile.value = "";
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  elements.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    activeTab = button.dataset.tab;
    renderActive();
  });
  elements.search.addEventListener("input", renderActive);
  elements.searchFields.addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-field]");
    if (!button) return;
    searchField = button.dataset.searchField;
    for (const option of elements.searchFields.querySelectorAll("button")) option.setAttribute("aria-pressed", String(option === button));
    elements.search.placeholder = { id: "idで検索", formula: "式で検索", name: "名称で検索" }[searchField];
    renderActive();
  });
  elements.enabledFilter.addEventListener("change", renderActive);
  elements.addRow.addEventListener("click", addRow);
  elements.ionsTable.addEventListener("change", tableChange);
  elements.compoundsTable.addEventListener("change", tableChange);
  elements.ionsTable.addEventListener("click", tableAction);
  elements.compoundsTable.addEventListener("click", tableAction);
  elements.difficultyEditor.addEventListener("change", difficultyChange);
  elements.validateButton.addEventListener("click", validateAndShow);
  elements.saveLocal.addEventListener("click", () => {
    let candidate;
    try { candidate = normalizeBundle(migrateBundle(state, pack)); }
    catch (error) { showStatus(`移行エラー：${error.message}。衝突するIDを変更してから保存してください。`, true); return; }
    const validation = validateData(candidate.ions, candidate.compounds, candidate.difficulty);
    if (!validation.valid) {
      validateAndShow();
      showStatus("検証エラーを直してから保存してください。", true);
      return;
    }
    try {
      const original = readOverride();
      if (original) persistMigration(original, candidate);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      state = candidate;
      renderActive();
      validateAndShow();
      showStatus("この端末内へ保存しました。学習画面にも反映されます。");
    } catch {
      showStatus("ブラウザの保存領域へ書き込めませんでした。", true);
    }
  });
  elements.resetLocal.addEventListener("click", () => {
    if (!confirm("端末内の編集内容を破棄して、公開中のJSONへ戻しますか？")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { showStatus("保存データを削除できませんでした。", true); return; }
    state = clone(publishedData);
    renderActive();
    validateAndShow();
    showStatus("公開中のJSONへ戻しました。端末内の編集内容は削除されました。");
  });
  elements.exportBundle.addEventListener("click", () => download("ionic-formula-data.json", { ...state, version: 2 }));
  elements.exportCurrent.addEventListener("click", () => {
    if (activeTab === "ions") download("ions.json", state.ions);
    else if (activeTab === "compounds") download("compounds.json", state.compounds);
    else download("difficulty.json", state.difficulty);
  });
  elements.importFile.addEventListener("change", () => {
    const [file] = elements.importFile.files;
    if (file) importJson(file);
  });
}

async function initialize() {
  bindEvents();
  try {
    const [ions, compounds, difficulty, chemistryPack] = await Promise.all([
      fetchJson("data/ions.json"), fetchJson("data/compounds.json"), fetchJson("data/difficulty.json"), fetchJson("data/complex-chemistry.json"),
    ]);
    pack = chemistryPack;
    publishedData = normalizeBundle(composePublishedBundle({ ions, compounds, difficulty }, pack));
    const override = readOverride();
    let candidate;
    let migrationError = null;
    if (override) {
      try { candidate = normalizeBundle(migrateBundle(override.bundle, pack)); }
      catch (error) {
        if (!String(error.message).includes("ID衝突")) throw error;
        migrationError = error;
        candidate = normalizeBundle(override.bundle);
      }
    } else candidate = clone(publishedData);
    const validation = validateData(candidate.ions, candidate.compounds, candidate.difficulty);
    let migrationSaveError = false;
    if (override && validation.valid && !migrationError) {
      try { persistMigration(override, candidate); } catch { migrationSaveError = true; }
    }
    state = candidate;
    renderActive();
    validateAndShow();
    if (override) {
      if (migrationError) showStatus(`移行エラー：${migrationError.message}。衝突するIDを変更してから保存してください。`, true);
      else if (migrationSaveError) showStatus("移行データを保存できませんでした。元の保存データは残っています。", true);
      else showStatus(validation.valid ? "この端末に保存された編集データを表示しています。" : "保存データに検証エラーがあります。修正後に保存してください。", !validation.valid);
    }
  } catch (error) {
    elements.validation.className = "validation-panel invalid";
    elements.validation.textContent = `読み込み失敗：${error.message}`;
  }
}

function lockEditor() {
  elements.editor.hidden = true;
  elements.lockScreen.hidden = false;
  elements.unlockForm.reset();
  elements.changePasswordForm.reset();
  elements.unlockStatus.textContent = "";
  elements.changePasswordStatus.textContent = "";
  elements.unlockPassword.focus();
}

elements.unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.unlockStatus.textContent = "";
  try {
    const record = currentPasswordRecord(localStorage, INITIAL_PASSWORD_RECORD);
    if (!await verifyPassword(elements.unlockPassword.value, record)) {
      elements.unlockStatus.textContent = "パスワードが違います。";
      return;
    }
    elements.unlockForm.reset();
    elements.lockScreen.hidden = true;
    elements.editor.hidden = false;
    if (!state) await initialize();
  } catch {
    elements.unlockStatus.textContent = "認証設定を読み込めませんでした。";
  }
});

elements.lockButton.addEventListener("click", lockEditor);
elements.changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.changePasswordStatus.textContent = "";
  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const confirmation = document.getElementById("confirm-password").value;
  try {
    await changeAdminPassword(current, next, confirmation, { storage: localStorage, initialRecord: INITIAL_PASSWORD_RECORD });
    lockEditor();
    elements.unlockStatus.textContent = "パスワードを変更しました。新しいパスワードで解錠してください。";
  } catch (error) {
    elements.changePasswordStatus.textContent = error.message;
  }
});
