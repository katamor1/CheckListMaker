# Electron Reference and Checklist Editors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reference registration, checklist editing, and complete nine-condition/four-scope forms to the Electron React GUI.

**Architecture:** Keep `App.tsx` as the session boundary and move immutable editing operations into pure TypeScript modules. React feature components receive complete domain values and emit replacement values, while all filesystem access continues through the existing preload bridge.

**Tech Stack:** TypeScript 5.9, React 19, Electron 41, Vitest 3, server-rendered component tests.

## Global Constraints

- Do not add runtime dependencies.
- Preserve `nodeIntegration: false`, context isolation, sandboxing, and offline-only behavior.
- Use the existing `DraftSynchronizer` and `SessionOperationQueue`; never bypass Main-process project ownership.
- Keep Japanese as the shipped UI language.
- Support keyboard-only operation and responsive layouts at 100%, 150%, and 200% scaling.
- IDs are generated and retired by helpers; users never edit IDs directly.

---

### Task 1: Reference editing model and form

**Files:**
- Create: `src/renderer/reference-editor-model.ts`
- Create: `src/renderer/ReferenceEditor.tsx`
- Test: `tests/reference-editor.test.ts`

**Interfaces:**
- Produces `appendSelectedReferences(project, documents)`, `updateReference(references, id, update)`, and `removeReference(references, id)`.
- `ReferenceEditor` consumes references and required roles and emits immutable replacements.

- [ ] Write failing tests for stable `REF-###` allocation, deterministic stored paths, metadata edits, removal, and rendered controls.
- [ ] Run `npm test -- tests/reference-editor.test.ts` and confirm failure because the feature modules do not exist.
- [ ] Implement the pure model helpers and form.
- [ ] Run the focused test and confirm it passes.

### Task 2: Checklist item and condition editing model

**Files:**
- Create: `src/renderer/checklist-editor-model.ts`
- Test: `tests/checklist-editor-model.test.ts`

**Interfaces:**
- Produces item and condition add/duplicate/move/remove/update helpers plus `createCondition`, `changeConditionType`, and `changeScopeType`.

- [ ] Write failing tests for ID allocation, deletion retirement, duplication, ordering, nine condition defaults, and four scope defaults.
- [ ] Run `npm test -- tests/checklist-editor-model.test.ts` and confirm failure.
- [ ] Implement the minimal immutable helpers.
- [ ] Run the focused test and confirm it passes.

### Task 3: Nine condition forms and checklist editor

**Files:**
- Create: `src/renderer/ConditionEditor.tsx`
- Create: `src/renderer/ChecklistEditor.tsx`
- Test: `tests/checklist-editor-form.test.ts`

**Interfaces:**
- `ConditionEditor` consumes one `ConditionDefinition`, reference options, and an update callback.
- `ChecklistEditor` consumes the full checklist and default policy and emits replacements.

- [ ] Write failing server-render tests that assert a visible form for every condition type and every scope type.
- [ ] Run `npm test -- tests/checklist-editor-form.test.ts` and confirm failure.
- [ ] Implement the shared scope form, type-specific forms, and item controls.
- [ ] Run the focused test and confirm it passes.

### Task 4: Integrate workspace tabs and reference selection

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Test: existing renderer and session tests plus the new feature tests.

**Interfaces:**
- `App.tsx` calls `selectReferences()` after flushing the draft, then commits `appendSelectedReferences` after the operation queue releases its block.
- Overview edits the project default repair policy; References and Checklist use the new components.

- [ ] Add focused assertions for the tab labels and safe import flow helpers where practical.
- [ ] Integrate components without changing IPC contracts.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.

### Task 5: Update documentation and verify CI

**Files:**
- Modify: `README.md`
- Modify: `docs/implementation/2026-07-15-electron-replatform-status.md`
- Modify: `docs/user-guide/samples-gui-demo.md`

- [ ] Remove the obsolete “GUI未実装” limitations and document the new tab locations.
- [ ] Push the branch and inspect Electron CI type-check, test, sample validation, and production build results.
- [ ] Keep PR #2 in draft until Windows manual acceptance is complete.
