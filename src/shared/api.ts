import type {
  PayrollInputLine,
  PayrollPostingSummary,
  PayrollRunSnapshot,
  PayrollRunStatus,
  PayrollRunValidation,
  PayrollRunVariance,
  RemittanceSchedule,
  Role,
  TaxPolicyPack
} from './types'

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

export type EmployeeType = 'full_time' | 'contract' | 'casual' | 'intern' | 'expat'

export interface CompanyPayrollSettings {
  defaultWorkingDays: number
  validationPolicy: 'strict' | 'balanced' | 'light'
  approvalPolicy: 'review_then_approve' | 'approve_direct'
  employeePensionRate: number
  employerPensionRate: number
  nhfEnabled: boolean
  nhfRate: number
  nsitfEnabled: boolean
  nsitfRate: number
  payeRemittanceDay: number
  pensionRemittanceWorkingDays: number
}

export interface DashboardData {
  payrollStatus: string
  grossPay: number
  netPay: number
  payeTotal: number
  employeeCount: number
  postingReadiness: {
    blockingCount: number
    warningCount: number
    journalExportReady: boolean
    bankExportReady: boolean
    summary: string
  }
  liabilities: {
    payePayable: number
    pensionPayable: number
    nhfPayable: number
    netPayable: number
  }
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

export interface PayComponentUpdateInput {
  name: string
  category: string
  recurring: boolean
  taxable: boolean
  pensionable: boolean
  nhfApplicable: boolean
  calculationBasis: string
  glCode?: string
}

export interface PayComponentCreateInput extends PayComponentUpdateInput {
  code: string
  kind: string
}

export interface PayrollRunSummary {
  id: string
  payPeriod?: string
  status: PayrollRunStatus
  grossPay: number
  netPay: number
  payeTotal: number
  employeeCount: number
}

export interface PayrollRunDetail extends PayrollRunSummary {
  companyId: string
  snapshot: PayrollRunSnapshot
  variance?: PayrollRunVariance
  validation: PayrollRunValidation
  postingSummary: PayrollPostingSummary
}

export interface PayrollRunTransitionResult {
  id: string
  status: PayrollRunStatus
  blockingCount?: number
  warningCount?: number
}

export interface ReportData {
  summary: PayrollRunDetail | null
  financeSummary: {
    payrollStatus: PayrollRunStatus
    validation: PayrollRunValidation
    postingSummary: PayrollPostingSummary
    exportReadiness: {
      journal: boolean
      bank: boolean
      payslip: boolean
      message: string
    }
  } | null
  exportJobs: Array<{ id: string; type: string; filePath: string; createdAt: string }>
}

export interface ComplianceData {
  schedules: RemittanceSchedule[]
  exceptions: {
    missingTin: Array<{ fullName: string; employeeCode: string }>
    missingRsa: Array<{ fullName: string; employeeCode: string }>
  }
  settings: CompanyPayrollSettings
  policySummary: {
    code: string
    name: string
    deductionRules: string[]
  }
}

export interface ExportResult {
  filePath: string
}

export interface InputCenterData {
  lines: PayrollInputLine[]
  batches: Array<{
    id: string
    sourceFile: string
    status: string
    createdAt: string
  }>
}

export interface PayrollInputSaveInput {
  employeeId: string
  payPeriod: string
  componentCode: string
  amount: number
  sourcePeriod?: string
}

export interface PayrollInputImportInput {
  payPeriod: string
  sourceFile: string
  csvText: string
}

export interface PayrollInputImportResult {
  batchId: string
  importedCount: number
  invalidCount: number
  status: string
}

export interface EmployeePayAssignment {
  componentCode: string
  componentName: string
  amount: number
  activeFrom: string
}

export interface EmployeePayAssignmentUpdateInput {
  componentCode: string
  amount: number
}

export type LoanStatus = 'active' | 'paused' | 'settled'

export interface LoanRecord {
  id: string
  employeeId: string
  employeeName: string
  type: 'staff_loan' | 'salary_advance'
  principal: number
  balance: number
  monthlyDeduction: number
  repaymentMethod: 'flat' | 'amortised' | 'one_time'
  startDate: string
  endDate: string
  interestOption: 'none' | 'flat'
  status: LoanStatus
}

export interface LoanCreateInput {
  employeeId: string
  type: 'staff_loan' | 'salary_advance'
  principal: number
  monthlyDeduction: number
  repaymentMethod: 'flat' | 'amortised' | 'one_time'
  startDate: string
  endDate: string
  interestOption: 'none' | 'flat'
}

export interface EmployeeRecord {
  id: string
  employeeCode: string
  fullName: string
  department: string
  branch: string
  roleTitle: string
  employeeType: EmployeeType
  hireDate: string
  status: string
  bankName?: string | null
  accountNumber?: string | null
  tin?: string | null
  rsaNumber?: string | null
  pfaName?: string | null
  nhfFlag?: number | boolean
  payAssignments: EmployeePayAssignment[]
}

export interface EmployeeUpdateInput {
  fullName: string
  department: string
  branch: string
  roleTitle: string
  employeeType: EmployeeType
  bankName: string
  accountNumber: string
  tin: string
  rsaNumber: string
  status: string
}

export interface EmployeeCreateInput extends EmployeeUpdateInput {
  employeeCode: string
  hireDate: string
}

export interface HaqlyApi {
  auth: {
    login(email: string, password: string): Promise<AuthSession> | AuthSession
  }
  companies: {
    list(): Promise<CompanyRecord[]> | CompanyRecord[]
    getSettings(companyId: string): Promise<CompanyPayrollSettings> | CompanyPayrollSettings
    updateSettings(companyId: string, payload: CompanyPayrollSettings, userId: string): Promise<CompanyPayrollSettings> | CompanyPayrollSettings
  }
  employees: {
    list(companyId: string): Promise<EmployeeRecord[]> | EmployeeRecord[]
    create(companyId: string, payload: EmployeeCreateInput, userId: string): Promise<EmployeeRecord> | EmployeeRecord
    update(companyId: string, employeeId: string, payload: EmployeeUpdateInput, userId: string): Promise<EmployeeRecord> | EmployeeRecord
    updatePayAssignments(companyId: string, employeeId: string, payload: EmployeePayAssignmentUpdateInput[], userId: string): Promise<EmployeePayAssignment[]> | EmployeePayAssignment[]
  }
  structures: {
    get(companyId: string): Promise<StructureData> | StructureData
    create(companyId: string, payload: PayComponentCreateInput, userId: string): Promise<StructureData['components'][number]> | StructureData['components'][number]
    update(companyId: string, componentCode: string, payload: PayComponentUpdateInput, userId: string): Promise<StructureData['components'][number]> | StructureData['components'][number]
  }
  inputs: {
    list(companyId: string, payPeriod: string): Promise<InputCenterData> | InputCenterData
    save(companyId: string, payload: PayrollInputSaveInput, userId: string): Promise<PayrollInputLine> | PayrollInputLine
    importCsv(companyId: string, payload: PayrollInputImportInput, userId: string): Promise<PayrollInputImportResult> | PayrollInputImportResult
  }
  payrollRuns: {
    generate(companyId: string, payPeriod: string): Promise<PayrollRunSummary> | PayrollRunSummary
    list(companyId: string): Promise<PayrollRunSummary[]> | PayrollRunSummary[]
    getById(runId: string): Promise<PayrollRunDetail> | PayrollRunDetail
    validate(runId: string, userId: string): Promise<PayrollRunTransitionResult> | PayrollRunTransitionResult
    submitForReview(runId: string, userId: string): Promise<PayrollRunTransitionResult> | PayrollRunTransitionResult
    approve(runId: string, userId: string): Promise<PayrollRunTransitionResult> | PayrollRunTransitionResult
    finalize(runId: string, userId: string): Promise<PayrollRunTransitionResult> | PayrollRunTransitionResult
    post(runId: string, userId: string): Promise<PayrollRunTransitionResult> | PayrollRunTransitionResult
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
    revealPath(filePath: string): Promise<void> | void
  }
  loans: {
    list(companyId: string): Promise<LoanRecord[]> | LoanRecord[]
    create(companyId: string, payload: LoanCreateInput, userId: string): Promise<LoanRecord> | LoanRecord
    updateStatus(companyId: string, loanId: string, status: LoanStatus, userId: string): Promise<LoanRecord> | LoanRecord
  }
}
