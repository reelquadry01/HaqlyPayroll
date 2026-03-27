# HAQLY UI Foundation Design

## Scope

This design covers the next product slice for the HAQLY Payroll desktop app:

- remove all remaining "Sovereign Ledger" branding
- strengthen the app's HAQLY-first voice and presentation
- split the renderer shell into smaller focused modules
- add real create flows for employees and salary components
- improve export/report interaction feedback without changing the payroll engine architecture

The goal is to move the app from a demo-shaped shell toward a more operational payroll desktop product while preserving the current Electron, service, and IPC boundaries.

## Product Direction

The app should present itself only as HAQLY Payroll. User-facing copy should sound finance-ready, clear, and controlled. The UI should keep the existing navy/editorial aesthetic, but avoid references to any outside inspiration or placeholder naming.

This slice focuses on operator confidence:

- users should be able to create core records instead of only editing seeded data
- screens should feel more intentionally structured
- reports and exports should feel like part of a real workflow

## Architecture

The current renderer places the app shell and all major screens inside a single large `App.tsx` file. That slows product work and makes UI improvements harder to reason about. This slice will keep the existing React stack but split the renderer into focused modules:

- top-level app shell and session loading
- shared layout/presentational components
- page components for dashboard, employees, structures, inputs, loans, payroll, reports, and compliance

The service layer remains the source of truth. New create workflows should be added through typed IPC contracts:

- `employees.create`
- `structures.create`

The payroll and compliance engines remain unchanged except where fresh records must be readable by existing flows.

## Data and Behavior

### Employee Creation

Users should be able to create a payroll employee with the HR-lite fields already supported by the data model:

- employee code
- full name
- department
- branch
- role title
- hire date
- status
- bank details
- TIN
- RSA number

New employees should belong to the selected company, appear immediately in the employee register, and write an audit log entry.

### Salary Component Creation

Users should be able to create salary components directly from the structures workspace using the existing component model:

- code
- name
- category
- earning or deduction kind
- recurring flag
- taxable flag
- pensionable flag
- NHF applicable flag
- calculation basis
- GL code

New components should become available immediately in the structures catalog and, where appropriate, in downstream input workflows.

## UX Notes

This slice does not attempt a total redesign. Instead it improves operator flow with:

- clearer section headers and HAQLY-only copy
- dedicated create panels alongside list/editor views
- stronger report/export status messaging
- smaller renderer modules that are easier to continue polishing

## Testing

This work should be covered with:

- service integration tests for employee creation and component creation
- renderer tests for HAQLY-only branding and the new create flows
- fresh full verification with `npm test` and `npm run build`
