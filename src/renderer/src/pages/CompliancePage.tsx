import { useEffect, useState } from 'react'

import type { CompanyPayrollSettings, ComplianceData } from '@shared/api'

export function CompliancePage({
  compliance,
  onSaveSettings
}: {
  compliance: ComplianceData
  onSaveSettings: (payload: CompanyPayrollSettings) => Promise<void>
}) {
  const [draft, setDraft] = useState<CompanyPayrollSettings>(compliance.settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(compliance.settings)
  }, [compliance])

  async function handleSave() {
    setSaving(true)
    try {
      await onSaveSettings(draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-grid employee-layout">
      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Compliance Monitoring</p>
            <h3>Remittances and exceptions</h3>
          </div>
          <span className="pill due_soon">{compliance.schedules.length} live schedules</span>
        </div>
        {compliance.schedules.map((schedule) => (
          <div key={schedule.type} className="table-row">
            <strong>{schedule.type.toUpperCase()}</strong>
            <span>{schedule.reference}</span>
            <span>{schedule.dueDate}</span>
            <span className={`pill ${schedule.status}`}>{schedule.status.replace('_', ' ')}</span>
          </div>
        ))}

        <div>
          <p className="section-label">Exceptions</p>
          {compliance.exceptions.missingTin.map((employee) => (
            <div key={employee.employeeCode} className="row-line">
              <span>{employee.fullName}</span>
              <strong>Missing TIN</strong>
            </div>
          ))}
          {compliance.exceptions.missingRsa.map((employee) => (
            <div key={employee.employeeCode} className="row-line">
              <span>{employee.fullName}</span>
              <strong>Missing RSA</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Company Payroll Settings</p>
            <h3>Statutory and approval controls</h3>
          </div>
          <span className="pill valid">{compliance.policySummary.code}</span>
        </div>

        <div className="editor-grid">
          <label>
            Default Working Days
            <input aria-label="Default Working Days" type="number" value={draft.defaultWorkingDays} onChange={(event) => setDraft({ ...draft, defaultWorkingDays: Number(event.target.value) })} />
          </label>
          <label>
            Validation Policy
            <select aria-label="Validation Policy" value={draft.validationPolicy} onChange={(event) => setDraft({ ...draft, validationPolicy: event.target.value as CompanyPayrollSettings['validationPolicy'] })}>
              <option value="strict">Strict</option>
              <option value="balanced">Balanced</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label>
            Approval Policy
            <select aria-label="Approval Policy" value={draft.approvalPolicy} onChange={(event) => setDraft({ ...draft, approvalPolicy: event.target.value as CompanyPayrollSettings['approvalPolicy'] })}>
              <option value="review_then_approve">Review then approve</option>
              <option value="approve_direct">Approve direct</option>
            </select>
          </label>
          <label>
            Employee Pension Rate
            <input aria-label="Employee Pension Rate" type="number" step="0.1" value={draft.employeePensionRate} onChange={(event) => setDraft({ ...draft, employeePensionRate: Number(event.target.value) })} />
          </label>
          <label>
            Employer Pension Rate
            <input aria-label="Employer Pension Rate" type="number" step="0.1" value={draft.employerPensionRate} onChange={(event) => setDraft({ ...draft, employerPensionRate: Number(event.target.value) })} />
          </label>
          <label>
            NHF Rate
            <input aria-label="NHF Rate" type="number" step="0.1" value={draft.nhfRate} onChange={(event) => setDraft({ ...draft, nhfRate: Number(event.target.value) })} />
          </label>
          <label>
            NSITF Rate
            <input aria-label="NSITF Rate" type="number" step="0.1" value={draft.nsitfRate} onChange={(event) => setDraft({ ...draft, nsitfRate: Number(event.target.value) })} />
          </label>
          <label>
            PAYE Remittance Day
            <input aria-label="PAYE Remittance Day" type="number" value={draft.payeRemittanceDay} onChange={(event) => setDraft({ ...draft, payeRemittanceDay: Number(event.target.value) })} />
          </label>
          <label>
            Pension Remittance Working Days
            <input aria-label="Pension Remittance Working Days" type="number" value={draft.pensionRemittanceWorkingDays} onChange={(event) => setDraft({ ...draft, pensionRemittanceWorkingDays: Number(event.target.value) })} />
          </label>
        </div>

        <div className="toggle-grid">
          <label className="toggle-card">
            <input aria-label="NHF Enabled" type="checkbox" checked={draft.nhfEnabled} onChange={(event) => setDraft({ ...draft, nhfEnabled: event.target.checked })} />
            <span>NHF enabled</span>
          </label>
          <label className="toggle-card">
            <input aria-label="NSITF Enabled" type="checkbox" checked={draft.nsitfEnabled} onChange={(event) => setDraft({ ...draft, nsitfEnabled: event.target.checked })} />
            <span>NSITF enabled</span>
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Compliance Settings'}
          </button>
        </div>

        <div>
          <p className="section-label">Active Tax Policy</p>
          <div className="row-line">
            <strong>{compliance.policySummary.name}</strong>
            <span>{compliance.policySummary.code}</span>
          </div>
          {compliance.policySummary.deductionRules.map((rule) => (
            <div key={rule} className="row-line">
              <span>{rule}</span>
              <strong>Active</strong>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
