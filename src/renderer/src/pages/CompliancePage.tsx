import type { ComplianceData } from '@shared/api'

export function CompliancePage({ compliance }: { compliance: ComplianceData }) {
  return (
    <section className="page-grid">
      <article className="surface-card">
        <p className="section-label">Remittance Schedules</p>
        {compliance.schedules.map((schedule) => (
          <div key={schedule.type} className="table-row">
            <strong>{schedule.type.toUpperCase()}</strong>
            <span>{schedule.reference}</span>
            <span>{schedule.dueDate}</span>
            <span className={`pill ${schedule.status}`}>{schedule.status.replace('_', ' ')}</span>
          </div>
        ))}
      </article>
      <article className="surface-card">
        <p className="section-label">Exceptions</p>
        {compliance.exceptions.missingTin.map((employee) => (
          <div key={employee.employeeCode} className="row-line">
            <span>{employee.fullName}</span>
            <strong>Missing TIN</strong>
          </div>
        ))}
      </article>
    </section>
  )
}
