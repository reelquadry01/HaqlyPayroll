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
  onValidate,
  onApprove,
  onFinalize,
  onPost,
  onSubmitForReview
}: {
  run: PayrollRunDetail
  selectedEmployeeId: string | null
  onSelectEmployee: (employeeId: string) => void
  selectedEmployee?: PayrollRunDetail['snapshot']['employees'][number]
  role: AuthSession['role']
  onValidate: () => void
  onApprove: () => void
  onFinalize: () => void
  onPost: () => void
  onSubmitForReview: () => void
}) {
  const canValidate = run.status === 'draft' && (role === 'admin' || role === 'payroll_officer')
  const canSubmitForReview = run.status === 'validated' && (role === 'admin' || role === 'payroll_officer')
  const canApprove = run.status === 'in_review' && (role === 'admin' || role === 'approver')
  const canFinalize = run.status === 'approved' && (role === 'admin' || role === 'approver')
  const canPost = run.status === 'finalized' && (role === 'admin' || role === 'approver')
  const activeStepByStatus: Record<PayrollRunDetail['status'], number> = {
    draft: 0,
    validated: 1,
    in_review: 2,
    approved: 3,
    finalized: 4,
    posted: 5,
    reversed: 0
  }

  return (
    <section className="page-grid payroll-layout">
      <article className="surface-card">
        <p className="section-label">Payroll Review</p>
        <div className="wizard-strip">
          {['Draft', 'Validate', 'Review', 'Approve', 'Finalize', 'Post'].map((step, index) => (
            <div key={step} className={index <= activeStepByStatus[run.status] ? 'wizard-step active' : 'wizard-step'}>
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
          {canValidate ? (
            <button className="primary-button" onClick={onValidate}>
              Validate Payroll
            </button>
          ) : null}
          {canSubmitForReview ? (
            <button className="primary-button" onClick={onSubmitForReview}>
              Send to Review
            </button>
          ) : null}
          {canApprove ? (
            <button className="primary-button" onClick={onApprove}>
              Approve Payroll
            </button>
          ) : null}
          {canFinalize ? (
            <button className="primary-button" onClick={onFinalize}>
              Finalize Payroll
            </button>
          ) : null}
          {canPost ? (
            <button className="primary-button" onClick={onPost}>
              Post Payroll
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
        <div>
          <p className="section-label">Validation Exceptions</p>
          <div className="stat-grid compact-stat-grid">
            <StatCard label="Blocking Issues" value={String(run.validation.blockingCount)} />
            <StatCard label="Warnings" value={String(run.validation.warningCount)} />
            <StatCard label="Current Status" value={run.status.replaceAll('_', ' ')} />
          </div>
          <div className="exception-list">
            {run.validation.exceptions.map((exception) => (
              <div key={`${exception.code}-${exception.employeeId ?? exception.title}`} className="exception-card">
                <div className="row-line exception-row">
                  <strong>{exception.title}</strong>
                  <span className={`pill ${exception.severity}`}>{exception.severity}</span>
                </div>
                <p className="muted">
                  {exception.employeeName ? `${exception.employeeName}: ` : ''}
                  {exception.detail}
                </p>
              </div>
            ))}
            {run.validation.exceptions.length === 0 ? (
              <div className="empty-state">
                <strong>No current validation exceptions.</strong>
                <p className="muted">This payroll run is clear for finance review and posting checks.</p>
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <p className="section-label">Posting Summary</p>
          <div className="stat-grid">
            <StatCard label="Salary Expense" value={formatNaira(run.postingSummary.salaryExpense)} />
            <StatCard label="Employer Pension" value={formatNaira(run.postingSummary.employerPensionExpense)} />
            <StatCard label="PAYE Payable" value={formatNaira(run.postingSummary.payePayable)} />
            <StatCard label="Pension Payable" value={formatNaira(run.postingSummary.pensionPayable)} />
            <StatCard label="NHF Payable" value={formatNaira(run.postingSummary.nhfPayable)} />
            <StatCard label="Bank Credit" value={formatNaira(run.postingSummary.netPayable)} />
            <StatCard label="Total Credits" value={formatNaira(run.postingSummary.totalCredits)} />
          </div>
        </div>
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
