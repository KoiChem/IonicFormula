import { compoundCategory, validateData } from "./core.js";

const STORAGE_KEY = "ionicFormula.adminData.v1";
const CATEGORY_LABELS = {
  simple11: "simple11",
  simpleRatio: "simpleRatio",
  polyatomic: "polyatomic",
  variableOx: "variableOx",
};

const elements = {
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
let state;
let activeTab = "ions";
let validationTimer;

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

function readOverride() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
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
  const needle = elements.search.value.trim().toLowerCase();
  const enabled = elements.enabledFilter.value;
  if (enabled === "enabled" && !item.enabled) return false;
  if (enabled === "disabled" && item.enabled) return false;
  return !needle || JSON.stringify(item).toLowerCase().includes(needle);
}

function renderIons() {
  const headers = ["id", "式", "電荷", "名称", "種類", "原子数", "酸化数", "有効", "操作"];
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
    <td class="check-cell">${input({ type: "checkbox", field: "enabled", index, checked: ion.enabled })}</td>
    <td class="action-cell"><button type="button" data-action="duplicate" data-index="${index}">複製</button><button class="delete-row" type="button" data-action="delete" data-index="${index}">削除</button></td>
  </tr>`).join("");
  elements.rowCount.textContent = `${visible.length} / ${state.ions.length}件`;
}

function aliasesText(compound) {
  return (compound.acceptedFormulaVariants ?? []).map((entry) => `${entry.formula}|${entry.note ?? ""}`).join(" ; ");
}

function renderCompounds() {
  const headers = ["id", "陽イオン", "陰イオン", "組成式", "名称", "自動カテゴリ", "別表記 formula|注記", "固体色", "色注記", "名→式", "式→名", "イオン→式", "イオン→名", "有効", "操作"];
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
    <td>${input({ value: aliasesText(compound), field: "acceptedFormulaVariants", index })}</td>
    <td>${input({ value: compound.solidColor ?? "", field: "solidColor", index })}</td>
    <td>${input({ value: compound.solidColorNote ?? "", field: "solidColorNote", index })}</td>
    ${["nameToFormula", "formulaToName", "ionsToFormula", "ionsToName"].map((mode) => `<td class="check-cell">${input({ type: "checkbox", field: `questionModes.${mode}`, index, checked: compound.questionModes?.[mode] })}</td>`).join("")}
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
  const difficulties = { easy: "やさしい", standard: "標準", hard: "難しい" };
  return `<section class="difficulty-block"><h2>${title}</h2><p>0は完全除外です。合計値ではなく相対的な重みとして扱います。</p>
    <div class="weight-grid" style="grid-template-columns:140px repeat(${Object.keys(labels).length}, minmax(100px, 1fr))">
      <span class="heading">難易度</span>${Object.values(labels).map((label) => `<span class="heading">${label}</span>`).join("")}
      ${Object.entries(difficulties).map(([difficulty, label]) => {
        const weights = state.difficulty.categoryWeights[domain][difficulty];
        return `<strong>${label}</strong>${Object.keys(labels).map((key) => `<label>${key}<input type="number" min="0" step="1" data-scope="category" data-domain="${domain}" data-difficulty="${difficulty}" data-key="${key}" value="${weights[key]}"></label>`).join("")}<span></span><span class="ratio-preview" style="grid-column: span ${Object.keys(labels).length}">${percentLabel(weights)}</span>`;
      }).join("")}
    </div>
    ${domain === "ion" ? '<div class="hard-warning">現在のvariableOxは4件です。10問・難しいの設定0：4：6は、重複を避けるため実際には0：6：4へ再配分されます。</div>' : ""}
  </section>`;
}

function renderDifficulty() {
  const ionVariants = state.difficulty.variantWeights.ion;
  const compoundVariants = state.difficulty.variantWeights.compound;
  elements.difficultyEditor.innerHTML = `${weightBlock("ion", "イオン：カテゴリ比率")}${weightBlock("compound", "化合物：カテゴリ比率")}
    <section class="difficulty-block"><h2>出題タイプ比率</h2><p>同じ問題IDは、別の出題タイプでも同一セット・周回内に重複させません。</p>
      <div class="weight-grid" style="grid-template-columns:140px repeat(${Object.keys(ionVariants).length}, minmax(130px, 1fr))">
        <strong>イオン</strong>${Object.entries(ionVariants).map(([key, value]) => `<label>${key}<input type="number" min="0" step="1" data-scope="variant" data-domain="ion" data-key="${key}" value="${value}"></label>`).join("")}
        <span></span><span class="ratio-preview" style="grid-column:span ${Object.keys(ionVariants).length}">${percentLabel(ionVariants)}</span>
      </div>
      <div class="weight-grid" style="margin-top:12px;grid-template-columns:140px repeat(${Object.keys(compoundVariants).length}, minmax(130px, 1fr))">
        <strong>化合物</strong>${Object.entries(compoundVariants).map(([key, value]) => `<label>${key}<input type="number" min="0" step="1" data-scope="variant" data-domain="compound" data-key="${key}" value="${value}"></label>`).join("")}
        <span></span><span class="ratio-preview" style="grid-column:span ${Object.keys(compoundVariants).length}">${percentLabel(compoundVariants)}</span>
      </div>
    </section>
    <section class="difficulty-block"><h2>苦手問題</h2><p>履歴は「モード＋問題ID＋出題タイプ」ごとに端末へ保存します。</p>
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
    state.compounds.push({ id: "new_compound", cation, anion, formula: null, name: "新しい化合物", solidColor: null, solidColorNote: null, enabled: false, questionModes: { nameToFormula: false, formulaToName: false, ionsToFormula: false, ionsToName: false } });
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
    state.difficulty.variantWeights[inputElement.dataset.domain][inputElement.dataset.key] = value;
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
    if (!value.ions || !value.compounds || !value.difficulty) throw new Error("Bundle Export形式（ions・compounds・difficulty）が必要です。");
    state = { ions: value.ions, compounds: value.compounds, difficulty: value.difficulty };
    renderActive();
    const validation = validateAndShow();
    showStatus(validation.valid ? "JSONを読み込みました。保存前に内容を確認してください。" : "JSONを読み込みましたが、検証エラーがあります。", !validation.valid);
  } catch (error) {
    showStatus(`Import失敗：${error.message}`, true);
  } finally {
    elements.importFile.value = "";
  }
}

