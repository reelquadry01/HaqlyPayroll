# HAQLY UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove leftover placeholder branding, add real employee/component creation workflows, and split the renderer shell into focused modules that support richer app development.

**Architecture:** Keep Electron services and the payroll engine intact while extending the API with create operations for employees and salary components. Refactor the renderer into smaller files so the shell, shared UI, and screen-specific workflows are easier to evolve.

**Tech Stack:** Electron, React, TypeScript, SQLite, Vitest, Testing Library

---

### Task 1: Write the failing tests for the new workflows

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\App.test.tsx`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\services\serviceFacade.integration.test.ts`

- [ ] **Step 1: Add a renderer test that asserts HAQLY-only branding**
- [ ] **Step 2: Add a renderer test for creating an employee from the employee workspace**
- [ ] **Step 3: Add a renderer test for creating a salary component from the structures workspace**
- [ ] **Step 4: Add service integration tests for `employees.create` and `structures.create`**
- [ ] **Step 5: Run targeted tests and confirm they fail for the missing behavior**

### Task 2: Add service and IPC support for creation flows

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\shared\api.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\shared\types.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\services\serviceFacade.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\index.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\preload.ts`

- [ ] **Step 1: Add typed input contracts for employee and component creation**
- [ ] **Step 2: Implement `employees.create` with audit logging and company scoping**
- [ ] **Step 3: Implement `structures.create` with validation and audit logging**
- [ ] **Step 4: Expose the new service methods over IPC and preload**
- [ ] **Step 5: Run the affected service tests and confirm they pass**

### Task 3: Refactor the renderer and add the new UI flows

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\App.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\components\appShell.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\components\shared.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\EmployeesPage.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\StructuresPage.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\DashboardPage.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\InputsPage.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\LoansPage.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\PayrollPage.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\ReportsPage.tsx`
- Create: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\CompliancePage.tsx`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\styles\app.css`

- [ ] **Step 1: Move shared shell and notice/layout pieces out of `App.tsx`**
- [ ] **Step 2: Replace all remaining `Sovereign Ledger` references with HAQLY-only copy**
- [ ] **Step 3: Add a create-employee panel and wire it to the new API**
- [ ] **Step 4: Add a create-component panel and wire it to the new API**
- [ ] **Step 5: Keep report/export feedback explicit and preserve existing flows**
- [ ] **Step 6: Run the renderer tests and confirm the new flows pass**

### Task 4: Full verification and branch completion

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\docs\superpowers\specs\2026-03-27-haqly-ui-foundation-design.md`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\docs\superpowers\plans\2026-03-27-haqly-ui-foundation.md`

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Review the diff for coherence**
- [ ] **Step 4: Commit with a focused message**
- [ ] **Step 5: Push the branch**
