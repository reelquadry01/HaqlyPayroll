import { useState } from 'react'

import type { EmployeeRecord, LoanCreateInput, LoanRecord, LoanStatus } from '@shared/api'
import { formatNaira } from '@shared/money'

import { StatCard } from '../components/shared'

function createLoanDraft(employees: EmployeeRecord[]): LoanCreateInput {
  return {
    employeeId: employees[0]?.id ?? '',
    type: 'staff_loan',
    principal: 250_000,
    monthlyDeduction: 50_000,
    repaymentMethod: 'flat',
    startDate: '2026-05-01',
    endDate: '2026-10-31',
    interestOption: 'none'
  }
}

export function LoansPage({
  loans,
  employees,
  onCreate,
  onUpdateStatus
}: {
  loans: LoanRecord[]
  employees: EmployeeRecord[]
  onCreate: (payload: LoanCreateInput) => Promise<void>
  onUpdateStatus: (loanId: string, status: LoanStatus) => Promise<void>
}) {
  const [draft, setDraft] = useState<LoanCreateInput>(() => createLoanDraft(employees))
  const [saving, setSaving] = useState(false)
  const totalOutstanding = loans.reduce((sum, loan) => sum + loan.balance, 0)

  async function handleSubmit() {
    setSaving(true)
    try {
      await onCreate(draft)
      setDraft(createLoanDraft(employees))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-grid employee-layout">
      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Loan Desk</p>
            <h3>Create staff loans and advances</h3>
          </div>
          <span className="pill due_soon">{loans.length} live facilities</span>
        </div>

        <div className="stat-grid compact-stat-grid">
          <StatCard label="Live Loans" value={String(loans.length)} />
          <StatCard label="Outstanding Balance" value={formatNaira(totalOutstanding)} />
          <StatCard label="Avg Deduction" value={formatNaira(loans.length ? totalOutstanding / Math.max(loans.length * 3, 1) : 0)} />
        </div>

        <div className="editor-grid">
          <label>
            Loan Employee
            <select aria-label="Loan Employee" value={draft.employeeId} onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })}>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.fullName}</option>
              ))}
            </select>
          </label>
          <label>
            Facility Type
            <select aria-label="Facility Type" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as LoanCreateInput['type'] })}>
              <option value="staff_loan">Staff Loan</option>
              <option value="salary_advance">Salary Advance</option>
            </select>
          </label>
          <label>
            Loan Principal
            <input aria-label="Loan Principal" type="number" value={draft.principal} onChange={(event) => setDraft({ ...draft, principal: Number(event.target.value) })} />
          </label>
          <label>
            Monthly Deduction
            <input aria-label="Monthly Deduction" type="number" value={draft.monthlyDeduction} onChange={(event) => setDraft({ ...draft, monthlyDeduction: Number(event.target.value) })} />
          </label>
          <label>
            Start Date
            <input aria-label="Loan Start Date" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
          </label>
          <label>
            End Date
            <input aria-label="Loan End Date" type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} />
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Create Loan'}
          </button>
        </div>
      </article>

      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Live Loan Book</p>
            <h3>Recoveries and statuses</h3>
          </div>
        </div>

        {loans.map((loan) => (
          <div key={loan.id} className="table-row loan-row">
            <div>
              <strong>{loan.employeeName}</strong>
              <p className="muted">{loan.type.replace('_', ' ')}</p>
            </div>
            <span>{formatNaira(loan.balance)}</span>
            <span>{formatNaira(loan.monthlyDeduction)}</span>
            <span className={`pill ${loan.status === 'active' ? 'valid' : loan.status === 'settled' ? 'remitted' : 'due_soon'}`}>{loan.status}</span>
            <div className="button-row inline-button-row">
              {loan.status === 'active' ? <button className="secondary-button" onClick={() => onUpdateStatus(loan.id, 'paused')}>Pause</button> : null}
              {loan.status === 'paused' ? <button className="secondary-button" onClick={() => onUpdateStatus(loan.id, 'active')}>Resume</button> : null}
              {loan.status !== 'settled' ? <button className="secondary-button" onClick={() => onUpdateStatus(loan.id, 'settled')}>Settle</button> : null}
            </div>
          </div>
        ))}
      </article>
    </section>
  )
}
