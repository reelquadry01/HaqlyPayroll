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
    runStatus?: 'draft' | 'in_review' | 'approved'
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
      list: vi.fn(() => [{ id: 'company-demo', name: 'HAQLY Demo Industries', taxState: 'Lagos', payrollFrequency: 12, currency: 'NGN', payDate: 30, activeTaxPolicyId: 'policy-2026-default' }])
    },
    employees: {
      list: vi.fn(() => [
        { id: 'emp-chidi', employeeCode: 'LAG-4492', fullName: 'Chidi Okoro', department: 'Engineering', branch: 'Lagos HQ', roleTitle: 'Engineering Analyst', tin: 'TIN-CHIDI', rsaNumber: 'RSA-001' },
        { id: 'emp-aisha', employeeCode: 'ABJ-2101', fullName: 'Aisha Abubakar', department: 'Operations', branch: 'Abuja', roleTitle: 'Operations Officer', tin: 'TIN-AISHA', rsaNumber: 'RSA-002' },
        { id: 'emp-femi', employeeCode: 'LAG-1120', fullName: 'Femi Adebayo', department: 'Legal', branch: 'Lagos HQ', roleTitle: 'Legal Counsel', tin: null, rsaNumber: 'RSA-003' }
      ]),
      update: vi.fn((_companyId, employeeId, update) => ({
        id: employeeId,
        employeeCode: 'LAG-4492',
        fullName: update.fullName,
        department: update.department,
        branch: update.branch,
        roleTitle: update.roleTitle,
        bankName: update.bankName,
        accountNumber: update.accountNumber,
        tin: update.tin,
        rsaNumber: update.rsaNumber,
        status: update.status,
        hireDate: '2024-02-12'
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
      }))
    },
    payrollRuns: {
      generate: vi.fn(() => payrollRun),
      list: vi.fn(() => [payrollRun]),
      getById: vi.fn(() => payrollRun),
      approve: vi.fn(() => ({ id: 'run-apr', status: 'approved' })),
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
        exceptions: { missingTin: [{ fullName: 'Femi Adebayo', employeeCode: 'LAG-1120' }], missingRsa: [] }
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
    expect(screen.getByRole('button', { name: /approve & lock payroll/i })).toBeInTheDocument()
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

  it('shows a review handoff action for payroll officers on draft runs', async () => {
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

    expect(await screen.findByRole('button', { name: /send to review/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve & lock payroll/i })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: /approve & lock payroll/i })).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /^structures$/i }))
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
})
