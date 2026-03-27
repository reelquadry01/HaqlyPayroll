import type { PayrollRunDetail, ReportData } from '@shared/api'

export function ReportsPage({
  reports,
  payrollRun,
  onExport,
  onRevealPath
}: {
  reports: ReportData
  payrollRun: PayrollRunDetail
  onExport: (kind: 'journal' | 'bank' | 'payslip') => Promise<void>
  onRevealPath: (filePath: string) => Promise<void>
}) {
  return (
    <section className="page-grid">
      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Export Center</p>
            <h3>{payrollRun.payPeriod} outputs</h3>
          </div>
          <span className="pill due_soon">{payrollRun.snapshot.employees.length} payslips</span>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => onExport('journal')}>Journal CSV</button>
          <button className="secondary-button" onClick={() => onExport('bank')}>Bank XLSX</button>
          <button className="secondary-button" onClick={() => onExport('payslip')}>Payslip PDF</button>
        </div>
      </article>
      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Recent Export Jobs</p>
            <h3>Latest files</h3>
          </div>
        </div>
        {reports.exportJobs.length ? (
          reports.exportJobs.map((job) => (
            <div key={job.id} className="table-row export-row">
              <div>
                <strong>{job.type}</strong>
                <p className="muted">{job.filePath}</p>
              </div>
              <div className="button-row">
                <span className="muted">{new Date(job.createdAt).toLocaleString()}</span>
                <button className="secondary-button" onClick={() => onRevealPath(job.filePath)}>Reveal file</button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No exports yet</strong>
            <p className="muted">Generate a journal, bank schedule, or payslip file to populate this center.</p>
          </div>
        )}
      </article>
    </section>
  )
}
