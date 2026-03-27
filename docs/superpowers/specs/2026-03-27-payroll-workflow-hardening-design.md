# Payroll Workflow Hardening Design

## Goal

Align HAQLY Payroll with a finance-grade control model by extending payroll runs from a simple review flow into a full lifecycle:

- `draft`
- `validated`
- `in_review`
- `approved`
- `finalized`
- `posted`

The workflow must surface validation exceptions before finance sign-off, preserve immutable approved snapshots, and expose accounting-oriented posting totals directly inside the payroll workspace.

## Scope

This slice adds:

- lifecycle states for validation, finalization, and posting
- exception detection for missing statutory/master-data issues and blocking pay issues
- posting summary totals for salary expense, statutory liabilities, and bank credit
- Electron IPC methods for the new transitions
- renderer controls and status visibility for the hardened workflow

This slice does not add:

- reversal workflows
- threshold-based routing logic
- scheduled payroll automation
- accounting system sync

## Service Design

The main-process service layer remains the source of truth for workflow transitions.

### Validation

Validation is owned by payroll operations (`admin`, `payroll_officer`) and moves a run from `draft` to `validated`.

Validation computes:

- warning exceptions
  - missing TIN
  - missing RSA
- blocking exceptions
  - missing bank details
  - zero or negative net pay

Validation stores no separate table in this slice. Instead, exceptions are derived from the frozen snapshot plus current employee master data whenever the run is read.

### Review and Approval

Only validated runs can move into review. Only `admin` and `approver` users can approve from `in_review`.

### Finalization and Posting

Finalization is the finance gate between approval and posting. A run can only be finalized when:

- it is already `approved`
- it has no blocking validation exceptions

Posting moves a finalized run to `posted` and records an audit trail with the posting summary.

## Posting Summary

Each run exposes a finance-facing summary derived from the snapshot and company payroll settings:

- salary expense
- employer pension expense
- PAYE payable
- pension payable
- NHF payable
- net pay payable
- total credits

These values are intended for operator review and export alignment, not yet for live ERP posting.

## UI Design

The payroll workspace shows the full lifecycle as a six-step strip:

1. Draft
2. Validate
3. Review
4. Approve
5. Finalize
6. Post

The primary action shown depends on both run status and user role.

The page also includes:

- variance vs prior period
- validation exception cards with severity pills
- posting summary stat cards
- employee drill-down for earnings, deductions, and band breakdown

## Testing

Coverage for this slice should prove:

- service lifecycle transitions work end to end
- finalization is blocked when blocking exceptions exist
- run details include validation and posting data
- renderer actions appear for the correct statuses and roles
- renderer shows validation exceptions and posting summary content
