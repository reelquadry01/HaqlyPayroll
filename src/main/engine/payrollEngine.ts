import { roundCurrency } from '@shared/money'
import type {
  EmployeeProfile,
  PayComponentDefinition,
  PayrollEmployeeResult,
  PayrollInputLine,
  PayrollResultLine,
  TaxPolicyPack
} from '@shared/types'

import { calculateAnnualPaye } from './complianceEngine'

interface PayrollComputationInput {
  employee: EmployeeProfile
  payPeriod: string
  components: Record<string, PayComponentDefinition>
  recurringInputs: PayrollInputLine[]
  variableInputs: PayrollInputLine[]
  taxPolicy: TaxPolicyPack
  payrollFrequency?: number
}

function createLine(component: PayComponentDefinition, amount: number): PayrollResultLine {
  return {
    code: component.code,
    name: component.name,
    amount: roundCurrency(amount),
    taxable: component.taxable,
    pensionable: component.pensionable,
    nhfApplicable: component.nhfApplicable,
    kind: component.kind
  }
}

export function calculateEmployeePayroll(input: PayrollComputationInput): PayrollEmployeeResult {
  const payrollFrequency = input.payrollFrequency ?? 12
  const allInputs = [...input.recurringInputs, ...input.variableInputs]

  const recurringLines = input.recurringInputs
    .map((line) => input.components[line.componentCode] && createLine(input.components[line.componentCode], line.amount))
    .filter(Boolean) as PayrollResultLine[]

  const variableLines = input.variableInputs
    .map((line) => input.components[line.componentCode] && createLine(input.components[line.componentCode], line.amount))
    .filter(Boolean) as PayrollResultLine[]

  const earningLines = [...recurringLines, ...variableLines].filter((line) => line.kind === 'earning')
  const customDeductionLines = [...recurringLines, ...variableLines].filter((line) => line.kind === 'deduction')

  const grossPay = roundCurrency(earningLines.reduce((sum, line) => sum + line.amount, 0))
  const taxableGross = roundCurrency(earningLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0))
  const pensionableGross = roundCurrency(earningLines.filter((line) => line.pensionable).reduce((sum, line) => sum + line.amount, 0))
  const recurringTaxableGross = roundCurrency(recurringLines.filter((line) => line.kind === 'earning' && line.taxable).reduce((sum, line) => sum + line.amount, 0))
  const variableTaxableGross = roundCurrency(variableLines.filter((line) => line.kind === 'earning' && line.taxable).reduce((sum, line) => sum + line.amount, 0))

  const statutoryDeductions = input.taxPolicy.deductionRules
    .filter((rule) => rule.employeeOrEmployer === 'employee' && rule.active)
    .map((rule) => {
      const amount =
        rule.basisType === 'percentage'
          ? roundCurrency((pensionableGross * (rule.ratePercent ?? 0)) / 100)
          : roundCurrency(rule.fixedAmount ?? 0)

      return {
        code: rule.code,
        name: rule.name,
        amount,
        taxable: false,
        pensionable: false,
        nhfApplicable: false,
        kind: 'deduction' as const,
        appliesBeforeTax: rule.appliesBeforeTax
      }
    })

  const preTaxCurrent = statutoryDeductions.filter((line) => line.appliesBeforeTax).reduce((sum, line) => sum + line.amount, 0)
  const annualTaxableIncome = roundCurrency(recurringTaxableGross * payrollFrequency + variableTaxableGross)
  const annualPreTaxDeductions = roundCurrency(preTaxCurrent * payrollFrequency)
  const taxResult = calculateAnnualPaye({
    annualTaxableIncome,
    annualPreTaxDeductions,
    annualRent: input.employee.annualRent,
    taxPolicy: input.taxPolicy,
    payrollFrequency
  })

  const paye = taxResult.periodTax

  const deductionLines: PayrollResultLine[] = [
    ...statutoryDeductions.map(({ appliesBeforeTax: _appliesBeforeTax, ...line }) => line),
    ...customDeductionLines,
    {
      code: 'PAYE',
      name: 'PAYE Tax',
      amount: paye,
      taxable: false,
      pensionable: false,
      nhfApplicable: false,
      kind: 'deduction'
    }
  ]

  const deductions = roundCurrency(deductionLines.reduce((sum, line) => sum + line.amount, 0))
  const netPay = roundCurrency(grossPay - deductions)

  return {
    employeeId: input.employee.id,
    grossPay,
    taxableGross,
    deductions,
    netPay,
    paye,
    recurringLines,
    variableLines,
    deductionLines,
    taxBreakdown: taxResult.breakdown
  }
}
