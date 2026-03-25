import { useEffect, useMemo, useState } from 'react'

import type {
  AuthSession,
  CompanyRecord,
  ComplianceData,
  DashboardData,
  EmployeePayAssignmentUpdateInput,
  EmployeeRecord,
  EmployeeUpdateInput,
  InputCenterData,
  LoanCreateInput,
  LoanRecord,
  LoanStatus,
  PayComponentUpdateInput,
  PayrollInputSaveInput,
  PayrollRunDetail,
  ReportData,
  StructureData
} from '@shared/api'
import { formatNaira } from '@shared/money'

type NavKey = 'dashboard' | 'employees' | 'structures' | 'inputs' | 'loans' | 'payroll' | 'reports' | 'compliance'

interface AppData {
  company: CompanyRecord
  dashboard: DashboardData
  employees: EmployeeRecord[]
  structures: StructureData
  inputs: InputCenterData
  loans: LoanRecord[]
  payrollRun: PayrollRunDetail
  reports: ReportData
  compliance: ComplianceData
}

interface NoticeState {
  tone: 'success' | 'error'
  message: string
}

const navItems: Array<{ key: NavKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'structures', label: 'Structures' },
  { key: 'inputs', label: 'Payroll Inputs' },
  { key: 'loans', label: 'Loans' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'reports', label: 'Reports' },
  { key: 'compliance', label: 'Compliance' }
]

async function loadAppData(company: CompanyRecord): Promise<AppData> {
  const [dashboard, employees, structures, inputs, loans, runs] = await Promise.all([
    window.haqlyApi.dashboard.get(company.id, '2026-04'),
    window.haqlyApi.employees.list(company.id),
    window.haqlyApi.structures.get(company.id),
    window.haqlyApi.inputs.list(company.id, '2026-04'),
    window.haqlyApi.loans.list(company.id),
    window.haqlyApi.payrollRuns.list(company.id)
  ])

  const payrollSummary = runs[0] ?? (await window.haqlyApi.payrollRuns.generate(company.id, '2026-04'))
  const [payrollRun, reports, compliance] = await Promise.all([
    window.haqlyApi.payrollRuns.getById(payrollSummary.id),
    window.haqlyApi.reports.get(company.id, '2026-04'),
    window.haqlyApi.compliance.get(company.id, '2026-04')
  ])

  return { company, dashboard, employees, structures, inputs, loans, payrollRun, reports, compliance }
}

function LoginView({ onLogin, busy, error }: { onLogin: (email: string, password: string) => void; busy: boolean; error?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="login-screen">
      <section className="login-card">
        <p className="eyebrow">The Sovereign Ledger</p>
        <h1>HAQLY Payroll</h1>
        <p className="muted">Nigeria-first payroll for finance teams that need control, clarity, and audit-ready outputs.</p>
        <label>
          Email
          <input aria-label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={busy} onClick={() => onLogin(email, password)}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="hint">Demo credentials: `admin@haqly.local` / `password123`</p>
      </section>
    </div>
  )
}

function formatSignedNaira(value: number): string {
  const prefix = value >= 0 ? '+' : '-'
  return `${prefix}${formatNaira(Math.abs(value))}`
}

function createEmployeeDraft(employee: EmployeeRecord): EmployeeUpdateInput {
  return {
    fullName: employee.fullName,
    department: employee.department,
    branch: employee.branch,
    roleTitle: employee.roleTitle,
    bankName: employee.bankName ?? '',
    accountNumber: employee.accountNumber ?? '',
    tin: employee.tin ?? '',
    rsaNumber: employee.rsaNumber ?? '',
    status: employee.status
  }
}

function createComponentDraft(component: StructureData['components'][number]): PayComponentUpdateInput {
  return {
    name: component.name,
    category: component.category,
    recurring: component.recurring,
    taxable: component.taxable,
    pensionable: component.pensionable,
    nhfApplicable: component.nhfApplicable,
    calculationBasis: component.calculationBasis,
    glCode: component.glCode ?? ''
  }
}

