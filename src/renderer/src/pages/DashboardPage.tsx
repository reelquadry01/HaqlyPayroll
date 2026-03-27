import type { DashboardData } from '@shared/api'
import { formatNaira } from '@shared/money'

import { StatCard } from '../components/shared'

export function DashboardPage({ data }: { data: DashboardData }) {
  const postingReadiness = data.postingReadiness ?? {
    blockingCount: 0,
    warningCount: 0,
    journalExportReady: false,
    bankExportReady: false,
    summary: 'Validate and finalize payroll to confirm posting readiness.'
  }
  const liabilities = data.liabilities ?? {
    payePayable: data.payeTotal,
    pensionPayable: 0,
    nhfPayable: 0,
    netPayable: data.netPay
  }

  return (
    <section className="page-grid">
      <article className="hero-card">
        <p className="section-label">Monthly Payroll Status</p>
        <h2>{String(data.payrollStatus).replace('_', ' ').toUpperCase()}</h2>
        <div className="stat-grid">
          <StatCard label="Gross Salary" value={formatNaira(data.grossPay)} />
          <StatCard label="Net Pay" value={formatNaira(data.netPay)} />
          <StatCard label="Employee Count" value={String(data.employeeCount)} />
          <StatCard label="Total Tax (PAYE)" value={formatNaira(data.payeTotal)} />
        </div>
      </article>
      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Posting Readiness</p>
            <h3>Finance control check</h3>
          </div>
          <span className={`pill ${postingReadiness.bankExportReady ? 'valid' : 'warning'}`}>
            {postingReadiness.bankExportReady ? 'export ready' : 'action needed'}
          </span>
        </div>
        <div className="stat-grid compact-stat-grid">
          <StatCard label="Blocking Issues" value={String(postingReadiness.blockingCount)} />
          <StatCard label="Warnings" value={String(postingReadiness.warningCount)} />
          <StatCard label="PAYE Liability" value={formatNaira(liabilities.payePayable)} />
          <StatCard label="Pension Liability" value={formatNaira(liabilities.pensionPayable)} />
          <StatCard label="NHF Liability" value={formatNaira(liabilities.nhfPayable)} />
          <StatCard label="Bank Liability" value={formatNaira(liabilities.netPayable)} />
        </div>
        <p className="muted">{postingReadiness.summary}</p>
      </article>
      <article className="surface-card">
        <p className="section-label">Pending Tasks</p>
        {data.pendingTasks.map((task) => (
          <div key={task.id} className="task-card">
            <strong>{task.title}</strong>
            <p className="muted">{task.detail}</p>
          </div>
        ))}
      </article>
      <article className="surface-card">
        <p className="section-label">Compliance Tracker</p>
        {data.compliance.map((schedule) => (
          <div key={schedule.type} className="row-line">
            <strong>{schedule.type.toUpperCase()}</strong>
            <span>{schedule.dueDate}</span>
            <span className={`pill ${schedule.status}`}>{schedule.status.replace('_', ' ')}</span>
          </div>
        ))}
      </article>
      <article className="surface-card">
        <p className="section-label">System Audit Log</p>
        {data.auditLog.map((item, index) => (
          <div key={`${item.action}-${index}`} className="audit-item">
            <strong>{item.action}</strong>
            <span>{new Date(item.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </article>
    </section>
  )
}
