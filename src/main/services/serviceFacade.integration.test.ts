import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase, createDatabaseContext, seedDemoData } from '../db/context'
import { createServiceFacade } from './serviceFacade'

describe('service facade integration', () => {
  let exportDir = ''

  beforeEach(() => {
    exportDir = mkdtempSync(join(tmpdir(), 'haqly-payroll-'))
  })

  afterEach(() => {
    rmSync(exportDir, { recursive: true, force: true })
  })

  it('validates, approves, finalizes, posts, and exports a payroll run from seeded SQLite data', async () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const company = services.companies.list()[0]
    const draftRun = services.payrollRuns.generate(company.id, '2026-04')

    expect(draftRun.status).toBe('draft')
    expect(draftRun.employeeCount).toBe(3)
    expect(draftRun.grossPay).toBeGreaterThan(0)

    const validatedRun = (services.payrollRuns as any).validate(draftRun.id, 'user-payroll')
    const reviewRun = services.payrollRuns.submitForReview(draftRun.id, 'user-payroll')
    const approvedRun = services.payrollRuns.approve(draftRun.id, 'user-approver')
    const finalizedRun = (services.payrollRuns as any).finalize(draftRun.id, 'user-approver')
    const postedRun = (services.payrollRuns as any).post(draftRun.id, 'user-approver')
    const detail = services.payrollRuns.getById(draftRun.id)

    expect(validatedRun.status).toBe('validated')
    expect(validatedRun.warningCount).toBeGreaterThanOrEqual(1)
    expect(reviewRun.status).toBe('in_review')
    expect(approvedRun.status).toBe('approved')
    expect(finalizedRun.status).toBe('finalized')
    expect(postedRun.status).toBe('posted')
    expect(detail.snapshot.approvedBy).toBe('user-approver')
    expect(detail.snapshot.status).toBe('posted')
    expect((detail as any).validation.blockingCount).toBe(0)
    expect((detail as any).validation.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_tin',
          severity: 'warning',
          employeeId: 'emp-femi'
        })
      ])
    )
    expect((detail as any).postingSummary).toEqual(
      expect.objectContaining({
        salaryExpense: detail.grossPay,
        payePayable: detail.payeTotal,
        netPayable: detail.netPay,
        totalCredits: expect.any(Number)
      })
    )
    expect(() => services.payrollRuns.generate(company.id, '2026-04')).toThrow(/immutable/i)

    const journal = services.exports.generateJournalCsv(draftRun.id)
    const bankSchedule = services.exports.generateBankScheduleXlsx(draftRun.id)
    const payslip = await services.exports.generatePayslipPdf(draftRun.id, detail.snapshot.employees[0].employeeId)

    expect(existsSync(journal.filePath)).toBe(true)
    expect(existsSync(bankSchedule.filePath)).toBe(true)
    expect(existsSync(payslip.filePath)).toBe(true)
  })

  it('blocks journal and bank exports until payroll is finalized or posted', async () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const company = services.companies.list()[0]
    const draftRun = services.payrollRuns.generate(company.id, '2026-04')

    expect(() => services.exports.generateJournalCsv(draftRun.id)).toThrow(/finalized or posted/i)
    expect(() => services.exports.generateBankScheduleXlsx(draftRun.id)).toThrow(/finalized or posted/i)
    await expect(services.exports.generatePayslipPdf(draftRun.id, 'emp-chidi')).rejects.toThrow(/approved/i)
  })

  it('writes a liability-aware journal export once a payroll run is finalized', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const company = services.companies.list()[0]
    const draftRun = services.payrollRuns.generate(company.id, '2026-04')

    ;(services.payrollRuns as any).validate(draftRun.id, 'user-payroll')
    services.payrollRuns.submitForReview(draftRun.id, 'user-payroll')
    services.payrollRuns.approve(draftRun.id, 'user-approver')
    ;(services.payrollRuns as any).finalize(draftRun.id, 'user-approver')

    const journal = services.exports.generateJournalCsv(draftRun.id)
    const contents = readFileSync(journal.filePath, 'utf8')

    expect(contents).toContain('Dr,Salary Expense')
    expect(contents).toContain('Dr,Employer Pension Expense')
    expect(contents).toContain('Cr,PAYE Payable')
    expect(contents).toContain('Cr,Pension Payable')
    expect(contents).toContain('Cr,NHF Payable')
    expect(contents).toContain('Cr,Bank')
  })

  it('returns posting readiness and finance summary on the dashboard and reports surfaces', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const dashboard = services.dashboard.get('company-demo', '2026-04') as any
    const reports = services.reports.get('company-demo', '2026-04') as any

    expect(dashboard.postingReadiness).toEqual(
      expect.objectContaining({
        blockingCount: 0,
        warningCount: 1,
        journalExportReady: false,
        bankExportReady: false
      })
    )
    expect(dashboard.liabilities).toEqual(
      expect.objectContaining({
        payePayable: expect.any(Number),
        pensionPayable: expect.any(Number),
        netPayable: expect.any(Number)
      })
    )
    expect(reports.financeSummary).toEqual(
      expect.objectContaining({
        payrollStatus: 'draft',
        exportReadiness: expect.objectContaining({
          journal: false,
          bank: false,
          payslip: false
        })
      })
    )
  })

  it('blocks payroll finalization when validation finds blocking exceptions', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    services.employees.update(
      'company-demo',
      'emp-aisha',
      {
        fullName: 'Aisha Abubakar',
        department: 'Operations',
        branch: 'Abuja',
        roleTitle: 'Operations Officer',
        employeeType: 'contract',
        bankName: '',
        accountNumber: '',
        tin: 'TIN-AISHA',
        rsaNumber: 'RSA-002',
        status: 'active'
      },
      'user-payroll'
    )

    const company = services.companies.list()[0]
    const draftRun = services.payrollRuns.generate(company.id, '2026-04')

    expect((services.payrollRuns as any).validate(draftRun.id, 'user-payroll').status).toBe('validated')
    expect(services.payrollRuns.submitForReview(draftRun.id, 'user-payroll').status).toBe('in_review')
    expect(services.payrollRuns.approve(draftRun.id, 'user-approver').status).toBe('approved')
    expect(() => (services.payrollRuns as any).finalize(draftRun.id, 'user-approver')).toThrow(/blocking exceptions/i)

    const detail = services.payrollRuns.getById(draftRun.id) as any

    expect(detail.validation.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_bank_details',
          severity: 'blocking',
          employeeId: 'emp-aisha'
        })
      ])
    )
  })

  it('rejects payroll approval for users without approver privileges', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const company = services.companies.list()[0]
    const draftRun = services.payrollRuns.generate(company.id, '2026-04')

    expect(() => services.payrollRuns.approve(draftRun.id, 'user-reviewer')).toThrow(/permission/i)
  })

  it('requires a draft run to move into review before an approver can approve it', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const company = services.companies.list()[0]
    const draftRun = services.payrollRuns.generate(company.id, '2026-04')

    expect(() => services.payrollRuns.approve(draftRun.id, 'user-approver')).toThrow(/review/i)

    expect((services.payrollRuns as any).validate(draftRun.id, 'user-payroll').status).toBe('validated')
    const reviewRun = services.payrollRuns.submitForReview(draftRun.id, 'user-payroll')

    expect(reviewRun.status).toBe('in_review')
    expect(services.payrollRuns.approve(draftRun.id, 'user-approver').status).toBe('approved')
  })

  it('includes variance against the previous payroll period on payroll run details', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const company = services.companies.list()[0]
    const draftRun = services.payrollRuns.generate(company.id, '2026-04')
    const detail = services.payrollRuns.getById(draftRun.id)

    expect(detail.variance).toEqual({
      previousPayPeriod: '2026-03',
      grossPayDelta: 520_000,
      netPayDelta: 375_580,
      payeDelta: 109_920
    })
  })

  it('seeds multiple companies so the desktop flow can present a real company selector', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const companies = services.companies.list()

    expect(companies).toHaveLength(2)
    expect(companies.map((company) => company.name)).toEqual([
      'HAQLY Demo Industries',
      'Northwind Services Nigeria'
    ])
  })

  it('returns import batches alongside validated payroll inputs for the input center', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const inputs = services.inputs.list('company-demo', '2026-04')

    expect(inputs.lines).toHaveLength(4)
    expect(inputs.batches).toEqual([
      {
        id: 'batch-apr-2026',
        sourceFile: 'april-2026-inputs.xlsx',
        status: 'validated',
        createdAt: '2026-04-28T10:00:00Z'
      }
    ])
  })

  it('updates an employee record through the service layer for payroll operations users', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const updated = services.employees.update(
      'company-demo',
      'emp-chidi',
      {
        fullName: 'Chidi Okoro-Okafor',
        department: 'Platform Engineering',
        branch: 'Lekki Annex',
        roleTitle: 'Senior Engineering Analyst',
        employeeType: 'full_time',
        bankName: 'First Bank',
        accountNumber: '9988776655',
        tin: 'TIN-CHIDI-NEW',
        rsaNumber: 'RSA-001-ALT',
        status: 'active'
      },
      'user-payroll'
    )

    expect(updated.fullName).toBe('Chidi Okoro-Okafor')
    expect(updated.department).toBe('Platform Engineering')
    expect(updated.branch).toBe('Lekki Annex')
    expect(updated.roleTitle).toBe('Senior Engineering Analyst')
    expect(updated.bankName).toBe('First Bank')
    expect(updated.accountNumber).toBe('9988776655')
    expect(updated.tin).toBe('TIN-CHIDI-NEW')
    expect(updated.rsaNumber).toBe('RSA-001-ALT')
  })

  it('creates an employee through the service layer and exposes it in employee listings', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const created = (services.employees as any).create(
      'company-demo',
      {
        employeeCode: 'KAN-1001',
        fullName: 'Ngozi Danjuma',
        department: 'Finance',
        branch: 'Kano',
        roleTitle: 'Payroll Analyst',
        employeeType: 'expat',
        hireDate: '2026-03-01',
        status: 'active',
        bankName: 'Zenith Bank',
        accountNumber: '1029384756',
        tin: 'TIN-NGOZI',
        rsaNumber: 'RSA-1001'
      },
      'user-payroll'
    )

    const employees = services.employees.list('company-demo')

    expect(created.employeeCode).toBe('KAN-1001')
    expect(created.fullName).toBe('Ngozi Danjuma')
    expect((created as any).employeeType).toBe('expat')
    expect(employees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeCode: 'KAN-1001',
          fullName: 'Ngozi Danjuma',
          department: 'Finance',
          employeeType: 'expat'
        })
      ])
    )
  })

  it('updates company payroll settings and exposes them through compliance data', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const updated = (services.companies as any).updateSettings(
      'company-demo',
      {
        defaultWorkingDays: 20,
        validationPolicy: 'balanced',
        approvalPolicy: 'review_then_approve',
        employeePensionRate: 9,
        employerPensionRate: 11,
        nhfEnabled: true,
        nhfRate: 2.5,
        nsitfEnabled: true,
        nsitfRate: 1.2,
        payeRemittanceDay: 12,
        pensionRemittanceWorkingDays: 5
      },
      'user-admin'
    )

    const compliance = services.compliance.get('company-demo', '2026-04') as any

    expect(updated.employeePensionRate).toBe(9)
    expect(updated.payeRemittanceDay).toBe(12)
    expect(compliance.settings).toEqual(
      expect.objectContaining({
        employeePensionRate: 9,
        employerPensionRate: 11,
        payeRemittanceDay: 12,
        pensionRemittanceWorkingDays: 5
      })
    )
    expect(compliance.policySummary).toEqual(
      expect.objectContaining({
        code: 'NG-2026',
        deductionRules: expect.arrayContaining(['Employee Pension'])
      })
    )
  })

  it('saves a manual variable payroll input and exposes it through the input center', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const created = services.inputs.save(
      'company-demo',
      {
        employeeId: 'emp-aisha',
        payPeriod: '2026-04',
        componentCode: 'BONUS',
        amount: 55_000,
        sourcePeriod: '2026-04'
      },
      'user-payroll'
    )

    const inputs = services.inputs.list('company-demo', '2026-04')

    expect(created.componentCode).toBe('BONUS')
    expect(created.amount).toBe(55_000)
    expect(inputs.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: 'emp-aisha',
          componentCode: 'BONUS',
          amount: 55_000
        })
      ])
    )
  })

  it('updates a pay component definition through the structures service for payroll operators', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const updated = services.structures.update(
      'company-demo',
      'BONUS',
      {
        name: 'Quarterly Performance Bonus',
        category: 'bonus',
        recurring: false,
        taxable: true,
        pensionable: false,
        nhfApplicable: false,
        calculationBasis: 'fixed',
        glCode: '5015'
      },
      'user-payroll'
    )

    const refreshed = services.structures.get('company-demo').components.find((component) => component.code === 'BONUS')

    expect(updated.name).toBe('Quarterly Performance Bonus')
    expect(updated.glCode).toBe('5015')
    expect(refreshed).toEqual(
      expect.objectContaining({
        code: 'BONUS',
        name: 'Quarterly Performance Bonus',
        glCode: '5015'
      })
    )
  })

  it('creates a pay component through the structures service and exposes it in the structures catalog', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const created = (services.structures as any).create(
      'company-demo',
      {
        code: 'SHIFT',
        name: 'Shift Allowance',
        category: 'allowance',
        kind: 'earning',
        recurring: false,
        taxable: true,
        pensionable: false,
        nhfApplicable: false,
        calculationBasis: 'fixed',
        glCode: '5099'
      },
      'user-payroll'
    )

    const refreshed = services.structures.get('company-demo').components.find((component) => component.code === 'SHIFT')

    expect(created.code).toBe('SHIFT')
    expect(created.name).toBe('Shift Allowance')
    expect(refreshed).toEqual(
      expect.objectContaining({
        code: 'SHIFT',
        name: 'Shift Allowance',
        kind: 'earning',
        glCode: '5099'
      })
    )
  })

  it('updates an employee compensation assignment and exposes the new amount in employee records', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const updatedAssignments = services.employees.updatePayAssignments(
      'company-demo',
      'emp-chidi',
      [{ componentCode: 'BASIC', amount: 975_000 }],
      'user-payroll'
    )

    const employee = services.employees.list('company-demo').find((candidate) => candidate.id === 'emp-chidi')

    expect(updatedAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: 'BASIC',
          amount: 975_000
        })
      ])
    )
    expect(employee?.payAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: 'BASIC',
          amount: 975_000
        })
      ])
    )
  })

  it('creates a staff loan and exposes it in the loan workspace', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const created = services.loans.create(
      'company-demo',
      {
        employeeId: 'emp-aisha',
        principal: 300_000,
        monthlyDeduction: 50_000,
        repaymentMethod: 'flat',
        startDate: '2026-05-01',
        endDate: '2026-10-31',
        interestOption: 'none',
        type: 'staff_loan'
      },
      'user-payroll'
    )

    const loans = services.loans.list('company-demo')

    expect(created.employeeId).toBe('emp-aisha')
    expect(created.balance).toBe(300_000)
    expect(created.status).toBe('active')
    expect(loans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          employeeId: 'emp-aisha',
          principal: 300_000
        })
      ])
    )
  })

  it('updates loan status for payroll operators', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const updated = services.loans.updateStatus('company-demo', 'loan-aisha-laptop', 'paused', 'user-payroll')

    expect(updated.status).toBe('paused')
  })

  it('imports a payroll input CSV batch and exposes the imported lines with a tracked batch', () => {
    const database = createDatabaseContext({ filePath: ':memory:' })
    bootstrapDatabase(database)
    seedDemoData(database)

    const services = createServiceFacade({
      database,
      exportDir
    })

    const imported = services.inputs.importCsv(
      'company-demo',
      {
        payPeriod: '2026-04',
        sourceFile: 'bonus-template.csv',
        csvText: [
          'employeeCode,componentCode,amount,sourcePeriod',
          'ABJ-2101,BONUS,45000,2026-04',
          'LAG-4492,OVERTIME,25000,'
        ].join('\n')
      },
      'user-payroll'
    )

    const inputs = services.inputs.list('company-demo', '2026-04')

    expect(imported.importedCount).toBe(2)
    expect(inputs.batches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceFile: 'bonus-template.csv',
          status: 'validated'
        })
      ])
    )
    expect(inputs.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: 'emp-aisha',
          componentCode: 'BONUS',
          amount: 45_000
        }),
        expect.objectContaining({
          employeeId: 'emp-chidi',
          componentCode: 'OVERTIME',
          amount: 25_000
        })
      ])
    )
  })
})
