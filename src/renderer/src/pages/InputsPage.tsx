import { useEffect, useState } from 'react'

import type { EmployeeRecord, InputCenterData, PayrollInputImportInput, PayrollInputSaveInput, StructureData } from '@shared/api'
import { formatNaira } from '@shared/money'

import { StatCard } from '../components/shared'

function createInputDraft(
  payPeriod: string,
  employees: EmployeeRecord[],
  components: StructureData['components'],
  previous?: PayrollInputSaveInput
): PayrollInputSaveInput {
  const manualComponents = components.filter((component) => !component.recurring || component.kind === 'deduction')
  return {
    employeeId: previous?.employeeId ?? employees[0]?.id ?? '',
    payPeriod,
    componentCode: previous?.componentCode ?? manualComponents[0]?.code ?? 'BONUS',
    amount: 0,
    sourcePeriod: previous?.sourcePeriod ?? payPeriod
  }
}

export function InputsPage({
  payPeriod,
  inputs,
  employees,
  components,
  onSave,
  onImport
}: {
  payPeriod: string
  inputs: InputCenterData
  employees: EmployeeRecord[]
  components: StructureData['components']
  onSave: (payload: PayrollInputSaveInput) => Promise<void>
  onImport: (payload: PayrollInputImportInput) => Promise<void>
}) {
  const manualComponents = components.filter((component) => !component.recurring || component.kind === 'deduction')
  const [draft, setDraft] = useState<PayrollInputSaveInput>(() => createInputDraft(payPeriod, employees, components))
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [batchDraft, setBatchDraft] = useState<PayrollInputImportInput>({
    payPeriod,
    sourceFile: 'bonus-template.csv',
    csvText: 'employeeCode,componentCode,amount,sourcePeriod'
  })
  const totalInputValue = inputs.lines.reduce((sum, line) => sum + Number(line.amount), 0)

  useEffect(() => {
    setDraft(createInputDraft(payPeriod, employees, components))
    setBatchDraft((current) => ({ ...current, payPeriod }))
  }, [components, employees, payPeriod])

  async function handleSubmit() {
    setSaving(true)
    try {
      await onSave({
        ...draft,
        amount: Number(draft.amount)
      })
      setDraft(createInputDraft(payPeriod, employees, components, draft))
    } finally {
      setSaving(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    try {
      await onImport(batchDraft)
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="page-grid employee-layout">
      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Manual Input Entry</p>
            <h3>Post variable payroll items</h3>
          </div>
          <span className="pill due_soon">{inputs.lines.length} active lines</span>
        </div>

        <div className="stat-grid compact-stat-grid">
          <StatCard label="Variable Items" value={String(inputs.lines.length)} />
          <StatCard label="Input Value" value={formatNaira(totalInputValue)} />
          <StatCard label="Batch Imports" value={String(inputs.batches.length)} />
        </div>

        <div className="editor-grid">
          <label>
            Employee
            <select aria-label="Employee" value={draft.employeeId} onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })}>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.fullName}</option>
              ))}
            </select>
          </label>
          <label>
            Component
            <select aria-label="Component" value={draft.componentCode} onChange={(event) => setDraft({ ...draft, componentCode: event.target.value })}>
              {manualComponents.map((component) => (
                <option key={component.code} value={component.code}>{component.name}</option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input aria-label="Amount" type="number" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} />
          </label>
          <label>
            Source Period
            <input aria-label="Source Period" value={draft.sourcePeriod ?? ''} onChange={(event) => setDraft({ ...draft, sourcePeriod: event.target.value })} />
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save Input'}
          </button>
          <button className="secondary-button" onClick={() => setDraft(createInputDraft(payPeriod, employees, components, draft))}>
            Reset Form
          </button>
        </div>

        <div className="section-header">
          <div>
            <p className="section-label">Batch Import</p>
            <h3>Paste reusable CSV templates</h3>
          </div>
        </div>

        <div className="editor-grid">
          <label>
            Batch Source File
            <input aria-label="Batch Source File" value={batchDraft.sourceFile} onChange={(event) => setBatchDraft({ ...batchDraft, sourceFile: event.target.value })} />
          </label>
          <label>
            Template Hint
            <input aria-label="Template Hint" value="employeeCode,componentCode,amount,sourcePeriod" readOnly />
          </label>
        </div>

        <label className="textarea-label">
          Batch CSV
          <textarea
            aria-label="Batch CSV"
            value={batchDraft.csvText}
            onChange={(event) => setBatchDraft({ ...batchDraft, csvText: event.target.value })}
          />
        </label>

        <div className="button-row">
          <button className="primary-button" disabled={importing} onClick={handleImport}>
            {importing ? 'Importing…' : 'Import Batch'}
          </button>
        </div>
      </article>

      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Variable Payroll Inputs</p>
            <h3>Live run adjustments</h3>
          </div>
        </div>

        {inputs.lines.map((line, index) => {
          const employee = employees.find((candidate) => candidate.id === line.employeeId)
          const component = components.find((candidate) => candidate.code === line.componentCode)
          return (
            <div key={`${String(line.employeeId)}-${index}`} className="table-row">
              <div>
                <strong>{employee?.fullName ?? String(line.employeeId)}</strong>
                <p className="muted">{component?.name ?? String(line.componentCode)}</p>
              </div>
              <span>{line.sourcePeriod ?? 'current period'}</span>
              <span>{formatNaira(Number(line.amount))}</span>
              <span className={`pill ${String(line.validationStatus) === 'valid' ? 'remitted' : 'overdue'}`}>{String(line.validationStatus)}</span>
            </div>
          )
        })}

        <div>
          <p className="section-label">Import Batches</p>
          {inputs.batches.map((batch) => (
            <div key={batch.id} className="table-row">
              <div>
                <strong>{batch.sourceFile}</strong>
                <p className="muted">{new Date(batch.createdAt).toLocaleString()}</p>
              </div>
              <span className={`pill ${batch.status === 'validated' ? 'remitted' : 'overdue'}`}>{batch.status}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