function bindEvents() {
  elements.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    activeTab = button.dataset.tab;
    renderActive();
  });
  elements.search.addEventListener("input", renderActive);
  elements.enabledFilter.addEventListener("change", renderActive);
  elements.addRow.addEventListener("click", addRow);
  elements.ionsTable.addEventListener("change", tableChange);
  elements.compoundsTable.addEventListener("change", tableChange);
  elements.ionsTable.addEventListener("click", tableAction);
  elements.compoundsTable.addEventListener("click", tableAction);
  elements.difficultyEditor.addEventListener("change", difficultyChange);
  elements.validateButton.addEventListener("click", validateAndShow);
  elements.saveLocal.addEventListener("click", () => {
    const validation = validateAndShow();
    if (!validation.valid) {
      showStatus("検証エラーを直してから保存してください。", true);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      showStatus("この端末内へ保存しました。学習画面にも反映されます。");
    } catch {
      showStatus("ブラウザの保存領域へ書き込めませんでした。", true);
    }
  });
  elements.resetLocal.addEventListener("click", () => {
    if (!confirm("端末内の編集内容を破棄して、公開中のJSONへ戻しますか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = clone(publishedData);
    renderActive();
    validateAndShow();
    showStatus("公開中のJSONへ戻しました。端末内の編集内容は削除されました。");
  });
  elements.exportBundle.addEventListener("click", () => download("ionic-formula-data.json", { version: 1, ...state }));
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
    const [ions, compounds, difficulty] = await Promise.all([
      fetchJson("data/ions.json"), fetchJson("data/compounds.json"), fetchJson("data/difficulty.json"),
    ]);
    publishedData = { ions, compounds, difficulty };
    const override = readOverride();
    state = override?.ions && override?.compounds && override?.difficulty ? override : clone(publishedData);
    renderActive();
    validateAndShow();
    if (override) showStatus("この端末に保存された編集データを表示しています。");
  } catch (error) {
    elements.validation.className = "validation-panel invalid";
    elements.validation.textContent = `読み込み失敗：${error.message}`;
  }
}

initialize();
