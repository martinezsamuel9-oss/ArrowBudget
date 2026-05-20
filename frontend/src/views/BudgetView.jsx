// BudgetView — migrated from costos/views-budget.jsx + Supabase integration
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { I } from '../icons'
import { StatusBadge, formatMoney, Drawer } from '../components'
import { supabase } from '../lib/supabase'
import { exportPDFPresupuesto, exportExcelPresupuesto } from '../lib/export'
import FichaCostoModal from './FichaCostoModal'

/* ============ BudgetView ============ */
export function BudgetView({ project, params, setParams, onBack, onSettings, onProjectUpdate }) {
  const [tab,           setTab]           = useState('budget')
  const [showCotizante, setShowCotizante] = useState(false)
  const [items,         setItems]         = useState(project.items || [])
  const [saving,        setSaving]        = useState(false)
  const [saveLabel,     setSaveLabel]     = useState(project.updated || 'Guardado')
  const [fichaItem,     setFichaItem]     = useState(null)
  const [cotizante,     setCotizante]     = useState({
    name:     project.cotizante || '',
    client:   project.client   || '',
    location: project.location || '',
    date:     project.date     || '',
    revision: project.revision || 1,
    currency: project.currency || 'USD',
  })

  // Sync items when project changes (opening a different project)
  useEffect(() => {
    setItems(project.items || [])
    setCotizante({
      name:     project.cotizante || '',
      client:   project.client   || '',
      location: project.location || '',
      date:     project.date     || '',
      revision: project.revision || 1,
      currency: project.currency || 'USD',
    })
  }, [project.id])

  // Auto-save — debounced 1.2s after any change
  useEffect(() => {
    const t = setTimeout(async () => {
      setSaving(true)
      await supabase.from('presupuestos').update({
        items_json:       items,
        pct_indirectos:   params.indirectos,
        pct_imprevistos:  params.imprevistos,
        pct_utilidad:     params.utilidad,
        pct_impuesto:     params.impuesto,
        cotizante:        cotizante.name,
        cliente:          cotizante.client,
        lugar:            cotizante.location,
        fecha:            cotizante.date,
        revision:         cotizante.revision,
        moneda:           cotizante.currency,
        updated_at:       new Date().toISOString(),
      }).eq('id', project.id)
      setSaving(false)
      setSaveLabel('hace un momento')
      if (onProjectUpdate) onProjectUpdate(project.id, { items, params, cotizante })
    }, 1200)
    return () => clearTimeout(t)
  }, [items, params, cotizante, project.id])

  // Compute totals
  const totals = useMemo(() => {
    let direct = 0
    const byChapter = {}
    const bySub     = {}
    items.forEach(it => {
      if (it.kind === 'activity') {
        const sub = (it.qty || 0) * (it.price || 0)
        direct += sub
        bySub[it.parent] = (bySub[it.parent] || 0) + sub
      }
    })
    items.forEach(it => {
      if (it.kind === 'subchapter') {
        byChapter[it.parent] = (byChapter[it.parent] || 0) + (bySub[it.id] || 0)
      }
    })
    const indirectos  = direct * (params.indirectos / 100)
    const imprevistos = (direct + indirectos) * (params.imprevistos / 100)
    const subtotal    = direct + indirectos + imprevistos
    const utilidad    = subtotal * (params.utilidad / 100)
    const withU       = subtotal + utilidad
    const impuesto    = withU * (params.impuesto / 100)
    const total       = withU + impuesto
    return { direct, indirectos, imprevistos, utilidad, impuesto, total, byChapter, bySub }
  }, [items, params])

  const tabs = [
    { id: 'budget',       label: 'Presupuesto',           icon: 'FileText',     count: items.length },
    { id: 'materials',    label: 'Lista Materiales',       icon: 'Box',          count: null },
    { id: 'labor',        label: 'Lista Mano de Obra',     icon: 'HardHat',      count: null },
    { id: 'equipment',    label: 'Herramientas/Equipo',    icon: 'Wrench',       count: null },
    { id: 'subcontracts', label: 'Lista Subcontratos',     icon: 'Users',        count: null },
  ]

  const updateActivity = useCallback((id, field, value) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
  }, [])

  const addChapter = () => {
    const chapCount = items.filter(i => i.kind === 'chapter').length + 1
    const id = `ch-${Date.now()}`
    setItems(prev => [...prev, { id, kind: 'chapter', code: String(chapCount), desc: 'Nuevo Capítulo' }])
  }

  const addSubchapter = (chapterId) => {
    const chap = items.find(i => i.id === chapterId)
    if (!chap) return
    const siblings = items.filter(i => i.kind === 'subchapter' && i.parent === chapterId)
    const id = `sub-${Date.now()}`
    const code = `${chap.code}.${siblings.length + 1}`
    setItems(prev => [...prev, { id, kind: 'subchapter', code, desc: 'Nuevo Sub-capítulo', parent: chapterId }])
  }

  const addActivity = (subId) => {
    const sub = items.find(i => i.id === subId)
    if (!sub) return
    const siblings = items.filter(i => i.kind === 'activity' && i.parent === subId)
    const id = `act-${Date.now()}`
    const code = `${sub.code}.${String(siblings.length + 1).padStart(2, '0')}`
    setItems(prev => [...prev, {
      id, kind: 'activity', code, desc: 'Nueva actividad', unit: 'und', qty: 1, price: 0, parent: subId,
      ficha: { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] },
    }])
  }

  // Called by FichaCostoModal on save — updates the activity with new ficha + recalculated price
  const saveFicha = (updatedActivity) => {
    setItems(prev => prev.map(it => it.id === updatedActivity.id ? updatedActivity : it))
    setFichaItem(null)
  }

  const deleteItem = (id) => {
    if (!confirm('¿Eliminar este elemento y sus hijos?')) return
    // Collect IDs to delete (item + all descendants)
    const toDelete = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      items.forEach(it => {
        if (it.parent && toDelete.has(it.parent) && !toDelete.has(it.id)) {
          toDelete.add(it.id); changed = true
        }
      })
    }
    setItems(prev => prev.filter(i => !toDelete.has(i.id)))
  }

  const duplicateItem = (id) => {
    const it = items.find(i => i.id === id)
    if (!it || it.kind !== 'activity') return
    const newId = `act-${Date.now()}`
    setItems(prev => [...prev, { ...it, id: newId, code: it.code + '-copy' }])
  }

  // Build export-compatible budget object
  const budgetForExport = {
    nombre_proyecto: project.name,
    cotizante:       cotizante.name,
    cliente:         cotizante.client,
    lugar:           cotizante.location,
    fecha:           cotizante.date,
    revision:        cotizante.revision,
    moneda:          cotizante.currency || project.currency,
    pctIndirectos:   params.indirectos,
    pctImprevistos:  params.imprevistos,
    pctUtilidad:     params.utilidad,
    items,
  }

  return (
    <>
      {/* Page header */}
      <div className="page-head">
        <div className="page-head-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-text-3)', fontWeight: 500 }}>
            <span className="badge brand">{project.tag}</span>
            <StatusBadge status={project.status} />
            <span className="badge">Rev {cotizante.revision}</span>
            <span className="badge mono"><I.Coins size={11} /> {cotizante.currency || project.currency}</span>
          </div>
          <h1>
            {project.name}
            <button className="icon-btn" style={{ width: 26, height: 26 }} title="Datos del proyecto"
              onClick={() => setShowCotizante(true)}><I.Edit size={13} /></button>
          </h1>
          <div className="page-head-meta">
            {cotizante.client   && <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}><I.Briefcase size={13} style={{ verticalAlign: '-2px' }} /> {cotizante.client}</span>}
            {cotizante.location && <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}><I.MapPin size={13} style={{ verticalAlign: '-2px' }} /> {cotizante.location}</span>}
            {cotizante.date     && <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}><I.Calendar size={13} style={{ verticalAlign: '-2px' }} /> {cotizante.date}</span>}
            <span className={`save-state ${saving ? 'saving' : ''}`}>
              <span className="pulse" />
              {saving ? 'Guardando…' : `Guardado · ${saveLabel}`}
            </span>
          </div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            <button title="Exportar Excel"
              onClick={() => exportExcelPresupuesto(budgetForExport)}>
              <I.FileSpreadsheet size={13} stroke={1.8} style={{ color: '#10B981' }} /> Excel
            </button>
            <button title="Exportar PDF"
              onClick={() => exportPDFPresupuesto(budgetForExport)}>
              <I.FileText size={13} stroke={1.8} style={{ color: '#DC2626' }} /> PDF
            </button>
          </div>
          <button className="btn ghost icon" onClick={onSettings} title="Configuración">
            <I.Settings size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => {
          const Icon = I[t.icon]
          return (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={14} />
              {t.label}
              {t.count != null && <span className="count">{t.count}</span>}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="page-body">
        {tab === 'budget' ? (
          <>
            {/* KPI strip */}
            <div className="kpi-row">
              <KPICard label="Costo Directo"          value={totals.direct}    icon="HardHat"  foot="Materiales + MO + Equipo"      currency={cotizante.currency || project.currency} />
              <KPICard label="Indirectos + Imprevistos" value={totals.indirectos + totals.imprevistos} icon="Layers" foot={`${params.indirectos}% + ${params.imprevistos}%`} currency={cotizante.currency || project.currency} />
              <KPICard label="Utilidad Esperada"      value={totals.utilidad}  icon="TrendUp"  foot={`${params.utilidad}% sobre subtotal`} currency={cotizante.currency || project.currency} />
              <KPICard label="Total General"          value={totals.total}     icon="DollarSign" foot={`Incluye impuesto ${params.impuesto}%`} highlight currency={cotizante.currency || project.currency} />
            </div>

            {/* Params strip */}
            <div className="params">
              <span className="params-label">Parámetros globales</span>
              {[
                { key: 'indirectos',  label: 'Indirectos' },
                { key: 'imprevistos', label: 'Imprevistos' },
                { key: 'utilidad',    label: 'Utilidad' },
                { key: 'impuesto',    label: 'Impuesto' },
              ].map(p => (
                <div key={p.key} className="param-pill">
                  <span className="param-pill-lbl">{p.label}</span>
                  <input type="number" value={params[p.key]}
                    onChange={e => setParams({ ...params, [p.key]: parseFloat(e.target.value) || 0 })} />
                  <span className="suf">%</span>
                </div>
              ))}
              <div style={{ flex: 1 }} />
              <button className="btn ghost sm" onClick={() => setShowCotizante(true)}>
                <I.Edit size={13} /> Datos del cotizante
              </button>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="sec-title" style={{ flex: 1 }}>
                <I.Layers size={15} /> Desglose por capítulos
                <span className="badge" style={{ marginLeft: 6 }}>
                  {items.filter(i => i.kind === 'chapter').length} cap. · {items.filter(i => i.kind === 'activity').length} act.
                </span>
              </div>
              <button className="btn sm"><I.Plus size={13} stroke={2.5} onClick={addChapter} /> Nuevo Capítulo</button>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <BudgetTable
                items={items}
                totals={totals}
                params={params}
                currency={cotizante.currency || project.currency}
                onUpdate={updateActivity}
                onAddSub={addSubchapter}
                onAddAct={addActivity}
                onDelete={deleteItem}
                onDuplicate={duplicateItem}
                onOpenFicha={setFichaItem}
              />
            </div>
          </>
        ) : (
          <div className="card empty">
            {React.createElement(I[tabs.find(t => t.id === tab)?.icon || 'Sparkles'], { size: 28, style: { color: 'var(--c-text-4)', marginBottom: 8 } })}
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text-2)' }}>{tabs.find(t => t.id === tab)?.label}</div>
            <div style={{ marginTop: 4 }}>Esta lista se genera automáticamente desde las actividades del presupuesto.</div>
          </div>
        )}
      </div>

      {/* Ficha de Costo Unitario modal */}
      <FichaCostoModal
        open={!!fichaItem}
        onClose={() => setFichaItem(null)}
        activity={fichaItem}
        params={params}
        currency={cotizante.currency || project.currency}
        onSave={saveFicha}
      />

      {/* Cotizante / project data drawer */}
      <Drawer
        open={showCotizante}
        onClose={() => setShowCotizante(false)}
        title="Datos del Cotizante y Proyecto"
        subtitle="Información que aparecerá en la portada de la cotización"
        footer={
          <>
            <button className="btn ghost" onClick={() => setShowCotizante(false)}>Cancelar</button>
            <button className="btn primary" onClick={() => setShowCotizante(false)}>
              <I.Check size={14} /> Guardar cambios
            </button>
          </>
        }
      >
        <CotizanteForm value={cotizante} onChange={setCotizante} />
      </Drawer>
    </>
  )
}

