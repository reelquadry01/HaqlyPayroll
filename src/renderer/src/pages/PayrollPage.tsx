import type { AuthSession, PayrollRunDetail } from '@shared/api'
import { formatNaira } from '@shared/money'

import { StatCard } from '../components/shared'

function formatSignedNaira(value: number): string {
  return `${value >= 0 ? '+' : '-'}${formatNaira(Math.abs(value))}`
}

function employeeName(employeeId: string | null): string {
  if (employeeId === 'emp-chidi') return 'Chidi Okoro'
  if (employeeId === 'emp-aisha') return 'Aisha Abubakar'
  return 'Femi Adebayo'
}

export function PayrollPage({
  run,
  selectedEmployeeId,
  onSelectEmployee,
  selectedEmployee,
  role,
  onApprove,
  onSubmitForReview
}: {
  run: PayrollRunDetail
  selectedEmployeeId: string | null
  onSelectEmployee: (employeeId: string) => void
  selectedEmployee?: PayrollRunDetail['snapshot']['employees'][number]
  role: AuthSession['role']
  onApprove: () => void
  onSubmitForReview: () => void
}) {
  const canSubmitForReview = run.status === 'draft' && (role === 'admin' || role === 'payroll_officer')
  const canApprove = run.status === 'in_review' && (role === 'admin' || role === 'approver')

  return (
    <section className="page-grid payroll-layout">
      <article className="surface-card">
        <p className="section-label">Payroll Review</p>
        <div className="wizard-strip">
          {['Draft', 'Review', 'Approve', 'Lock'].map((step, index) => (
            <div key={step} className={index === 1 ? 'wizard-step active' : 'wizard-step'}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
        {run.snapshot.employees.map((employee) => (
          <button
            key={employee.employeeId}
            className={employee.employeeId === selectedEmployeeId ? 'employee-tile selected' : 'employee-tile'}
            onClick={() => onSelectEmployee(employee.employeeId)}
          >
            <div>
              <strong>{employeeName(employee.employeeId)}</strong>
              <p className="muted">{formatNaira(employee.grossPay)} gross</p>
            </div>
            <span>{formatNaira(employee.netPay)}</span>
          </button>
        ))}
      </article>
      <article className="surface-card detail-card">
        <div className="row-line">
          <div>
            <p className="section-label">Employee Breakdown</p>
            <h3>{employeeName(selectedEmployeeId)}</h3>
          </div>
          {canSubmitForReview ? (
            <button className="primary-button" onClick={onSubmitForReview}>
              Send to Review
            </button>
          ) : null}
          {canApprove ? (
            <button className="primary-button" onClick={onApprove}>
              Approve &amp; Lock Payroll
            </button>
          ) : null}
        </div>
        {run.variance ? (
          <div>
            <p className="section-label">Variance vs {run.variance.previousPayPeriod}</p>
            <div className="stat-grid">
              <StatCard label="Gross Movement" value={formatSignedNaira(run.variance.grossPayDelta)} />
              <StatCard label="Net Movement" value={formatSignedNaira(run.variance.netPayDelta)} />
              <StatCard label="PAYE Movement" value={formatSignedNaira(run.variance.payeDelta)} />
            </div>
          </div>
        ) : null}
        <div className="detail-columns">
          <div>
            <p className="section-label">Earnings</p>
            {selectedEmployee?.recurringLines.concat(selectedEmployee.variableLines).map((line) => (
              <div key={`${line.code}-${line.amount}`} className="row-line">
                <span>{line.name}</span>
                <strong>{formatNaira(line.amount)}</strong>
              </div>
            ))}
          </div>
          <div>
            <p className="section-label">Statutory &amp; Deductions</p>
            {selectedEmployee?.deductionLines.map((line) => (
              <div key={`${line.code}-${line.amount}`} className="row-line">
                <span>{line.name}</span>
                <strong>{formatNaira(line.amount)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="section-label">Effective Tax Band</p>
          {selectedEmployee?.taxBreakdown.map((line) => (
            <div key={line.bandLabel} className="row-line">
              <span>{line.bandLabel}</span>
              <strong>{line.ratePercent}%</strong>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
