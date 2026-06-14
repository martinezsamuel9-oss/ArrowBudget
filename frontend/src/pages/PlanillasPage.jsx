// ============ PLANILLAS A CONTRATISTAS (Fase III · módulo 3) ============
// Pago periódico a subcontratistas con dos tipos de línea: destajo (obra
// ejecutada × P.U., opcionalmente ligada a una actividad del presupuesto
// para control de gastos) y personal al día / obras varias. Más deducciones,
// retención y amortización de anticipo. Flujo borrador → ... → pagada.
import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { calcItem, makeMoneyFmt, round2, uid } from '../lib/calc'
import { flattenActividades, hoyISO } from '../lib/cronograma'
import { exportPDFPlanilla } from '../lib/exportPlanilla'
import {
  HardHat, Plus, FileText, Check, X, Send, ChevronLeft, Trash2, DollarSign, Users, Coins,
} from 'lucide-react'

const ESTADOS = {
  borrador:  { label: 'Borrador',  bg: '#9ca3af22', fg: '#6b7280' },
  enviada:   { label: 'Enviada',   bg: '#fef3c7',   fg: '#92400e' },
  aprobada:  { label: 'Aprobada',  bg: '#d1fae5',   fg: '#065f46' },
  rechazada: { label: 'Rechazada', bg: '#fee2e2',   fg: '#991b1b' },
  pagada:    { label: 'Pagada',    bg: '#dbeafe',   fg: '#1d4ed8' },
}
const Chip = ({ estado }) => {
  const e = ESTADOS[estado] || ESTADOS.borrador
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: e.bg, color: e.fg, whiteSpace: 'nowrap' }}>{e.label}</span>
}

