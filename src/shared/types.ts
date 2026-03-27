export type Role = 'admin' | 'payroll_officer' | 'reviewer' | 'approver'

export type PayrollRunStatus = 'draft' | 'validated' | 'in_review' | 'approved' | 'finalized' | 'posted' | 'reversed'

export type RemittanceStatus = 'not_due' | 'due_soon' | 'overdue' | 'remitted' | 'pending'

export type PayComponentKind = 'earning' | 'deduction'

export type CalculationBasis = 'fixed' | 'percentage'

export interface TaxBand {
  bandOrder: number
  lowerLimit: number
  upperLimit: number | null
  ratePercent: number
}

export interface DeductionRule {
  code: string
  name: string
  appliesBeforeTax: boolean
  basisType: CalculationBasis
  ratePercent?: number
  fixedAmount?: number
  capAmount?: number
  employeeOrEmployer: 'employee' | 'employer'
  active: boolean
}

export interface ReliefRule {
  code: string
  name: string
  formulaType: 'fixed' | 'percentage'
  ratePercent?: number
  fixedAmount?: number
  capAmount?: number
}

export interface TaxPolicyPack {
  id: string
  country: string
  name: string
  code: string
  taxYear: number
  effectiveFrom: string
  effectiveTo?: string
  bands: TaxBand[]
  deductionRules: DeductionRule[]
  reliefRules: ReliefRule[]
}

export interface PayComponentDefinition {
  code: string
  name: string
  category: string
  kind: PayComponentKind
  recurring: boolean
  taxable: boolean
  pensionable: boolean
  nhfApplicable: boolean
  calculationBasis: CalculationBasis
  defaultAmount?: number
  percentageOf?: string[]
  glCode?: string
}

export interface PayrollInputLine {
  employeeId: string
  payPeriod: string
  componentCode: string
  amount: number
  sourcePeriod?: string
  sourceFile?: string
  importBatchId?: string
  validationStatus?: 'valid' | 'invalid'
}

export interface EmployeeProfile {
  id: string
  employeeCode: string
  fullName: string
  department: string
  branch: string
  roleTitle: string
  annualRent?: number
}

export interface EmployeePayrollRecord {
  employee: EmployeeProfile
  recurringComponents: PayrollInputLine[]
  variableInputs: PayrollInputLine[]
}

export interface TaxBreakdownLine {
  bandLabel: string
  taxableAmount: number
  ratePercent: number
  taxAmount: number
}

export interface ComplianceComputationInput {
  annualTaxableIncome: number
  annualPreTaxDeductions?: number
  annualReliefs?: number
  payrollFrequency?: number
  taxPolicy: TaxPolicyPack
}

export interface ComplianceComputationResult {
  chargeableIncome: number
  annualTax: number
  periodTax: number
  breakdown: TaxBreakdownLine[]
}

export interface PayrollResultLine {
  code: string
  name: string
  amount: number
  taxable: boolean
  pensionable: boolean
  nhfApplicable: boolean
  kind: PayComponentKind
}

export interface PayrollEmployeeResult {
  employeeId: string
  grossPay: number
  taxableGross: number
  deductions: number
  netPay: number
  paye: number
  recurringLines: PayrollResultLine[]
  variableLines: PayrollResultLine[]
  deductionLines: PayrollResultLine[]
  taxBreakdown: TaxBreakdownLine[]
}

export interface PayrollRunSnapshot {
  runId: string
  period: string
  status: PayrollRunStatus
  policyCode: string
  approvedBy?: string
  approvedAt?: string
  employees: PayrollEmployeeResult[]
}

export interface PayrollRunVariance {
  previousPayPeriod: string
  grossPayDelta: number
  netPayDelta: number
  payeDelta: number
}

export interface PayrollValidationException {
  code: 'missing_tin' | 'missing_rsa' | 'missing_bank_details' | 'non_positive_net_pay'
  title: string
  severity: 'warning' | 'blocking'
  employeeId?: string
  employeeName?: string
  detail: string
}

export interface PayrollRunValidation {
  blockingCount: number
  warningCount: number
  exceptions: PayrollValidationException[]
}

export interface PayrollPostingSummary {
  salaryExpense: number
  employerPensionExpense: number
  payePayable: number
  pensionPayable: number
  nhfPayable: number
  netPayable: number
  totalCredits: number
}

export interface RemittanceSchedule {
  type: 'paye' | 'pension'
  paymentDate: string
  dueDate: string
  status: RemittanceStatus
  amount: number
  reference: string
}
