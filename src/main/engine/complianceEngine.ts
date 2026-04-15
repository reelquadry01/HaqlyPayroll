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

  // NTA 2025 Rent Relief: min(20% of annual rent, 500,000)
  const annualRent = input.annualRent ?? 0
  const rentRelief = Math.min(roundCurrency(annualRent * 0.2), 500_000)

  const annualReliefs = (input.annualReliefs ?? 0) + rentRelief
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

  // NTA 2025: Employees earning N800,000 or less are exempt from PIT.
  // Minimum tax of 1% of gross income applies to those earning above N800,000
  // if their calculated tax is lower than 1% of gross income.
  let finalAnnualTax = annualTax
  if (input.annualTaxableIncome > 800_000) {
    const minimumTax = roundCurrency(input.annualTaxableIncome * 0.01)
    finalAnnualTax = Math.max(annualTax, minimumTax)
  } else {
    finalAnnualTax = 0
  }

  return {
    chargeableIncome,
    annualTax: roundCurrency(finalAnnualTax),
    periodTax: roundCurrency(finalAnnualTax / payrollFrequency),
    breakdown
  }
}
