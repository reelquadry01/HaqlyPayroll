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
})
