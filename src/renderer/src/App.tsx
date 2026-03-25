import { useEffect, useMemo, useState } from 'react'

import type {
  AuthSession,
  CompanyRecord,
  ComplianceData,
  DashboardData,
  EmployeeRecord,
  EmployeeUpdateInput,
  InputCenterData,
  PayrollRunDetail,
  ReportData,
  StructureData
} from '@shared/api'
import { formatNaira } from '@shared/money'

type NavKey = 'dashboard' | 'employees' | 'structures' | 'inputs' | 'payroll' | 'reports' | 'compliance'

interface AppData {
  company: CompanyRecord
  dashboard: DashboardData
  employees: EmployeeRecord[]
  structures: StructureData
  inputs: InputCenterData
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
  { key: 'payroll', label: 'Payroll' },
  { key: 'reports', label: 'Reports' },
  { key: 'compliance', label: 'Compliance' }
]

async function loadAppData(company: CompanyRecord): Promise<AppData> {
  const [dashboard, employees, structures, inputs, runs] = await Promise.all([
    window.haqlyApi.dashboard.get(company.id, '2026-04'),
    window.haqlyApi.employees.list(company.id),
    window.haqlyApi.structures.get(company.id),
    window.haqlyApi.inputs.list(company.id, '2026-04'),
    window.haqlyApi.payrollRuns.list(company.id)
  ])

  const payrollSummary = runs[0] ?? (await window.haqlyApi.payrollRuns.generate(company.id, '2026-04'))
  const [payrollRun, reports, compliance] = await Promise.all([
    window.haqlyApi.payrollRuns.getById(payrollSummary.id),
    window.haqlyApi.reports.get(company.id, '2026-04'),
    window.haqlyApi.compliance.get(company.id, '2026-04')
  ])

  return { company, dashboard, employees, structures, inputs, payrollRun, reports, compliance }
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
        {activeNav === 'employees' ? <EmployeesPage employees={data.employees} onSave={handleEmployeeUpdate} /> : null}
        {activeNav === 'structures' ? <StructuresPage structures={data.structures} /> : null}
        {activeNav === 'inputs' ? <InputsPage inputs={data.inputs} /> : null}
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
  onSave
}: {
  employees: EmployeeRecord[]
  onSave: (employeeId: string, payload: EmployeeUpdateInput) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EmployeeUpdateInput | null>(employees[0] ? createEmployeeDraft(employees[0]) : null)
  const [saving, setSaving] = useState(false)

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
      </article>
    </section>
  )
}

function StructuresPage({ structures }: { structures: StructureData }) {
  return (
    <section className="page-grid">
      <article className="surface-card">
        <p className="section-label">Salary Components</p>
        {structures.components.map((component) => (
          <div key={component.code} className="table-row">
            <div>
              <strong>{component.name}</strong>
              <p className="muted">{component.code}</p>
            </div>
            <span>{component.kind}</span>
            <span>{component.taxable ? 'Taxable' : 'Non-taxable'}</span>
            <span>{component.glCode ?? 'Unmapped'}</span>
          </div>
        ))}
      </article>
      <article className="surface-card">
        <p className="section-label">Tax Policy</p>
        {structures.policy.bands.map((band) => (
          <div key={band.bandOrder} className="row-line">
            <strong>{band.bandOrder}</strong>
            <span>{band.lowerLimit.toLocaleString()} - {band.upperLimit?.toLocaleString() ?? 'above'}</span>
            <span>{band.ratePercent}%</span>
          </div>
        ))}
      </article>
    </section>
  )
}

function InputsPage({ inputs }: { inputs: InputCenterData }) {
  return (
    <section className="page-grid">
      <article className="surface-card">
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
      </article>
      <article className="surface-card">
        <p className="section-label">Variable Payroll Inputs</p>
        {inputs.lines.map((line, index) => (
          <div key={`${String(line.employeeId)}-${index}`} className="table-row">
            <span>{String(line.employeeId)}</span>
            <span>{String(line.componentCode)}</span>
            <span>{formatNaira(Number(line.amount))}</span>
            <span className={`pill ${String(line.validationStatus) === 'valid' ? 'remitted' : 'overdue'}`}>{String(line.validationStatus)}</span>
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