function createInputDraft(
  employees: EmployeeRecord[],
  components: StructureData['components'],
  previous?: PayrollInputSaveInput
): PayrollInputSaveInput {
  const manualComponents = components.filter((component) => !component.recurring || component.kind === 'deduction')
  return {
    employeeId: previous?.employeeId ?? employees[0]?.id ?? '',
    payPeriod: previous?.payPeriod ?? '2026-04',
    componentCode: previous?.componentCode ?? manualComponents[0]?.code ?? 'BONUS',
    amount: 0,
    sourcePeriod: previous?.sourcePeriod ?? '2026-04'
  }
}

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

function createAssignmentDrafts(employee: EmployeeRecord) {
  return employee.payAssignments.map((assignment) => ({
    componentCode: assignment.componentCode,
    amount: assignment.amount
  }))
}

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [availableCompanies, setAvailableCompanies] = useState<CompanyRecord[]>([])
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<NoticeState | null>(null)

  const selectedPayrollEmployee = useMemo(
    () => data?.payrollRun.snapshot.employees.find((employee) => employee.employeeId === selectedEmployeeId) ?? data?.payrollRun.snapshot.employees[0],
    [data, selectedEmployeeId]
  )

  useEffect(() => {
    if (!data?.payrollRun.snapshot.employees.length || selectedEmployeeId) return
    setSelectedEmployeeId(data.payrollRun.snapshot.employees[0].employeeId)
  }, [data, selectedEmployeeId])

  async function refreshCompanyData(company: CompanyRecord): Promise<AppData> {
    const refreshed = await loadAppData(company)
    setData(refreshed)
    return refreshed
  }

  async function handleLogin(email: string, password: string) {
    try {
      setBusy(true)
      setError(undefined)
      const authSession = await window.haqlyApi.auth.login(email, password)
      setSession(authSession)
      const companies = await window.haqlyApi.companies.list()
      setAvailableCompanies(companies)
      if (companies.length === 1) {
        await refreshCompanyData(companies[0])
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in')
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove() {
    if (!data || !session) return
    try {
      await window.haqlyApi.payrollRuns.approve(data.payrollRun.id, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: 'Payroll approved and locked.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to approve payroll.' })
    }
  }

  async function handleSubmitForReview() {
    if (!data || !session) return
    try {
      await window.haqlyApi.payrollRuns.submitForReview(data.payrollRun.id, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: 'Payroll run submitted for review.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to submit payroll for review.' })
    }
  }

  async function handleCompanySelection(company: CompanyRecord) {
    setBusy(true)
    try {
      await refreshCompanyData(company)
      setNotice(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleEmployeeUpdate(employeeId: string, payload: EmployeeUpdateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.employees.update(data.company.id, employeeId, payload, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: 'Employee record saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save employee.' })
    }
  }

  async function handleEmployeeCompensationSave(employeeId: string, payload: EmployeePayAssignmentUpdateInput[]) {
    if (!data || !session) return

    try {
      await window.haqlyApi.employees.updatePayAssignments(data.company.id, employeeId, payload, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: 'Compensation lines saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save compensation lines.' })
    }
  }

  async function handleInputSave(payload: PayrollInputSaveInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.inputs.save(data.company.id, payload, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: 'Payroll input saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save payroll input.' })
    }
  }

  async function handleStructureSave(componentCode: string, payload: PayComponentUpdateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.structures.update(data.company.id, componentCode, payload, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: 'Salary component saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save salary component.' })
    }
  }

  async function handleLoanCreate(payload: LoanCreateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.loans.create(data.company.id, payload, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: 'Loan record saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save loan record.' })
    }
  }

  async function handleLoanStatusUpdate(loanId: string, status: LoanStatus) {
    if (!data || !session) return

    try {
      await window.haqlyApi.loans.updateStatus(data.company.id, loanId, status, session.id)
      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: `Loan marked ${status}.` })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to update loan status.' })
    }
  }

  async function handleExport(kind: 'journal' | 'bank' | 'payslip') {
    if (!data) return

    try {
      const result = kind === 'journal'
        ? await window.haqlyApi.exports.generateJournalCsv(data.payrollRun.id)
        : kind === 'bank'
          ? await window.haqlyApi.exports.generateBankScheduleXlsx(data.payrollRun.id)
          : await window.haqlyApi.exports.generatePayslipPdf(data.payrollRun.id, data.payrollRun.snapshot.employees[0].employeeId)

      await refreshCompanyData(data.company)
      setNotice({ tone: 'success', message: `Export ready: ${result.filePath}` })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to generate export.' })
    }
  }

  async function handleRevealPath(filePath: string) {
    try {
      await window.haqlyApi.exports.revealPath(filePath)
      setNotice({ tone: 'success', message: `Opened export location: ${filePath}` })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to open export location.' })
    }
  }

  if (!session || !data) {
    if (!session) {
      return <LoginView onLogin={handleLogin} busy={busy} error={error} />
    }

    return <CompanySelectionView companies={availableCompanies} busy={busy} onSelectCompany={handleCompanySelection} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">The Sovereign Ledger</p>
          <h2>HAQLY Payroll</h2>
          <p className="muted">Nigerian Enterprise Edition</p>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button key={item.key} className={item.key === activeNav ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="primary-button sidebar-button" onClick={() => setActiveNav('payroll')}>
          Run Payroll
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="muted">{data.company.name}</p>
            <h1>2026 Nigeria Tax Pack Active</h1>
          </div>
          <div className="profile-chip">
            <span>{session.displayName}</span>
            <small>{session.role.replace('_', ' ')}</small>
          </div>
        </header>

        {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

        {activeNav === 'dashboard' ? <DashboardPage data={data.dashboard} /> : null}
        {activeNav === 'employees' ? <EmployeesPage employees={data.employees} onSave={handleEmployeeUpdate} onSaveCompensation={handleEmployeeCompensationSave} /> : null}
        {activeNav === 'structures' ? <StructuresPage structures={data.structures} onSave={handleStructureSave} /> : null}
        {activeNav === 'inputs' ? <InputsPage inputs={data.inputs} employees={data.employees} components={data.structures.components} onSave={handleInputSave} /> : null}
        {activeNav === 'loans' ? <LoansPage loans={data.loans} employees={data.employees} onCreate={handleLoanCreate} onUpdateStatus={handleLoanStatusUpdate} /> : null}
        {activeNav === 'payroll' ? (
          <PayrollPage
            run={data.payrollRun}
            selectedEmployeeId={selectedEmployeeId}
            onSelectEmployee={setSelectedEmployeeId}
            selectedEmployee={selectedPayrollEmployee}
            role={session.role}
            onApprove={handleApprove}
            onSubmitForReview={handleSubmitForReview}
          />
        ) : null}
        {activeNav === 'reports' ? <ReportsPage reports={data.reports} payrollRun={data.payrollRun} onExport={handleExport} onRevealPath={handleRevealPath} /> : null}
        {activeNav === 'compliance' ? <CompliancePage compliance={data.compliance} /> : null}
      </main>
    </div>
  )
}

function CompanySelectionView({
  companies,
  busy,
  onSelectCompany
}: {
  companies: CompanyRecord[]
  busy: boolean
  onSelectCompany: (company: CompanyRecord) => void
}) {
  return (
    <div className="login-screen">
      <section className="login-card">
        <p className="eyebrow">Select Company</p>
        <h1>Choose the payroll workspace</h1>
        <p className="muted">This installation supports multiple companies. Pick the one you want to work on for this session.</p>
        <div className="company-selector-list">
          {companies.map((company) => (
            <button key={company.id} className="company-selector-card" disabled={busy} onClick={() => onSelectCompany(company)}>
              <strong>{company.name}</strong>
              <span>{company.taxState}</span>
              <small>Pay date: day {company.payDate}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function NoticeBanner({ notice, onDismiss }: { notice: NoticeState; onDismiss: () => void }) {
  return (
    <div className={`notice-banner ${notice.tone}`}>
      <strong>{notice.message}</strong>
      <button className="link-button" onClick={onDismiss}>Dismiss</button>
    </div>
  )
}

function DashboardPage({ data }: { data: DashboardData }) {
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

function EmployeesPage({
  employees,
  onSave,
  onSaveCompensation
}: {
  employees: EmployeeRecord[]
  onSave: (employeeId: string, payload: EmployeeUpdateInput) => Promise<void>
  onSaveCompensation: (employeeId: string, payload: EmployeePayAssignmentUpdateInput[]) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EmployeeUpdateInput | null>(employees[0] ? createEmployeeDraft(employees[0]) : null)
  const [saving, setSaving] = useState(false)
  const [assignmentDrafts, setAssignmentDrafts] = useState<EmployeePayAssignmentUpdateInput[]>(employees[0] ? createAssignmentDrafts(employees[0]) : [])
  const [savingCompensation, setSavingCompensation] = useState(false)

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

  return (
    <section className="page-grid employee-layout">
      <article className="surface-card">
        <div className="section-header">
          <div>
            <p className="section-label">Employee Register</p>
            <h3>Payroll directory</h3>
          </div>
          <span className="pill valid">{employees.length} employees</span>
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
      </article>
    </section>
  )
}

function StructuresPage({
  structures,
  onSave
}: {
  structures: StructureData
  onSave: (componentCode: string, payload: PayComponentUpdateInput) => Promise<void>
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(structures.components[0]?.code ?? null)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [draft, setDraft] = useState<PayComponentUpdateInput | null>(structures.components[0] ? createComponentDraft(structures.components[0]) : null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!structures.components.length) {
      setSelectedCode(null)
      setEditingCode(null)
      setDraft(null)
      return
    }

    if (!selectedCode || !structures.components.find((component) => component.code === selectedCode)) {
      setSelectedCode(structures.components[0].code)
    }
  }, [selectedCode, structures.components])

  const selectedComponent = structures.components.find((component) => component.code === selectedCode) ?? structures.components[0]
  const activeComponent = structures.components.find((component) => component.code === editingCode) ?? selectedComponent

  useEffect(() => {
    if (activeComponent) {
      setDraft(createComponentDraft(activeComponent))
    }
  }, [activeComponent])

  if (!selectedComponent || !draft) {
    return null
  }

  async function handleSubmit() {
    if (!activeComponent) return
    setSaving(true)
    try {
      await onSave(activeComponent.code, draft)
      setSelectedCode(activeComponent.code)
      setEditingCode(activeComponent.code)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-grid employee-layout">
      <article className="surface-card">
        <div className="section-header">
          <div>
            <p className="section-label">Salary Components</p>
            <h3>Policy-ready component catalog</h3>
          </div>
          <span className="pill valid">{structures.components.length} components</span>
        </div>
        <div className="table-list">
          {structures.components.map((component) => (
            <div key={component.code} className={`table-row employee-row ${component.code === selectedCode ? 'selected' : ''}`}>
              <button className="employee-summary" onClick={() => setSelectedCode(component.code)}>
                <div>
                  <strong>{component.name}</strong>
                  <p className="muted">{component.code}</p>
                </div>
                <span>{component.kind}</span>
                <span>{component.taxable ? 'Taxable' : 'Non-taxable'}</span>
                <span>{component.glCode ?? 'Unmapped'}</span>
              </button>
              <button
                className="secondary-button"
                aria-label={`Edit ${component.name}`}
                onClick={() => {
                  setSelectedCode(component.code)
                  setEditingCode(component.code)
                  setDraft(createComponentDraft(component))
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
            <p className="section-label">Component Editor</p>
            <h3>{activeComponent?.name ?? selectedComponent.name}</h3>
          </div>
          <span className={`pill ${draft.taxable ? 'valid' : 'due_soon'}`}>{draft.taxable ? 'taxable' : 'non-taxable'}</span>
        </div>

        <div className="editor-grid">
          <label>
            Component Name
            <input aria-label="Component Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Category
            <input aria-label="Category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          </label>
          <label>
            GL Code
            <input aria-label="GL Code" value={draft.glCode ?? ''} onChange={(event) => setDraft({ ...draft, glCode: event.target.value })} />
          </label>
          <label>
            Calculation Basis
            <select
              aria-label="Calculation Basis"
              value={draft.calculationBasis}
              onChange={(event) => setDraft({ ...draft, calculationBasis: event.target.value })}
            >
              <option value="fixed">Fixed</option>
              <option value="percentage">Percentage</option>
            </select>
          </label>
        </div>

        <div className="toggle-grid">
          <label className="toggle-card">
            <input
              aria-label="Recurring"
              type="checkbox"
              checked={draft.recurring}
              onChange={(event) => setDraft({ ...draft, recurring: event.target.checked })}
            />
            <span>Recurring component</span>
          </label>
          <label className="toggle-card">
            <input
              aria-label="Taxable"
              type="checkbox"
              checked={draft.taxable}
              onChange={(event) => setDraft({ ...draft, taxable: event.target.checked })}
            />
            <span>Taxable under PAYE</span>
          </label>
          <label className="toggle-card">
            <input
              aria-label="Pensionable"
              type="checkbox"
              checked={draft.pensionable}
              onChange={(event) => setDraft({ ...draft, pensionable: event.target.checked })}
            />
            <span>Pensionable earning</span>
          </label>
          <label className="toggle-card">
            <input
              aria-label="NHF Applicable"
              type="checkbox"
              checked={draft.nhfApplicable}
              onChange={(event) => setDraft({ ...draft, nhfApplicable: event.target.checked })}
            />
            <span>NHF applicable</span>
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save Component'}
          </button>
        </div>

        <div>
          <p className="section-label">Tax Policy</p>
          {structures.policy.bands.map((band) => (
            <div key={band.bandOrder} className="row-line">
              <strong>{band.bandOrder}</strong>
              <span>{band.lowerLimit.toLocaleString()} - {band.upperLimit?.toLocaleString() ?? 'above'}</span>
              <span>{band.ratePercent}%</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function InputsPage({
  inputs,
  employees,
  components,
  onSave
}: {
  inputs: InputCenterData
  employees: EmployeeRecord[]
  components: StructureData['components']
  onSave: (payload: PayrollInputSaveInput) => Promise<void>
}) {
  const manualComponents = components.filter((component) => !component.recurring || component.kind === 'deduction')
  const [draft, setDraft] = useState<PayrollInputSaveInput>(() => createInputDraft(employees, components))
  const [saving, setSaving] = useState(false)
  const totalInputValue = inputs.lines.reduce((sum, line) => sum + Number(line.amount), 0)

  async function handleSubmit() {
    setSaving(true)
    try {
      await onSave({
        ...draft,
        amount: Number(draft.amount)
      })
      setDraft(createInputDraft(employees, components, draft))
    } finally {
      setSaving(false)
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
          <button className="secondary-button" onClick={() => setDraft(createInputDraft(employees, components, draft))}>
            Reset Form
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

function LoansPage({
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

function PayrollPage({
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
              <strong>{employee.employeeId === 'emp-chidi' ? 'Chidi Okoro' : employee.employeeId === 'emp-aisha' ? 'Aisha Abubakar' : 'Femi Adebayo'}</strong>
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
            <h3>{selectedEmployeeId === 'emp-chidi' ? 'Chidi Okoro' : selectedEmployeeId === 'emp-aisha' ? 'Aisha Abubakar' : 'Femi Adebayo'}</h3>
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

function ReportsPage({
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

function CompliancePage({ compliance }: { compliance: ComplianceData }) {
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="section-label">{label}</p>
      <strong>{value}</strong>
    </div>
  )
}
