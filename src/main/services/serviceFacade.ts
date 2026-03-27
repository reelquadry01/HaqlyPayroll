import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { compareSync } from 'bcryptjs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as XLSX from 'xlsx'

import type {
  CompanyPayrollSettings,
  EmployeeCreateInput,
  EmployeePayAssignmentUpdateInput,
  EmployeeUpdateInput,
  LoanCreateInput,
  PayrollRunTransitionResult,
  PayComponentCreateInput,
  LoanStatus,
  PayComponentUpdateInput,
  PayrollInputImportInput,
  PayrollInputSaveInput
} from '@shared/api'
import { formatNaira, roundCurrency } from '@shared/money'
import type {
  EmployeeProfile,
  PayComponentDefinition,
  PayrollInputLine,
  PayrollPostingSummary,
  PayrollRunSnapshot,
  PayrollRunValidation,
  PayrollRunVariance,
  Role
} from '@shared/types'

import { readActivePolicy, type DatabaseContext } from '../db/context'
import { buildPayeSchedule, buildPensionSchedule } from '../engine/deadlineEngine'
import { calculateEmployeePayroll } from '../engine/payrollEngine'

interface ServiceFacadeOptions {
  database: DatabaseContext
  exportDir: string
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function formatPdfCurrency(value: number): string {
  return formatNaira(value).replace('₦', 'NGN ')
}

function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const [headerLine, ...lines] = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!headerLine) {
    return []
  }

  const headers = headerLine.split(',').map((header) => header.trim())
  return lines.map((line) => {
    const values = line.split(',').map((value) => value.trim())
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? ''
      return row
    }, {})
  })
}

function buildPayrollVariance(context: DatabaseContext, companyId: string, payPeriod: string, totals: {
  grossPay: number
  netPay: number
  payeTotal: number
}): PayrollRunVariance | undefined {
  const previousRun = context.db
    .prepare('SELECT pay_period AS payPeriod, gross_pay AS grossPay, net_pay AS netPay, paye_total AS payeTotal FROM payroll_runs WHERE company_id = ? AND pay_period < ? ORDER BY pay_period DESC LIMIT 1')
    .get(companyId, payPeriod) as { payPeriod: string; grossPay: number; netPay: number; payeTotal: number } | undefined

  if (!previousRun) {
    return undefined
  }

  return {
    previousPayPeriod: previousRun.payPeriod,
    grossPayDelta: roundCurrency(totals.grossPay - previousRun.grossPay),
    netPayDelta: roundCurrency(totals.netPay - previousRun.netPay),
    payeDelta: roundCurrency(totals.payeTotal - previousRun.payeTotal)
  }
}

function readRunSummary(context: DatabaseContext, runId: string) {
  return context.db
    .prepare('SELECT id, company_id AS companyId, pay_period AS payPeriod, status, gross_pay AS grossPay, net_pay AS netPay, paye_total AS payeTotal, employee_count AS employeeCount FROM payroll_runs WHERE id = ?')
    .get(runId) as {
    id: string
    companyId: string
    payPeriod: string
    status: string
    grossPay: number
    netPay: number
    payeTotal: number
    employeeCount: number
  } | undefined
}

function readRunSnapshot(context: DatabaseContext, runId: string) {
  const record = context.db.prepare('SELECT snapshot_json AS snapshotJson FROM payroll_snapshots WHERE run_id = ?').get(runId) as { snapshotJson: string } | undefined
  if (!record) {
    throw new Error('Payroll snapshot not found')
  }

  return parseJson<PayrollRunSnapshot>(record.snapshotJson)
}

function writeRunSnapshot(context: DatabaseContext, runId: string, snapshot: PayrollRunSnapshot): void {
  context.db.prepare('UPDATE payroll_snapshots SET snapshot_json = ? WHERE run_id = ?').run(JSON.stringify(snapshot), runId)
}

function readValidationEmployees(context: DatabaseContext, companyId: string) {
  return context.db
    .prepare(
      `SELECT id, full_name AS fullName, bank_name AS bankName, account_number AS accountNumber, tin, rsa_number AS rsaNumber, nhf_flag AS nhfFlag
       FROM employees
       WHERE company_id = ?`
    )
    .all(companyId) as Array<{
      id: string
      fullName: string
      bankName: string | null
      accountNumber: string | null
      tin: string | null
      rsaNumber: string | null
      nhfFlag: number
    }>
}

function buildPayrollValidation(context: DatabaseContext, runId: string): PayrollRunValidation {
  const run = readRunSummary(context, runId)
  if (!run) {
    throw new Error('Payroll run not found')
  }

  const snapshot = readRunSnapshot(context, runId)
  const employees = readValidationEmployees(context, run.companyId)
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee] as const))
  const exceptions: PayrollRunValidation['exceptions'] = []

  for (const employee of employees) {
    if (!employee.tin?.trim()) {
      exceptions.push({
        code: 'missing_tin',
        title: 'Missing TIN',
        severity: 'warning',
        employeeId: employee.id,
        employeeName: employee.fullName,
        detail: 'Employee record is missing a TIN, which may affect filing readiness.'
      })
    }

    if (!employee.rsaNumber?.trim()) {
      exceptions.push({
        code: 'missing_rsa',
        title: 'Missing RSA',
        severity: 'warning',
        employeeId: employee.id,
        employeeName: employee.fullName,
        detail: 'Employee record is missing an RSA number for pension remittance.'
      })
    }

    if (!employee.bankName?.trim() || !employee.accountNumber?.trim()) {
      exceptions.push({
        code: 'missing_bank_details',
        title: 'Missing Bank Details',
        severity: 'blocking',
        employeeId: employee.id,
        employeeName: employee.fullName,
        detail: 'Employee must have both bank name and account number before payroll can be finalized.'
      })
    }
  }

  for (const employee of snapshot.employees) {
    if (employee.netPay <= 0) {
      exceptions.push({
        code: 'non_positive_net_pay',
        title: 'Non-positive Net Pay',
        severity: 'blocking',
        employeeId: employee.employeeId,
        employeeName: employeeMap.get(employee.employeeId)?.fullName,
        detail: 'Net pay is zero or negative and requires payroll correction before posting.'
      })
    }
  }

  return {
    blockingCount: exceptions.filter((exception) => exception.severity === 'blocking').length,
    warningCount: exceptions.filter((exception) => exception.severity === 'warning').length,
    exceptions
  }
}

