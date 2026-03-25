import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { compareSync } from 'bcryptjs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as XLSX from 'xlsx'

import type { EmployeeUpdateInput, PayComponentUpdateInput, PayrollInputSaveInput } from '@shared/api'
import { formatNaira, roundCurrency } from '@shared/money'
import type {
  EmployeeProfile,
  PayComponentDefinition,
  PayrollInputLine,
  PayrollRunSnapshot,
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
    hireDate: String(row.hireDate),
    status: String(row.status),
    bankName: typeof row.bankName === 'string' ? row.bankName : null,
    accountNumber: typeof row.accountNumber === 'string' ? row.accountNumber : null,
    tin: typeof row.tin === 'string' ? row.tin : null,
    rsaNumber: typeof row.rsaNumber === 'string' ? row.rsaNumber : null,
    pfaName: typeof row.pfaName === 'string' ? row.pfaName : null,
    nhfFlag: Boolean(row.nhfFlag)
  }
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
    }
  }

  const payrollRuns = {
    generate(companyId: string, payPeriod: string) {
      const existingRun = database.db.prepare('SELECT id, status FROM payroll_runs WHERE company_id = ? AND pay_period = ?').get(companyId, payPeriod) as { id: string; status: string } | undefined
      if (existingRun?.status === 'approved') {
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
      if (run.status !== 'draft') throw new Error('Only draft payroll runs can be submitted for review')

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
    list(companyId: string) {
      return database.db
        .prepare('SELECT id, pay_period AS payPeriod, status, gross_pay AS grossPay, net_pay AS netPay, paye_total AS payeTotal, employee_count AS employeeCount FROM payroll_runs WHERE company_id = ? ORDER BY pay_period DESC')
        .all(companyId)
    },
    getById(runId: string) {
      const run = database.db
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
        }
      const snapshot = parseJson<PayrollRunSnapshot>((database.db.prepare('SELECT snapshot_json AS snapshotJson FROM payroll_snapshots WHERE run_id = ?').get(runId) as { snapshotJson: string }).snapshotJson)
      const variance = buildPayrollVariance(database, run.companyId, run.payPeriod, {
        grossPay: run.grossPay,
        netPay: run.netPay,
        payeTotal: run.payeTotal
      })

      return { ...run, snapshot, variance }
    }
  }

  const exports = {
    generateJournalCsv(runId: string) {
      const detail = payrollRuns.getById(runId)
      const filePath = join(exportDir, `${detail.payPeriod}-journal.csv`)
      writeFileSync(filePath, ['entry,account,amount', `Dr,Salary Expense,${detail.grossPay}`, `Cr,PAYE Payable,${detail.payeTotal}`, `Cr,Bank,${detail.netPay}`].join('\n'), 'utf8')
      database.db.prepare('INSERT INTO export_jobs (id, company_id, run_id, type, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), detail.companyId, runId, 'journal_csv', filePath, new Date().toISOString())
      return { filePath }
    },
    generateBankScheduleXlsx(runId: string) {
      const detail = payrollRuns.getById(runId)
      const filePath = join(exportDir, `${detail.payPeriod}-bank-schedule.xlsx`)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail.snapshot.employees.map((employee) => ({ EmployeeId: employee.employeeId, NetPay: employee.netPay }))), 'Bank Schedule')
      XLSX.writeFile(workbook, filePath)
      database.db.prepare('INSERT INTO export_jobs (id, company_id, run_id, type, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), detail.companyId, runId, 'bank_xlsx', filePath, new Date().toISOString())
      return { filePath }
    },
    async generatePayslipPdf(runId: string, employeeId: string) {
      const detail = payrollRuns.getById(runId)
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
          .prepare('SELECT id, employee_code AS employeeCode, full_name AS fullName, department, branch, role_title AS roleTitle, hire_date AS hireDate, status, bank_name AS bankName, account_number AS accountNumber, tin, rsa_number AS rsaNumber, pfa_name AS pfaName, nhf_flag AS nhfFlag FROM employees WHERE company_id = ? ORDER BY full_name ASC')
          .all(companyId)
          .map((row) => mapEmployee(row as Record<string, unknown>))
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
          .prepare('UPDATE employees SET full_name = ?, department = ?, branch = ?, role_title = ?, bank_name = ?, account_number = ?, tin = ?, rsa_number = ?, status = ? WHERE id = ? AND company_id = ?')
          .run(
            payload.fullName.trim(),
            payload.department.trim(),
            payload.branch.trim(),
            payload.roleTitle.trim(),
            payload.bankName.trim(),
            payload.accountNumber.trim(),
            payload.tin.trim() || null,
            payload.rsaNumber.trim() || null,
            payload.status.trim(),
            employeeId,
            companyId
          )

        writeAuditLog(database, companyId, 'employee.updated', 'employee', employeeId, userId, payload)

        return mapEmployee(
          database.db
            .prepare('SELECT id, employee_code AS employeeCode, full_name AS fullName, department, branch, role_title AS roleTitle, hire_date AS hireDate, status, bank_name AS bankName, account_number AS accountNumber, tin, rsa_number AS rsaNumber, pfa_name AS pfaName, nhf_flag AS nhfFlag FROM employees WHERE id = ?')
            .get(employeeId) as Record<string, unknown>
        )
      }
    },
    structures: {
      get(companyId: string) {
        return {
          policy: readActivePolicy(database, companyId),
          components: database.db.prepare('SELECT * FROM pay_components WHERE company_id = ? ORDER BY kind ASC, code ASC').all(companyId).map((row) => mapComponent(row as Record<string, unknown>))
        }
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
      }
    },
    payrollRuns,
    dashboard: {
      get(companyId: string, payPeriod: string) {
        const run = (database.db.prepare('SELECT id FROM payroll_runs WHERE company_id = ? AND pay_period = ?').get(companyId, payPeriod) as { id: string } | undefined) ?? payrollRuns.generate(companyId, payPeriod)
        const detail = payrollRuns.getById(run.id)
        return {
          payrollStatus: detail.status,
          grossPay: detail.grossPay,
          netPay: detail.netPay,
          payeTotal: detail.payeTotal,
          employeeCount: detail.employeeCount,
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
        return {
          schedules: [
            buildPayeSchedule({ amount: detail.payeTotal, paymentDate: `${payPeriod}-30`, today: `${payPeriod}-30`, reference: payPeriod }),
            buildPensionSchedule({ amount: roundCurrency(detail.payeTotal * 0.35), paymentDate: `${payPeriod}-30`, today: `${payPeriod}-30`, reference: payPeriod })
          ],
          exceptions: {
            missingTin: database.db.prepare('SELECT full_name AS fullName, employee_code AS employeeCode FROM employees WHERE company_id = ? AND tin IS NULL').all(companyId),
            missingRsa: database.db.prepare('SELECT full_name AS fullName, employee_code AS employeeCode FROM employees WHERE company_id = ? AND rsa_number IS NULL').all(companyId)
          }
        }
      }
    },
    reports: {
      get(companyId: string, payPeriod: string) {
        const run = database.db.prepare('SELECT id FROM payroll_runs WHERE company_id = ? AND pay_period = ?').get(companyId, payPeriod) as { id: string } | undefined
        return {
          summary: run ? payrollRuns.getById(run.id) : null,
          exportJobs: database.db.prepare('SELECT id, type, file_path AS filePath, created_at AS createdAt FROM export_jobs WHERE company_id = ? ORDER BY created_at DESC').all(companyId)
        }
      }
    },
    exports
  }
}
