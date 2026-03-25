import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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

  it('creates, approves, freezes, and exports a payroll run from seeded SQLite data', async () => {
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

    const reviewRun = services.payrollRuns.submitForReview(draftRun.id, 'user-payroll')
    const approvedRun = services.payrollRuns.approve(draftRun.id, 'user-approver')
    const detail = services.payrollRuns.getById(draftRun.id)

    expect(reviewRun.status).toBe('in_review')
    expect(approvedRun.status).toBe('approved')
    expect(detail.snapshot.approvedBy).toBe('user-approver')
    expect(() => services.payrollRuns.generate(company.id, '2026-04')).toThrow(/immutable/i)

    const journal = services.exports.generateJournalCsv(draftRun.id)
    const bankSchedule = services.exports.generateBankScheduleXlsx(draftRun.id)
    const payslip = await services.exports.generatePayslipPdf(draftRun.id, detail.snapshot.employees[0].employeeId)

    expect(existsSync(journal.filePath)).toBe(true)
    expect(existsSync(bankSchedule.filePath)).toBe(true)
    expect(existsSync(payslip.filePath)).toBe(true)
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
      netPayDelta: 400_580,
      payeDelta: 124_920
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
})
