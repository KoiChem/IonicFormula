# Complex Ions Implementation Plan

> Agentic workers: use superpowers:subagent-driven-development for independent tasks, TDD and final review.

Goal: Implement and publish the approved IonicFormula complex chemistry and admin changes.
Architecture: A versioned JSON pack and pure chemistry/migration functions feed existing generation and UI. Admin authentication remains a local browser gate.
Tech Stack: native ES modules, JSON, node:test, Web Crypto, Playwright MCP, GitHub Pages.
Spec: docs/COMPLEX_IONS_SPEC_SOL_DRAFT.md (approved by the user's implementation/publication request).

## Constraints
- 17 ions and 38 compounds; standard enabled, advanced disabled; complex toggle initially off.
- Existing compound question modes, history and data edits preserved.
- Parenthesis up/down flick inserts corresponding square bracket regardless of toggle.
- Password is the user-specified initial value; local changes require current password.
- No changes to Competition; portable data/functions/fixtures for later migration.

## Review focus
- Legacy override migration must preserve removed/edited records and never repeat after migration.
- Fe(II) and Fe(III) share formula bodies but have different IDs/charges.
- Flick completion and following native click must insert exactly one character.
- Disabled references and malformed import must not overwrite stored data.
- New assets must be in the service worker and use aligned release versions.

## Tasks
### 1. Portable chemistry pack and data migration
Files: data/complex-chemistry.json, js/chemistry/complex-policy.js, js/chemistry/formula-syntax.js, js/data-migrations.js, tests/complex-chemistry.test.mjs.
Interfaces: isComplexItem(item, ionById), complexItemAllowed(item, enabled, ionById); formulaSyntaxValid(value, {allowCharge}); composePublishedBundle(base, pack); migrateBundle(bundle, pack) returns bundle or throws on ID conflict. Migration version and schema/content version in resulting bundle.
- [x] Write tests for catalog counts/charge/ID contracts, square bracket syntax, filtering and migration preservation/conflicts/repeated imports.
- [x] Run tests red, implement minimal pure functions and pack, run tests green.
### 2. Local admin gate and targeted search
Files: admin.html, admin.css, js/admin.js, js/admin-lock.js, js/admin-search.js, tests/admin.test.mjs.
Interfaces consumed: pack composition/migration and existing validateData. Local lock uses PBKDF2 and separate key; searchMatches(item, query, field) normalizes formula/name.
- [x] Write tests for password verification/change persistence and field-only search.
- [x] Run red, implement gate, change form, lock action, columns and migrated import/export/load, run green.
### 3. Generation and learning UI integration
Files: js/core.js, js/app.js, js/formula-keyboard-gesture.js, index.html, styles.css, tests/core.test.mjs, tests/complex-integration.test.mjs.
- [x] Add failing tests for OFF exclusion, ON eligibility, weak mode, neutral bracketed formulas, charge 4-, and bracket flick cancellation.
- [x] Integrate portable eligibility/migration, freeze session setting, label quiz/results, fixed name fragments and acid/old-name hints.
- [x] Extend existing gesture dispatch to parentheses and prevent duplicate click; preserve normal click and keyboard access.
- [x] Run all node tests.
### 4. Review, browser verification and release
Files: service-worker.js, all HTML/module release query strings, package.json, README.md, docs specifications.
- [x] Align cache and query versions and update app shell.
- [x] Independent whole-change review; address concrete findings.
- [x] Playwright: admin authentication/search/import/change, ion and compound flow, gestures, 320/390/768/desktop layouts, console/network.
- Release step: commit, push to main after verifying ancestry, verify GitHub Pages deployment status and deployed browser/assets. Results are reported in the release chat.

## Execution decisions
- User explicitly authorized implementation and publication; proceed without an additional plan-approval round.
- Work in the existing authorized checkout on codex/complex-ions. Uncommitted files are solely this chat's spec; filesystem boundary restricts other checkout locations. No user edits are discarded.
