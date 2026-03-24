import { describe, expect, it } from 'vitest'

import { buildPayeSchedule, buildPensionSchedule } from './deadlineEngine'

describe('deadlineEngine', () => {
  it('marks PAYE as due soon before the 10th of the following month', () => {
    const schedule = buildPayeSchedule({
      amount: 3_575_250,
      paymentDate: '2026-04-30',
      today: '2026-05-07',
      reference: 'APR-2026'
    })

    expect(schedule.dueDate).toBe('2026-05-10')
    expect(schedule.status).toBe('due_soon')
  })

  it('computes pension due date using seven working days after payment', () => {
    const schedule = buildPensionSchedule({
      amount: 1_240_000,
      paymentDate: '2026-04-30',
      today: '2026-05-12',
      reference: 'APR-2026'
    })

    expect(schedule.dueDate).toBe('2026-05-11')
    expect(schedule.status).toBe('overdue')
  })

  it('keeps remitted schedules out of overdue status', () => {
    const schedule = buildPayeSchedule({
      amount: 3_575_250,
      paymentDate: '2026-04-30',
      today: '2026-05-18',
      reference: 'APR-2026',
      remittedAt: '2026-05-09'
    })

    expect(schedule.status).toBe('remitted')
  })
})
