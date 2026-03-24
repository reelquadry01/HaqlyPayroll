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

    const approvedRun = services.payrollRuns.approve(draftRun.id, 'user-approver')
    const detail = services.payrollRuns.getById(draftRun.id)

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
})
