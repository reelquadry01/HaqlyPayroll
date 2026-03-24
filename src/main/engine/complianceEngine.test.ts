import { describe, expect, it } from 'vitest'

import type { TaxPolicyPack } from '@shared/types'
import { calculateAnnualPaye } from './complianceEngine'

const nigeria2026Policy: TaxPolicyPack = {
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
  deductionRules: [],
  reliefRules: []
}

describe('calculateAnnualPaye', () => {
  it('applies the zero percent band for low-income employees', () => {
    const result = calculateAnnualPaye({
      annualTaxableIncome: 600_000,
      taxPolicy: nigeria2026Policy
    })

    expect(result.chargeableIncome).toBe(600_000)
    expect(result.annualTax).toBe(0)
    expect(result.periodTax).toBe(0)
  })

  it('computes progressive tax across the first two taxable bands', () => {
    const result = calculateAnnualPaye({
      annualTaxableIncome: 6_000_000,
      annualPreTaxDeductions: 360_000,
      taxPolicy: nigeria2026Policy
    })

    expect(result.chargeableIncome).toBe(5_640_000)
    expect(result.annualTax).toBe(805_200)
    expect(result.periodTax).toBe(67_100)
    expect(result.breakdown).toEqual([
      { bandLabel: '₦0 - ₦800,000', taxableAmount: 800_000, ratePercent: 0, taxAmount: 0 },
      { bandLabel: '₦800,000 - ₦3,000,000', taxableAmount: 2_200_000, ratePercent: 15, taxAmount: 330_000 },
      { bandLabel: '₦3,000,000 - ₦12,000,000', taxableAmount: 2_640_000, ratePercent: 18, taxAmount: 475_200 }
    ])
  })

  it('handles very high annual income through the top 25 percent band', () => {
    const result = calculateAnnualPaye({
      annualTaxableIncome: 55_000_000,
      taxPolicy: nigeria2026Policy
    })

    expect(result.annualTax).toBe(11_680_000)
    expect(result.periodTax).toBe(973_333.33)
    expect(result.breakdown.at(-1)).toEqual({
      bandLabel: '₦50,000,000+',
      taxableAmount: 5_000_000,
      ratePercent: 25,
      taxAmount: 1_250_000
    })
  })
})
