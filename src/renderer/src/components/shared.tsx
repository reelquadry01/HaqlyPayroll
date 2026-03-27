import { useState } from 'react'

import type { CompanyRecord } from '@shared/api'

export interface NoticeState {
  tone: 'success' | 'error'
  message: string
}

export function LoginView({
  onLogin,
  busy,
  error
}: {
  onLogin: (email: string, password: string) => void
  busy: boolean
  error?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="login-screen">
      <section className="login-card">
        <p className="eyebrow">HAQLY Payroll</p>
        <h1>HAQLY Payroll</h1>
        <p className="muted">Nigeria-first payroll for finance teams that need control, clarity, and audit-ready outputs.</p>
        <label>
          Email
          <input aria-label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={busy} type="button" onClick={() => onLogin(email, password)}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="hint">Demo credentials: `admin@haqly.local` / `password123`</p>
      </section>
    </div>
  )
}

export function CompanySelectionView({
  companies,
  busy,
  onSelectCompany
}: {
  companies: CompanyRecord[]
  busy: boolean
  onSelectCompany: (company: CompanyRecord) => void
}) {
  return (
    <div className="login-screen">
      <section className="login-card">
        <p className="eyebrow">Select Company</p>
        <h1>Choose the payroll workspace</h1>
        <p className="muted">This installation supports multiple companies. Pick the one you want to work on for this session.</p>
        <div className="company-selector-list">
          {companies.map((company) => (
            <button key={company.id} className="company-selector-card" disabled={busy} onClick={() => onSelectCompany(company)}>
              <strong>{company.name}</strong>
              <span>{company.taxState}</span>
              <small>Pay date: day {company.payDate}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export function NoticeBanner({ notice, onDismiss }: { notice: NoticeState; onDismiss: () => void }) {
  return (
    <div className={`notice-banner ${notice.tone}`}>
      <strong>{notice.message}</strong>
      <button className="link-button" onClick={onDismiss}>Dismiss</button>
    </div>
  )
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="section-label">{label}</p>
      <strong>{value}</strong>
    </div>
  )
}
