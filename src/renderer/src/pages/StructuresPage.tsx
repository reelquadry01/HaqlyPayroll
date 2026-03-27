import { useEffect, useState } from 'react'

import type { PayComponentCreateInput, PayComponentUpdateInput, StructureData } from '@shared/api'

function createComponentDraft(component: StructureData['components'][number]): PayComponentUpdateInput {
  return {
    name: component.name,
    category: component.category,
    recurring: component.recurring,
    taxable: component.taxable,
    pensionable: component.pensionable,
    nhfApplicable: component.nhfApplicable,
    calculationBasis: component.calculationBasis,
    glCode: component.glCode ?? ''
  }
}

function createComponentCreateDraft(): PayComponentCreateInput {
  return {
    code: '',
    name: '',
    category: '',
    kind: 'earning',
    recurring: false,
    taxable: true,
    pensionable: false,
    nhfApplicable: false,
    calculationBasis: 'fixed',
    glCode: ''
  }
}

export function StructuresPage({
  structures,
  onSave,
  onCreate
}: {
  structures: StructureData
  onSave: (componentCode: string, payload: PayComponentUpdateInput) => Promise<void>
  onCreate: (payload: PayComponentCreateInput) => Promise<void>
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(structures.components[0]?.code ?? null)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [draft, setDraft] = useState<PayComponentUpdateInput | null>(structures.components[0] ? createComponentDraft(structures.components[0]) : null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createDraft, setCreateDraft] = useState<PayComponentCreateInput>(createComponentCreateDraft())

  useEffect(() => {
    if (!structures.components.length) {
      setSelectedCode(null)
      setEditingCode(null)
      setDraft(null)
      return
    }

    if (!selectedCode || !structures.components.find((component) => component.code === selectedCode)) {
      setSelectedCode(structures.components[0].code)
    }
  }, [selectedCode, structures.components])

  const selectedComponent = structures.components.find((component) => component.code === selectedCode) ?? structures.components[0]
  const activeComponent = structures.components.find((component) => component.code === editingCode) ?? selectedComponent

  useEffect(() => {
    if (activeComponent) {
      setDraft(createComponentDraft(activeComponent))
    }
  }, [activeComponent])

  if (!selectedComponent || !draft) {
    return null
  }

  async function handleSubmit() {
    if (!activeComponent) return
    setSaving(true)
    try {
      await onSave(activeComponent.code, draft)
      setSelectedCode(activeComponent.code)
      setEditingCode(activeComponent.code)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateSubmit() {
    setCreating(true)
    try {
      await onCreate(createDraft)
      setCreateDraft(createComponentCreateDraft())
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="page-grid employee-layout">
      <article className="surface-card">
        <div className="section-header">
          <div>
            <p className="section-label">Salary Components</p>
            <h3>Policy-ready component catalog</h3>
          </div>
          <div className="button-row">
            <span className="pill valid">{structures.components.length} components</span>
            <button className="secondary-button" onClick={() => setShowCreate((current) => !current)}>
              New Component
            </button>
          </div>
        </div>
        <div className="table-list">
          {structures.components.map((component) => (
            <div key={component.code} className={`table-row employee-row ${component.code === selectedCode ? 'selected' : ''}`}>
              <button className="employee-summary" onClick={() => setSelectedCode(component.code)}>
                <div>
                  <strong>{component.name}</strong>
                  <p className="muted">{component.code}</p>
                </div>
                <span>{component.kind}</span>
                <span>{component.taxable ? 'Taxable' : 'Non-taxable'}</span>
                <span>{component.glCode ?? 'Unmapped'}</span>
              </button>
              <button
                className="secondary-button"
                aria-label={`Edit ${component.name}`}
                onClick={() => {
                  setSelectedCode(component.code)
                  setEditingCode(component.code)
                  setDraft(createComponentDraft(component))
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </article>
      <article className="surface-card detail-card">
        <div className="section-header">
          <div>
            <p className="section-label">Component Editor</p>
            <h3>{activeComponent?.name ?? selectedComponent.name}</h3>
          </div>
          <span className={`pill ${draft.taxable ? 'valid' : 'due_soon'}`}>{draft.taxable ? 'taxable' : 'non-taxable'}</span>
        </div>

        <div className="editor-grid">
          <label>
            Component Name
            <input aria-label="Component Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Category
            <input aria-label="Category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          </label>
          <label>
            GL Code
            <input aria-label="GL Code" value={draft.glCode ?? ''} onChange={(event) => setDraft({ ...draft, glCode: event.target.value })} />
          </label>
          <label>
            Calculation Basis
            <select
              aria-label="Calculation Basis"
              value={draft.calculationBasis}
              onChange={(event) => setDraft({ ...draft, calculationBasis: event.target.value })}
            >
              <option value="fixed">Fixed</option>
              <option value="percentage">Percentage</option>
            </select>
          </label>
        </div>

        <div className="toggle-grid">
          <label className="toggle-card">
            <input
              aria-label="Recurring"
              type="checkbox"
              checked={draft.recurring}
              onChange={(event) => setDraft({ ...draft, recurring: event.target.checked })}
            />
            <span>Recurring component</span>
          </label>
          <label className="toggle-card">
            <input
              aria-label="Taxable"
              type="checkbox"
              checked={draft.taxable}
              onChange={(event) => setDraft({ ...draft, taxable: event.target.checked })}
            />
            <span>Taxable under PAYE</span>
          </label>
          <label className="toggle-card">
            <input
              aria-label="Pensionable"
              type="checkbox"
              checked={draft.pensionable}
              onChange={(event) => setDraft({ ...draft, pensionable: event.target.checked })}
            />
            <span>Pensionable earning</span>
          </label>
          <label className="toggle-card">
            <input
              aria-label="NHF Applicable"
              type="checkbox"
              checked={draft.nhfApplicable}
              onChange={(event) => setDraft({ ...draft, nhfApplicable: event.target.checked })}
            />
            <span>NHF applicable</span>
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save Component'}
          </button>
        </div>

        {showCreate ? (
          <div className="create-panel">
            <div className="section-header">
              <div>
                <p className="section-label">New Component</p>
                <h3>Add a payroll component</h3>
              </div>
            </div>

            <div className="editor-grid">
              <label>
                Component Code
                <input aria-label="New Component Code" value={createDraft.code} onChange={(event) => setCreateDraft({ ...createDraft, code: event.target.value })} />
              </label>
              <label>
                Component Name
                <input aria-label="New Component Name" value={createDraft.name} onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })} />
              </label>
              <label>
                Category
                <input aria-label="New Category" value={createDraft.category} onChange={(event) => setCreateDraft({ ...createDraft, category: event.target.value })} />
              </label>
              <label>
                Component Kind
                <select aria-label="New Component Kind" value={createDraft.kind} onChange={(event) => setCreateDraft({ ...createDraft, kind: event.target.value })}>
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </label>
              <label>
                GL Code
                <input aria-label="New GL Code" value={createDraft.glCode ?? ''} onChange={(event) => setCreateDraft({ ...createDraft, glCode: event.target.value })} />
              </label>
            </div>

            <div className="toggle-grid">
              <label className="toggle-card">
                <input
                  aria-label="New Recurring"
                  type="checkbox"
                  checked={createDraft.recurring}
                  onChange={(event) => setCreateDraft({ ...createDraft, recurring: event.target.checked })}
                />
                <span>Recurring component</span>
              </label>
              <label className="toggle-card">
                <input
                  aria-label="New Taxable"
                  type="checkbox"
                  checked={createDraft.taxable}
                  onChange={(event) => setCreateDraft({ ...createDraft, taxable: event.target.checked })}
                />
                <span>Taxable under PAYE</span>
              </label>
              <label className="toggle-card">
                <input
                  aria-label="New Pensionable"
                  type="checkbox"
                  checked={createDraft.pensionable}
                  onChange={(event) => setCreateDraft({ ...createDraft, pensionable: event.target.checked })}
                />
                <span>Pensionable earning</span>
              </label>
              <label className="toggle-card">
                <input
                  aria-label="New NHF Applicable"
                  type="checkbox"
                  checked={createDraft.nhfApplicable}
                  onChange={(event) => setCreateDraft({ ...createDraft, nhfApplicable: event.target.checked })}
                />
                <span>NHF applicable</span>
              </label>
            </div>

            <div className="button-row">
              <button className="primary-button" disabled={creating} onClick={handleCreateSubmit}>
                {creating ? 'Creating…' : 'Create Component'}
              </button>
              <button className="secondary-button" onClick={() => setCreateDraft(createComponentCreateDraft())}>
                Reset New Component
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <p className="section-label">Tax Policy</p>
          {structures.policy.bands.map((band) => (
            <div key={band.bandOrder} className="row-line">
              <strong>{band.bandOrder}</strong>
              <span>{band.lowerLimit.toLocaleString()} - {band.upperLimit?.toLocaleString() ?? 'above'}</span>
              <span>{band.ratePercent}%</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
