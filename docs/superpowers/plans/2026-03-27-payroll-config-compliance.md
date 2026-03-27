# Payroll Configuration And Compliance Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employee types and company payroll settings, and upgrade the UI into clearer earnings/deductions and compliance/tax workspaces.

**Architecture:** Persist company-specific payroll settings in a dedicated settings table and expose them through the existing Electron service layer. Extend employee records with employee type, then update the renderer to surface these controls in employee management and compliance pages.

**Tech Stack:** Electron, React, TypeScript, SQLite, Vitest, Testing Library

---

### Task 1: Add failing tests for configuration and compliance behavior

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\services\serviceFacade.integration.test.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\App.test.tsx`

- [ ] **Step 1: Add a service test for employee type persistence**
- [ ] **Step 2: Add a service test for company payroll settings updates**
- [ ] **Step 3: Add a renderer test for the new setup navigation labels**
- [ ] **Step 4: Add a renderer test for saving compliance settings**
- [ ] **Step 5: Run targeted tests and confirm they fail**

### Task 2: Extend the local data model and service layer

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\db\context.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\shared\types.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\shared\api.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\services\serviceFacade.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\index.ts`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\main\preload.ts`

- [ ] **Step 1: Add safe schema setup for `employee_type` and `company_payroll_settings`**
- [ ] **Step 2: Seed default payroll settings for demo companies**
- [ ] **Step 3: Extend employee contracts to include employee type**
- [ ] **Step 4: Add `companies.getSettings` and `companies.updateSettings`**
- [ ] **Step 5: Extend compliance data to include settings and policy summaries**
- [ ] **Step 6: Run service tests and confirm they pass**

### Task 3: Upgrade the renderer workspaces

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\App.tsx`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\components\appShell.tsx`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\EmployeesPage.tsx`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\pages\CompliancePage.tsx`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\src\renderer\src\styles\app.css`

- [ ] **Step 1: Rename nav labels to `Earnings & Deductions` and `Compliance & Tax`**
- [ ] **Step 2: Add employee type fields to create and edit flows**
- [ ] **Step 3: Add a compliance settings editor bound to the company settings API**
- [ ] **Step 4: Show active tax and deduction policy summary in the compliance workspace**
- [ ] **Step 5: Run renderer tests and confirm they pass**

### Task 4: Full verification and completion

**Files:**
- Modify: `C:\Users\USER\Documents\Haqly Payroll\docs\superpowers\specs\2026-03-27-payroll-config-compliance-design.md`
- Modify: `C:\Users\USER\Documents\Haqly Payroll\docs\superpowers\plans\2026-03-27-payroll-config-compliance.md`

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Review the final diff**
- [ ] **Step 4: Commit the slice**
- [ ] **Step 5: Push the branch**