function buildPostingSummary(context: DatabaseContext, runId: string): PayrollPostingSummary {
  const run = readRunSummary(context, runId)
  if (!run) {
    throw new Error('Payroll run not found')
  }

  const settings = readCompanySettings(context, run.companyId)
  const snapshot = readRunSnapshot(context, runId)
  const employees = readValidationEmployees(context, run.companyId)
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee] as const))

  const pensionableGross = roundCurrency(
    snapshot.employees.reduce(
      (sum, employee) =>
        sum +
        employee.recurringLines
          .concat(employee.variableLines)
          .filter((line) => line.kind === 'earning' && line.pensionable)
          .reduce((lineSum, line) => lineSum + line.amount, 0),
      0
    )
  )

  const nhfBase = roundCurrency(
    snapshot.employees.reduce(
      (sum, employee) =>
        sum +
        employee.recurringLines
          .concat(employee.variableLines)
          .filter((line) => line.kind === 'earning' && line.nhfApplicable && Boolean(employeeMap.get(employee.employeeId)?.nhfFlag))
          .reduce((lineSum, line) => lineSum + line.amount, 0),
      0
    )
  )

  const employeePension = roundCurrency((pensionableGross * settings.employeePensionRate) / 100)
  const employerPensionExpense = roundCurrency((pensionableGross * settings.employerPensionRate) / 100)
  const pensionPayable = roundCurrency(employeePension + employerPensionExpense)
  const nhfPayable = settings.nhfEnabled ? roundCurrency((nhfBase * settings.nhfRate) / 100) : 0
  const totalCredits = roundCurrency(run.netPay + run.payeTotal + pensionPayable + nhfPayable)

  return {
    salaryExpense: run.grossPay,
    employerPensionExpense,
    payePayable: run.payeTotal,
    pensionPayable,
    nhfPayable,
    netPayable: run.netPay,
    totalCredits
  }
}

function buildExportReadiness(status: string) {
  const journal = status === 'finalized' || status === 'posted'
  const bank = status === 'finalized' || status === 'posted'
  const payslip = status === 'approved' || status === 'finalized' || status === 'posted'
  const message = journal
    ? 'Finance exports are ready.'
    : payslip
      ? 'Finalize payroll before generating journal and bank exports.'
      : 'Approve payroll before generating final outputs.'

  return {
    journal,
    bank,
    payslip,
    message
  }
}

function assertExportAllowed(status: string, kind: 'journal' | 'bank' | 'payslip'): void {
  const readiness = buildExportReadiness(status)

  if (kind === 'journal' && !readiness.journal) {
    throw new Error('Journal export is available only for finalized or posted payroll runs')
  }

  if (kind === 'bank' && !readiness.bank) {
    throw new Error('Bank export is available only for finalized or posted payroll runs')
  }

  if (kind === 'payslip' && !readiness.payslip) {
    throw new Error('Payslip export is available only for approved, finalized, or posted payroll runs')
  }
}

function readEmployeePaymentDetails(context: DatabaseContext, companyId: string) {
  return context.db
    .prepare(
      `SELECT id, full_name AS fullName, bank_name AS bankName, account_number AS accountNumber
       FROM employees
       WHERE company_id = ?`
    )
    .all(companyId) as Array<{
      id: string
      fullName: string
      bankName: string | null
      accountNumber: string | null
    }>
}

function mapComponent(row: Record<string, unknown>): PayComponentDefinition {
  return {
    code: String(row.code),
    name: String(row.name),
    category: String(row.category),
    kind: row.kind === 'deduction' ? 'deduction' : 'earning',
    recurring: Boolean(row.recurring),
    taxable: Boolean(row.taxable),
    pensionable: Boolean(row.pensionable),
    nhfApplicable: Boolean(row.nhf_applicable),
    calculationBasis: row.calculation_basis === 'percentage' ? 'percentage' : 'fixed',
    defaultAmount: typeof row.default_amount === 'number' ? row.default_amount : undefined,
    glCode: typeof row.gl_code === 'string' ? row.gl_code : undefined
  }
}

function mapEmployee(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    employeeCode: String(row.employeeCode),
    fullName: String(row.fullName),
    department: String(row.department),
    branch: String(row.branch),
    roleTitle: String(row.roleTitle),
    employeeType: String(row.employeeType),
    hireDate: String(row.hireDate),
    status: String(row.status),
    bankName: typeof row.bankName === 'string' ? row.bankName : null,
    accountNumber: typeof row.accountNumber === 'string' ? row.accountNumber : null,
    tin: typeof row.tin === 'string' ? row.tin : null,
    rsaNumber: typeof row.rsaNumber === 'string' ? row.rsaNumber : null,
    pfaName: typeof row.pfaName === 'string' ? row.pfaName : null,
    nhfFlag: Boolean(row.nhfFlag),
    payAssignments: []
  }
}

function readEmployeeById(context: DatabaseContext, employeeId: string) {
  return mapEmployee(
    context.db
      .prepare('SELECT id, employee_code AS employeeCode, full_name AS fullName, department, branch, role_title AS roleTitle, employee_type AS employeeType, hire_date AS hireDate, status, bank_name AS bankName, account_number AS accountNumber, tin, rsa_number AS rsaNumber, pfa_name AS pfaName, nhf_flag AS nhfFlag FROM employees WHERE id = ?')
      .get(employeeId) as Record<string, unknown>
  )
}

