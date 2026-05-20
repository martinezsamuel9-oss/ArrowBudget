// Ficha de Costo Unitario — modal adaptado al diseño costos/ (styles.css, sin Tailwind)
import React, { useState, useEffect } from 'react'
import { I } from '../icons'
import { calcFicha, conceptoCost, fmt } from '../lib/calc'
import { formatMoney } from '../components'
import { exportPDFFicha, exportExcelFicha } from '../lib/export'

const EMPTY_FICHA = () => ({ materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] })
const NEW_CONCEPTO = () => ({ id: Date.now() + Math.random(), descripcion: 'Nuevo concepto', unidad: 'und', rendimiento: 1, desperdicio: 0, costoUnitario: 0 })

/* ─── Overlay styles (no Tailwind) ─── */
const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-xl)',
    width: '100%', maxWidth: 1080, maxHeight: '92vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    border: '1px solid var(--c-line)',
  },
  header: {
    background: 'var(--c-side)', color: '#fff', padding: '14px 20px',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0,
  },
  body: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  footer: {
    padding: '12px 20px', borderTop: '1px solid var(--c-line)', background: 'var(--c-bg)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0,
  },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    background: 'var(--c-side)', color: 'rgba(255,255,255,0.85)', padding: '6px 8px',
    textAlign: 'left', fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
    borderBottom: '1px solid var(--c-line)',
  },
  thR: {
    background: 'var(--c-side)', color: 'rgba(255,255,255,0.85)', padding: '6px 8px',
    textAlign: 'right', fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
    borderBottom: '1px solid var(--c-line)',
  },
  td: { padding: '5px 6px', borderBottom: '1px solid var(--c-line)', verticalAlign: 'middle' },
  tdR: { padding: '5px 6px', borderBottom: '1px solid var(--c-line)', verticalAlign: 'middle', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  tdC: { padding: '5px 6px', borderBottom: '1px solid var(--c-line)', verticalAlign: 'middle', textAlign: 'center' },
  tdSub: {
    padding: '6px 8px', background: 'var(--c-bg)', fontWeight: 600, fontSize: 12,
    borderTop: '2px solid var(--c-line)', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  },
  cellInput: {
    width: '100%', background: 'transparent', border: '1px solid transparent', borderRadius: 4,
    padding: '3px 5px', fontSize: 12, color: 'var(--c-ink)', outline: 'none', transition: 'border-color 0.15s',
  },
  numInput: {
    width: '100%', background: 'transparent', border: '1px solid transparent', borderRadius: 4,
    padding: '3px 5px', fontSize: 12, color: 'var(--c-ink)', outline: 'none', textAlign: 'right',
    transition: 'border-color 0.15s', fontVariantNumeric: 'tabular-nums',
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--c-side-2, #14213D)', padding: '8px 12px',
    borderRadius: '6px 6px 0 0', color: '#fff',
  },
  resumenRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 0', borderBottom: '1px solid var(--c-line)', fontSize: 13,
  },
  resumenTotal: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--c-side)', color: '#fff', padding: '10px 14px',
    borderRadius: 6, marginTop: 4,
  },
}

