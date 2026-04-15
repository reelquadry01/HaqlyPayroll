import { describe, expect, it } from 'vitest'

import type { EmployeeProfile, PayComponentDefinition, TaxPolicyPack } from '@shared/types'
import { calculateEmployeePayroll } from './payrollEngine'

const policy: TaxPolicyPack = {
  id: 'policy-2026',
  country: 'NG',
  name: 'Nigeria 2026 Default',
  code: 'NG-2026',
  taxYear: 2026,
  effectiveFrom: '2026-01-01',
  bands: [
    { bandOrder: 1, lowerLimit: 0, upperLimit: 800_000, ratePercent: 0 },
    { bandOrder: 2, lowerLimit: 800_000, upperLimit: 3_000_000, ratePercent: 15 },
    { bandOrder: 3, lowerLimit: 3_000_000, upperLimit: 12_000_000, ratePercent: 18 },
    { bandOrder: 4, lowerLimit: 12_000_000, upperLimit: 25_000_000, ratePercent: 21 },
    { bandOrder: 5, lowerLimit: 25_000_000, upperLimit: 50_000_000, ratePercent: 23 },
    { bandOrder: 6, lowerLimit: 50_000_000, upperLimit: null, ratePercent: 25 }
  ],
  deductionRules: [
    {
      code: 'PENSION',
      name: 'Employee Pension',
      appliesBeforeTax: true,
      basisType: 'percentage',
      ratePercent: 8,
      employeeOrEmployer: 'employee',
      active: true
    },
    {
      code: 'NHF',
      name: 'National Housing Fund',
      appliesBeforeTax: false,
      basisType: 'fixed',
      fixedAmount: 25_000,
      employeeOrEmployer: 'employee',
      active: true
    }
  ],
  reliefRules: []
}

const employee: EmployeeProfile = {
  id: 'emp-1',
  employeeCode: 'LAG-1001',
  fullName: 'Amina Yusuf',
  department: 'Finance',
  branch: 'Lagos',
  roleTitle: 'Payroll Analyst'
}

const components: Record<string, PayComponentDefinition> = {
  BASIC: {
    code: 'BASIC',
    name: 'Basic Salary',
    category: 'salary',
    kind: 'earning',
    recurring: true,
    taxable: true,
    pensionable: true,
    nhfApplicable: true,
    calculationBasis: 'fixed'
  },
  HOUSING: {
    code: 'HOUSING',
    name: 'Housing Allowance',
    category: 'allowance',
    kind: 'earning',
    recurring: true,
    taxable: true,
    pensionable: true,
    nhfApplicable: false,
    calculationBasis: 'fixed'
  },
  BONUS: {
    code: 'BONUS',
    name: 'Performance Bonus',
    category: 'bonus',
    kind: 'earning',
    recurring: false,
    taxable: true,
    pensionable: false,
    nhfApplicable: false,
    calculationBasis: 'fixed'
  },
  MEAL: {
    code: 'MEAL',
    name: 'Meal Allowance',
    category: 'allowance',
    kind: 'earning',
    recurring: true,
    taxable: false,
    pensionable: false,
    nhfApplicable: false,
    calculationBasis: 'fixed'
  },
  COOP: {
    code: 'COOP',
    name: 'Cooperative Deduction',
    category: 'custom',
    kind: 'deduction',
    recurring: false,
    taxable: false,
    pensionable: false,
    nhfApplicable: false,
    calculationBasis: 'fixed'
  }
}

describe('calculateEmployeePayroll', () => {
  it('recalculates PAYE with Rent Relief when a taxable bonus lands in the payroll month', () => {
    const result = calculateEmployeePayroll({
      employee: { ...employee, annualRent: 1_200_000 },
      payPeriod: '2026-04',
      components,
      recurringInputs: [
        { employeeId: employee.id, payPeriod: '2026-04', componentCode: 'BASIC', amount: 950_000 },
        { employeeId: employee.id, payPeriod: '2026-04', componentCode: 'HOUSING', amount: 150_000 },
        { employeeId: employee.id, payPeriod: '2026-04', componentCode: 'MEAL', amount: 50_000 }
      ],
      variableInputs: [
        { employeeId: employee.id, payPeriod: '2026-04', componentCode: 'BONUS', amount: 120_000 }
      ],
      taxPolicy: policy
    })

    // Gross = 1,270,000. Taxable Gross = 1,220,000
    // Recurring Taxable Gross = 1,100,000. Variable Taxable Gross = 120,000
    // Annual Taxable Gross = 1,100,000 * 12 + 120,000 = 13,200,000 + 120,000 = 13,320,000
    // Pre-tax deductions (Pension 8% of BASIC+HOUSING) = 0.08 * (950k + 150k) = 88,000
    // Annual Pre-tax = 88,000 * 12 = 1,056,000
    // Rent Relief = min(0.2 * 1.2M, 500k) = 240,000
    // Chargeable Income = 13,320,000 - 1,056,000 - 240,000 = 12,024,000
    // Band 1: 800k @ 0% = 0
    // Band 2: 2.2M @ 15% = 330,000
    // Band 3: 9M @ 18% = 1,620,000
    // Band 4: (12,024,000 - 12,000,000) = 24,000 @ 21% = 5,040
    // Annual Tax = 1,955,040
    // Monthly PAYE = 162,920
    expect(result.grossPay).toBe(1_270_000)
    expect(result.taxableGross).toBe(1_220_000)
    expect(result.paye).toBe(162_920)
    expect(result.deductions).toBe(162_920 + 88_000 + 25_000) // PAYE + Pension + NHF
    expect(result.netPay).toBe(1_270_000 - result.deductions)
  })

  it('tracks arrears by source period and includes them in current-period tax', () => {
    const result = calculateEmployeePayroll({
      employee,
      payPeriod: '2026-05',
      components,
      recurringInputs: [
        { employeeId: employee.id, payPeriod: '2026-05', componentCode: 'BASIC', amount: 500_000 }
      ],
      variableInputs: [
        {
          employeeId: employee.id,
          payPeriod: '2026-05',
          componentCode: 'BONUS',
          amount: 100_000,
          sourcePeriod: '2026-03'
        },
        {
          employeeId: employee.id,
          payPeriod: '2026-05',
          componentCode: 'COOP',
          amount: 25_000
        }
      ],
      taxPolicy: policy
    })

    expect(result.grossPay).toBe(600_000)
    expect(result.taxableGross).toBe(600_000)
    expect(result.paye).toBe(66_800)
    expect(result.deductions).toBe(156_800)
    expect(result.netPay).toBe(443_200)
    expect(result.variableLines.find((line) => line.code === 'BONUS')?.amount).toBe(100_000)
  })
})
