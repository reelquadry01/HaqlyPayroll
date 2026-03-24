import { addDays, addMonths, differenceInCalendarDays, formatISO, isAfter, isBefore, parseISO } from 'date-fns'

import type { RemittanceSchedule, RemittanceStatus } from '@shared/types'

interface ScheduleInput {
  amount: number
  paymentDate: string
  today: string
  reference: string
  remittedAt?: string
}

function deriveStatus(today: Date, paymentDate: Date, dueDate: Date, remittedAt?: string): RemittanceStatus {
  if (remittedAt) {
    return 'remitted'
  }

  if (isBefore(today, paymentDate)) {
    return 'not_due'
  }

  if (isAfter(today, dueDate)) {
    return 'overdue'
  }

  return differenceInCalendarDays(dueDate, today) <= 5 ? 'due_soon' : 'pending'
}

function toDateString(value: Date): string {
  return formatISO(value, { representation: 'date' })
}

export function buildPayeSchedule(input: ScheduleInput): RemittanceSchedule {
  const paymentDate = parseISO(input.paymentDate)
  const nextMonth = addMonths(paymentDate, 1)
  const dueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 10)
  const today = parseISO(input.today)

  return {
    type: 'paye',
    amount: input.amount,
    paymentDate: input.paymentDate,
    dueDate: toDateString(dueDate),
    status: deriveStatus(today, paymentDate, dueDate, input.remittedAt),
    reference: input.reference
  }
}

function addWorkingDays(baseDate: Date, workingDays: number): Date {
  let cursor = new Date(baseDate)
  let added = 0

  while (added < workingDays) {
    cursor = addDays(cursor, 1)
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) {
      added += 1
    }
  }

  return cursor
}

export function buildPensionSchedule(input: ScheduleInput): RemittanceSchedule {
  const paymentDate = parseISO(input.paymentDate)
  const dueDate = addWorkingDays(paymentDate, 7)
  const today = parseISO(input.today)

  return {
    type: 'pension',
    amount: input.amount,
    paymentDate: input.paymentDate,
    dueDate: toDateString(dueDate),
    status: deriveStatus(today, paymentDate, dueDate, input.remittedAt),
    reference: input.reference
  }
}
