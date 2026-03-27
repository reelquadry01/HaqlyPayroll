import type { ReactNode } from 'react'

import type { AuthSession, CompanyRecord } from '@shared/api'

import type { NoticeState } from './shared'
import { NoticeBanner } from './shared'

export type NavKey = 'dashboard' | 'employees' | 'structures' | 'inputs' | 'loans' | 'payroll' | 'reports' | 'compliance'

const navItems: Array<{ key: NavKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'structures', label: 'Earnings & Deductions' },
  { key: 'inputs', label: 'Payroll Inputs' },
  { key: 'loans', label: 'Loans' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'reports', label: 'Reports' },
  { key: 'compliance', label: 'Compliance & Tax' }
]

export function AppShell({
  company,
  session,
  selectedPayPeriod,
  payPeriodOptions,
  busy,
  activeNav,
  notice,
  onPayPeriodChange,
  onActiveNavChange,
  onDismissNotice,
  children
}: {
  company: CompanyRecord
  session: AuthSession
  selectedPayPeriod: string
  payPeriodOptions: string[]
  busy: boolean
  activeNav: NavKey
  notice: NoticeState | null
  onPayPeriodChange: (payPeriod: string) => void
  onActiveNavChange: (nav: NavKey) => void
  onDismissNotice: () => void
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">HAQLY Payroll</p>
          <h2>HAQLY Payroll</h2>
          <p className="muted">Nigeria-first desktop operations</p>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button key={item.key} className={item.key === activeNav ? 'nav-item active' : 'nav-item'} onClick={() => onActiveNavChange(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="primary-button sidebar-button" onClick={() => onActiveNavChange('payroll')}>
          Run Payroll
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="muted">{company.name}</p>
            <h1>2026 Nigeria Tax Pack Active</h1>
          </div>
          <div className="topbar-actions">
            <label className="period-select">
              <span>Pay Period</span>
              <select aria-label="Pay Period" value={selectedPayPeriod} disabled={busy} onChange={(event) => onPayPeriodChange(event.target.value)}>
                {payPeriodOptions.map((payPeriod) => (
                  <option key={payPeriod} value={payPeriod}>{payPeriod}</option>
                ))}
              </select>
            </label>
            <div className="profile-chip">
              <span>{session.displayName}</span>
              <small>{session.role.replace('_', ' ')}</small>
            </div>
          </div>
        </header>

        {notice ? <NoticeBanner notice={notice} onDismiss={onDismissNotice} /> : null}
        {children}
      </main>
    </div>
  )
}