/* ============ Budget Table ============ */
function BudgetTable({ items, totals, currency, onUpdate, onAddSub, onAddAct, onDelete, onDuplicate, onOpenFicha }) {
  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 500px)', minHeight: 200 }}>
      <table className="bt">
        <thead>
          <tr>
            <th style={{ width: 80 }}>ID</th>
            <th>Descripción</th>
            <th style={{ width: 80 }}>Unidad</th>
            <th className="num" style={{ width: 100 }}>Cantidad</th>
            <th className="num" style={{ width: 120 }}>P. Unitario</th>
            <th className="num" style={{ width: 140 }}>Subtotal</th>
            <th style={{ width: 130 }} />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--c-text-3)' }}>
                Sin ítems aún. Agrega un capítulo para comenzar.
              </td>
            </tr>
          )}
          {items.map(it => {
            if (it.kind === 'chapter') {
              return (
                <tr key={it.id} className="chapter">
                  <td className="id">{it.code}</td>
                  <td className="desc" colSpan={4}>
                    <span style={{ marginRight: 8, color: 'var(--c-text-3)', fontSize: 11, fontWeight: 500 }}>CAPÍTULO</span>
                    {it.desc}
                  </td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--c-ink)' }}>
                    {formatMoney(totals.byChapter[it.id] || 0, currency)}
                  </td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="btn xs" onClick={() => onAddSub(it.id)}><I.Plus size={11} /> Sub</button>
                      <button className="btn xs danger icon" onClick={() => onDelete(it.id)}><I.Trash size={12} /></button>
                    </div>
                  </td>
                </tr>
              )
            }
            if (it.kind === 'subchapter') {
              return (
                <tr key={it.id} className="subchapter">
                  <td className="id">{it.code}</td>
                  <td className="desc" colSpan={4}>{it.desc}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {formatMoney(totals.bySub[it.id] || 0, currency)}
                  </td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="btn xs" onClick={() => onAddAct(it.id)}><I.Plus size={11} /> Act</button>
                      <button className="btn xs danger icon" onClick={() => onDelete(it.id)}><I.Trash size={12} /></button>
                    </div>
                  </td>
                </tr>
              )
            }
            // activity
            const sub = (it.qty || 0) * (it.price || 0)
            const hasFicha = it.ficha && (
              (it.ficha.materiales?.length || 0) +
              (it.ficha.manoObra?.length || 0) +
              (it.ficha.herramientaEquipo?.length || 0) +
              (it.ficha.subcontratos?.length || 0)
            ) > 0
            return (
              <tr key={it.id} className="activity">
                <td className="id">{it.code}</td>
                <td className="desc">
                  <input className="cell-input" style={{ width: '100%' }} value={it.desc}
                    onChange={e => onUpdate(it.id, 'desc', e.target.value)} />
                </td>
                <td>
                  <input className="cell-input" style={{ width: 60 }} value={it.unit || ''}
                    onChange={e => onUpdate(it.id, 'unit', e.target.value)} />
                </td>
                <td className="num">
                  <input className="cell-input num" type="number" value={it.qty}
                    onChange={e => onUpdate(it.id, 'qty', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="num">
                  <input className="cell-input num" type="number" step="0.01" value={it.price}
                    title="Precio unitario — editable directo o calculado desde APU"
                    onChange={e => onUpdate(it.id, 'price', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="num" style={{ fontWeight: 600 }}>{formatMoney(sub, currency)}</td>
                <td className="actions">
                  <div className="row-actions">
                    <button
                      className={`btn xs ${hasFicha ? 'brand' : 'ghost'}`}
                      title="Editar Análisis de Precio Unitario (APU)"
                      onClick={() => onOpenFicha(it)}
                      style={{ minWidth: 44 }}
                    >
                      <I.FileText size={11} /> APU
                    </button>
                    <button className="btn xs ghost icon" title="Duplicar" onClick={() => onDuplicate(it.id)}><I.Copy size={12} /></button>
                    <button className="btn xs danger icon" title="Eliminar" onClick={() => onDelete(it.id)}><I.Trash size={12} /></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="lbl" colSpan={5}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span>Total General</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', textTransform: 'none', letterSpacing: 0 }}>
                  Directo {formatMoney(totals.direct, currency)} · Indir. {formatMoney(totals.indirectos, currency)} · Impr. {formatMoney(totals.imprevistos, currency)} · Util. {formatMoney(totals.utilidad, currency)} · Imp. {formatMoney(totals.impuesto, currency)}
                </span>
              </div>
            </td>
            <td className="num total-cell">{formatMoney(totals.total, currency)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ============ Cotizante Form ============ */
function CotizanteForm({ value, onChange }) {
  const set = (field, val) => onChange(prev => ({ ...prev, [field]: val }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div className="sec-title" style={{ fontSize: 13, marginBottom: 12 }}>
          <I.Building size={14} /> Empresa que cotiza
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label className="field-label">Empresa / Cotizante</label>
            <input className="input" value={value.name} onChange={e => set('name', e.target.value)} placeholder="Nombre de la empresa" />
          </div>
          <div className="field">
            <label className="field-label">Cliente</label>
            <input className="input" value={value.client} onChange={e => set('client', e.target.value)} placeholder="Nombre del cliente" />
          </div>
        </div>
      </div>
      <div className="divider" />
      <div>
        <div className="sec-title" style={{ fontSize: 13, marginBottom: 12 }}>
          <I.FileText size={14} /> Detalles del proyecto
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label className="field-label">Lugar del proyecto</label>
            <input className="input" value={value.location} onChange={e => set('location', e.target.value)} placeholder="Ciudad, departamento" />
          </div>
          <div className="grid-3">
            <div className="field">
              <label className="field-label">Fecha</label>
              <input type="date" className="input" value={value.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Revisión</label>
              <input type="number" className="input mono" value={value.revision} onChange={e => set('revision', parseInt(e.target.value) || 1)} />
            </div>
            <div className="field">
              <label className="field-label">Moneda</label>
              <select className="select" value={value.currency} onChange={e => set('currency', e.target.value)}>
                <option value="USD">USD — Dólar</option>
                <option value="HNL">HNL — Lempira</option>
                <option value="EUR">EUR — Euro</option>
                <option value="MXN">MXN — Peso MX</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============ Settings Drawer ============ */
export function SettingsView({ open, onClose, user, profile, onSignOut }) {
  const [pane, setPane] = useState('company')
  const [companyName, setCompanyName] = useState(profile?.company_name || '')
  const [fullName,    setFullName]    = useState(profile?.full_name    || user?.user_metadata?.full_name || '')

  const save = async () => {
    await supabase.from('profiles').upsert({
      id:           user.id,
      company_name: companyName,
      full_name:    fullName,
      updated_at:   new Date().toISOString(),
    })
    onClose()
  }

  return (
    <Drawer open={open} onClose={onClose} title="Configuración" subtitle="Gestiona tu empresa y preferencias" width={560}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cerrar</button>
          <button className="btn primary" onClick={save}><I.Check size={14} /> Guardar cambios</button>
        </>
      }
    >
      <div className="seg" style={{ marginBottom: 18, width: '100%' }}>
        {[
          { id: 'company', label: 'Empresa',      icon: 'Building' },
          { id: 'account', label: 'Cuenta',        icon: 'Users' },
          { id: 'prefs',   label: 'Preferencias',  icon: 'Settings' },
        ].map(p => {
          const Icon = I[p.icon]
          return (
            <button key={p.id} className={pane === p.id ? 'on' : ''} onClick={() => setPane(p.id)} style={{ flex: 1, justifyContent: 'center' }}>
              <Icon size={13} /> {p.label}
            </button>
          )
        })}
      </div>

      {pane === 'company' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label className="field-label">Nombre de la empresa</label>
            <input className="input" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Mi empresa S.A." />
          </div>
          <div className="field">
            <label className="field-label">Moneda predeterminada</label>
            <select className="select">
              <option value="USD">USD — Dólar</option>
              <option value="HNL">HNL — Lempira</option>
              <option value="MXN">MXN — Peso MX</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">País</label>
            <select className="select">
              <option value="HN">Honduras</option>
              <option value="GT">Guatemala</option>
              <option value="SV">El Salvador</option>
              <option value="MX">México</option>
            </select>
          </div>
        </div>
      )}

      {pane === 'account' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label className="field-label">Nombre completo</label>
            <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div className="field">
            <label className="field-label">Correo electrónico</label>
            <input className="input" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
          </div>
          <div className="divider" />
          <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={onSignOut}>
            <I.LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      )}

      {pane === 'prefs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle label="Autoguardado" sub="Guarda los cambios cada segundo automáticamente" on />
          <Toggle label="Cálculo de utilidad sobre subtotal" sub="Aplica utilidad después de indirectos e imprevistos" on />
          <Toggle label="Notificaciones" sub="Alertas del sistema" />
        </div>
      )}
    </Drawer>
  )
}

function Toggle({ label, sub, on }) {
  const [v, set] = useState(!!on)
  return (
    <div className="spread" style={{ padding: '4px 0' }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sub}</div>}
      </div>
      <button onClick={() => set(!v)} style={{ width: 36, height: 20, borderRadius: 999, background: v ? 'var(--c-success)' : '#CCD3DD', border: 0, position: 'relative', transition: 'background 150ms ease', cursor: 'pointer' }}>
        <span style={{ position: 'absolute', top: 2, left: v ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 150ms ease' }} />
      </button>
    </div>
  )
}

function KPICard({ label, value, icon, foot, highlight, currency }) {
  const Icon = I[icon]
  return (
    <div className={`kpi ${highlight ? 'highlight' : ''}`}>
      <div className="kpi-label">{Icon && <Icon size={12} className="ico" />}{label}</div>
      <div className="kpi-val">{formatMoney(value, currency)}</div>
      {foot && <div className="kpi-foot"><span>{foot}</span></div>}
    </div>
  )
}
