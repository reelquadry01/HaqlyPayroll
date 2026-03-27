import { useEffect, useMemo, useState } from 'react'

import type {
  AuthSession,
  CompanyRecord,
  CompanyPayrollSettings,
  ComplianceData,
  DashboardData,
  EmployeeCreateInput,
  EmployeePayAssignmentUpdateInput,
  EmployeeRecord,
  EmployeeUpdateInput,
  InputCenterData,
  LoanCreateInput,
  LoanRecord,
  LoanStatus,
  PayComponentCreateInput,
  PayComponentUpdateInput,
  PayrollInputImportInput,
  PayrollInputSaveInput,
  PayrollRunDetail,
  ReportData,
  StructureData
} from '@shared/api'

import { AppShell, type NavKey } from './components/appShell'
import { CompanySelectionView, LoginView, type NoticeState } from './components/shared'
import { CompliancePage } from './pages/CompliancePage'
import { DashboardPage } from './pages/DashboardPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { InputsPage } from './pages/InputsPage'
import { LoansPage } from './pages/LoansPage'
import { PayrollPage } from './pages/PayrollPage'
import { ReportsPage } from './pages/ReportsPage'
import { StructuresPage } from './pages/StructuresPage'

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

function shiftPayPeriod(payPeriod: string, delta: number): string {
  const [year, month] = payPeriod.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function buildPayPeriodOptions(runPeriods: string[], selectedPayPeriod: string): string[] {
  return Array.from(new Set([selectedPayPeriod, shiftPayPeriod(selectedPayPeriod, -1), shiftPayPeriod(selectedPayPeriod, 1), ...runPeriods])).sort().reverse()
}

async function loadAppData(company: CompanyRecord, payPeriod: string): Promise<AppData> {
  const [dashboard, employees, structures, inputs, loans, runs] = await Promise.all([
    window.haqlyApi.dashboard.get(company.id, payPeriod),
    window.haqlyApi.employees.list(company.id),
    window.haqlyApi.structures.get(company.id),
    window.haqlyApi.inputs.list(company.id, payPeriod),
    window.haqlyApi.loans.list(company.id),
    window.haqlyApi.payrollRuns.list(company.id)
  ])

  const payrollSummary = runs.find((run) => run.payPeriod === payPeriod) ?? (await window.haqlyApi.payrollRuns.generate(company.id, payPeriod))
  const [payrollRun, reports, compliance] = await Promise.all([
    window.haqlyApi.payrollRuns.getById(payrollSummary.id),
    window.haqlyApi.reports.get(company.id, payPeriod),
    window.haqlyApi.compliance.get(company.id, payPeriod)
  ])

  return { company, dashboard, employees, structures, inputs, loans, payrollRun, reports, compliance }
}

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [availableCompanies, setAvailableCompanies] = useState<CompanyRecord[]>([])
  const [selectedPayPeriod, setSelectedPayPeriod] = useState('2026-04')
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

  async function refreshCompanyData(company: CompanyRecord, payPeriod = selectedPayPeriod): Promise<AppData> {
    const refreshed = await loadAppData(company, payPeriod)
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
        await refreshCompanyData(companies[0], selectedPayPeriod)
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
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Payroll approved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to approve payroll.' })
    }
  }

  async function handleValidate() {
    if (!data || !session) return
    try {
      const result = await window.haqlyApi.payrollRuns.validate(data.payrollRun.id, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({
        tone: 'success',
        message: `Payroll validated. ${result.blockingCount ?? 0} blocking issue(s), ${result.warningCount ?? 0} warning(s).`
      })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to validate payroll.' })
    }
  }

  async function handleSubmitForReview() {
    if (!data || !session) return
    try {
      await window.haqlyApi.payrollRuns.submitForReview(data.payrollRun.id, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Payroll run submitted for review.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to submit payroll for review.' })
    }
  }

  async function handleFinalize() {
    if (!data || !session) return
    try {
      await window.haqlyApi.payrollRuns.finalize(data.payrollRun.id, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Payroll finalized for posting.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to finalize payroll.' })
    }
  }

  async function handlePost() {
    if (!data || !session) return
    try {
      await window.haqlyApi.payrollRuns.post(data.payrollRun.id, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Payroll posted successfully.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to post payroll.' })
    }
  }

  async function handleCompanySelection(company: CompanyRecord) {
    setBusy(true)
    try {
      await refreshCompanyData(company, selectedPayPeriod)
      setNotice(null)
    } finally {
      setBusy(false)
    }
  }

  async function handlePayPeriodChange(payPeriod: string) {
    setSelectedPayPeriod(payPeriod)
    if (!data) return

    setBusy(true)
    try {
      await refreshCompanyData(data.company, payPeriod)
    } finally {
      setBusy(false)
    }
  }

  async function handleEmployeeCreate(payload: EmployeeCreateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.employees.create(data.company.id, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Employee created.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to create employee.' })
    }
  }

  async function handleEmployeeUpdate(employeeId: string, payload: EmployeeUpdateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.employees.update(data.company.id, employeeId, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Employee record saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save employee.' })
    }
  }

  async function handleEmployeeCompensationSave(employeeId: string, payload: EmployeePayAssignmentUpdateInput[]) {
    if (!data || !session) return

    try {
      await window.haqlyApi.employees.updatePayAssignments(data.company.id, employeeId, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Compensation lines saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save compensation lines.' })
    }
  }

  async function handleInputSave(payload: PayrollInputSaveInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.inputs.save(data.company.id, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Payroll input saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save payroll input.' })
    }
  }

  async function handleInputImport(payload: PayrollInputImportInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.inputs.importCsv(data.company.id, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Import batch saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to import payroll batch.' })
    }
  }

  async function handleStructureCreate(payload: PayComponentCreateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.structures.create(data.company.id, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Salary component created.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to create salary component.' })
    }
  }

  async function handleStructureSave(componentCode: string, payload: PayComponentUpdateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.structures.update(data.company.id, componentCode, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Salary component saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save salary component.' })
    }
  }

  async function handleCompanySettingsSave(payload: CompanyPayrollSettings) {
    if (!data || !session) return

    try {
      await window.haqlyApi.companies.updateSettings(data.company.id, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Compliance settings saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save compliance settings.' })
    }
  }

  async function handleLoanCreate(payload: LoanCreateInput) {
    if (!data || !session) return

    try {
      await window.haqlyApi.loans.create(data.company.id, payload, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
      setNotice({ tone: 'success', message: 'Loan record saved.' })
    } catch (actionError) {
      setNotice({ tone: 'error', message: actionError instanceof Error ? actionError.message : 'Unable to save loan record.' })
    }
  }

  async function handleLoanStatusUpdate(loanId: string, status: LoanStatus) {
    if (!data || !session) return

    try {
      await window.haqlyApi.loans.updateStatus(data.company.id, loanId, status, session.id)
      await refreshCompanyData(data.company, selectedPayPeriod)
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

      await refreshCompanyData(data.company, selectedPayPeriod)
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
    <AppShell
      company={data.company}
      session={session}
      selectedPayPeriod={selectedPayPeriod}
      payPeriodOptions={buildPayPeriodOptions(data.payrollRun ? [data.payrollRun.payPeriod] : [], selectedPayPeriod)}
      busy={busy}
      activeNav={activeNav}
      notice={notice}
      onPayPeriodChange={handlePayPeriodChange}
      onActiveNavChange={setActiveNav}
      onDismissNotice={() => setNotice(null)}
    >
      {activeNav === 'dashboard' ? <DashboardPage data={data.dashboard} /> : null}
      {activeNav === 'employees' ? (
        <EmployeesPage
          employees={data.employees}
          onCreate={handleEmployeeCreate}
          onSave={handleEmployeeUpdate}
          onSaveCompensation={handleEmployeeCompensationSave}
        />
      ) : null}
      {activeNav === 'structures' ? (
        <StructuresPage
          structures={data.structures}
          onCreate={handleStructureCreate}
          onSave={handleStructureSave}
        />
      ) : null}
      {activeNav === 'inputs' ? (
        <InputsPage
          payPeriod={selectedPayPeriod}
          inputs={data.inputs}
          employees={data.employees}
          components={data.structures.components}
          onSave={handleInputSave}
          onImport={handleInputImport}
        />
      ) : null}
      {activeNav === 'loans' ? (
        <LoansPage
          loans={data.loans}
          employees={data.employees}
          onCreate={handleLoanCreate}
          onUpdateStatus={handleLoanStatusUpdate}
        />
      ) : null}
      {activeNav === 'payroll' ? (
        <PayrollPage
          run={data.payrollRun}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
          selectedEmployee={selectedPayrollEmployee}
          role={session.role}
          onValidate={handleValidate}
          onApprove={handleApprove}
          onFinalize={handleFinalize}
          onPost={handlePost}
          onSubmitForReview={handleSubmitForReview}
        />
      ) : null}
      {activeNav === 'reports' ? <ReportsPage reports={data.reports} payrollRun={data.payrollRun} onExport={handleExport} onRevealPath={handleRevealPath} /> : null}
      {activeNav === 'compliance' ? <CompliancePage compliance={data.compliance} onSaveSettings={handleCompanySettingsSave} /> : null}
    </AppShell>
  )
}
