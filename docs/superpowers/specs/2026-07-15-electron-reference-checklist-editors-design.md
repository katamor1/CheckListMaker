# Electron Reference and Checklist Editors Design

- Status: approved for implementation by the 2026-07-15 GitHub request
- Target branch: `agent/replatform-electron`
- Target runtime: Windows 11 x64, Electron, React, TypeScript

## Goal

Complete the Electron renderer workflow so a user can register and describe reference documents, edit checklist items, and configure all nine condition types and all four scope types without editing JSON.

## Scope

This change adds:

- reference document selection through the existing restricted IPC bridge;
- reference metadata editing: title, purpose, authority level, priority, effective date, and role assignments;
- checklist metadata and project default repair-policy editing;
- check item add, duplicate, reorder, delete, and field editing;
- condition add, type change, reorder, delete, and typed editing for all nine MVP condition types;
- shared scope editing for entire document, section, table, and semantic locator;
- tests for immutable update helpers and server-rendered form coverage;
- updated status and user-guide text.

Standalone `.clmcheck` template workflow, recent projects, a first-run wizard, and visual drag-and-drop remain outside this change.

## Architecture

### Renderer boundaries

`App.tsx` remains the session owner. It keeps the current draft synchronization and operation queue, exposes project-level update callbacks, and renders three workspace tabs: Overview, References, and Checklist.

Feature code is split into focused modules:

- `reference-editor-model.ts`: converts selected documents into stable reference definitions and performs immutable reference updates.
- `ReferenceEditor.tsx`: renders reference metadata and role assignment controls.
- `checklist-editor-model.ts`: creates, duplicates, moves, retires, and updates checklist items and conditions.
- `ConditionEditor.tsx`: renders the shared scope editor and the nine type-specific forms.
- `ChecklistEditor.tsx`: renders checklist metadata, item controls, and condition collections.

The renderer never reads files directly. File selection stays behind `window.checklistMaker.selectReferences()` and the existing Main-process allowlist.

### Reference registration

The Main process returns registered `SelectedDocument` values with temporary stored paths. The renderer assigns the next available `REF-###` ID and rewrites each descriptor to `references/<ID>.<extension>` while preserving the opaque registry token. This gives deterministic archive paths without widening IPC authority.

Defaults are deliberately safe and editable:

- title: filename without extension;
- purpose: empty string;
- authority: `reference`;
- priority: `50`;
- no effective date or roles;
- read-only: always true.

### Checklist identity and retirement

New check item IDs use `CHK-####`; new condition IDs use `COND-##`. Deleted IDs are appended to the corresponding retired-ID set and are never reused. Duplicating an item allocates a fresh item ID and fresh IDs for every cloned condition. Reordering changes array order only.

### Condition forms

Each condition has a type selector, a shared scope editor, and only fields relevant to the selected type. Changing a condition type preserves its ID and scope but replaces type-specific data with safe defaults.

List-like fields use one value per line. Optional numeric and date values map an empty input to `undefined`, preserving exact optional-property semantics.

Pattern presets populate a deterministic regex; custom regex exposes the editable pattern field. Validation remains centralized in `src/shared/validation.ts`.

### Accessibility and layout

All controls have visible Japanese labels and stable `name` attributes. Reorder controls use explicit Up/Down buttons rather than drag-only interaction. Status is expressed in text, not color alone. Long item lists scroll and use `content-visibility` to reduce rendering cost.

## Error handling

- File-dialog cancellation makes no project change.
- Reference import errors continue through the existing user-safe IPC error boundary.
- A priority input outside 0–100 remains editable but is reported by preflight.
- Removing a reference does not silently remove its ID from cross-source conditions; preflight reports the dangling reference so the user can resolve it explicitly.
- Deleting the final condition is allowed in the editor, but preflight blocks save/export until at least one condition exists.

## Testing

Pure-model tests cover reference path assignment, immutable edits, ID retirement, duplication, ordering, type defaults, and scope changes. React server-render tests verify that reference metadata, all nine condition types, and all four scope types have concrete GUI controls. Existing session, persistence, package, and IPC tests must remain green.
