# Payroll Configuration And Compliance Setup Design

## Scope

This slice aligns HAQLY Payroll with the product blueprint by strengthening the configuration and compliance foundations without expanding into unrelated automation or posting features.

The work in scope is:

- introduce employee types as first-class payroll data
- add company payroll and statutory settings that are stored as configuration
- evolve the structures module into a clearer earnings and deductions setup workspace
- turn the compliance screen into a compliance and tax workspace with editable statutory settings and policy visibility

This keeps the app finance-oriented while preserving the existing offline-first Electron architecture.

## Product Intent

The app should behave more like a payroll control room than a seeded demo. Configuration should be explicit, editable, and traceable. Company-specific payroll rules should be visible in one place, and the user should be able to understand both the statutory setup and the remittance state from the same workspace.

## Data Model Changes

### Employee Types

Employees gain an `employeeType` field with these supported values:

- `full_time`
- `contract`
- `casual`
- `intern`
- `expat`

This value is stored in the local database, returned in employee records, and editable in both create and update flows.

### Company Payroll Settings

Add a dedicated company payroll settings record keyed by `companyId` instead of overloading the company row. This keeps the configuration extensible and avoids baking every future option into the company table.

The initial settings set should include:

- default working days
- validation policy
- approval policy
- employee pension rate
- employer pension rate
- NHF enabled flag
- NHF rate
- NSITF enabled flag
- NSITF rate
- PAYE remittance day
- pension remittance working-day window

These values are the editable, company-specific layer that sits beside the versioned tax policy.

## API And Service Shape

Add typed support for:

- `companies.getSettings(companyId)`
- `companies.updateSettings(companyId, payload, userId)`

Extend:

- `EmployeeRecord`
- `EmployeeCreateInput`
- `EmployeeUpdateInput`

to include `employeeType`.

Extend `ComplianceData` to return:

- remittance schedules
- statutory exceptions
- company payroll settings
- policy summary cards for tax and deduction rules

## UX Changes

### Navigation

Rename the existing setup-focused modules so they better match the product direction:

- `Structures` -> `Earnings & Deductions`
- `Compliance` -> `Compliance & Tax`

### Employees

Employee create and edit flows should include employee type so payroll admins can classify workers correctly.

### Compliance And Tax

The compliance workspace should now show:

- remittance schedules
- compliance exceptions
- editable statutory and payroll settings
- a compact summary of the active tax policy and deduction rules

This keeps policy visibility and company configuration together, while still allowing future expansion into filing and audit workflows.

## Migration Strategy

Because existing local databases may already exist, new schema must be added safely:

- create the new `company_payroll_settings` table if missing
- add `employee_type` to `employees` only when the column is absent
- backfill defaults for existing demo data

## Testing

Cover this slice with:

- service integration tests for employee type persistence and company settings updates
- renderer tests for navigation labels, employee type fields, and compliance settings save flow
- full `npm test` and `npm run build` verification
