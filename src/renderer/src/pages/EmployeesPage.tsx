import { useEffect, useState } from 'react'

import type {
  EmployeeCreateInput,
  EmployeePayAssignmentUpdateInput,
  EmployeeRecord,
  EmployeeUpdateInput
} from '@shared/api'

function createEmployeeDraft(employee: EmployeeRecord): EmployeeUpdateInput {
  return {
    fullName: employee.fullName,
    department: employee.department,
    branch: employee.branch,
    roleTitle: employee.roleTitle,
    employeeType: employee.employeeType,
    bankName: employee.bankName ?? '',
    accountNumber: employee.accountNumber ?? '',
    tin: employee.tin ?? '',
    rsaNumber: employee.rsaNumber ?? '',
    status: employee.status,
    annualRent: (employee as any).annualRent ?? 0
  }
}

function createEmployeeCreateDraft(): EmployeeCreateInput {
  return {
    employeeCode: '',
    fullName: '',
    department: '',
    branch: '',
    roleTitle: '',
    employeeType: 'full_time',
    hireDate: '',
    bankName: '',
    accountNumber: '',
    tin: '',
    rsaNumber: '',
    status: 'active',
    annualRent: 0
  }
}

function createAssignmentDrafts(employee: EmployeeRecord) {
  return employee.payAssignments.map((assignment) => ({
    componentCode: assignment.componentCode,
    amount: assignment.amount
  }))
}