function readCompanySettings(context: DatabaseContext, companyId: string): CompanyPayrollSettings {
  const row = context.db
    .prepare(
      `SELECT default_working_days AS defaultWorkingDays, validation_policy AS validationPolicy, approval_policy AS approvalPolicy,
              employee_pension_rate AS employeePensionRate, employer_pension_rate AS employerPensionRate, nhf_enabled AS nhfEnabled,
              nhf_rate AS nhfRate, nsitf_enabled AS nsitfEnabled, nsitf_rate AS nsitfRate, paye_remittance_day AS payeRemittanceDay,
              pension_remittance_working_days AS pensionRemittanceWorkingDays
       FROM company_payroll_settings
       WHERE company_id = ?`
    )
    .get(companyId) as Record<string, unknown> | undefined

  if (!row) {
    throw new Error(`Payroll settings not found for company ${companyId}`)
  }

  return {
    defaultWorkingDays: Number(row.defaultWorkingDays),
    validationPolicy: String(row.validationPolicy) as CompanyPayrollSettings['validationPolicy'],
    approvalPolicy: String(row.approvalPolicy) as CompanyPayrollSettings['approvalPolicy'],
    employeePensionRate: Number(row.employeePensionRate),
    employerPensionRate: Number(row.employerPensionRate),
    nhfEnabled: Boolean(row.nhfEnabled),
    nhfRate: Number(row.nhfRate),
    nsitfEnabled: Boolean(row.nsitfEnabled),
    nsitfRate: Number(row.nsitfRate),
    payeRemittanceDay: Number(row.payeRemittanceDay),
    pensionRemittanceWorkingDays: Number(row.pensionRemittanceWorkingDays)
  }
}

function readEmployeePayAssignments(context: DatabaseContext, employeeId: string) {
  return context.db
    .prepare(
      `SELECT assignment.component_code AS componentCode, component.name AS componentName, assignment.amount, assignment.active_from AS activeFrom
       FROM employee_component_assignments assignment
       JOIN pay_components component ON component.code = assignment.component_code
       WHERE assignment.employee_id = ?
       ORDER BY component.kind ASC, component.code ASC`
    )
    .all(employeeId) as Array<{ componentCode: string; componentName: string; amount: number; activeFrom: string }>
}

function readLoans(context: DatabaseContext, companyId: string) {
  return context.db
    .prepare(
      `SELECT loans.id, loans.employee_id AS employeeId, employees.full_name AS employeeName, loans.type, loans.principal, loans.balance,
              loans.monthly_deduction AS monthlyDeduction, loans.repayment_method AS repaymentMethod, loans.start_date AS startDate,
              loans.end_date AS endDate, loans.interest_option AS interestOption, loans.status
       FROM loans
       JOIN employees ON employees.id = loans.employee_id
       WHERE loans.company_id = ?
       ORDER BY loans.start_date DESC, employees.full_name ASC`
    )
    .all(companyId) as Array<{
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
    }>
}

function writeAuditLog(context: DatabaseContext, companyId: string, action: string, entityType: string, entityId: string, userId?: string, details?: unknown): void {
  context.db
    .prepare('INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), companyId, userId ?? null, action, entityType, entityId, details ? JSON.stringify(details) : null, new Date().toISOString())
}

function getUserRole(context: DatabaseContext, userId: string): Role {
  const user = context.db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: Role } | undefined
  if (!user) {
    throw new Error('User not found')
  }

  return user.role
}

