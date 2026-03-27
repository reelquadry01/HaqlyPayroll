import type { DashboardData } from '@shared/api'
import { formatNaira } from '@shared/money'

import { StatCard } from '../components/shared'

export function DashboardPage({ data }: { data: DashboardData }) {
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
