# Question Profile Port Implementation Plan

> Execution: superpowers:executing-plans, inline in the current clean feature checkout. User explicitly requested implementation and publication after approving the presented direction.

**Goal:** コンペと同じ簡潔な管理UIと出題設定を静的学習アプリに移植する。
**Architecture:** 純粋なプロファイル/カタログ・保存移行モジュールを作り、既存出題エンジンへプロファイル経由の抽選を追加する。管理画面を設定専用に置き換え、補足情報を別JSONへ移す。
**Tech Stack:** Vanilla JS ES modules, HTML/CSS, Node test, Playwright MCP, GitHub Pages.
**Spec:** ../specs/2026-10-04-question-profile-port.md

## Global Constraints
- 学習履歴・元のローカル教材・パスワードを保持する。
- 46イオン/192化合物の一覧、normal/hard/both/off、錯体10%/20%初期値。
- 静的配信、既存採点/学習機能、教材の化学的検証を維持する。

## Review Focus
- イオン単独offと化合物参照が混同されないこと。
- 保存失敗・不正Importで元データが失われないこと。
- 錯体/通常の候補不足と解答形式制約で空問題を開始しないこと。
- カテゴリ重み0と明示的再有効化が表示/出題で一致すること。
- 管理画面から戻った学習ページが最新設定を読み込むこと。

### Task 1: Profile and persistence
Files: js/question-profile.js, js/profile-storage.js, data/question-profile.json, tests/question-profile.test.mjs.
Interfaces: questionProfileCatalog(bundle); validateQuestionProfile(raw,catalog); itemDifficulty(item,overrides); profileCandidates(bundle,profile,domain,level,complexEnabled); loadQuestionProfile(storage,published,bundle,legacyPack).
- [x] Write/run failing tests for catalog, four states, validation, migration and failed storage.
- [x] Implement pure functions and default profile.
- [x] Run focused tests and full suite.

### Task 2: Quiz integration and data separation
Files: js/core.js, js/app.js, data/chemistry-metadata.json, data/compounds.json, data/complex-chemistry.json, tests/profile-rounds.test.mjs.
Interfaces: builders accept questionProfile; return original round shape with quota-aware candidates and existing grading.
- [x] Write/run failing tests for independent compound membership, quotas, zero weights, insufficient pools and all three round routes.
- [x] Integrate partitioned profile rounds through existing selection, load profile on every new session; move metadata and preserve validation coverage.
- [x] Run full suite.

### Task 3: Admin UI and publication
Files: admin.html, admin.css, js/admin.js, service-worker.js, README.md, verification document.
Interfaces: existing admin lock, profile import/export/local persistence, same profile used by quizzes.
- [x] Replace table editor with profile tabs, accessible toggles, filters, ratio/candidate previews, save/reset/import/export/backup export.
- [x] Verify local mobile/desktop flows with Playwright and Node full suite.
- [ ] Review change, update release/cache identifiers, commit and publish through Pages.
- [ ] Verify deployed flows and CI/deployment status.
