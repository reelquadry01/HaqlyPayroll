import { contextBridge, ipcRenderer } from 'electron'

import type { HaqlyApi } from '@shared/api'

const api: HaqlyApi = {
  auth: {
    login: (email, password) => ipcRenderer.invoke('haqly:auth:login', email, password)
  },
  companies: {
    list: () => ipcRenderer.invoke('haqly:companies:list')
  },
  employees: {
    list: (companyId) => ipcRenderer.invoke('haqly:employees:list', companyId),
    update: (companyId, employeeId, payload, userId) => ipcRenderer.invoke('haqly:employees:update', companyId, employeeId, payload, userId)
  },
  structures: {
    get: (companyId) => ipcRenderer.invoke('haqly:structures:get', companyId)
  },
  inputs: {
    list: (companyId, payPeriod) => ipcRenderer.invoke('haqly:inputs:list', companyId, payPeriod)
  },
  payrollRuns: {
    generate: (companyId, payPeriod) => ipcRenderer.invoke('haqly:payroll-runs:generate', companyId, payPeriod),
    list: (companyId) => ipcRenderer.invoke('haqly:payroll-runs:list', companyId),
    getById: (runId) => ipcRenderer.invoke('haqly:payroll-runs:get', runId),
    submitForReview: (runId, userId) => ipcRenderer.invoke('haqly:payroll-runs:review', runId, userId),
    approve: (runId, userId) => ipcRenderer.invoke('haqly:payroll-runs:approve', runId, userId)
  },
  dashboard: {
    get: (companyId, payPeriod) => ipcRenderer.invoke('haqly:dashboard:get', companyId, payPeriod)
  },
  compliance: {
    get: (companyId, payPeriod) => ipcRenderer.invoke('haqly:compliance:get', companyId, payPeriod)
  },
  reports: {
    get: (companyId, payPeriod) => ipcRenderer.invoke('haqly:reports:get', companyId, payPeriod)
  },
  exports: {
    generateJournalCsv: (runId) => ipcRenderer.invoke('haqly:exports:journal', runId),
    generateBankScheduleXlsx: (runId) => ipcRenderer.invoke('haqly:exports:bank', runId),
    generatePayslipPdf: (runId, employeeId) => ipcRenderer.invoke('haqly:exports:payslip', runId, employeeId),
    revealPath: (filePath) => ipcRenderer.invoke('haqly:exports:reveal', filePath)
  }
}

contextBridge.exposeInMainWorld('haqlyApi', api)
