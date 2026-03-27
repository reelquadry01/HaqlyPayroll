// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HaqlyApi } from '@shared/api'

import { App } from './App'

declare global {
  interface Window {
    haqlyApi: HaqlyApi
  }
}

function createFakeApi(
  role: 'approver' | 'reviewer',
  options: {
    runStatus?: 'draft' | 'validated' | 'in_review' | 'approved' | 'finalized'
  } = {}
): HaqlyApi {
  const runStatus = options.runStatus ?? 'draft'
  const payrollRun = {
    id: 'run-apr',
    companyId: 'company-demo',
    payPeriod: '2026-04',
    status: runStatus,
    grossPay: 4_320_000,
    netPay: 3_238_850,
    payeTotal: 614_650,
    employeeCount: 3,
    variance: {
      previousPayPeriod: '2026-03',
      grossPayDelta: 420_000,
      netPayDelta: 268_850,
      payeDelta: 91_150
    },
    validation: {
      blockingCount: 0,
      warningCount: 1,
      exceptions: [
        {
          code: 'missing_tin',
          title: 'Missing TIN',
          severity: 'warning',
          employeeId: 'emp-femi',
          employeeName: 'Femi Adebayo',
          detail: 'Employee record is missing a TIN, which may affect filing readiness.'
        }
      ]
    },
    postingSummary: {
      salaryExpense: 4_320_000,
      employerPensionExpense: 261_000,
      payePayable: 614_650,
      pensionPayable: 469_800,
      nhfPayable: 56_750,
      netPayable: 3_238_850,
      totalCredits: 4_380_050
    },
    snapshot: {
      runId: 'run-apr',
      period: '2026-04',
      status: runStatus,
      policyCode: 'NG-2026',
      employees: [
        {
          employeeId: 'emp-chidi',
          grossPay: 1_270_000,
          taxableGross: 1_220_000,
          deductions: 280_120,
          netPay: 989_880,
          paye: 167_120,
          recurringLines: [{ code: 'BASIC', name: 'Basic Salary', amount: 950_000, taxable: true, pensionable: true, kind: 'earning' }],
          variableLines: [{ code: 'BONUS', name: 'Performance Bonus', amount: 120_000, taxable: true, pensionable: false, kind: 'earning' }],
          deductionLines: [{ code: 'PAYE', name: 'PAYE Tax', amount: 167_120, taxable: false, pensionable: false, kind: 'deduction' }],
          taxBreakdown: [{ bandLabel: '₦800,000 - ₦3,000,000', taxableAmount: 2_200_000, ratePercent: 15, taxAmount: 330_000 }]
        },
        {
          employeeId: 'emp-aisha',
          grossPay: 880_000,
          taxableGross: 830_000,
          deductions: 156_800,
          netPay: 723_200,
          paye: 66_800,
          recurringLines: [],
          variableLines: [],
          deductionLines: [],
          taxBreakdown: []
        },
        {
          employeeId: 'emp-femi',
          grossPay: 2_170_000,
          taxableGross: 2_020_000,
          deductions: 644_730,
          netPay: 1_525_270,
          paye: 380_730,
          recurringLines: [],
          variableLines: [],
          deductionLines: [],
          taxBreakdown: []
        }
      ]
    }
  }

  return {
    auth: {
      login: vi.fn(() => ({ id: `user-${role}`, email: `${role}@haqly.local`, role, displayName: role === 'approver' ? 'Kemi Adebayo' : 'Tunde Kolawole' }))
    },
    companies: {
      list: vi.fn(() => [{ id: 'company-demo', name: 'HAQLY Demo Industries', taxState: 'Lagos', payrollFrequency: 12, currency: 'NGN', payDate: 30, activeTaxPolicyId: 'policy-2026-default' }]),
      ...({
        getSettings: vi.fn(() => ({
          defaultWorkingDays: 22,
          validationPolicy: 'strict',
          approvalPolicy: 'review_then_approve',
          employeePensionRate: 8,
          employerPensionRate: 10,
          nhfEnabled: true,
          nhfRate: 2.5,
          nsitfEnabled: true,
          nsitfRate: 1,
          payeRemittanceDay: 10,
          pensionRemittanceWorkingDays: 7
        })),
        updateSettings: vi.fn((_companyId, payload) => payload)
      } as any)
    },
    employees: {
      list: vi.fn(() => [
        {
          id: 'emp-chidi',
          employeeCode: 'LAG-4492',
          fullName: 'Chidi Okoro',
          department: 'Engineering',
          branch: 'Lagos HQ',
          roleTitle: 'Engineering Analyst',
          employeeType: 'full_time',
          tin: 'TIN-CHIDI',
          rsaNumber: 'RSA-001',
          payAssignments: [
            { componentCode: 'BASIC', componentName: 'Basic Salary', amount: 950_000, activeFrom: '2026-01-01' },
            { componentCode: 'HOUSING', componentName: 'Housing Allowance', amount: 150_000, activeFrom: '2026-01-01' }
          ]
        },
        {
          id: 'emp-aisha',
          employeeCode: 'ABJ-2101',
          fullName: 'Aisha Abubakar',
          department: 'Operations',
          branch: 'Abuja',
          roleTitle: 'Operations Officer',
          employeeType: 'contract',
          tin: 'TIN-AISHA',
          rsaNumber: 'RSA-002',
          payAssignments: [
            { componentCode: 'BASIC', componentName: 'Basic Salary', amount: 700_000, activeFrom: '2026-01-01' },
            { componentCode: 'TRANSPORT', componentName: 'Transport Allowance', amount: 100_000, activeFrom: '2026-01-01' }
          ]
        },
        {
          id: 'emp-femi',
          employeeCode: 'LAG-1120',
          fullName: 'Femi Adebayo',
          department: 'Legal',
          branch: 'Lagos HQ',
          roleTitle: 'Legal Counsel',
          employeeType: 'full_time',
          tin: null,
          rsaNumber: 'RSA-003',
          payAssignments: [
            { componentCode: 'BASIC', componentName: 'Basic Salary', amount: 1_600_000, activeFrom: '2026-01-01' }
          ]
        }
      ]),
      update: vi.fn((_companyId, employeeId, update) => ({
        id: employeeId,
        employeeCode: 'LAG-4492',
        fullName: update.fullName,
        department: update.department,
        branch: update.branch,
        roleTitle: update.roleTitle,
        employeeType: (update as any).employeeType,
        bankName: update.bankName,
        accountNumber: update.accountNumber,
        tin: update.tin,
        rsaNumber: update.rsaNumber,
        status: update.status,
        hireDate: '2024-02-12',
        payAssignments: [
          { componentCode: 'BASIC', componentName: 'Basic Salary', amount: 950_000, activeFrom: '2026-01-01' }
        ]
      })),
      updatePayAssignments: vi.fn((_companyId, _employeeId, payload) => payload.map((assignment) => ({
        componentCode: assignment.componentCode,
        componentName: assignment.componentCode === 'BASIC' ? 'Basic Salary' : 'Housing Allowance',
        amount: assignment.amount,
        activeFrom: '2026-01-01'
      }))),
      create: vi.fn((_companyId, payload) => ({
        id: 'emp-new',
        employeeCode: payload.employeeCode,
        fullName: payload.fullName,
        department: payload.department,
        branch: payload.branch,
        roleTitle: payload.roleTitle,
        employeeType: (payload as any).employeeType,
        bankName: payload.bankName,
        accountNumber: payload.accountNumber,
        tin: payload.tin,
        rsaNumber: payload.rsaNumber,
        status: payload.status,
        hireDate: payload.hireDate,
        payAssignments: []
      }))
    },
    structures: {
      get: vi.fn(() => ({
        policy: { id: 'policy-2026-default', country: 'NG', name: 'Nigeria 2026 Default', code: 'NG-2026', taxYear: 2026, effectiveFrom: '2026-01-01', bands: [], deductionRules: [], reliefRules: [] },
        components: [
          { code: 'BASIC', name: 'Basic Salary', category: 'salary', kind: 'earning', recurring: true, taxable: true, pensionable: true, nhfApplicable: true, calculationBasis: 'fixed' },
          { code: 'BONUS', name: 'Performance Bonus', category: 'bonus', kind: 'earning', recurring: false, taxable: true, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed' },
          { code: 'OVERTIME', name: 'Overtime', category: 'variable', kind: 'earning', recurring: false, taxable: true, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed' },
          { code: 'COOP', name: 'Cooperative Deduction', category: 'custom', kind: 'deduction', recurring: false, taxable: false, pensionable: false, nhfApplicable: false, calculationBasis: 'fixed' }
        ]
      })),
      update: vi.fn((companyId, componentCode, payload) => ({
        companyId,
        code: componentCode,
        kind: componentCode === 'COOP' ? 'deduction' : 'earning',
        ...payload
      })),
      create: vi.fn((companyId, payload) => ({
        companyId,
        ...payload
      }))
    },
    inputs: {
      list: vi.fn(() => ({
        lines: [{ employeeId: 'emp-chidi', payPeriod: '2026-04', componentCode: 'BONUS', amount: 120_000, validationStatus: 'valid' }],
        batches: [{ id: 'batch-apr-2026', sourceFile: 'april-2026-inputs.xlsx', status: 'validated', createdAt: '2026-04-28T10:00:00Z' }]
      })),
      save: vi.fn((companyId, payload) => ({
        ...payload,
        companyId,
        validationStatus: 'valid'
      })),
      importCsv: vi.fn(() => ({
        batchId: 'batch-new',
        importedCount: 2,
        invalidCount: 0,
        status: 'validated'
      }))
    },
    payrollRuns: {
      generate: vi.fn(() => payrollRun),
      list: vi.fn(() => [payrollRun]),
      getById: vi.fn(() => payrollRun),
      validate: vi.fn(() => ({ id: 'run-apr', status: 'validated', blockingCount: 0, warningCount: 1 })),
      approve: vi.fn(() => ({ id: 'run-apr', status: 'approved' })),
      finalize: vi.fn(() => ({ id: 'run-apr', status: 'finalized' })),
      post: vi.fn(() => ({ id: 'run-apr', status: 'posted' })),
      submitForReview: vi.fn(() => ({ id: 'run-apr', status: 'in_review' }))
    },
    dashboard: {
      get: vi.fn(() => ({
        payrollStatus: 'draft',
        grossPay: 4_320_000,
        netPay: 3_238_850,
        payeTotal: 614_650,
        employeeCount: 3,
        compliance: [{ type: 'paye', paymentDate: '2026-04-30', dueDate: '2026-05-10', status: 'due_soon', amount: 614_650, reference: '2026-04' }],
        pendingTasks: [{ id: 'arrears', title: 'Review Arrears for Dept A', detail: '2 employees affected by back-dated adjustments' }],
        auditLog: [{ action: 'payroll.generated', createdAt: '2026-04-30T08:30:00Z' }]
      }))
    },
    compliance: {
      get: vi.fn(() => ({
        schedules: [{ type: 'paye', paymentDate: '2026-04-30', dueDate: '2026-05-10', status: 'due_soon', amount: 614_650, reference: '2026-04' }],
        exceptions: { missingTin: [{ fullName: 'Femi Adebayo', employeeCode: 'LAG-1120' }], missingRsa: [] },
        settings: {
          defaultWorkingDays: 22,
          validationPolicy: 'strict',
          approvalPolicy: 'review_then_approve',
          employeePensionRate: 8,
          employerPensionRate: 10,
          nhfEnabled: true,
          nhfRate: 2.5,
          nsitfEnabled: true,
          nsitfRate: 1,
          payeRemittanceDay: 10,
          pensionRemittanceWorkingDays: 7
        },
        policySummary: {
          code: 'NG-2026',
          name: 'Nigeria 2026 Default',
          deductionRules: ['Employee Pension', 'National Housing Fund']
        }
      }))
    },
    reports: {
      get: vi.fn(() => ({ summary: payrollRun, exportJobs: [] }))
    },
    exports: {
      generateJournalCsv: vi.fn(() => ({ filePath: 'journal.csv' })),
      generateBankScheduleXlsx: vi.fn(() => ({ filePath: 'bank.xlsx' })),
      generatePayslipPdf: vi.fn(() => ({ filePath: 'payslip.pdf' })),
      revealPath: vi.fn(() => undefined)
    },
    loans: {
      list: vi.fn(() => [
        {
          id: 'loan-aisha-laptop',
          employeeId: 'emp-aisha',
          employeeName: 'Aisha Abubakar',
          type: 'staff_loan',
          principal: 240_000,
          balance: 120_000,
          monthlyDeduction: 40_000,
          repaymentMethod: 'flat',
          startDate: '2026-02-01',
          endDate: '2026-07-31',
          interestOption: 'none',
          status: 'active'
        }
      ]),
      create: vi.fn((_companyId, payload) => ({
        id: 'loan-new',
        employeeName: payload.employeeId === 'emp-chidi' ? 'Chidi Okoro' : 'Aisha Abubakar',
        balance: payload.principal,
        status: 'active',
        ...payload
      })),
      updateStatus: vi.fn((_companyId, loanId, status) => ({
        id: loanId,
        employeeId: 'emp-aisha',
        employeeName: 'Aisha Abubakar',
        type: 'staff_loan',
        principal: 240_000,
        balance: 120_000,
        monthlyDeduction: 40_000,
        repaymentMethod: 'flat',
        startDate: '2026-02-01',
        endDate: '2026-07-31',
        interestOption: 'none',
        status
      }))
    }
  }
}

describe('App', () => {
  beforeEach(() => {
    window.haqlyApi = createFakeApi('approver')
  })

  it('asks the user to choose a company before loading the main workspace when multiple companies exist', async () => {
    const user = userEvent.setup()
    window.haqlyApi = {
      ...createFakeApi('approver'),
      companies: {
        list: vi.fn(() => [
          { id: 'company-demo', name: 'HAQLY Demo Industries', taxState: 'Lagos', payrollFrequency: 12, currency: 'NGN', payDate: 30, activeTaxPolicyId: 'policy-2026-default' },
          { id: 'company-northwind', name: 'Northwind Services Nigeria', taxState: 'Abuja FCT', payrollFrequency: 12, currency: 'NGN', payDate: 28, activeTaxPolicyId: 'policy-2026-default' }
        ])
      }
    }

    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/select company/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /northwind services nigeria/i }))
    expect(await screen.findByText(/2026 nigeria tax pack active/i)).toBeInTheDocument()
  })

  it('shows HAQLY-only branding on the sign-in screen', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /haqly payroll/i })).toBeInTheDocument()
    expect(screen.queryByText(/sovereign ledger/i)).not.toBeInTheDocument()
  })

  it('shows the aligned setup navigation labels', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    expect(screen.getByRole('button', { name: /earnings & deductions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compliance & tax/i })).toBeInTheDocument()
  })

  it('shows payroll review drill-down and approval controls for approvers', async () => {
    const user = userEvent.setup()
    window.haqlyApi = createFakeApi('approver', { runStatus: 'in_review' })
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^payroll$/i }))
    await user.click(await screen.findByRole('button', { name: /chidi okoro/i }))

    expect(await screen.findByText(/performance bonus/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve payroll/i })).toBeInTheDocument()
  })

  it('shows payroll variance against the previous month in the payroll review screen', async () => {
    const user = userEvent.setup()
    window.haqlyApi = createFakeApi('approver', { runStatus: 'in_review' })
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^payroll$/i }))

    expect(await screen.findByText(/variance vs 2026-03/i)).toBeInTheDocument()
    expect(screen.getByText(/\+₦420,000\.00/i)).toBeInTheDocument()
    expect(screen.getByText(/\+₦268,850\.00/i)).toBeInTheDocument()
    expect(screen.getByText(/\+₦91,150\.00/i)).toBeInTheDocument()
  })

  it('shows a validation action for payroll officers on draft runs', async () => {
    const payrollOfficerApi = {
      ...createFakeApi('reviewer'),
      auth: {
        login: vi.fn(() => ({ id: 'user-payroll', email: 'payroll@haqly.local', role: 'payroll_officer', displayName: 'Amina Yusuf' }))
      }
    } as unknown as HaqlyApi

    window.haqlyApi = payrollOfficerApi
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'payroll@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^payroll$/i }))

    expect(await screen.findByRole('button', { name: /validate payroll/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send to review/i })).not.toBeInTheDocument()
  })

  it('shows a review handoff action for payroll officers after validation', async () => {
    const payrollOfficerApi = {
      ...createFakeApi('reviewer', { runStatus: 'validated' }),
      auth: {
        login: vi.fn(() => ({ id: 'user-payroll', email: 'payroll@haqly.local', role: 'payroll_officer', displayName: 'Amina Yusuf' }))
      }
    } as unknown as HaqlyApi

    window.haqlyApi = payrollOfficerApi
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'payroll@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^payroll$/i }))

    expect(await screen.findByRole('button', { name: /send to review/i })).toBeInTheDocument()
  })

  it('hides approval controls for reviewers while keeping the payroll breakdown visible', async () => {
    window.haqlyApi = createFakeApi('reviewer')
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'reviewer@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText(/monthly payroll status/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^payroll$/i }))
    await user.click(await screen.findByRole('button', { name: /chidi okoro/i }))

    expect(await screen.findByText(/paye tax/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve payroll/i })).not.toBeInTheDocument()
  })

  it('shows validation exceptions and posting summary in the payroll workspace', async () => {
    const user = userEvent.setup()
    window.haqlyApi = createFakeApi('approver', { runStatus: 'approved' })
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^payroll$/i }))

    expect(await screen.findByText(/validation exceptions/i)).toBeInTheDocument()
    expect(screen.getByText(/missing tin/i)).toBeInTheDocument()
    expect(screen.getByText(/posting summary/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /finalize payroll/i })).toBeInTheDocument()
  })

  it('shows a posting action once a payroll run has been finalized', async () => {
    const user = userEvent.setup()
    window.haqlyApi = createFakeApi('approver', { runStatus: 'finalized' })
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^payroll$/i }))

    expect(await screen.findByRole('button', { name: /post payroll/i })).toBeInTheDocument()
  })

  it('shows import batch health in the payroll inputs center', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /payroll inputs/i }))

    expect(await screen.findByText(/april-2026-inputs\.xlsx/i)).toBeInTheDocument()
    expect(screen.getByText(/validated/i)).toBeInTheDocument()
    expect(screen.getAllByText(/performance bonus/i).length).toBeGreaterThan(0)
  })

  it('lets payroll operations users edit an employee record from the employee workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^employees$/i }))
    await user.click(screen.getByRole('button', { name: /edit chidi okoro/i }))
    await user.clear(screen.getByLabelText(/full name/i))
    await user.type(screen.getByLabelText(/full name/i), 'Chidi Okoro-Okafor')
    await user.clear(screen.getByLabelText(/department/i))
    await user.type(screen.getByLabelText(/department/i), 'Platform Engineering')
    await user.click(screen.getByRole('button', { name: /save employee/i }))

    expect(api.employees.update).toHaveBeenCalledWith(
      'company-demo',
      'emp-chidi',
      expect.objectContaining({
        fullName: 'Chidi Okoro-Okafor',
        department: 'Platform Engineering'
      }),
      'user-approver'
    )
    expect(await screen.findByText(/employee record saved/i)).toBeInTheDocument()
  })

  it('lets payroll operations users edit recurring compensation assignments from the employee workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^employees$/i }))
    await user.clear(screen.getByLabelText(/basic salary amount/i))
    await user.type(screen.getByLabelText(/basic salary amount/i), '975000')
    await user.click(screen.getByRole('button', { name: /save compensation/i }))

    expect(api.employees.updatePayAssignments).toHaveBeenCalledWith(
      'company-demo',
      'emp-chidi',
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: 'BASIC',
          amount: 975_000
        })
      ]),
      'user-approver'
    )
    expect(await screen.findByText(/compensation lines saved/i)).toBeInTheDocument()
  })

  it('lets payroll operators create an employee from the employee workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^employees$/i }))
    await user.click(screen.getByRole('button', { name: /new employee/i }))
    await user.type(screen.getByLabelText(/new employee code/i), 'KAN-1001')
    await user.type(screen.getByLabelText(/new full name/i), 'Ngozi Danjuma')
    await user.type(screen.getByLabelText(/new department/i), 'Finance')
    await user.type(screen.getByLabelText(/new branch/i), 'Kano')
    await user.type(screen.getByLabelText(/new role title/i), 'Payroll Analyst')
    await user.type(screen.getByLabelText(/new hire date/i), '2026-03-01')
    await user.type(screen.getByLabelText(/new bank name/i), 'Zenith Bank')
    await user.type(screen.getByLabelText(/new account number/i), '1029384756')
    await user.selectOptions(screen.getByLabelText(/new employee type/i), 'expat')
    await user.type(screen.getByLabelText(/new tin/i), 'TIN-NGOZI')
    await user.type(screen.getByLabelText(/new rsa number/i), 'RSA-1001')
    await user.click(screen.getByRole('button', { name: /create employee/i }))

    expect((api.employees as any).create).toHaveBeenCalledWith(
      'company-demo',
      expect.objectContaining({
        employeeCode: 'KAN-1001',
        fullName: 'Ngozi Danjuma',
        department: 'Finance',
        employeeType: 'expat'
      }),
      'user-approver'
    )
    expect(await screen.findByText(/employee created/i)).toBeInTheDocument()
  }, 10000)

  it('shows export success feedback and refreshed history after generating a report file', async () => {
    const user = userEvent.setup()
    const exportJobs = [{ id: 'existing-export', type: 'journal_csv', filePath: 'old-journal.csv', createdAt: '2026-04-30T08:30:00Z' }]
    const api = createFakeApi('approver')
    api.reports.get = vi
      .fn()
      .mockReturnValueOnce({ summary: api.payrollRuns.getById('run-apr'), exportJobs: [] })
      .mockReturnValue({ summary: api.payrollRuns.getById('run-apr'), exportJobs: [{ id: 'job-2', type: 'journal_csv', filePath: 'journal.csv', createdAt: '2026-04-30T09:10:00Z' }, ...exportJobs] })
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^reports$/i }))
    await user.click(screen.getByRole('button', { name: /journal csv/i }))

    expect(await screen.findByText(/export ready/i)).toBeInTheDocument()
    expect(screen.getAllByText(/journal\.csv/i).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /reveal file/i }).length).toBeGreaterThan(0)
  })

  it('lets payroll operators add a manual variable input from the payroll inputs workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    api.inputs.list = vi
      .fn()
      .mockReturnValueOnce({
        lines: [{ employeeId: 'emp-chidi', payPeriod: '2026-04', componentCode: 'BONUS', amount: 120_000, validationStatus: 'valid' }],
        batches: [{ id: 'batch-apr-2026', sourceFile: 'april-2026-inputs.xlsx', status: 'validated', createdAt: '2026-04-28T10:00:00Z' }]
      })
      .mockReturnValue({
        lines: [
          { employeeId: 'emp-chidi', payPeriod: '2026-04', componentCode: 'BONUS', amount: 120_000, validationStatus: 'valid' },
          { employeeId: 'emp-aisha', payPeriod: '2026-04', componentCode: 'BONUS', amount: 55_000, validationStatus: 'valid' }
        ],
        batches: [{ id: 'batch-apr-2026', sourceFile: 'april-2026-inputs.xlsx', status: 'validated', createdAt: '2026-04-28T10:00:00Z' }]
      })
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /payroll inputs/i }))
    await user.selectOptions(screen.getByLabelText(/employee/i), 'emp-aisha')
    await user.selectOptions(screen.getByLabelText(/component/i), 'BONUS')
    await user.clear(screen.getByLabelText(/amount/i))
    await user.type(screen.getByLabelText(/amount/i), '55000')
    await user.click(screen.getByRole('button', { name: /save input/i }))

    expect(api.inputs.save).toHaveBeenCalledWith(
      'company-demo',
      expect.objectContaining({
        employeeId: 'emp-aisha',
        componentCode: 'BONUS',
        amount: 55_000
      }),
      'user-approver'
    )
    expect(await screen.findByText(/payroll input saved/i)).toBeInTheDocument()
  })

  it('lets payroll operators edit a salary component from the structures workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /earnings & deductions/i }))
    await user.click(screen.getByRole('button', { name: /edit performance bonus/i }))
    await user.clear(screen.getByLabelText(/component name/i))
    await user.type(screen.getByLabelText(/component name/i), 'Quarterly Performance Bonus')
    await user.clear(screen.getByLabelText(/gl code/i))
    await user.type(screen.getByLabelText(/gl code/i), '5015')
    await user.click(screen.getByRole('button', { name: /save component/i }))

    expect(api.structures.update).toHaveBeenCalledWith(
      'company-demo',
      'BONUS',
      expect.objectContaining({
        name: 'Quarterly Performance Bonus',
        glCode: '5015'
      }),
      'user-approver'
    )
    expect(await screen.findByText(/salary component saved/i)).toBeInTheDocument()
  })

  it('lets payroll operators create a salary component from the structures workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /earnings & deductions/i }))
    await user.click(screen.getByRole('button', { name: /new component/i }))
    await user.type(screen.getByLabelText(/new component code/i), 'SHIFT')
    await user.type(screen.getByLabelText(/new component name/i), 'Shift Allowance')
    await user.type(screen.getByLabelText(/new category/i), 'allowance')
    await user.selectOptions(screen.getByLabelText(/new component kind/i), 'earning')
    await user.type(screen.getByLabelText(/new gl code/i), '5099')
    await user.click(screen.getByRole('button', { name: /create component/i }))

    expect((api.structures as any).create).toHaveBeenCalledWith(
      'company-demo',
      expect.objectContaining({
        code: 'SHIFT',
        name: 'Shift Allowance',
        category: 'allowance',
        kind: 'earning'
      }),
      'user-approver'
    )
    expect(await screen.findByText(/salary component created/i)).toBeInTheDocument()
  })

  it('lets payroll operators save company payroll settings from compliance & tax', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /compliance & tax/i }))
    await user.clear(screen.getByLabelText(/employee pension rate/i))
    await user.type(screen.getByLabelText(/employee pension rate/i), '9')
    await user.clear(screen.getByLabelText(/paye remittance day/i))
    await user.type(screen.getByLabelText(/paye remittance day/i), '12')
    await user.click(screen.getByRole('button', { name: /save compliance settings/i }))

    expect((api.companies as any).updateSettings).toHaveBeenCalledWith(
      'company-demo',
      expect.objectContaining({
        employeePensionRate: 9,
        payeRemittanceDay: 12
      }),
      'user-approver'
    )
    expect(await screen.findByText(/compliance settings saved/i)).toBeInTheDocument()
  })

  it('lets payroll operators create a staff loan from the loans workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    api.loans.list = vi
      .fn()
      .mockReturnValueOnce([
        {
          id: 'loan-aisha-laptop',
          employeeId: 'emp-aisha',
          employeeName: 'Aisha Abubakar',
          type: 'staff_loan',
          principal: 240_000,
          balance: 120_000,
          monthlyDeduction: 40_000,
          repaymentMethod: 'flat',
          startDate: '2026-02-01',
          endDate: '2026-07-31',
          interestOption: 'none',
          status: 'active'
        }
      ])
      .mockReturnValue([
        {
          id: 'loan-aisha-laptop',
          employeeId: 'emp-aisha',
          employeeName: 'Aisha Abubakar',
          type: 'staff_loan',
          principal: 240_000,
          balance: 120_000,
          monthlyDeduction: 40_000,
          repaymentMethod: 'flat',
          startDate: '2026-02-01',
          endDate: '2026-07-31',
          interestOption: 'none',
          status: 'active'
        },
        {
          id: 'loan-new',
          employeeId: 'emp-chidi',
          employeeName: 'Chidi Okoro',
          type: 'staff_loan',
          principal: 300_000,
          balance: 300_000,
          monthlyDeduction: 50_000,
          repaymentMethod: 'flat',
          startDate: '2026-05-01',
          endDate: '2026-10-31',
          interestOption: 'none',
          status: 'active'
        }
      ])
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /^loans$/i }))
    await user.selectOptions(screen.getByLabelText(/loan employee/i), 'emp-chidi')
    await user.clear(screen.getByLabelText(/loan principal/i))
    await user.type(screen.getByLabelText(/loan principal/i), '300000')
    await user.clear(screen.getByLabelText(/monthly deduction/i))
    await user.type(screen.getByLabelText(/monthly deduction/i), '50000')
    await user.click(screen.getByRole('button', { name: /create loan/i }))

    expect(api.loans.create).toHaveBeenCalledWith(
      'company-demo',
      expect.objectContaining({
        employeeId: 'emp-chidi',
        principal: 300_000,
        monthlyDeduction: 50_000
      }),
      'user-approver'
    )
    expect(await screen.findByText(/loan record saved/i)).toBeInTheDocument()
  })

  it('lets payroll operators import a CSV batch from the payroll inputs workspace', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    api.inputs.list = vi
      .fn()
      .mockReturnValueOnce({
        lines: [{ employeeId: 'emp-chidi', payPeriod: '2026-04', componentCode: 'BONUS', amount: 120_000, validationStatus: 'valid' }],
        batches: [{ id: 'batch-apr-2026', sourceFile: 'april-2026-inputs.xlsx', status: 'validated', createdAt: '2026-04-28T10:00:00Z' }]
      })
      .mockReturnValue({
        lines: [
          { employeeId: 'emp-chidi', payPeriod: '2026-04', componentCode: 'BONUS', amount: 120_000, validationStatus: 'valid' },
          { employeeId: 'emp-aisha', payPeriod: '2026-04', componentCode: 'BONUS', amount: 45_000, validationStatus: 'valid' }
        ],
        batches: [
          { id: 'batch-new', sourceFile: 'bonus-template.csv', status: 'validated', createdAt: '2026-04-30T10:00:00Z' },
          { id: 'batch-apr-2026', sourceFile: 'april-2026-inputs.xlsx', status: 'validated', createdAt: '2026-04-28T10:00:00Z' }
        ]
      })
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.click(screen.getByRole('button', { name: /payroll inputs/i }))
    await user.clear(screen.getByLabelText(/batch source file/i))
    await user.type(screen.getByLabelText(/batch source file/i), 'bonus-template.csv')
    await user.clear(screen.getByLabelText(/batch csv/i))
    await user.type(
      screen.getByLabelText(/batch csv/i),
      'employeeCode,componentCode,amount,sourcePeriod{enter}ABJ-2101,BONUS,45000,2026-04{enter}LAG-4492,OVERTIME,25000,'
    )
    await user.click(screen.getByRole('button', { name: /import batch/i }))

    expect(api.inputs.importCsv).toHaveBeenCalledWith(
      'company-demo',
      expect.objectContaining({
        payPeriod: '2026-04',
        sourceFile: 'bonus-template.csv'
      }),
      'user-approver'
    )
    expect(await screen.findByText(/import batch saved/i)).toBeInTheDocument()
  })

  it('lets payroll operators switch pay periods and generates a run when the selected period has no existing payroll', async () => {
    const user = userEvent.setup()
    const api = createFakeApi('approver')
    const generatedRun = {
      ...api.payrollRuns.getById('run-apr'),
      id: 'run-may',
      payPeriod: '2026-05',
      snapshot: {
        ...api.payrollRuns.getById('run-apr').snapshot,
        period: '2026-05'
      }
    }

    api.dashboard.get = vi.fn((_companyId, payPeriod) => ({
      payrollStatus: 'draft',
      grossPay: payPeriod === '2026-05' ? 4_500_000 : 4_320_000,
      netPay: payPeriod === '2026-05' ? 3_350_000 : 3_238_850,
      payeTotal: payPeriod === '2026-05' ? 650_000 : 614_650,
      employeeCount: 3,
      compliance: [{ type: 'paye', paymentDate: `${payPeriod}-30`, dueDate: '2026-06-10', status: 'due_soon', amount: 650_000, reference: payPeriod }],
      pendingTasks: [{ id: 'review', title: `Review ${payPeriod}`, detail: 'Ready for payroll review' }],
      auditLog: [{ action: 'payroll.generated', createdAt: '2026-05-31T08:30:00Z' }]
    }))
    api.inputs.list = vi.fn((_companyId, payPeriod) => ({
      lines: [{ employeeId: 'emp-chidi', payPeriod, componentCode: 'BONUS', amount: 120_000, validationStatus: 'valid' }],
      batches: []
    }))
    api.payrollRuns.list = vi.fn(() => [api.payrollRuns.getById('run-apr')])
    api.payrollRuns.generate = vi.fn((_companyId, payPeriod) => ({ ...generatedRun, payPeriod }))
    api.payrollRuns.getById = vi.fn((runId) => (runId === 'run-may' ? generatedRun : createFakeApi('approver').payrollRuns.getById('run-apr')))
    api.reports.get = vi.fn((_companyId, payPeriod) => ({ summary: payPeriod === '2026-05' ? generatedRun : createFakeApi('approver').payrollRuns.getById('run-apr'), exportJobs: [] }))
    api.compliance.get = vi.fn((_companyId, payPeriod) => ({
      schedules: [{ type: 'paye', paymentDate: `${payPeriod}-30`, dueDate: '2026-06-10', status: 'due_soon', amount: 650_000, reference: payPeriod }],
      exceptions: { missingTin: [], missingRsa: [] }
    }))
    window.haqlyApi = api
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'approver@haqly.local')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText(/haqly demo industries/i)
    await user.selectOptions(screen.getByLabelText(/pay period/i), '2026-05')
    await user.click(screen.getByRole('button', { name: /^reports$/i }))

    expect(api.payrollRuns.generate).toHaveBeenCalledWith('company-demo', '2026-05')
    expect(api.dashboard.get).toHaveBeenCalledWith('company-demo', '2026-05')
    expect(await screen.findByText(/2026-05 outputs/i)).toBeInTheDocument()
  })
})
