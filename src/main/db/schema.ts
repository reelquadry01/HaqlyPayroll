import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  displayName: text('display_name').notNull()
})

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  taxState: text('tax_state').notNull(),
  payrollFrequency: integer('payroll_frequency').notNull(),
  currency: text('currency').notNull(),
  payDate: integer('pay_date').notNull(),
  activeTaxPolicyId: text('active_tax_policy_id').notNull()
})

export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  employeeCode: text('employee_code').notNull(),
  fullName: text('full_name').notNull(),
  department: text('department').notNull(),
  branch: text('branch').notNull(),
  roleTitle: text('role_title').notNull(),
  hireDate: text('hire_date').notNull(),
  status: text('status').notNull(),
  tin: text('tin'),
  rsaNumber: text('rsa_number')
})

export const payComponents = sqliteTable('pay_components', {
  code: text('code').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  kind: text('kind').notNull(),
  recurring: integer('recurring').notNull(),
  taxable: integer('taxable').notNull(),
  pensionable: integer('pensionable').notNull(),
  nhfApplicable: integer('nhf_applicable').notNull(),
  calculationBasis: text('calculation_basis').notNull(),
  defaultAmount: real('default_amount'),
  glCode: text('gl_code')
})

export const taxPolicies = sqliteTable('tax_policies', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  country: text('country').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  taxYear: integer('tax_year').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to')
})

export const payrollRuns = sqliteTable('payroll_runs', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  payPeriod: text('pay_period').notNull(),
  status: text('status').notNull(),
  policyCode: text('policy_code').notNull(),
  grossPay: real('gross_pay').notNull(),
  netPay: real('net_pay').notNull(),
  payeTotal: real('paye_total').notNull(),
  employeeCount: integer('employee_count').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at')
})
