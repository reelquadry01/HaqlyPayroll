import { randomUUID } from 'node:crypto'

import Database from 'better-sqlite3'
import { hashSync } from 'bcryptjs'

import type { DeductionRule, PayComponentDefinition, TaxBand, TaxPolicyPack } from '@shared/types'

export interface DatabaseContext {
  db: Database.Database
  filePath: string
}

export function createDatabaseContext(options: { filePath: string }): DatabaseContext {
  return {
    db: new Database(options.filePath),
    filePath: options.filePath
  }
}

export function bootstrapDatabase(context: DatabaseContext): void {
  context.db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tax_state TEXT NOT NULL,
      payroll_frequency INTEGER NOT NULL,
      currency TEXT NOT NULL,
      pay_date INTEGER NOT NULL,
      active_tax_policy_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      employee_code TEXT NOT NULL,
      full_name TEXT NOT NULL,
      department TEXT NOT NULL,
      branch TEXT NOT NULL,
      role_title TEXT NOT NULL,
      hire_date TEXT NOT NULL,
      status TEXT NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      tin TEXT,
      rsa_number TEXT,
      pfa_name TEXT,
      nhf_flag INTEGER NOT NULL DEFAULT 0,
      annual_rent REAL
    );
    CREATE TABLE IF NOT EXISTS pay_components (
      code TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      kind TEXT NOT NULL,
      recurring INTEGER NOT NULL,
      taxable INTEGER NOT NULL,
      pensionable INTEGER NOT NULL,
      nhf_applicable INTEGER NOT NULL,
      calculation_basis TEXT NOT NULL,
      default_amount REAL,
      gl_code TEXT
    );
    CREATE TABLE IF NOT EXISTS employee_component_assignments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      component_code TEXT NOT NULL,
      amount REAL NOT NULL,
      active_from TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payroll_inputs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      pay_period TEXT NOT NULL,
      component_code TEXT NOT NULL,
      amount REAL NOT NULL,
      source_period TEXT,
      source_file TEXT,
      import_batch_id TEXT,
      validation_status TEXT
    );
    CREATE TABLE IF NOT EXISTS tax_policies (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      country TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      tax_year INTEGER NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT
    );
    CREATE TABLE IF NOT EXISTS tax_bands (
      id TEXT PRIMARY KEY,
      tax_policy_id TEXT NOT NULL,
      band_order INTEGER NOT NULL,
      lower_limit REAL NOT NULL,
      upper_limit REAL,
      rate_percent REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deduction_rules (
      id TEXT PRIMARY KEY,
      tax_policy_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      applies_before_tax INTEGER NOT NULL,
      basis_type TEXT NOT NULL,
      rate_percent REAL,
      fixed_amount REAL,
      cap_amount REAL,
      employee_or_employer TEXT NOT NULL,
      active INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relief_rules (
      id TEXT PRIMARY KEY,
      tax_policy_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      formula_type TEXT NOT NULL,
      rate_percent REAL,
      fixed_amount REAL,
      cap_amount REAL
    );
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      pay_period TEXT NOT NULL,
      status TEXT NOT NULL,
      policy_code TEXT NOT NULL,
      gross_pay REAL NOT NULL,
      net_pay REAL NOT NULL,
      paye_total REAL NOT NULL,
      employee_count INTEGER NOT NULL,
      approved_by TEXT,
      approved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS payroll_snapshots (
      run_id TEXT PRIMARY KEY,
      snapshot_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      source_file TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
}

function insertTaxPolicy(context: DatabaseContext, companyId: string): string {
  const policyId = 'policy-2026-default'
  context.db
    .prepare(
      'INSERT OR IGNORE INTO tax_policies (id, company_id, country, name, code, tax_year, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(policyId, companyId, 'NG', 'Nigeria 2026 Default', 'NG-2026', 2026, '2026-01-01', null)

  const bands: TaxBand[] = [
    { bandOrder: 1, lowerLimit: 0, upperLimit: 800_000, ratePercent: 0 },
    { bandOrder: 2, lowerLimit: 800_000, upperLimit: 3_000_000, ratePercent: 15 },
    { bandOrder: 3, lowerLimit: 3_000_000, upperLimit: 12_000_000, ratePercent: 18 },
    { bandOrder: 4, lowerLimit: 12_000_000, upperLimit: 25_000_000, ratePercent: 21 },
    { bandOrder: 5, lowerLimit: 25_000_000, upperLimit: 50_000_000, ratePercent: 23 },
    { bandOrder: 6, lowerLimit: 50_000_000, upperLimit: null, ratePercent: 25 }
  ]

  const insertBand = context.db.prepare(
    'INSERT OR IGNORE INTO tax_bands (id, tax_policy_id, band_order, lower_limit, upper_limit, rate_percent) VALUES (?, ?, ?, ?, ?, ?)'
  )

  for (const band of bands) {
    insertBand.run(`band-${band.bandOrder}`, policyId, band.bandOrder, band.lowerLimit, band.upperLimit, band.ratePercent)
  }

  const deductions: DeductionRule[] = [
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
  ]

  const insertDeduction = context.db.prepare(
    'INSERT OR IGNORE INTO deduction_rules (id, tax_policy_id, code, name, applies_before_tax, basis_type, rate_percent, fixed_amount, cap_amount, employee_or_employer, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )

  for (const deduction of deductions) {
    insertDeduction.run(
      `${policyId}-${deduction.code}`,
      policyId,
      deduction.code,
      deduction.name,
      deduction.appliesBeforeTax ? 1 : 0,
      deduction.basisType,
      deduction.ratePercent ?? null,
      deduction.fixedAmount ?? null,
      deduction.capAmount ?? null,
      deduction.employeeOrEmployer,
      deduction.active ? 1 : 0
    )
  }

  return policyId
}

export function seedDemoData(context: DatabaseContext): void {
  const hasCompany = context.db.prepare('SELECT id FROM companies LIMIT 1').get()
  if (hasCompany) return

  const companyId = 'company-demo'
  const policyId = insertTaxPolicy(context, companyId)

  context.db
    .prepare('INSERT INTO companies (id, name, tax_state, payroll_frequency, currency, pay_date, active_tax_policy_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(companyId, 'HAQLY Demo Industries', 'Lagos', 12, 'NGN', 30, policyId)

  const insertUser = context.db.prepare('INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)')
  for (const [id, email, role, displayName] of [
    ['user-admin', 'admin@haqly.local', 'admin', 'Adeyemi O. Balogun'],
    ['user-payroll', 'payroll@haqly.local', 'payroll_officer', 'Amina Yusuf'],
    ['user-reviewer', 'reviewer@haqly.local', 'reviewer', 'Tunde Kolawole'],
    ['user-approver', 'approver@haqly.local', 'approver', 'Kemi Adebayo']
  ] as const) {
    insertUser.run(id, email, hashSync('password123', 10), role, displayName)
  }

  const insertEmployee = context.db.prepare(
    'INSERT INTO employees (id, company_id, employee_code, full_name, department, branch, role_title, hire_date, status, bank_name, account_number, tin, rsa_number, pfa_name, nhf_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  for (const employee of [
    ['emp-chidi', companyId, 'LAG-4492', 'Chidi Okoro', 'Engineering', 'Lagos HQ', 'Engineering Analyst', '2024-02-12', 'active', 'Access Bank', '0123456789', 'TIN-CHIDI', 'RSA-001', 'Leadway PFA', 1],
    ['emp-aisha', companyId, 'ABJ-2101', 'Aisha Abubakar', 'Operations', 'Abuja', 'Operations Officer', '2023-09-03', 'active', 'GTBank', '1234567890', 'TIN-AISHA', 'RSA-002', 'Stanbic IBTC PFA', 1],
    ['emp-femi', companyId, 'LAG-1120', 'Femi Adebayo', 'Legal', 'Lagos HQ', 'Legal Counsel', '2022-04-18', 'active', 'UBA', '2222333344', null, 'RSA-003', 'Premium PFA', 0]
  ] as const) {
    insertEmployee.run(...employee)
  }

  const insertComponent = context.db.prepare(
    'INSERT INTO pay_components (code, company_id, name, category, kind, recurring, taxable, pensionable, nhf_applicable, calculation_basis, default_amount, gl_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  for (const component of [
    { code: 'BASIC', name: 'Basic Salary', category: 'salary', kind: 'earning', recurring: true, taxable: true, pensionable: true, nhfApplicable: true, calculationBasis: 'fixed', glCode: '5000' },
    { code: 'HOUSING', name: 'Housing Allowance', category: 'allowance', kind: 'earning', recurring: true, taxable: true, pensionable: true, nhfApplicable: false, calculationBasis: 'fixed', glCode: '5001' },
    { code: 'TRANSPORT', name: 'Transport Allowance', category: 'allowance', kind: 'earning', recurring: true, taxable: true, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed', glCode: '5002' },
    { code: 'MEAL', name: 'Meal Allowance', category: 'allowance', kind: 'earning', recurring: true, taxable: false, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed', glCode: '5003' },
    { code: 'BONUS', name: 'Performance Bonus', category: 'bonus', kind: 'earning', recurring: false, taxable: true, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed', glCode: '5004' },
    { code: 'ARREARS', name: 'Promotion Arrears', category: 'arrears', kind: 'earning', recurring: false, taxable: true, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed', glCode: '5005' },
    { code: 'OVERTIME', name: 'Overtime', category: 'variable', kind: 'earning', recurring: false, taxable: true, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed', glCode: '5006' },
    { code: 'COOP', name: 'Cooperative Deduction', category: 'custom', kind: 'deduction', recurring: false, taxable: false, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed', glCode: '2105' }
  ] satisfies PayComponentDefinition[]) {
    insertComponent.run(
      component.code, companyId, component.name, component.category, component.kind,
      component.recurring ? 1 : 0, component.taxable ? 1 : 0, component.pensionable ? 1 : 0,
      component.nhfApplicable ? 1 : 0, component.calculationBasis, component.defaultAmount ?? null, component.glCode ?? null
    )
  }

  const insertAssignment = context.db.prepare(
    'INSERT INTO employee_component_assignments (id, employee_id, component_code, amount, active_from) VALUES (?, ?, ?, ?, ?)'
  )
  for (const [employeeId, componentCode, amount] of [
    ['emp-chidi', 'BASIC', 950_000], ['emp-chidi', 'HOUSING', 150_000], ['emp-chidi', 'MEAL', 50_000],
    ['emp-aisha', 'BASIC', 700_000], ['emp-aisha', 'TRANSPORT', 100_000], ['emp-aisha', 'MEAL', 50_000],
    ['emp-femi', 'BASIC', 1_600_000], ['emp-femi', 'HOUSING', 300_000], ['emp-femi', 'TRANSPORT', 200_000]
  ] as const) {
    insertAssignment.run(randomUUID(), employeeId, componentCode, amount, '2026-01-01')
  }

  const importBatchId = 'batch-apr-2026'
  context.db.prepare('INSERT INTO import_batches (id, company_id, source_file, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
    importBatchId, companyId, 'april-2026-inputs.xlsx', 'validated', '2026-04-28T10:00:00Z'
  )

  const insertInput = context.db.prepare(
    'INSERT INTO payroll_inputs (id, company_id, employee_id, pay_period, component_code, amount, source_period, source_file, import_batch_id, validation_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  for (const [employeeId, payPeriod, componentCode, amount, sourcePeriod] of [
    ['emp-chidi', '2026-04', 'BONUS', 120_000, null],
    ['emp-aisha', '2026-04', 'ARREARS', 80_000, '2026-02'],
    ['emp-femi', '2026-04', 'OVERTIME', 120_000, null],
    ['emp-femi', '2026-04', 'COOP', 30_000, null]
  ] as const) {
    insertInput.run(randomUUID(), companyId, employeeId, payPeriod, componentCode, amount, sourcePeriod, 'april-2026-inputs.xlsx', importBatchId, 'valid')
  }
}

export function readActivePolicy(context: DatabaseContext, companyId: string): TaxPolicyPack {
  const company = context.db.prepare('SELECT active_tax_policy_id AS activeTaxPolicyId FROM companies WHERE id = ?').get(companyId) as { activeTaxPolicyId: string }
  const policy = context.db
    .prepare('SELECT id, country, name, code, tax_year AS taxYear, effective_from AS effectiveFrom, effective_to AS effectiveTo FROM tax_policies WHERE id = ?')
    .get(company.activeTaxPolicyId) as TaxPolicyPack

  policy.bands = context.db
    .prepare('SELECT band_order AS bandOrder, lower_limit AS lowerLimit, upper_limit AS upperLimit, rate_percent AS ratePercent FROM tax_bands WHERE tax_policy_id = ? ORDER BY band_order ASC')
    .all(company.activeTaxPolicyId) as TaxBand[]

  policy.deductionRules = context.db
    .prepare('SELECT code, name, applies_before_tax AS appliesBeforeTax, basis_type AS basisType, rate_percent AS ratePercent, fixed_amount AS fixedAmount, cap_amount AS capAmount, employee_or_employer AS employeeOrEmployer, active FROM deduction_rules WHERE tax_policy_id = ?')
    .all(company.activeTaxPolicyId)
    .map((rule) => ({ ...rule, appliesBeforeTax: Boolean(rule.appliesBeforeTax), active: Boolean(rule.active) })) as DeductionRule[]

  policy.reliefRules = []
  return policy
}
