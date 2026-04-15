import { describe, expect, it } from 'vitest'

import { roundCurrency } from '@shared/money'
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
  it('applies full tax exemption for low-income employees (<= N800k)', () => {
    const result = calculateAnnualPaye({
      annualTaxableIncome: 600_000,
      taxPolicy: nigeria2026Policy
    })

    expect(result.chargeableIncome).toBe(600_000)
    expect(result.annualTax).toBe(0)
    expect(result.periodTax).toBe(0)
  })

  it('applies Rent Relief and enforces minimum tax for those above N800k', () => {
    const result = calculateAnnualPaye({
      annualTaxableIncome: 1_000_000,
      annualRent: 1_200_000,
      taxPolicy: nigeria2026Policy
    })

    // Rent Relief = min(0.2 * 1.2M, 500k) = 240,000
    // Chargeable Income = 1M - 240k = 760,000
    // Calculated Tax = 0 (as 760k < 800k band)
    // Minimum Tax = 1% of 1M = 10,000
    expect(result.chargeableIncome).toBe(760_000)
    expect(result.annualTax).toBe(10_000)
    expect(result.periodTax).toBe(roundCurrency(10_000 / 12))
  })

  it('computes progressive tax across the first two taxable bands with Rent Relief', () => {
    const result = calculateAnnualPaye({
      annualTaxableIncome: 6_000_000,
      annualRent: 2_000_000,
      annualPreTaxDeductions: 360_000,
      taxPolicy: nigeria2026Policy
    })

    // Rent Relief = min(0.2 * 2M, 500k) = 400,000
    // Chargeable Income = 6,000,000 - 360,000 - 400,000 = 5,240_000
    // Band 1: 800k @ 0% = 0
    // Band 2: 2.2M @ 15% = 330,000
    // Band 3: (5,240,000 - 3,000,000) = 2,240,000 @ 18% = 403,200
    // Total Tax = 733,200
    expect(result.chargeableIncome).toBe(5_240_000)
    expect(result.annualTax).toBe(733_200)
    expect(result.periodTax).toBe(61_100)
    expect(result.breakdown).toEqual([
      { bandLabel: '₦0 - ₦800,000', taxableAmount: 800_000, ratePercent: 0, taxAmount: 0 },
      { bandLabel: '₦800,000 - ₦3,000,000', taxableAmount: 2_200_000, ratePercent: 15, taxAmount: 330_000 },
      { bandLabel: '₦3,000,000 - ₦12,000,000', taxableAmount: 2_240_000, ratePercent: 18, taxAmount: 403_200 }
    ])
  })
})