export function EmployeesPage({
  employees,
  onSave,
  onSaveCompensation,
  onCreate
}: {
  employees: EmployeeRecord[]
  onSave: (employeeId: string, payload: EmployeeUpdateInput) => Promise<void>
  onSaveCompensation: (employeeId: string, payload: EmployeePayAssignmentUpdateInput[]) => Promise<void>
  onCreate: (payload: EmployeeCreateInput) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EmployeeUpdateInput | null>(employees[0] ? createEmployeeDraft(employees[0]) : null)
  const [saving, setSaving] = useState(false)
  const [assignmentDrafts, setAssignmentDrafts] = useState<EmployeePayAssignmentUpdateInput[]>(employees[0] ? createAssignmentDrafts(employees[0]) : [])
  const [savingCompensation, setSavingCompensation] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<EmployeeCreateInput>(createEmployeeCreateDraft())
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!employees.length) {
      setSelectedId(null)
      setEditingId(null)
      setDraft(null)
      return
    }

    if (!selectedId || !employees.find((employee) => employee.id === selectedId)) {
      setSelectedId(employees[0].id)
    }
  }, [employees, selectedId])

  const selectedEmployee = employees.find((employee) => employee.id === selectedId) ?? employees[0]
  const activeEmployee = employees.find((employee) => employee.id === editingId) ?? selectedEmployee

  useEffect(() => {
    if (activeEmployee) {
      setDraft(createEmployeeDraft(activeEmployee))
      setAssignmentDrafts(createAssignmentDrafts(activeEmployee))
    }
  }, [activeEmployee])

  if (!selectedEmployee || !draft) {
    return null
  }

  async function handleSubmit() {
    if (!activeEmployee) return
    setSaving(true)
    try {
      await onSave(activeEmployee.id, draft)
      setEditingId(activeEmployee.id)
      setSelectedId(activeEmployee.id)
    } finally {
      setSaving(false)
    }
  }

  async function handleCompensationSubmit() {
    if (!activeEmployee) return
    setSavingCompensation(true)
    try {
      await onSaveCompensation(activeEmployee.id, assignmentDrafts)
    } finally {
      setSavingCompensation(false)
    }
  }

  async function handleCreateSubmit() {
    setCreating(true)
    try {
      await onCreate(createDraft)
      setCreateDraft(createEmployeeCreateDraft())
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="page-grid employee-layout">
      <article className="surface-card">
        <div className="section-header">
          <div>
            <p className="section-label">Employee Register</p>
            <h3>Payroll directory</h3>
          </div>
          <div className="button-row">
            <span className="pill valid">{employees.length} employees</span>
            <button className="secondary-button" onClick={() => setShowCreate((current) => !current)}>
              New Employee
            </button>
          </div>
        </div>
        <div className="table-list">
          {employees.map((employee) => (
            <div key={employee.id} className={`table-row employee-row ${employee.id === selectedId ? 'selected' : ''}`}>
              <button className="employee-summary" onClick={() => setSelectedId(employee.id)}>
                <div>
                  <strong>{employee.fullName}</strong>
                  <p className="muted">{employee.employeeCode}</p>
                </div>
                <span>{employee.department}</span>
                <span>{employee.branch}</span>
                <span>{employee.roleTitle}</span>
              </button>
              <button
                className="secondary-button"
                aria-label={`Edit ${employee.fullName}`}
                onClick={() => {
                  setSelectedId(employee.id)
                  setEditingId(employee.id)
                  setDraft(createEmployeeDraft(employee))
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </article>

      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Employee Editor</p>
            <h3>{activeEmployee?.fullName ?? selectedEmployee.fullName}</h3>
          </div>
          <span className={`pill ${draft.status === 'active' ? 'valid' : 'overdue'}`}>{draft.status}</span>
        </div>

        <div className="editor-grid">
          <label>
            Full Name
            <input aria-label="Full Name" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} />
          </label>
          <label>
            Department
            <input aria-label="Department" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} />
          </label>
          <label>
            Branch
            <input aria-label="Branch" value={draft.branch} onChange={(event) => setDraft({ ...draft, branch: event.target.value })} />
          </label>
          <label>
            Role Title
            <input aria-label="Role Title" value={draft.roleTitle} onChange={(event) => setDraft({ ...draft, roleTitle: event.target.value })} />
          </label>
          <label>
            Employee Type
            <select aria-label="Employee Type" value={draft.employeeType} onChange={(event) => setDraft({ ...draft, employeeType: event.target.value as EmployeeCreateInput['employeeType'] })}>
              <option value="full_time">Full-time</option>
              <option value="contract">Contract</option>
              <option value="casual">Casual</option>
              <option value="intern">Intern</option>
              <option value="expat">Expat</option>
            </select>
          </label>
          <label>
            Bank Name
            <input aria-label="Bank Name" value={draft.bankName} onChange={(event) => setDraft({ ...draft, bankName: event.target.value })} />
          </label>
          <label>
            Account Number
            <input aria-label="Account Number" value={draft.accountNumber} onChange={(event) => setDraft({ ...draft, accountNumber: event.target.value })} />
          </label>
          <label>
            TIN
            <input aria-label="TIN" value={draft.tin} onChange={(event) => setDraft({ ...draft, tin: event.target.value })} />
          </label>
          <label>
            RSA Number
            <input aria-label="RSA Number" value={draft.rsaNumber} onChange={(event) => setDraft({ ...draft, rsaNumber: event.target.value })} />
          </label>
          <label>
            Status
            <select aria-label="Status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
            </select>
          </label>
          <label>
            Annual Rent (for Rent Relief)
            <input aria-label="Annual Rent" type="number" value={draft.annualRent} onChange={(event) => setDraft({ ...draft, annualRent: Number(event.target.value) })} />
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save Employee'}
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setEditingId(selectedEmployee.id)
              setDraft(createEmployeeDraft(selectedEmployee))
            }}
          >
            Reset
          </button>
        </div>

        <div className="section-header">
          <div>
            <p className="section-label">Recurring Compensation</p>
            <h3>Assigned payroll lines</h3>
          </div>
          <span className="pill valid">{assignmentDrafts.length} active lines</span>
        </div>

        <div className="table-list">
          {activeEmployee.payAssignments.map((assignment) => {
            const draftAssignment = assignmentDrafts.find((candidate) => candidate.componentCode === assignment.componentCode) ?? {
              componentCode: assignment.componentCode,
              amount: assignment.amount
            }

            return (
              <div key={assignment.componentCode} className="table-row">
                <div>
                  <strong>{assignment.componentName}</strong>
                  <p className="muted">{assignment.componentCode}</p>
                </div>
                <label className="amount-input-label">
                  <span className="sr-only">{`${assignment.componentName} Amount`}</span>
                  <input
                    aria-label={`${assignment.componentName} Amount`}
                    type="number"
                    value={draftAssignment.amount}
                    onChange={(event) => {
                      const amount = Number(event.target.value)
                      setAssignmentDrafts((current) =>
                        current.map((candidate) =>
                          candidate.componentCode === assignment.componentCode
                            ? { ...candidate, amount }
                            : candidate
                        )
                      )
                    }}
                  />
                </label>
                <span>{assignment.activeFrom}</span>
              </div>
            )
          })}
        </div>

        <div className="button-row">
          <button className="primary-button" disabled={savingCompensation} onClick={handleCompensationSubmit}>
            {savingCompensation ? 'Saving…' : 'Save Compensation'}
          </button>
          <button className="secondary-button" onClick={() => setAssignmentDrafts(createAssignmentDrafts(activeEmployee))}>
            Reset Compensation
          </button>
        </div>

        {showCreate ? (
          <div className="create-panel">
            <div className="section-header">
              <div>
                <p className="section-label">New Employee</p>
                <h3>Add a payroll-ready employee</h3>
              </div>
            </div>

            <div className="editor-grid">
              <label>
                Employee Code
                <input aria-label="New Employee Code" value={createDraft.employeeCode} onChange={(event) => setCreateDraft({ ...createDraft, employeeCode: event.target.value })} />
              </label>
              <label>
                Full Name
                <input aria-label="New Full Name" value={createDraft.fullName} onChange={(event) => setCreateDraft({ ...createDraft, fullName: event.target.value })} />
              </label>
              <label>
                Department
                <input aria-label="New Department" value={createDraft.department} onChange={(event) => setCreateDraft({ ...createDraft, department: event.target.value })} />
              </label>
              <label>
                Branch
                <input aria-label="New Branch" value={createDraft.branch} onChange={(event) => setCreateDraft({ ...createDraft, branch: event.target.value })} />
              </label>
              <label>
                Role Title
                <input aria-label="New Role Title" value={createDraft.roleTitle} onChange={(event) => setCreateDraft({ ...createDraft, roleTitle: event.target.value })} />
              </label>
              <label>
                Employee Type
                <select aria-label="New Employee Type" value={createDraft.employeeType} onChange={(event) => setCreateDraft({ ...createDraft, employeeType: event.target.value as EmployeeCreateInput['employeeType'] })}>
                  <option value="full_time">Full-time</option>
                  <option value="contract">Contract</option>
                  <option value="casual">Casual</option>
                  <option value="intern">Intern</option>
                  <option value="expat">Expat</option>
                </select>
              </label>
              <label>
                Hire Date
                <input aria-label="New Hire Date" type="date" value={createDraft.hireDate} onChange={(event) => setCreateDraft({ ...createDraft, hireDate: event.target.value })} />
              </label>
              <label>
                Bank Name
                <input aria-label="New Bank Name" value={createDraft.bankName} onChange={(event) => setCreateDraft({ ...createDraft, bankName: event.target.value })} />
              </label>
              <label>
                Account Number
                <input aria-label="New Account Number" value={createDraft.accountNumber} onChange={(event) => setCreateDraft({ ...createDraft, accountNumber: event.target.value })} />
              </label>
              <label>
                TIN
                <input aria-label="New TIN" value={createDraft.tin} onChange={(event) => setCreateDraft({ ...createDraft, tin: event.target.value })} />
              </label>
              <label>
                RSA Number
                <input aria-label="New RSA Number" value={createDraft.rsaNumber} onChange={(event) => setCreateDraft({ ...createDraft, rsaNumber: event.target.value })} />
              </label>
              <label>
                Annual Rent
                <input aria-label="New Annual Rent" type="number" value={createDraft.annualRent} onChange={(event) => setCreateDraft({ ...createDraft, annualRent: Number(event.target.value) })} />
              </label>
            </div>

            <div className="button-row">
              <button className="primary-button" disabled={creating} onClick={handleCreateSubmit}>
                {creating ? 'Creating…' : 'Create Employee'}
              </button>
              <button className="secondary-button" onClick={() => setCreateDraft(createEmployeeCreateDraft())}>
                Reset New Employee
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  )
}