/* ─── Section Table ─── */
function Section({ title, catKey, ficha, onChange, calc, currency, params }) {
  const rows = ficha[catKey] || []
  const total = calc[{ materiales: 'totMat', manoObra: 'totMo', herramientaEquipo: 'totHe', subcontratos: 'totSub' }[catKey]] || 0

  const update = (idx, field, value) => {
    const arr = [...rows]
    arr[idx] = { ...arr[idx], [field]: value }
    onChange(catKey, arr)
  }
  const add = () => onChange(catKey, [...rows, NEW_CONCEPTO()])
  const del = (idx) => onChange(catKey, rows.filter((_, i) => i !== idx))

  return (
    <div style={{ border: '1px solid var(--c-line)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={S.sectionHeader}>
        <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{title}</span>
        <button className="btn xs" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }} onClick={add}>
          <I.Plus size={11} /> Agregar
        </button>
      </div>
      <table style={S.tbl}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: 28 }}>#</th>
            <th style={S.th}>Descripción</th>
            <th style={{ ...S.th, width: 70 }}>Unidad</th>
            <th style={{ ...S.thR, width: 88 }}>Rendimiento</th>
            <th style={{ ...S.thR, width: 72 }}>Desp. %</th>
            <th style={{ ...S.thR, width: 100 }}>Costo Unit.</th>
            <th style={{ ...S.thR, width: 110 }}>Subtotal</th>
            <th style={{ ...S.th, width: 28 }} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} style={{ ...S.td, textAlign: 'center', color: 'var(--c-text-3)', padding: 12 }}>
                Sin conceptos aún
              </td>
            </tr>
          )}
          {rows.map((c, i) => (
            <tr key={c.id} style={{ background: i % 2 === 0 ? 'var(--c-surface)' : 'var(--c-bg)' }}>
              <td style={{ ...S.tdC, color: 'var(--c-text-3)', fontWeight: 500 }}>{i + 1}</td>
              <td style={S.td}>
                <input style={S.cellInput} value={c.descripcion}
                  onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                  onBlur={e => e.target.style.borderColor = 'transparent'}
                  onChange={e => update(i, 'descripcion', e.target.value)} />
              </td>
              <td style={S.td}>
                <input style={{ ...S.cellInput, textAlign: 'center' }} value={c.unidad}
                  onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                  onBlur={e => e.target.style.borderColor = 'transparent'}
                  onChange={e => update(i, 'unidad', e.target.value)} />
              </td>
              <td style={S.td}>
                <input type="number" step="any" style={S.numInput} value={c.rendimiento}
                  onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                  onBlur={e => e.target.style.borderColor = 'transparent'}
                  onChange={e => update(i, 'rendimiento', parseFloat(e.target.value) || 0)} />
              </td>
              <td style={S.td}>
                <input type="number" step="any" style={S.numInput} value={c.desperdicio}
                  onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                  onBlur={e => e.target.style.borderColor = 'transparent'}
                  onChange={e => update(i, 'desperdicio', parseFloat(e.target.value) || 0)} />
              </td>
              <td style={S.td}>
                <input type="number" step="any" style={S.numInput} value={c.costoUnitario}
                  onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                  onBlur={e => e.target.style.borderColor = 'transparent'}
                  onChange={e => update(i, 'costoUnitario', parseFloat(e.target.value) || 0)} />
              </td>
              <td style={{ ...S.tdR, fontWeight: 500 }}>{formatMoney(conceptoCost(c), currency)}</td>
              <td style={S.tdC}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-danger, #EF4444)', padding: '0 2px', fontSize: 16, lineHeight: 1 }}
                  onClick={() => del(i)}>×</button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={6} style={{ ...S.tdSub, textAlign: 'right', paddingRight: 12, color: 'var(--c-text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              SUBTOTAL {title}
            </td>
            <td style={{ ...S.tdSub, color: 'var(--c-ink)' }}>{formatMoney(total, currency)}</td>
            <td style={{ ...S.tdSub }} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/* ─── Main Modal ─── */
export default function FichaCostoModal({ open, onClose, activity, params, currency, budget, onSave }) {
  const [ficha, setFicha] = useState(EMPTY_FICHA())

  // Sync ficha when activity changes
  useEffect(() => {
    if (activity) {
      setFicha(activity.ficha || EMPTY_FICHA())
    }
  }, [activity?.id])

  if (!open || !activity) return null

  const calc = calcFicha(ficha, params.indirectos, params.imprevistos, params.utilidad)

  const handleChange = (catKey, arr) => setFicha(prev => ({ ...prev, [catKey]: arr }))

  const handleSave = () => {
    onSave({ ...activity, ficha, price: calc.precioUnitario })
    onClose()
  }

  // Map flat activity → old format expected by export functions
  const actForExport = {
    codigo:      activity?.code,
    descripcion: activity?.desc,
    cantidad:    activity?.qty,
    unidad:      activity?.unit,
    ficha,
  }

  const handleExportPDF = () => {
    if (budget) exportPDFFicha(budget, actForExport)
  }

  const handleExportExcel = () => {
    if (budget) exportExcelFicha(budget, actForExport)
  }

  const cur = currency || 'USD'

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ background: 'var(--c-accent)', color: '#14213D', fontWeight: 700, fontSize: 10, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                APU
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono)' }}>{activity.code}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 2 }}>{activity.desc}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'flex', gap: 14 }}>
              <span>Cantidad: <b style={{ color: 'rgba(255,255,255,0.8)' }}>{fmt(activity.qty || 0)} {activity.unit}</b></span>
              <span>Precio unitario calculado: <b style={{ color: 'var(--c-accent)' }}>{formatMoney(calc.precioUnitario, cur)}</b></span>
              <span>Subtotal: <b style={{ color: 'var(--c-accent)' }}>{formatMoney(calc.precioUnitario * (activity.qty || 0), cur)}</b></span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: 18, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <I.X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={S.body}>
          <Section title="Materiales"          catKey="materiales"          ficha={ficha} onChange={handleChange} calc={calc} currency={cur} params={params} />
          <Section title="Mano de Obra"         catKey="manoObra"            ficha={ficha} onChange={handleChange} calc={calc} currency={cur} params={params} />
          <Section title="Herramienta + Equipo" catKey="herramientaEquipo"   ficha={ficha} onChange={handleChange} calc={calc} currency={cur} params={params} />
          <Section title="Subcontratos"         catKey="subcontratos"        ficha={ficha} onChange={handleChange} calc={calc} currency={cur} params={params} />

          {/* Resumen */}
          <div style={{ background: 'var(--c-bg)', border: '1px solid var(--c-line)', borderRadius: 8, padding: '14px 16px', marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', marginBottom: 10 }}>
              Resumen de costos
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              {[
                { label: 'Materiales',    val: calc.totMat },
                { label: 'Mano de Obra',  val: calc.totMo  },
                { label: 'Herr. + Equipo',val: calc.totHe  },
                { label: 'Subcontratos',  val: calc.totSub },
              ].map(r => (
                <div key={r.label} style={S.resumenRow}>
                  <span style={{ color: 'var(--c-text-2)' }}>{r.label}</span>
                  <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.val, cur)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--c-line)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'Costo Directo',            val: calc.costoDirecto, bold: true },
                { label: `Indirectos (${params.indirectos}%)`,   val: calc.indirectos },
                { label: `Imprevistos (${params.imprevistos}%)`, val: calc.imprevistos },
                { label: `Utilidad (${params.utilidad}%)`,       val: calc.utilidad },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                  <span style={{ color: 'var(--c-text-2)', fontWeight: r.bold ? 600 : 400 }}>{r.label}</span>
                  <span style={{ fontWeight: r.bold ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.val, cur)}</span>
                </div>
              ))}
            </div>
            <div style={S.resumenTotal}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>PRECIO UNITARIO</span>
              <span style={{ fontWeight: 800, fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--c-accent)' }}>
                {formatMoney(calc.precioUnitario, cur)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={handleExportPDF} title="Exportar ficha en PDF">
              <I.FileText size={13} style={{ color: '#DC2626' }} /> PDF
            </button>
            <button className="btn ghost sm" onClick={handleExportExcel} title="Exportar ficha en Excel">
              <I.FileSpreadsheet size={13} style={{ color: '#10B981' }} /> Excel
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              Al guardar, el precio unitario se actualiza automáticamente.
            </span>
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button className="btn primary" onClick={handleSave}>
              <I.Check size={14} /> Guardar APU
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