export function createServiceFacade(options: ServiceFacadeOptions) {
  const { database, exportDir } = options
  ensureDirectory(exportDir)

  const companies = {
    list() {
      return database.db
        .prepare('SELECT id, name, tax_state AS taxState, payroll_frequency AS payrollFrequency, currency, pay_date AS payDate, active_tax_policy_id AS activeTaxPolicyId FROM companies ORDER BY name ASC')
        .all() as Array<{
        id: string
        name: string
        taxState: string
        payrollFrequency: number
        currency: string
        payDate: number
        activeTaxPolicyId: string
      }>
    },
    getSettings(companyId: string) {
      return readCompanySettings(database, companyId)
    },
    updateSettings(companyId: string, payload: CompanyPayrollSettings, userId: string) {
      const role = getUserRole(database, userId)
      if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
        throw new Error('Permission denied: user cannot update company payroll settings')
      }

      database.db
        .prepare(
          `UPDATE company_payroll_settings
           SET default_working_days = ?, validation_policy = ?, approval_policy = ?, employee_pension_rate = ?, employer_pension_rate = ?,
               nhf_enabled = ?, nhf_rate = ?, nsitf_enabled = ?, nsitf_rate = ?, paye_remittance_day = ?, pension_remittance_working_days = ?
           WHERE company_id = ?`
        )
        .run(
          payload.defaultWorkingDays,
          payload.validationPolicy,
          payload.approvalPolicy,
          payload.employeePensionRate,
          payload.employerPensionRate,
          payload.nhfEnabled ? 1 : 0,
          payload.nhfRate,
          payload.nsitfEnabled ? 1 : 0,
          payload.nsitfRate,
          payload.payeRemittanceDay,
          payload.pensionRemittanceWorkingDays,
          companyId
        )

      writeAuditLog(database, companyId, 'company_payroll_settings.updated', 'company', companyId, userId, payload)

      return readCompanySettings(database, companyId)
    }
  }

  const payrollRuns = {
    generate(companyId: string, payPeriod: string) {
      const existingRun = database.db.prepare('SELECT id, status FROM payroll_runs WHERE company_id = ? AND pay_period = ?').get(companyId, payPeriod) as { id: string; status: string } | undefined
      if (existingRun && ['approved', 'finalized', 'posted'].includes(existingRun.status)) {
        throw new Error('Approved payroll run is immutable')
      }

      const company = database.db.prepare('SELECT payroll_frequency AS payrollFrequency FROM companies WHERE id = ?').get(companyId) as { payrollFrequency: number }
      const policy = readActivePolicy(database, companyId)

      const employees = database.db
        .prepare('SELECT id, employee_code AS employeeCode, full_name AS fullName, department, branch, role_title AS roleTitle, annual_rent AS annualRent FROM employees WHERE company_id = ? AND status = ? ORDER BY full_name ASC')
        .all(companyId, 'active') as EmployeeProfile[]

      const componentMap = Object.fromEntries(
        database.db.prepare('SELECT * FROM pay_components WHERE company_id = ?').all(companyId).map((row) => {
          const component = mapComponent(row as Record<string, unknown>)
          return [component.code, component]
        })
      ) as Record<string, PayComponentDefinition>

      const recurringAssignments = database.db
        .prepare('SELECT employee_id AS employeeId, component_code AS componentCode, amount FROM employee_component_assignments WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)')
        .all(companyId) as Array<{ employeeId: string; componentCode: string; amount: number }>

      const variableInputs = database.db
        .prepare('SELECT employee_id AS employeeId, pay_period AS payPeriod, component_code AS componentCode, amount, source_period AS sourcePeriod, source_file AS sourceFile, import_batch_id AS importBatchId, validation_status AS validationStatus FROM payroll_inputs WHERE company_id = ? AND pay_period = ?')
        .all(companyId, payPeriod) as PayrollInputLine[]

      const employeeResults = employees.map((employee) =>
        calculateEmployeePayroll({
          employee,
          payPeriod,
          components: componentMap,
          recurringInputs: recurringAssignments.filter((assignment) => assignment.employeeId === employee.id).map((assignment) => ({
            employeeId: assignment.employeeId,
            payPeriod,
            componentCode: assignment.componentCode,
            amount: Number(assignment.amount)
          })),
          variableInputs: variableInputs.filter((line) => line.employeeId === employee.id).map((line) => ({ ...line, amount: Number(line.amount) })),
          taxPolicy: policy,
          payrollFrequency: company.payrollFrequency
        })
      )

      const summary = {
        id: existingRun?.id ?? randomUUID(),
        status: 'draft' as const,
        grossPay: roundCurrency(employeeResults.reduce((sum, result) => sum + result.grossPay, 0)),
        netPay: roundCurrency(employeeResults.reduce((sum, result) => sum + result.netPay, 0)),
        payeTotal: roundCurrency(employeeResults.reduce((sum, result) => sum + result.paye, 0)),
        employeeCount: employeeResults.length
      }

      const snapshot: PayrollRunSnapshot = {
        runId: summary.id,
        period: payPeriod,
        status: summary.status,
        policyCode: policy.code,
        employees: employeeResults
      }

      database.db
        .prepare('INSERT INTO payroll_runs (id, company_id, pay_period, status, policy_code, gross_pay, net_pay, paye_total, employee_count, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, policy_code = excluded.policy_code, gross_pay = excluded.gross_pay, net_pay = excluded.net_pay, paye_total = excluded.paye_total, employee_count = excluded.employee_count, approved_by = NULL, approved_at = NULL')
        .run(summary.id, companyId, payPeriod, summary.status, policy.code, summary.grossPay, summary.netPay, summary.payeTotal, summary.employeeCount, null, null)
      database.db
        .prepare('INSERT INTO payroll_snapshots (run_id, snapshot_json) VALUES (?, ?) ON CONFLICT(run_id) DO UPDATE SET snapshot_json = excluded.snapshot_json')
        .run(summary.id, JSON.stringify(snapshot))

      writeAuditLog(database, companyId, 'payroll.generated', 'payroll_run', summary.id, undefined, { payPeriod })
      return summary
    },
    validate(runId: string, userId: string): PayrollRunTransitionResult {
      const run = database.db.prepare('SELECT company_id AS companyId, status FROM payroll_runs WHERE id = ?').get(runId) as { companyId: string; status: string } | undefined
      if (!run) throw new Error('Payroll run not found')

      const role = getUserRole(database, userId)
      if (!['admin', 'payroll_officer'].includes(role)) {
        throw new Error('Permission denied: user cannot validate payroll')
      }
      if (!['draft', 'validated'].includes(run.status)) {
        throw new Error('Only draft payroll runs can be validated')
      }

      const validation = buildPayrollValidation(database, runId)
      const snapshot = readRunSnapshot(database, runId)
      const validatedSnapshot: PayrollRunSnapshot = { ...snapshot, status: 'validated' }

      database.db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('validated', runId)
      writeRunSnapshot(database, runId, validatedSnapshot)
      writeAuditLog(database, run.companyId, 'payroll.validated', 'payroll_run', runId, userId, validation)

      return {
        id: runId,
        status: 'validated',
        blockingCount: validation.blockingCount,
        warningCount: validation.warningCount
      }
    },
    approve(runId: string, userId: string) {
      const run = database.db.prepare('SELECT company_id AS companyId, status FROM payroll_runs WHERE id = ?').get(runId) as { companyId: string; status: string } | undefined
      if (!run) throw new Error('Payroll run not found')
      const role = getUserRole(database, userId)
      if (role !== 'admin' && role !== 'approver') {
        throw new Error('Permission denied: user cannot approve payroll')
      }
      if (run.status === 'approved') throw new Error('Payroll run already approved')
      if (run.status !== 'in_review') throw new Error('Payroll run must be in review before approval')

      const approvedAt = new Date().toISOString()
      const snapshotRecord = database.db.prepare('SELECT snapshot_json AS snapshotJson FROM payroll_snapshots WHERE run_id = ?').get(runId) as { snapshotJson: string }
      const snapshot = parseJson<PayrollRunSnapshot>(snapshotRecord.snapshotJson)
      const approvedSnapshot: PayrollRunSnapshot = { ...snapshot, status: 'approved', approvedBy: userId, approvedAt }

      database.db.prepare('UPDATE payroll_runs SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?').run('approved', userId, approvedAt, runId)
      database.db.prepare('UPDATE payroll_snapshots SET snapshot_json = ? WHERE run_id = ?').run(JSON.stringify(approvedSnapshot), runId)
      writeAuditLog(database, run.companyId, 'payroll.approved', 'payroll_run', runId, userId, { approvedAt })

      return { id: runId, status: 'approved' as const }
    },
    submitForReview(runId: string, userId: string) {
      const run = database.db.prepare('SELECT company_id AS companyId, status FROM payroll_runs WHERE id = ?').get(runId) as { companyId: string; status: string } | undefined
      if (!run) throw new Error('Payroll run not found')
      if (run.status !== 'validated') throw new Error('Only validated payroll runs can be submitted for review')

      const role = getUserRole(database, userId)
      if (role !== 'admin' && role !== 'payroll_officer') {
        throw new Error('Permission denied: user cannot submit payroll for review')
      }

      const snapshotRecord = database.db.prepare('SELECT snapshot_json AS snapshotJson FROM payroll_snapshots WHERE run_id = ?').get(runId) as { snapshotJson: string }
      const snapshot = parseJson<PayrollRunSnapshot>(snapshotRecord.snapshotJson)
      const reviewedSnapshot: PayrollRunSnapshot = { ...snapshot, status: 'in_review' }

      database.db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('in_review', runId)
      database.db.prepare('UPDATE payroll_snapshots SET snapshot_json = ? WHERE run_id = ?').run(JSON.stringify(reviewedSnapshot), runId)
      writeAuditLog(database, run.companyId, 'payroll.in_review', 'payroll_run', runId, userId)

      return { id: runId, status: 'in_review' as const }
    },
    finalize(runId: string, userId: string): PayrollRunTransitionResult {
      const run = database.db.prepare('SELECT company_id AS companyId, status FROM payroll_runs WHERE id = ?').get(runId) as { companyId: string; status: string } | undefined
      if (!run) throw new Error('Payroll run not found')

      const role = getUserRole(database, userId)
      if (!['admin', 'approver'].includes(role)) {
        throw new Error('Permission denied: user cannot finalize payroll')
      }
      if (run.status !== 'approved') {
        throw new Error('Payroll run must be approved before finalization')
      }

      const validation = buildPayrollValidation(database, runId)
      if (validation.blockingCount > 0) {
        throw new Error('Payroll run has blocking exceptions and cannot be finalized')
      }

      const snapshot = readRunSnapshot(database, runId)
      const finalizedSnapshot: PayrollRunSnapshot = { ...snapshot, status: 'finalized' }

      database.db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('finalized', runId)
      writeRunSnapshot(database, runId, finalizedSnapshot)
      writeAuditLog(database, run.companyId, 'payroll.finalized', 'payroll_run', runId, userId, validation)

      return { id: runId, status: 'finalized' }
    },
    post(runId: string, userId: string): PayrollRunTransitionResult {
      const run = database.db.prepare('SELECT company_id AS companyId, status FROM payroll_runs WHERE id = ?').get(runId) as { companyId: string; status: string } | undefined
      if (!run) throw new Error('Payroll run not found')

      const role = getUserRole(database, userId)
      if (!['admin', 'approver'].includes(role)) {
        throw new Error('Permission denied: user cannot post payroll')
      }
      if (run.status !== 'finalized') {
        throw new Error('Payroll run must be finalized before posting')
      }

      const snapshot = readRunSnapshot(database, runId)
      const postedSnapshot: PayrollRunSnapshot = { ...snapshot, status: 'posted' }

      database.db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('posted', runId)
      writeRunSnapshot(database, runId, postedSnapshot)
      writeAuditLog(database, run.companyId, 'payroll.posted', 'payroll_run', runId, userId, buildPostingSummary(database, runId))

      return { id: runId, status: 'posted' }
    },
    list(companyId: string) {
      return database.db
        .prepare('SELECT id, pay_period AS payPeriod, status, gross_pay AS grossPay, net_pay AS netPay, paye_total AS payeTotal, employee_count AS employeeCount FROM payroll_runs WHERE company_id = ? ORDER BY pay_period DESC')
        .all(companyId)
    },
    getById(runId: string) {
      const run = readRunSummary(database, runId)
      if (!run) {
        throw new Error('Payroll run not found')
      }
      const snapshot = readRunSnapshot(database, runId)
      const variance = buildPayrollVariance(database, run.companyId, run.payPeriod, {
        grossPay: run.grossPay,
        netPay: run.netPay,
        payeTotal: run.payeTotal
      })
      const validation = buildPayrollValidation(database, runId)
      const postingSummary = buildPostingSummary(database, runId)

      return { ...run, snapshot, variance, validation, postingSummary }
    }
  }

  const exports = {
    generateJournalCsv(runId: string) {
      const detail = payrollRuns.getById(runId)
      assertExportAllowed(detail.status, 'journal')
      const filePath = join(exportDir, `${detail.payPeriod}-journal.csv`)
      const rows = [
        'entry,account,amount',
        `Dr,Salary Expense,${detail.postingSummary.salaryExpense}`,
        `Dr,Employer Pension Expense,${detail.postingSummary.employerPensionExpense}`,
        `Cr,PAYE Payable,${detail.postingSummary.payePayable}`,
        `Cr,Pension Payable,${detail.postingSummary.pensionPayable}`,
        `Cr,NHF Payable,${detail.postingSummary.nhfPayable}`,
        `Cr,Bank,${detail.postingSummary.netPayable}`
      ]
      writeFileSync(filePath, rows.join('\n'), 'utf8')
      database.db.prepare('INSERT INTO export_jobs (id, company_id, run_id, type, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), detail.companyId, runId, 'journal_csv', filePath, new Date().toISOString())
      return { filePath }
    },
    generateBankScheduleXlsx(runId: string) {
      const detail = payrollRuns.getById(runId)
      assertExportAllowed(detail.status, 'bank')
      const filePath = join(exportDir, `${detail.payPeriod}-bank-schedule.xlsx`)
      const workbook = XLSX.utils.book_new()
      const paymentDetails = new Map(readEmployeePaymentDetails(database, detail.companyId).map((employee) => [employee.id, employee] as const))
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          detail.snapshot.employees.map((employee) => ({
            EmployeeId: employee.employeeId,
            EmployeeName: paymentDetails.get(employee.employeeId)?.fullName ?? employee.employeeId,
            BankName: paymentDetails.get(employee.employeeId)?.bankName ?? '',
            AccountNumber: paymentDetails.get(employee.employeeId)?.accountNumber ?? '',
            NetPay: employee.netPay
          }))
        ),
        'Bank Schedule'
      )
      XLSX.writeFile(workbook, filePath)
      database.db.prepare('INSERT INTO export_jobs (id, company_id, run_id, type, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), detail.companyId, runId, 'bank_xlsx', filePath, new Date().toISOString())
      return { filePath }
    },
    async generatePayslipPdf(runId: string, employeeId: string) {
      const detail = payrollRuns.getById(runId)
      assertExportAllowed(detail.status, 'payslip')
      const employee = detail.snapshot.employees.find((candidate) => candidate.employeeId === employeeId)
      if (!employee) throw new Error('Employee payslip not found')

      const pdf = await PDFDocument.create()
      const page = pdf.addPage([595, 842])
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      page.drawText('HAQLY Payroll Payslip', { x: 50, y: 780, size: 24, font, color: rgb(0, 0.12, 0.3) })
      page.drawText(`Run: ${detail.payPeriod}`, { x: 50, y: 740, size: 12, font })
      page.drawText(`Employee ID: ${employee.employeeId}`, { x: 50, y: 720, size: 12, font })
      page.drawText(`Gross Pay: ${formatPdfCurrency(employee.grossPay)}`, { x: 50, y: 690, size: 12, font })
      page.drawText(`PAYE: ${formatPdfCurrency(employee.paye)}`, { x: 50, y: 670, size: 12, font })
      page.drawText(`Net Pay: ${formatPdfCurrency(employee.netPay)}`, { x: 50, y: 650, size: 12, font })
      const filePath = join(exportDir, `${detail.payPeriod}-${employeeId}-payslip.pdf`)
      writeFileSync(filePath, await pdf.save())
      database.db.prepare('INSERT INTO export_jobs (id, company_id, run_id, type, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), detail.companyId, runId, 'payslip_pdf', filePath, new Date().toISOString())
      return { filePath }
    }
  }

  return {
    auth: {
      login(email: string, password: string) {
        const user = database.db.prepare('SELECT id, email, password_hash AS passwordHash, role, display_name AS displayName FROM users WHERE email = ?').get(email) as { id: string; email: string; passwordHash: string; role: Role; displayName: string } | undefined
        if (!user || !compareSync(password, user.passwordHash)) throw new Error('Invalid credentials')
        return { id: user.id, email: user.email, role: user.role, displayName: user.displayName }
      }
    },
    companies,
    employees: {
      list(companyId: string) {
        return database.db
          .prepare('SELECT id, employee_code AS employeeCode, full_name AS fullName, department, branch, role_title AS roleTitle, employee_type AS employeeType, hire_date AS hireDate, status, bank_name AS bankName, account_number AS accountNumber, tin, rsa_number AS rsaNumber, pfa_name AS pfaName, nhf_flag AS nhfFlag FROM employees WHERE company_id = ? ORDER BY full_name ASC')
          .all(companyId)
          .map((row) => {
            const employee = mapEmployee(row as Record<string, unknown>)
            return {
              ...employee,
              payAssignments: readEmployeePayAssignments(database, employee.id)
            }
          })
      },
      create(companyId: string, payload: EmployeeCreateInput, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot create employees')
        }

        const employeeId = randomUUID()
        database.db
          .prepare(
            `INSERT INTO employees
             (id, company_id, employee_code, full_name, department, branch, role_title, employee_type, hire_date, status, bank_name, account_number, tin, rsa_number, pfa_name, nhf_flag)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            employeeId,
            companyId,
            payload.employeeCode.trim(),
            payload.fullName.trim(),
            payload.department.trim(),
            payload.branch.trim(),
            payload.roleTitle.trim(),
            payload.employeeType,
            payload.hireDate.trim(),
            payload.status.trim(),
            payload.bankName.trim() || null,
            payload.accountNumber.trim() || null,
            payload.tin.trim() || null,
            payload.rsaNumber.trim() || null,
            null,
            0
          )

        writeAuditLog(database, companyId, 'employee.created', 'employee', employeeId, userId, payload)

        return {
          ...readEmployeeById(database, employeeId),
          payAssignments: readEmployeePayAssignments(database, employeeId)
        }
      },
      update(companyId: string, employeeId: string, payload: EmployeeUpdateInput, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot update employees')
        }

        const employee = database.db
          .prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?')
          .get(employeeId, companyId) as { id: string } | undefined

        if (!employee) {
          throw new Error('Employee not found')
        }

        database.db
          .prepare('UPDATE employees SET full_name = ?, department = ?, branch = ?, role_title = ?, employee_type = ?, bank_name = ?, account_number = ?, tin = ?, rsa_number = ?, status = ? WHERE id = ? AND company_id = ?')
          .run(
            payload.fullName.trim(),
            payload.department.trim(),
            payload.branch.trim(),
            payload.roleTitle.trim(),
            payload.employeeType,
            payload.bankName.trim(),
            payload.accountNumber.trim(),
            payload.tin.trim() || null,
            payload.rsaNumber.trim() || null,
            payload.status.trim(),
            employeeId,
            companyId
          )

        writeAuditLog(database, companyId, 'employee.updated', 'employee', employeeId, userId, payload)

        return {
          ...readEmployeeById(database, employeeId),
          payAssignments: readEmployeePayAssignments(database, employeeId)
        }
      },
      updatePayAssignments(companyId: string, employeeId: string, payload: EmployeePayAssignmentUpdateInput[], userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot edit employee compensation')
        }

        const employee = database.db.prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?').get(employeeId, companyId) as { id: string } | undefined
        if (!employee) {
          throw new Error('Employee not found')
        }

        const updateAssignment = database.db.prepare(
          `UPDATE employee_component_assignments
           SET amount = ?
           WHERE employee_id = ? AND component_code = ?`
        )

        for (const assignment of payload) {
          updateAssignment.run(assignment.amount, employeeId, assignment.componentCode)
        }

        writeAuditLog(database, companyId, 'employee_compensation.updated', 'employee', employeeId, userId, payload)

        return readEmployeePayAssignments(database, employeeId)
      }
    },
    structures: {
      get(companyId: string) {
        return {
          policy: readActivePolicy(database, companyId),
          components: database.db.prepare('SELECT * FROM pay_components WHERE company_id = ? ORDER BY kind ASC, code ASC').all(companyId).map((row) => mapComponent(row as Record<string, unknown>))
        }
      },
      create(companyId: string, payload: PayComponentCreateInput, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot create salary structures')
        }

        database.db
          .prepare(
            `INSERT INTO pay_components
             (code, company_id, name, category, kind, recurring, taxable, pensionable, nhf_applicable, calculation_basis, default_amount, gl_code)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            payload.code.trim(),
            companyId,
            payload.name.trim(),
            payload.category.trim(),
            payload.kind.trim(),
            payload.recurring ? 1 : 0,
            payload.taxable ? 1 : 0,
            payload.pensionable ? 1 : 0,
            payload.nhfApplicable ? 1 : 0,
            payload.calculationBasis,
            null,
            payload.glCode?.trim() || null
          )

        writeAuditLog(database, companyId, 'pay_component.created', 'pay_component', payload.code.trim(), userId, payload)

        const created = database.db.prepare('SELECT * FROM pay_components WHERE company_id = ? AND code = ?').get(companyId, payload.code.trim())
        if (!created) {
          throw new Error(`Unable to find pay component ${payload.code}`)
        }

        return mapComponent(created as Record<string, unknown>)
      },
      update(companyId: string, componentCode: string, payload: PayComponentUpdateInput, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot edit salary structures')
        }

        database.db
          .prepare(
            `UPDATE pay_components
             SET name = ?, category = ?, recurring = ?, taxable = ?, pensionable = ?, nhf_applicable = ?, calculation_basis = ?, gl_code = ?
             WHERE company_id = ? AND code = ?`
          )
          .run(
            payload.name.trim(),
            payload.category.trim(),
            payload.recurring ? 1 : 0,
            payload.taxable ? 1 : 0,
            payload.pensionable ? 1 : 0,
            payload.nhfApplicable ? 1 : 0,
            payload.calculationBasis,
            payload.glCode?.trim() || null,
            companyId,
            componentCode
          )

        writeAuditLog(database, companyId, 'pay_component.updated', 'pay_component', componentCode, userId, payload)

        const updated = database.db.prepare('SELECT * FROM pay_components WHERE company_id = ? AND code = ?').get(companyId, componentCode)
        if (!updated) {
          throw new Error(`Unable to find pay component ${componentCode}`)
        }

        return mapComponent(updated as Record<string, unknown>)
      }
    },
    inputs: {
      list(companyId: string, payPeriod: string) {
        const lines = database.db.prepare('SELECT employee_id AS employeeId, pay_period AS payPeriod, component_code AS componentCode, amount, source_period AS sourcePeriod, source_file AS sourceFile, import_batch_id AS importBatchId, validation_status AS validationStatus FROM payroll_inputs WHERE company_id = ? AND pay_period = ? ORDER BY employee_id ASC').all(companyId, payPeriod) as PayrollInputLine[]
        const batches = database.db
          .prepare('SELECT id, source_file AS sourceFile, status, created_at AS createdAt FROM import_batches WHERE company_id = ? ORDER BY created_at DESC')
          .all(companyId) as Array<{ id: string; sourceFile: string; status: string; createdAt: string }>

        return {
          lines,
          batches
        }
      },
      save(companyId: string, payload: PayrollInputSaveInput, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot save payroll inputs')
        }

        database.db
          .prepare('INSERT INTO payroll_inputs (id, company_id, employee_id, pay_period, component_code, amount, source_period, source_file, import_batch_id, validation_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(
            randomUUID(),
            companyId,
            payload.employeeId,
            payload.payPeriod,
            payload.componentCode,
            payload.amount,
            payload.sourcePeriod?.trim() || null,
            'manual-entry',
            null,
            'valid'
          )

        writeAuditLog(database, companyId, 'payroll_input.saved', 'payroll_input', `${payload.employeeId}:${payload.componentCode}:${payload.payPeriod}`, userId, payload)

        return {
          employeeId: payload.employeeId,
          payPeriod: payload.payPeriod,
          componentCode: payload.componentCode,
          amount: payload.amount,
          sourcePeriod: payload.sourcePeriod?.trim() || undefined,
          sourceFile: 'manual-entry',
          validationStatus: 'valid' as const
        }
      },
      importCsv(companyId: string, payload: PayrollInputImportInput, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot import payroll inputs')
        }

        const batchId = randomUUID()
        const rows = parseCsvRows(payload.csvText)
        const employeeLookup = new Map(
          (database.db.prepare('SELECT id, employee_code AS employeeCode FROM employees WHERE company_id = ?').all(companyId) as Array<{ id: string; employeeCode: string }>)
            .map((employee) => [employee.employeeCode, employee.id] as const)
        )
        const componentLookup = new Set(
          (database.db.prepare('SELECT code FROM pay_components WHERE company_id = ?').all(companyId) as Array<{ code: string }>).map((component) => component.code)
        )

        let importedCount = 0
        let invalidCount = 0

        for (const row of rows) {
          const employeeId = employeeLookup.get(row.employeeCode)
          const amount = Number(row.amount)
          const componentCode = row.componentCode

          if (!employeeId || !componentLookup.has(componentCode) || Number.isNaN(amount)) {
            invalidCount += 1
            continue
          }

          database.db
            .prepare('INSERT INTO payroll_inputs (id, company_id, employee_id, pay_period, component_code, amount, source_period, source_file, import_batch_id, validation_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(
              randomUUID(),
              companyId,
              employeeId,
              payload.payPeriod,
              componentCode,
              amount,
              row.sourcePeriod || null,
              payload.sourceFile.trim(),
              batchId,
              'valid'
            )

          importedCount += 1
        }

        const status = invalidCount > 0 ? 'needs_review' : 'validated'
        database.db
          .prepare('INSERT INTO import_batches (id, company_id, source_file, status, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(batchId, companyId, payload.sourceFile.trim(), status, new Date().toISOString())

        writeAuditLog(database, companyId, 'payroll_input.imported', 'import_batch', batchId, userId, {
          sourceFile: payload.sourceFile,
          payPeriod: payload.payPeriod,
          importedCount,
          invalidCount
        })

        return {
          batchId,
          importedCount,
          invalidCount,
          status
        }
      }
    },
    payrollRuns,
    dashboard: {
      get(companyId: string, payPeriod: string) {
        const run = (database.db.prepare('SELECT id FROM payroll_runs WHERE company_id = ? AND pay_period = ?').get(companyId, payPeriod) as { id: string } | undefined) ?? payrollRuns.generate(companyId, payPeriod)
        const detail = payrollRuns.getById(run.id)
        const exportReadiness = buildExportReadiness(detail.status)
        return {
          payrollStatus: detail.status,
          grossPay: detail.grossPay,
          netPay: detail.netPay,
          payeTotal: detail.payeTotal,
          employeeCount: detail.employeeCount,
          postingReadiness: {
            blockingCount: detail.validation.blockingCount,
            warningCount: detail.validation.warningCount,
            journalExportReady: exportReadiness.journal,
            bankExportReady: exportReadiness.bank,
            summary: exportReadiness.message
          },
          liabilities: {
            payePayable: detail.postingSummary.payePayable,
            pensionPayable: detail.postingSummary.pensionPayable,
            nhfPayable: detail.postingSummary.nhfPayable,
            netPayable: detail.postingSummary.netPayable
          },
          compliance: [
            buildPayeSchedule({ amount: detail.payeTotal, paymentDate: `${payPeriod}-30`, today: `${payPeriod}-30`, reference: payPeriod }),
            buildPensionSchedule({ amount: roundCurrency(detail.payeTotal * 0.35), paymentDate: `${payPeriod}-30`, today: `${payPeriod}-30`, reference: payPeriod })
          ],
          pendingTasks: [
            { id: 'arrears', title: 'Review Arrears for Dept A', detail: '2 employees affected by back-dated adjustments' },
            { id: 'bonus', title: 'Approve Salary Adjustments', detail: 'Performance bonuses for Engineering team' }
          ],
          auditLog: database.db.prepare('SELECT action, created_at AS createdAt FROM audit_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT 5').all(companyId)
        }
      }
    },
    compliance: {
      get(companyId: string, payPeriod: string) {
        const run = (database.db.prepare('SELECT id FROM payroll_runs WHERE company_id = ? AND pay_period = ?').get(companyId, payPeriod) as { id: string } | undefined) ?? payrollRuns.generate(companyId, payPeriod)
        const detail = payrollRuns.getById(run.id)
        const policy = readActivePolicy(database, companyId)
        return {
          schedules: [
            buildPayeSchedule({ amount: detail.payeTotal, paymentDate: `${payPeriod}-30`, today: `${payPeriod}-30`, reference: payPeriod }),
            buildPensionSchedule({ amount: roundCurrency(detail.payeTotal * 0.35), paymentDate: `${payPeriod}-30`, today: `${payPeriod}-30`, reference: payPeriod })
          ],
          exceptions: {
            missingTin: database.db.prepare('SELECT full_name AS fullName, employee_code AS employeeCode FROM employees WHERE company_id = ? AND tin IS NULL').all(companyId),
            missingRsa: database.db.prepare('SELECT full_name AS fullName, employee_code AS employeeCode FROM employees WHERE company_id = ? AND rsa_number IS NULL').all(companyId)
          },
          settings: readCompanySettings(database, companyId),
          policySummary: {
            code: policy.code,
            name: policy.name,
            deductionRules: policy.deductionRules.map((rule) => rule.name)
          }
        }
      }
    },
    reports: {
      get(companyId: string, payPeriod: string) {
        const run = database.db.prepare('SELECT id FROM payroll_runs WHERE company_id = ? AND pay_period = ?').get(companyId, payPeriod) as { id: string } | undefined
        const summary = run ? payrollRuns.getById(run.id) : null
        return {
          summary,
          financeSummary: summary
            ? {
                payrollStatus: summary.status,
                validation: summary.validation,
                postingSummary: summary.postingSummary,
                exportReadiness: buildExportReadiness(summary.status)
              }
            : null,
          exportJobs: database.db.prepare('SELECT id, type, file_path AS filePath, created_at AS createdAt FROM export_jobs WHERE company_id = ? ORDER BY created_at DESC').all(companyId)
        }
      }
    },
    exports,
    loans: {
      list(companyId: string) {
        return readLoans(database, companyId)
      },
      create(companyId: string, payload: LoanCreateInput, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot create loans')
        }

        const id = randomUUID()
        database.db
          .prepare(
            `INSERT INTO loans (id, company_id, employee_id, type, principal, balance, monthly_deduction, repayment_method, start_date, end_date, interest_option, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            companyId,
            payload.employeeId,
            payload.type,
            payload.principal,
            payload.principal,
            payload.monthlyDeduction,
            payload.repaymentMethod,
            payload.startDate,
            payload.endDate,
            payload.interestOption,
            'active'
          )

        writeAuditLog(database, companyId, 'loan.created', 'loan', id, userId, payload)

        const created = readLoans(database, companyId).find((loan) => loan.id === id)
        if (!created) {
          throw new Error('Unable to create loan')
        }
        return created
      },
      updateStatus(companyId: string, loanId: string, status: LoanStatus, userId: string) {
        const role = getUserRole(database, userId)
        if (!['admin', 'payroll_officer', 'approver'].includes(role)) {
          throw new Error('Permission denied: user cannot update loans')
        }

        database.db
          .prepare('UPDATE loans SET status = ? WHERE id = ? AND company_id = ?')
          .run(status, loanId, companyId)

        writeAuditLog(database, companyId, 'loan.status_updated', 'loan', loanId, userId, { status })

        const updated = readLoans(database, companyId).find((loan) => loan.id === loanId)
        if (!updated) {
          throw new Error(`Loan not found: ${loanId}`)
        }
        return updated
      }
    }
  }
}
