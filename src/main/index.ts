import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { app, BrowserWindow, ipcMain, shell } from 'electron'

import { bootstrapDatabase, createDatabaseContext, seedDemoData } from './db/context'
import { createServiceFacade } from './services/serviceFacade'

let mainWindow: BrowserWindow | null = null

function createRuntime() {
  const dataDir = join(app.getPath('userData'), 'data')
  const exportDir = join(app.getPath('userData'), 'exports')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(exportDir, { recursive: true })
  const database = createDatabaseContext({
    filePath: join(dataDir, 'haqly-payroll.db')
  })

  bootstrapDatabase(database)
  seedDemoData(database)

  return createServiceFacade({ database, exportDir })
}

function registerHandlers() {
  const services = createRuntime()

  ipcMain.handle('haqly:auth:login', (_event, email: string, password: string) => services.auth.login(email, password))
  ipcMain.handle('haqly:companies:list', () => services.companies.list())
  ipcMain.handle('haqly:employees:list', (_event, companyId: string) => services.employees.list(companyId))
  ipcMain.handle('haqly:employees:update', (_event, companyId: string, employeeId: string, payload, userId: string) => services.employees.update(companyId, employeeId, payload, userId))
  ipcMain.handle('haqly:structures:get', (_event, companyId: string) => services.structures.get(companyId))
  ipcMain.handle('haqly:structures:update', (_event, companyId: string, componentCode: string, payload, userId: string) => services.structures.update(companyId, componentCode, payload, userId))
  ipcMain.handle('haqly:inputs:list', (_event, companyId: string, payPeriod: string) => services.inputs.list(companyId, payPeriod))
  ipcMain.handle('haqly:inputs:save', (_event, companyId: string, payload, userId: string) => services.inputs.save(companyId, payload, userId))
  ipcMain.handle('haqly:payroll-runs:generate', (_event, companyId: string, payPeriod: string) => services.payrollRuns.generate(companyId, payPeriod))
  ipcMain.handle('haqly:payroll-runs:list', (_event, companyId: string) => services.payrollRuns.list(companyId))
  ipcMain.handle('haqly:payroll-runs:get', (_event, runId: string) => services.payrollRuns.getById(runId))
  ipcMain.handle('haqly:payroll-runs:review', (_event, runId: string, userId: string) => services.payrollRuns.submitForReview(runId, userId))
  ipcMain.handle('haqly:payroll-runs:approve', (_event, runId: string, userId: string) => services.payrollRuns.approve(runId, userId))
  ipcMain.handle('haqly:dashboard:get', (_event, companyId: string, payPeriod: string) => services.dashboard.get(companyId, payPeriod))
  ipcMain.handle('haqly:compliance:get', (_event, companyId: string, payPeriod: string) => services.compliance.get(companyId, payPeriod))
  ipcMain.handle('haqly:reports:get', (_event, companyId: string, payPeriod: string) => services.reports.get(companyId, payPeriod))
  ipcMain.handle('haqly:exports:journal', (_event, runId: string) => services.exports.generateJournalCsv(runId))
  ipcMain.handle('haqly:exports:bank', (_event, runId: string) => services.exports.generateBankScheduleXlsx(runId))
  ipcMain.handle('haqly:exports:payslip', (_event, runId: string, employeeId: string) => services.exports.generatePayslipPdf(runId, employeeId))
  ipcMain.handle('haqly:exports:reveal', (_event, filePath: string) => shell.showItemInFolder(filePath))
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1280,
    minHeight: 820,
    title: 'HAQLY Payroll',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerHandlers()
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
