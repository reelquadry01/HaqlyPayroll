import { roundCurrency } from '@shared/money'
import type { ComplianceComputationInput, ComplianceComputationResult, TaxBand } from '@shared/types'

function formatBandLabel(band: TaxBand): string {
  if (band.upperLimit === null) {
    return `₦${band.lowerLimit.toLocaleString()}+`
  }

  return `₦${band.lowerLimit.toLocaleString()} - ₦${band.upperLimit.toLocaleString()}`
}

export function calculateAnnualPaye(input: ComplianceComputationInput): ComplianceComputationResult {
  const payrollFrequency = input.payrollFrequency ?? 12
  const annualPreTaxDeductions = input.annualPreTaxDeductions ?? 0
  const annualReliefs = input.annualReliefs ?? 0
  const chargeableIncome = Math.max(0, roundCurrency(input.annualTaxableIncome - annualPreTaxDeductions - annualReliefs))

  let annualTax = 0
  const breakdown = input.taxPolicy.bands
    .sort((left, right) => left.bandOrder - right.bandOrder)
    .map((band) => {
      const upperBound = band.upperLimit ?? chargeableIncome
      const taxableAmount = Math.max(0, Math.min(chargeableIncome, upperBound) - band.lowerLimit)
      const taxAmount = roundCurrency((taxableAmount * band.ratePercent) / 100)
      annualTax += taxAmount

      return {
        bandLabel: formatBandLabel(band),
        taxableAmount: roundCurrency(taxableAmount),
        ratePercent: band.ratePercent,
        taxAmount
      }
    })
    .filter((line) => line.taxableAmount > 0 || line.ratePercent === 0)

  return {
    chargeableIncome,
    annualTax: roundCurrency(annualTax),
    periodTax: roundCurrency(annualTax / payrollFrequency),
    breakdown
  }
}
