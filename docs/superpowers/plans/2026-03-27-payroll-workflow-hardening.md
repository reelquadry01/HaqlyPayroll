# Payroll Workflow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden HAQLY Payroll into a finance-grade payroll lifecycle with validation, finalization, posting, and visible exception/accounting summaries.

**Architecture:** Keep all workflow enforcement inside the Electron main-process service layer and expose the state to the renderer via typed shared contracts. Treat validation and posting summaries as derived run metadata so approved snapshots remain the frozen payroll source while finance checks stay reproducible.

**Tech Stack:** Electron, React, TypeScript, SQLite, Vitest

---

### Task 1: Extend Shared Payroll Contracts

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/api.ts`
- Test: `src/main/services/serviceFacade.integration.test.ts`
- Test: `src/renderer/src/App.test.tsx`

- [ ] Add the new lifecycle states and validation/posting summary interfaces.
- [ ] Expose typed transition methods for `validate`, `finalize`, and `post`.
- [ ] Run the focused tests to confirm they fail before service implementation.

### Task 2: Add Service-Level Workflow Hardening

**Files:**
- Modify: `src/main/services/serviceFacade.ts`
- Modify: `src/main/engine/payrollEngine.ts`
- Test: `src/main/services/serviceFacade.integration.test.ts`

- [ ] Implement derived validation exception helpers.
- [ ] Implement posting summary helper logic from snapshot and company settings.
- [ ] Add `validate`, `finalize`, and `post` service methods with role checks and status guards.
- [ ] Tighten `submitForReview` to require a validated run.
- [ ] Run the service integration suite and keep it green.

### Task 3: Wire Electron IPC

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/preload.ts`
- Test: `src/renderer/src/App.test.tsx`

- [ ] Add IPC handlers for the new payroll lifecycle actions.
- [ ] Extend the preload bridge to expose the methods to the renderer.
- [ ] Re-run the renderer suite to confirm it still fails only on missing UI behavior.

### Task 4: Upgrade the Payroll Workspace UI

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/pages/PayrollPage.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `src/renderer/src/App.test.tsx`

- [ ] Add app-level handlers for validate/finalize/post transitions.
- [ ] Replace the old review-only payroll action bar with status-aware lifecycle actions.
- [ ] Render validation exceptions and posting summary cards on the payroll page.
- [ ] Update styling for the extended wizard and exception cards.
- [ ] Run the renderer suite and keep it green.

### Task 5: Verify, Build, and Ship

**Files:**
- Modify: `docs/superpowers/specs/2026-03-27-payroll-workflow-hardening-design.md`
- Modify: `docs/superpowers/plans/2026-03-27-payroll-workflow-hardening.md`

- [ ] Run `npm test`
- [ ] Run `npm run build`
- [ ] Review git diff for only the intended workflow-hardening slice.
- [ ] Commit with a focused message describing payroll workflow hardening.
