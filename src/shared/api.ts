import type { PayrollInputLine, PayrollRunSnapshot, RemittanceSchedule, Role, TaxPolicyPack } from './types'

export interface AuthSession {
  id: string
  email: string
  role: Role
  displayName: string
}

export interface CompanyRecord {
  id: string
  name: string
  taxState: string
  payrollFrequency: number
  currency: string
  payDate: number
  activeTaxPolicyId: string
}

export interface DashboardData {
  payrollStatus: string
  grossPay: number
  netPay: number
  payeTotal: number
  employeeCount: number
  compliance: RemittanceSchedule[]
  pendingTasks: Array<{ id: string; title: string; detail: string }>
  auditLog: Array<{ action: string; createdAt: string }>
}

export interface StructureData {
  policy: TaxPolicyPack
  components: Array<{
    code: string
    name: string
    category: string
    kind: string
    recurring: boolean
    taxable: boolean
    pensionable: boolean
    nhfApplicable: boolean
    calculationBasis: string
    glCode?: string
  }>
}

export interface PayrollRunSummary {
  id: string
  payPeriod?: string
  status: string
  grossPay: number
  netPay: number
  payeTotal: number
  employeeCount: number
}

export interface PayrollRunDetail extends PayrollRunSummary {
  companyId: string
  snapshot: PayrollRunSnapshot
}

export interface ReportData {
  summary: PayrollRunDetail | null
  exportJobs: Array<{ id: string; type: string; filePath: string; createdAt: string }>
}

export interface ComplianceData {
  schedules: RemittanceSchedule[]
  exceptions: {
    missingTin: Array<{ fullName: string; employeeCode: string }>
    missingRsa: Array<{ fullName: string; employeeCode: string }>
  }
}

export interface ExportResult {
  filePath: string
}

export interface HaqlyApi {
  auth: {
    login(email: string, password: string): Promise<AuthSession> | AuthSession
  }
  companies: {
    list(): Promise<CompanyRecord[]> | CompanyRecord[]
  }
  employees: {
    list(companyId: string): Promise<Array<Record<string, unknown>>> | Array<Record<string, unknown>>
  }
  structures: {
    get(companyId: string): Promise<StructureData> | StructureData
  }
  inputs: {
    list(companyId: string, payPeriod: string): Promise<PayrollInputLine[]> | PayrollInputLine[]
  }
  payrollRuns: {
    generate(companyId: string, payPeriod: string): Promise<PayrollRunSummary> | PayrollRunSummary
    list(companyId: string): Promise<PayrollRunSummary[]> | PayrollRunSummary[]
    getById(runId: string): Promise<PayrollRunDetail> | PayrollRunDetail
    approve(runId: string, userId: string): Promise<{ id: string; status: string }> | { id: string; status: string }
  }
  dashboard: {
    get(companyId: string, payPeriod: string): Promise<DashboardData> | DashboardData
  }
  compliance: {
    get(companyId: string, payPeriod: string): Promise<ComplianceData> | ComplianceData
  }
  reports: {
    get(companyId: string, payPeriod: string): Promise<ReportData> | ReportData
  }
  exports: {
    generateJournalCsv(runId: string): Promise<ExportResult> | ExportResult
    generateBankScheduleXlsx(runId: string): Promise<ExportResult> | ExportResult
    generatePayslipPdf(runId: string, employeeId: string): Promise<ExportResult> | ExportResult
  }
}