export default function PlanillasPage({ budget, projectRole, user, params }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)

  const money = makeMoneyFmt(budget?.moneda)
  const canElaborar = puedeHacer(projectRole, 'elaborarPlanilla')
  const canAprobar  = puedeHacer(projectRole, 'aprobarPlanilla')

  const acts = useMemo(() => flattenActividades(budget?.items || []), [budget?.items])
  const puDe = useMemo(() => {
    const m = {}
    const walk = its => { for (const it of (its || [])) {
      if (it.tipo === 'actividad') m[it.id] = calcItem(it, budget?.catalogos, params).precioUnitario
      else if (it.children) walk(it.children)
    } }
    walk(budget?.items || [])
    return m
  }, [budget?.items, budget?.catalogos, params])

  useEffect(() => {
    let cancel = false
    const cargar = async () => {
      if (!budget?.id) { setLista([]); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase.from('planillas').select('*').eq('presupuesto_id', budget.id).order('created_at')
      if (!cancel) { setLista(data || []); setLoading(false) }
    }
    cargar(); setSel(null)
    return () => { cancel = true }
  }, [budget?.id])

  const totalesDe = p => {
    const ls = p.lineas_json || []
    const destajo = round2(ls.filter(l => l.tipo === 'destajo').reduce((s, l) => s + (+l.cantidad || 0) * (+l.pu || 0), 0))
    const dia = round2(ls.filter(l => l.tipo === 'dia').reduce((s, l) => s + (+l.cantidad || 0) * (+l.pu || 0), 0))
    const sub = round2(destajo + dia)
    const ret = round2(sub * (+p.pct_retencion || 0) / 100)
    const amo = round2(sub * (+p.pct_amortizacion || 0) / 100)
    const ded = round2((p.deducciones_json || []).reduce((s, d) => s + (+d.monto || 0), 0))
    return { destajo, dia, sub, ret, amo, ded, neto: round2(sub - ret - amo - ded) }
  }

  const nueva = async () => {
    const contratista = prompt('Nombre del contratista:')
    if (!contratista || !contratista.trim()) return
    const numero = lista.filter(p => (p.contratista || '').trim().toLowerCase() === contratista.trim().toLowerCase())
      .reduce((mx, p) => Math.max(mx, p.numero), 0) + 1
    const { data, error } = await supabase.from('planillas').insert({
      presupuesto_id: budget.id, numero, contratista: contratista.trim(),
      periodo_inicio: hoyISO(), periodo_fin: hoyISO(),
      lineas_json: [], deducciones_json: [], creado_por: user?.id || null,
    }).select().single()
    if (error) {
      alert('Error al crear la planilla: ' + error.message +
        (/planillas/.test(error.message) ? '\n\n(¿Se ejecutó supabase/fase3/fase3_03_planillas.sql?)' : ''))
      return
    }
    setLista(p => [...p, data]); setSel(data)
  }

  const guardar = async (p, extra = {}) => {
    const t = totalesDe(p)
    setBusy(true)
    const { error } = await supabase.from('planillas').update({
      contratista: p.contratista, periodo_inicio: p.periodo_inicio, periodo_fin: p.periodo_fin,
      lineas_json: p.lineas_json, deducciones_json: p.deducciones_json,
      pct_retencion: +p.pct_retencion || 0, pct_amortizacion: +p.pct_amortizacion || 0,
      subtotal: t.sub, retencion: t.ret, amortizacion: t.amo, deducciones: t.ded, neto: t.neto,
      notas: p.notas || null, updated_at: new Date().toISOString(), ...extra,
    }).eq('id', p.id)
    setBusy(false)
    if (error) { alert('Error al guardar: ' + error.message); return false }
    const act = { ...p, ...extra, subtotal: t.sub, neto: t.neto }
    setLista(prev => prev.map(x => x.id === p.id ? act : x))
    return act
  }

  const cambiarEstado = async (p, estado, msj) => {
    if (msj && !confirm(msj)) return
    const extra = { estado }
    if (estado === 'aprobada') extra.aprobado_por = user?.id || null
    const r = await guardar(p, extra); if (r) setSel(r)
  }

  const reabrirComoNueva = async p => {
    const numero = lista.filter(x => (x.contratista || '').trim().toLowerCase() === (p.contratista || '').trim().toLowerCase())
      .reduce((mx, x) => Math.max(mx, x.numero), 0) + 1
    if (!confirm(`La Planilla No. ${p.numero} de ${p.contratista} fue rechazada.\n\n¿Generar la No. ${numero} como versión corregida?`)) return
    const { data, error } = await supabase.from('planillas').insert({
      presupuesto_id: budget.id, numero, contratista: p.contratista,
      periodo_inicio: p.periodo_inicio, periodo_fin: p.periodo_fin,
      lineas_json: p.lineas_json, deducciones_json: p.deducciones_json,
      pct_retencion: p.pct_retencion, pct_amortizacion: p.pct_amortizacion,
      creado_por: user?.id || null,
    }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    setLista(prev => [...prev, data]); setSel(data)
  }

  const eliminar = async p => {
    if (!confirm(`¿Eliminar la Planilla No. ${p.numero} de ${p.contratista}?\n\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('planillas').delete().eq('id', p.id)
    if (error) return alert('Error: ' + error.message)
    setLista(prev => prev.filter(x => x.id !== p.id)); if (sel?.id === p.id) setSel(null)
  }

  const pdf = p => exportPDFPlanilla(budget, p, totalesDe(p),
    { logo: budget.logoOfertante, logoCliente: budget.logoCliente, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText })

  if (!budget) return (
    <div className="page-body"><div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-3)' }}>
      <HardHat size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
      <div style={{ fontSize: 13 }}>Abre un proyecto para gestionar las planillas a contratistas.</div>
    </div></div>
  )
  if (loading) return <div className="page-body" style={{ padding: 60, textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando planillas…</div>

  // ════════ EDITOR ════════
  if (sel) {
    const editable = sel.estado === 'borrador' && canElaborar
    const t = totalesDe(sel)
    const setLineas = lineas_json => setSel({ ...sel, lineas_json })
    const addLinea = tipo => setLineas([...(sel.lineas_json || []), { id: uid(), tipo, actividadId: '', descripcion: '', unidad: '', cantidad: tipo === 'dia' ? 1 : 0, pu: 0 }])
    const updLinea = (id, patch) => setLineas(sel.lineas_json.map(l => l.id === id ? { ...l, ...patch } : l))
    const delLinea = id => setLineas(sel.lineas_json.filter(l => l.id !== id))
    const vincular = (id, actId) => {
      const a = acts.find(x => x.id === actId)
      updLinea(id, a ? { actividadId: actId, descripcion: a.descripcion, unidad: a.unidad, pu: round2(puDe[actId] || 0) } : { actividadId: '' })
    }
    const setDed = deducciones_json => setSel({ ...sel, deducciones_json })

    // Función que retorna JSX (NO componente con <Seccion/>): si fuera componente
    // definido aquí, cada tecla remontaría los inputs y se perdería el foco.
    const renderSeccion = (titulo, tipo, Icon) => {
      const ls = (sel.lineas_json || []).filter(l => l.tipo === tipo)
      return (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title"><Icon size={15} /> {titulo}</div>
            {editable && <button className="btn sm" onClick={() => addLinea(tipo)}><Plus size={13} /> Agregar línea</button>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="bt">
              <thead><tr>
                {tipo === 'destajo' && <th style={{ width: 150 }}>Actividad (presupuesto)</th>}
                <th>Descripción</th>
                <th style={{ width: 80, textAlign: 'center' }}>Unidad</th>
                <th className="num" style={{ width: 100 }}>Cantidad</th>
                <th className="num" style={{ width: 120 }}>P. Unitario</th>
                <th className="num" style={{ width: 120 }}>Importe</th>
                <th style={{ width: 44 }}></th>
              </tr></thead>
              <tbody>
                {ls.length === 0 && <tr><td colSpan={tipo === 'destajo' ? 7 : 6} className="empty" style={{ padding: 18, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin líneas. {editable && 'Usa "Agregar línea".'}</td></tr>}
                {ls.map(l => (
                  <tr key={l.id}>
                    {tipo === 'destajo' && (
                      <td>
                        <select className="input sm" disabled={!editable} value={l.actividadId || ''} onChange={e => vincular(l.id, e.target.value)} style={{ width: 140, fontSize: 11 }}>
                          <option value="">— libre —</option>
                          {acts.map(a => <option key={a.id} value={a.id}>{a.id} · {a.descripcion.slice(0, 30)}</option>)}
                        </select>
                      </td>
                    )}
                    <td><input className="input sm" disabled={!editable} placeholder="Descripción" value={l.descripcion} onChange={e => updLinea(l.id, { descripcion: e.target.value })} style={{ width: '100%' }} /></td>
                    <td><input className="input sm" disabled={!editable} placeholder={tipo === 'dia' ? 'día, hora…' : 'm², ml…'} value={l.unidad} onChange={e => updLinea(l.id, { unidad: e.target.value })} style={{ width: 70, textAlign: 'center' }} /></td>
                    <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={l.cantidad} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { cantidad: e.target.value })} style={{ width: 86, textAlign: 'right' }} /></td>
                    <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={l.pu} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { pu: e.target.value })} style={{ width: 106, textAlign: 'right' }} /></td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(round2((+l.cantidad || 0) * (+l.pu || 0)))}</td>
                    <td>{editable && <button className="btn xs danger icon" onClick={() => delLinea(l.id)}><Trash2 size={11} /></button>}</td>
                  </tr>
                ))}
              </tbody>
              {ls.length > 0 && (
                <tfoot><tr>
                  <td colSpan={tipo === 'destajo' ? 5 : 4} style={{ textAlign: 'right', fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>SUBTOTAL {titulo.toUpperCase()}</td>
                  <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(tipo === 'destajo' ? t.destajo : t.dia)}</td>
                  <td style={{ background: 'var(--c-ink)' }}></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )
    }

    return (
      <Fragment>
        <div className="page-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn sm ghost" onClick={() => setSel(null)}><ChevronLeft size={14} /> Planillas</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 10 }}>
                Planilla No. {sel.numero} <Chip estado={sel.estado} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{sel.contratista} · {budget.nombreProyecto}</div>
            </div>
          </div>
          <div className="page-head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editable && <button className="btn primary" disabled={busy} onClick={async () => { if (await guardar(sel)) alert('💾 Planilla guardada.') }}><Check size={13} /> {busy ? 'Guardando…' : 'Guardar'}</button>}
            {editable && <button className="btn brand" disabled={busy} onClick={() => cambiarEstado(sel, 'enviada', '¿Enviar la planilla para aprobación?')}><Send size={13} /> Enviar</button>}
            {sel.estado === 'enviada' && canAprobar && (
              <Fragment>
                <button className="btn" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff' }} disabled={busy} onClick={() => cambiarEstado(sel, 'aprobada')}><Check size={13} /> Aprobar</button>
                <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} disabled={busy} onClick={() => cambiarEstado(sel, 'rechazada')}><X size={13} /> Rechazar</button>
              </Fragment>
            )}
            {sel.estado === 'rechazada' && canElaborar && <button className="btn brand" disabled={busy} onClick={() => reabrirComoNueva(sel)}>Generar siguiente planilla corregida</button>}
            {sel.estado === 'aprobada' && canElaborar && <button className="btn" style={{ background: 'var(--c-primary)', borderColor: 'var(--c-primary)', color: '#fff' }} disabled={busy} onClick={() => cambiarEstado(sel, 'pagada', '¿Marcar como pagada?')}><DollarSign size={13} /> Marcar pagada</button>}
            <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} onClick={() => pdf(sel)}><FileText size={13} /> PDF</button>
          </div>
        </div>

        <div className="page-body">
          <div className="kpi-row" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <div className="kpi-label">Contratista</div>
              <input className="input" disabled={!editable} value={sel.contratista || ''} onChange={e => setSel({ ...sel, contratista: e.target.value })} style={{ marginTop: 4, fontWeight: 700 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">Periodo del</div>
              <input type="date" className="input" disabled={!editable} value={sel.periodo_inicio || ''} onChange={e => setSel({ ...sel, periodo_inicio: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">al</div>
              <input type="date" className="input" disabled={!editable} value={sel.periodo_fin || ''} onChange={e => setSel({ ...sel, periodo_fin: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi highlight">
              <div className="kpi-label"><DollarSign size={12} className="ico" /> Neto a pagar</div>
              <div className="kpi-val" style={{ fontSize: 18 }}>{money(t.neto)}</div>
            </div>
          </div>

          {renderSeccion('Obra por destajo', 'destajo', HardHat)}
          {renderSeccion('Personal al día / Obras varias', 'dia', Users)}

          {/* Deducciones */}
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title"><X size={15} /> Deducciones varias</div>
              {editable && <button className="btn sm" onClick={() => setDed([...(sel.deducciones_json || []), { id: uid(), descripcion: '', monto: 0 }])}><Plus size={13} /> Agregar deducción</button>}
            </div>
            <div style={{ padding: (sel.deducciones_json || []).length ? '8px 16px' : 0 }}>
              {(sel.deducciones_json || []).map(d => (
                <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <input className="input sm" disabled={!editable} placeholder="Concepto (herramienta extraviada, adelanto…)" value={d.descripcion} onChange={e => setDed(sel.deducciones_json.map(x => x.id === d.id ? { ...x, descripcion: e.target.value } : x))} style={{ flex: 1 }} />
                  <input type="number" min="0" step="any" className="input sm" disabled={!editable} placeholder="Monto" value={d.monto} onFocus={e => e.target.select()} onChange={e => setDed(sel.deducciones_json.map(x => x.id === d.id ? { ...x, monto: e.target.value } : x))} style={{ width: 130, textAlign: 'right' }} />
                  {editable && <button className="btn xs danger icon" onClick={() => setDed(sel.deducciones_json.filter(x => x.id !== d.id))}><Trash2 size={11} /></button>}
                </div>
              ))}
              {(sel.deducciones_json || []).length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin deducciones.</div>}
            </div>
          </div>

          {/* Resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card card-pad">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label className="field-label">Retención %</label>
                  <input type="number" min="0" max="100" step="any" className="input" disabled={!editable} value={sel.pct_retencion ?? 0} onFocus={e => e.target.select()} onChange={e => setSel({ ...sel, pct_retencion: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Amortización anticipo %</label>
                  <input type="number" min="0" max="100" step="any" className="input" disabled={!editable} value={sel.pct_amortizacion ?? 0} onFocus={e => e.target.select()} onChange={e => setSel({ ...sel, pct_amortizacion: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header"><div className="card-title"><Coins size={15} /> Resumen de pago</div></div>
              {[
                ['Obra por destajo', money(t.destajo), false],
                ['Personal al día', money(t.dia), false],
                ['Subtotal', money(t.sub), false],
                [`Retención (${sel.pct_retencion || 0}%)`, `− ${money(t.ret)}`, false],
                [`Amortización anticipo (${sel.pct_amortizacion || 0}%)`, `− ${money(t.amo)}`, false],
                ['Otras deducciones', `− ${money(t.ded)}`, false],
                ['NETO A PAGAR', money(t.neto), true],
              ].map(([l, v, b]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--c-line-2)', background: b ? 'var(--c-ink)' : 'transparent' }}>
                  <span style={{ fontSize: 13, fontWeight: b ? 800 : 500, color: b ? '#fff' : 'var(--c-text-2)' }}>{l}</span>
                  <span style={{ fontSize: b ? 16 : 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: b ? 'var(--c-accent)' : 'var(--c-text)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Fragment>
    )
  }

  // ════════ LISTA ════════
  const totalPagado = round2(lista.filter(p => ['aprobada', 'pagada'].includes(p.estado)).reduce((s, p) => s + totalesDe(p).neto, 0))
  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Planillas a contratistas — {budget.nombreProyecto}</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{lista.length} planilla{lista.length !== 1 ? 's' : ''}</div>
        </div>
        {canElaborar && <button className="btn brand" onClick={nueva}><Plus size={14} strokeWidth={2.5} /> Nueva planilla</button>}
      </div>

      <div className="page-body">
        <div className="kpi-row" style={{ marginBottom: 16 }}>
          <div className="kpi highlight">
            <div className="kpi-label"><DollarSign size={12} className="ico" /> Pagado a contratistas</div>
            <div className="kpi-val" style={{ fontSize: 18 }}>{money(totalPagado)}</div>
            <div className="kpi-foot">aprobadas + pagadas</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><Users size={12} className="ico" /> Contratistas</div>
            <div className="kpi-val" style={{ fontSize: 18 }}>{new Set(lista.map(p => (p.contratista || '').trim()).filter(Boolean)).size}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {lista.length === 0
            ? <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <HardHat size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-2)' }}>Aún no hay planillas</div>
                <div style={{ fontSize: 13 }}>Registra los pagos por destajo y personal al día de tus subcontratistas.</div>
              </div>
            : (
              <table className="bt">
                <thead><tr>
                  <th style={{ width: 60 }}>No.</th>
                  <th>Contratista</th>
                  <th style={{ width: 190 }}>Periodo</th>
                  <th style={{ width: 110 }}>Estado</th>
                  <th className="num">Neto a pagar</th>
                  <th style={{ width: 180 }}></th>
                </tr></thead>
                <tbody>
                  {lista.map(p => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSel(p)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{p.numero}</td>
                      <td style={{ fontWeight: 600 }}>{p.contratista || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{p.periodo_inicio || '—'} → {p.periodo_fin || '—'}</td>
                      <td><Chip estado={p.estado} /></td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(totalesDe(p).neto)}</td>
                      <td className="actions" onClick={ev => ev.stopPropagation()}>
                        <button className="btn xs" onClick={() => setSel(p)}>Abrir</button>
                        <button className="btn xs ghost" style={{ marginLeft: 4 }} onClick={() => pdf(p)}><FileText size={11} /> PDF</button>
                        {p.estado === 'borrador' && canElaborar && <button className="btn xs danger icon" style={{ marginLeft: 4 }} onClick={() => eliminar(p)}><Trash2 size={11} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </Fragment>
  )
}
