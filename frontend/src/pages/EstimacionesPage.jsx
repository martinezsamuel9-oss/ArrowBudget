// ============ ESTIMACIONES PAGE (Fase III · módulo 1) ============
// Estimaciones de cobro por avance: líneas por actividad pre-llenadas desde
// los cortes de avance físico, retención y amortización de anticipo,
// correlativo por proyecto y flujo borrador → enviada → aprobada → pagada.
import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { calcItem, makeMoneyFmt, fmt, round2 } from '../lib/calc'
import { flattenActividades, pctReal, hoyISO } from '../lib/cronograma'
import { exportPDFEstimacion } from '../lib/exportEstimacion'
import {
  Receipt, Plus, FileText, Check, X, Send, ChevronLeft, Trash2, Coins, AlertTriangle, DollarSign,
} from 'lucide-react'

const ESTADOS_EST = {
  borrador:  { label: 'Borrador',  bg: '#9ca3af22', fg: '#6b7280' },
  enviada:   { label: 'Enviada',   bg: '#fef3c7',   fg: '#92400e' },
  aprobada:  { label: 'Aprobada',  bg: '#d1fae5',   fg: '#065f46' },
  rechazada: { label: 'Rechazada', bg: '#fee2e2',   fg: '#991b1b' },
  pagada:    { label: 'Pagada',    bg: '#dbeafe',   fg: '#1d4ed8' },
}

const ChipEstado = ({ estado }) => {
  const e = ESTADOS_EST[estado] || ESTADOS_EST.borrador
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: e.bg, color: e.fg, whiteSpace: 'nowrap' }}>{e.label}</span>
}

export default function EstimacionesPage({ budget, projectRole, user, params }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)        // estimación abierta en el editor
  const [busy, setBusy] = useState(false)

  const money = makeMoneyFmt(budget?.moneda)
  const canElaborar = puedeHacer(projectRole, 'elaborarEstimacion')
  const canAprobar  = puedeHacer(projectRole, 'aprobarEstimacion')

  const acts = useMemo(() => flattenActividades(budget?.items || []), [budget?.items])

  // PU contractual por actividad (precio de venta del presupuesto)
  const pus = useMemo(() => {
    const m = {}
    const walk = its => { for (const it of (its || [])) {
      if (it.tipo === 'actividad') m[it.id] = calcItem(it, budget?.catalogos, params).precioUnitario
      else if (it.children) walk(it.children)
    } }
    walk(budget?.items || [])
    return m
  }, [budget?.items, budget?.catalogos, params])

  const totalContrato = useMemo(
    () => round2(acts.reduce((s, a) => s + (pus[a.id] || 0) * (+a.cantidad || 0), 0)),
    [acts, pus],
  )

  // ── Carga ──
  useEffect(() => {
    let cancel = false
    const cargar = async () => {
      if (!budget?.id) { setLista([]); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase.from('estimaciones').select('*').eq('presupuesto_id', budget.id).order('numero')
      if (!cancel) { setLista(data || []); setLoading(false) }
    }
    cargar()
    setSel(null)
    return () => { cancel = true }
  }, [budget?.id])

  // ── Cálculos ──
  const totalesDe = e => {
    const sub = round2((e.lineas_json || []).reduce((s, l) => s + (+l.cantidad || 0) * (+l.pu || 0), 0))
    const ret = round2(sub * (+e.pct_retencion || 0) / 100)
    const amo = round2(sub * (+e.pct_amortizacion || 0) / 100)
    return { sub, ret, amo, neto: round2(sub - ret - amo) }
  }

  // Cantidades acumuladas por actividad en estimaciones ANTERIORES a `numero` (no rechazadas)
  const acumPrevio = numero => {
    const m = {}
    for (const e of lista) {
      if (e.numero >= numero || e.estado === 'rechazada') continue
      for (const l of (e.lineas_json || [])) m[l.actividadId] = round2((m[l.actividadId] || 0) + (+l.cantidad || 0))
    }
    return m
  }

  const acumDe = e => {
    const t = totalesDe(e)
    const prev = acumPrevio(e.numero)
    let acumAnterior = 0
    for (const ant of lista) {
      if (ant.numero >= e.numero || ant.estado === 'rechazada') continue
      acumAnterior += totalesDe(ant).sub
    }
    acumAnterior = round2(acumAnterior)
    const acumActual = round2(acumAnterior + t.sub)
    return {
      ...t, prev,
      contrato: totalContrato,
      acumAnterior, acumActual,
      saldo: round2(totalContrato - acumActual),
      pctContrato: totalContrato > 0 ? Math.round((acumActual / totalContrato) * 100) : 0,
    }
  }

  // ── Acciones ──
  const nueva = async () => {
    if (!acts.length) return alert('El presupuesto no tiene actividades aún.')
    const numero = lista.reduce((mx, e) => Math.max(mx, e.numero), 0) + 1
    // Pre-llenado desde los cortes de avance físico del cronograma (Fase II)
    let avances = {}
    const { data: cr } = await supabase.from('cronogramas').select('datos_json').eq('presupuesto_id', budget.id).maybeSingle()
    if (cr?.datos_json?.actividades) avances = cr.datos_json.actividades
    const prev = acumPrevio(numero)
    const lineas = acts.map(a => {
      const ejecutadaAcum = round2((pctReal(avances[a.id]?.avances) / 100) * (+a.cantidad || 0))
      const pendiente = Math.max(0, round2(ejecutadaAcum - (prev[a.id] || 0)))
      return {
        actividadId: a.id, descripcion: a.descripcion, unidad: a.unidad,
        capId: a.capId, capDesc: a.capDesc,
        cantContrato: +a.cantidad || 0, pu: round2(pus[a.id] || 0), cantidad: pendiente,
      }
    })
    const { data, error } = await supabase.from('estimaciones').insert({
      presupuesto_id: budget.id, numero,
      periodo_inicio: hoyISO(), periodo_fin: hoyISO(),
      lineas_json: lineas, creado_por: user?.id || null,
    }).select().single()
    if (error) {
      alert('Error al crear la estimación: ' + error.message +
        (/estimaciones/.test(error.message) ? '\n\n(¿Se ejecutó supabase/fase3/fase3_01_estimaciones.sql?)' : ''))
      return
    }
    setLista(p => [...p, data])
    setSel(data)
  }

  const guardar = async (e, extra = {}) => {
    const t = totalesDe(e)
    setBusy(true)
    const { error } = await supabase.from('estimaciones').update({
      periodo_inicio: e.periodo_inicio, periodo_fin: e.periodo_fin,
      lineas_json: e.lineas_json,
      pct_retencion: +e.pct_retencion || 0, pct_amortizacion: +e.pct_amortizacion || 0,
      notas: e.notas || null,
      subtotal: t.sub, retencion: t.ret, amortizacion: t.amo, neto: t.neto,
      updated_at: new Date().toISOString(),
      ...extra,
    }).eq('id', e.id)
    setBusy(false)
    if (error) { alert('Error al guardar: ' + error.message); return false }
    const actualizada = { ...e, ...extra }
    setLista(p => p.map(x => x.id === e.id ? { ...actualizada, subtotal: t.sub, neto: t.neto } : x))
    return actualizada
  }

  const cambiarEstado = async (e, estado, msj) => {
    if (msj && !confirm(msj)) return
    const extra = { estado }
    if (estado === 'aprobada') extra.aprobado_por = user?.id || null
    const r = await guardar(e, extra)
    if (r) setSel(r)
  }

  const eliminar = async e => {
    if (!confirm(`¿Eliminar la Estimación No. ${e.numero}? Solo se recomienda en borradores.\n\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('estimaciones').delete().eq('id', e.id)
    if (error) return alert('Error: ' + error.message)
    setLista(p => p.filter(x => x.id !== e.id))
    if (sel?.id === e.id) setSel(null)
  }

  const pdf = e => exportPDFEstimacion(budget, e, acumDe(e),
    { logo: budget.logoOfertante, logoCliente: budget.logoCliente, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText })

  // ── Estados vacíos ──
  if (!budget) return (
    <div className="page-body">
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-3)' }}>
        <Receipt size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
        <div style={{ fontSize: 13 }}>Abre un proyecto para gestionar sus estimaciones de cobro.</div>
      </div>
    </div>
  )
  if (loading) return <div className="page-body" style={{ padding: 60, textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando estimaciones…</div>

  // ════════ EDITOR ════════
  if (sel) {
    const editable = sel.estado === 'borrador' && canElaborar
    const A = acumDe(sel)
    const updLinea = (actividadId, cantidad) => {
      const lineas_json = sel.lineas_json.map(l => l.actividadId === actividadId
        ? { ...l, cantidad: Math.max(0, +cantidad || 0) } : l)
      setSel({ ...sel, lineas_json })
    }
    return (
      <Fragment>
        <div className="page-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn sm ghost" onClick={() => setSel(null)}><ChevronLeft size={14} /> Estimaciones</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 10 }}>
                Estimación No. {sel.numero} <ChipEstado estado={sel.estado} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{budget.nombreProyecto}</div>
            </div>
          </div>
          <div className="page-head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editable && <button className="btn primary" disabled={busy} onClick={async () => { if (await guardar(sel)) alert('💾 Estimación guardada.') }}><Check size={13} /> {busy ? 'Guardando…' : 'Guardar'}</button>}
            {editable && <button className="btn brand" disabled={busy} onClick={() => cambiarEstado(sel, 'enviada', '¿Enviar la estimación para aprobación? Ya no podrás editar las cantidades.')}><Send size={13} /> Enviar</button>}
            {sel.estado === 'enviada' && canAprobar && (
              <Fragment>
                <button className="btn" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff' }} disabled={busy}
                  onClick={() => cambiarEstado(sel, 'aprobada')}><Check size={13} /> Aprobar</button>
                <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} disabled={busy}
                  onClick={() => cambiarEstado(sel, 'rechazada', '¿Rechazar esta estimación? Volverá al equipo para corrección.')}><X size={13} /> Rechazar</button>
              </Fragment>
            )}
            {sel.estado === 'rechazada' && canElaborar && (
              <button className="btn" disabled={busy} onClick={() => cambiarEstado(sel, 'borrador')}>Reabrir como borrador</button>
            )}
            {sel.estado === 'aprobada' && canElaborar && (
              <button className="btn" style={{ background: 'var(--c-primary)', borderColor: 'var(--c-primary)', color: '#fff' }} disabled={busy}
                onClick={() => cambiarEstado(sel, 'pagada', '¿Marcar como pagada?')}><DollarSign size={13} /> Marcar pagada</button>
            )}
            <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} onClick={() => pdf(sel)}><FileText size={13} /> PDF</button>
          </div>
        </div>

        <div className="page-body">
          {/* Periodo + retención/amortización */}
          <div className="kpi-row" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <div className="kpi-label">Periodo del</div>
              <input type="date" className="input" disabled={!editable} value={sel.periodo_inicio || ''} onChange={e => setSel({ ...sel, periodo_inicio: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">al</div>
              <input type="date" className="input" disabled={!editable} value={sel.periodo_fin || ''} onChange={e => setSel({ ...sel, periodo_fin: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">Retención %</div>
              <input type="number" min="0" max="100" step="any" className="input" disabled={!editable}
                value={sel.pct_retencion ?? 0} onFocus={e => e.target.select()}
                onChange={e => setSel({ ...sel, pct_retencion: e.target.value })} style={{ marginTop: 4, fontWeight: 700 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">Amortización anticipo %</div>
              <input type="number" min="0" max="100" step="any" className="input" disabled={!editable}
                value={sel.pct_amortizacion ?? 0} onFocus={e => e.target.select()}
                onChange={e => setSel({ ...sel, pct_amortizacion: e.target.value })} style={{ marginTop: 4, fontWeight: 700 }} />
            </div>
          </div>

          {/* Líneas */}
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title"><Receipt size={15} /> Cantidades del periodo</div>
              <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                {editable ? 'Pre-llenado desde el avance físico — ajusta las cantidades reales a cobrar' : 'Solo lectura (la estimación ya fue enviada)'}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="bt">
                <thead><tr>
                  <th style={{ width: 64 }}>ID</th>
                  <th>Actividad</th>
                  <th style={{ width: 56, textAlign: 'center' }}>Und</th>
                  <th className="num" style={{ width: 92 }}>Cant. contrato</th>
                  <th className="num" style={{ width: 100 }}>P. Unitario</th>
                  <th className="num" style={{ width: 92 }}>Acum. anterior</th>
                  <th className="num" style={{ width: 104 }}>Esta estimación</th>
                  <th className="num" style={{ width: 110 }}>Importe</th>
                </tr></thead>
                <tbody>
                  {(() => {
                    const rows = []
                    let lastCap = null
                    for (const l of sel.lineas_json || []) {
                      if (l.capId !== lastCap) {
                        lastCap = l.capId
                        rows.push(
                          <tr key={`cap-${l.capId}`}>
                            <td colSpan={8} style={{ background: 'var(--c-ink)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 12, padding: '7px 14px' }}>
                              {l.capId} · {l.capDesc}
                            </td>
                          </tr>
                        )
                      }
                      const prev = A.prev[l.actividadId] || 0
                      const importe = round2((+l.cantidad || 0) * (+l.pu || 0))
                      const excede = round2(prev + (+l.cantidad || 0)) > (+l.cantContrato || 0) + 0.001
                      rows.push(
                        <tr key={l.actividadId}>
                          <td className="id">{l.actividadId}</td>
                          <td style={{ fontWeight: 500 }}>{l.descripcion}</td>
                          <td style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{l.unidad || '—'}</td>
                          <td className="num" style={{ color: 'var(--c-text-3)' }}>{fmt(l.cantContrato)}</td>
                          <td className="num">{money(l.pu)}</td>
                          <td className="num" style={{ color: 'var(--c-text-3)' }}>{fmt(prev)}</td>
                          <td className="num">
                            <input type="number" min="0" step="any" className="input sm" disabled={!editable}
                              value={l.cantidad} onFocus={e => e.target.select()}
                              onChange={e => updLinea(l.actividadId, e.target.value)}
                              style={{ width: 88, textAlign: 'right', fontWeight: 700, borderColor: excede ? 'var(--c-danger)' : undefined }} />
                            {excede && <span title={`Acumulado supera la cantidad de contrato (${fmt(l.cantContrato)})`} style={{ color: 'var(--c-danger)', marginLeft: 4 }}>⚠</span>}
                          </td>
                          <td className="num" style={{ fontWeight: 700 }}>{money(importe)}</td>
                        </tr>
                      )
                    }
                    return rows
                  })()}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'right', fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>SUBTOTAL EJECUTADO</td>
                    <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(A.sub)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Resumen + acumulados */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header"><div className="card-title"><Coins size={15} /> Resumen de la estimación</div></div>
              {[
                ['Subtotal ejecutado', money(A.sub), false],
                [`Retención (${fmt(sel.pct_retencion || 0)}%)`, `− ${money(A.ret)}`, false],
                [`Amortización anticipo (${fmt(sel.pct_amortizacion || 0)}%)`, `− ${money(A.amo)}`, false],
                ['NETO A COBRAR', money(A.neto), true],
              ].map(([l, v, b]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderTop: '1px solid var(--c-line-2)', background: b ? 'var(--c-ink)' : 'transparent' }}>
                  <span style={{ fontSize: 13, fontWeight: b ? 800 : 500, color: b ? '#fff' : 'var(--c-text-2)' }}>{l}</span>
                  <span style={{ fontSize: b ? 16 : 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: b ? 'var(--c-accent)' : 'var(--c-text)' }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header"><div className="card-title"><AlertTriangle size={15} /> Acumulados del contrato</div></div>
              {[
                ['Monto del contrato', money(A.contrato)],
                ['Acumulado anterior', money(A.acumAnterior)],
                ['Esta estimación', money(A.sub)],
                ['Acumulado actual', money(A.acumActual)],
                ['Avance financiero', `${A.pctContrato}%`],
                ['Saldo por estimar', money(A.saldo)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 16px', borderTop: '1px solid var(--c-line-2)' }}>
                  <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>{l}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label className="field-label">Notas</label>
            <textarea className="input textarea" rows={2} disabled={!editable} value={sel.notas || ''}
              onChange={e => setSel({ ...sel, notas: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
        </div>
      </Fragment>
    )
  }

  // ════════ LISTA ════════
  const aprobadas = lista.filter(e => ['aprobada', 'pagada'].includes(e.estado))
  const acumEstimado = round2(lista.filter(e => e.estado !== 'rechazada').reduce((s, e) => s + (+e.subtotal || totalesDe(e).sub), 0))
  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Estimaciones — {budget.nombreProyecto}</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{lista.length} estimación{lista.length !== 1 ? 'es' : ''}</div>
        </div>
        {canElaborar && (
          <button className="btn brand" onClick={nueva}><Plus size={14} strokeWidth={2.5} /> Nueva estimación</button>
        )}
      </div>

      <div className="page-body">
        <div className="kpi-row" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-label"><DollarSign size={12} className="ico" /> Monto del contrato</div>
            <div className="kpi-val" style={{ fontSize: 17 }}>{money(totalContrato)}</div>
          </div>
          <div className="kpi highlight">
            <div className="kpi-label"><Receipt size={12} className="ico" /> Acumulado estimado</div>
            <div className="kpi-val" style={{ fontSize: 17 }}>{money(acumEstimado)}</div>
            <div className="kpi-foot">{totalContrato > 0 ? Math.round(acumEstimado / totalContrato * 100) : 0}% del contrato · {aprobadas.length} aprobada{aprobadas.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><Coins size={12} className="ico" /> Saldo por estimar</div>
            <div className="kpi-val" style={{ fontSize: 17 }}>{money(round2(totalContrato - acumEstimado))}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {lista.length === 0
            ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <Receipt size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-2)' }}>Aún no hay estimaciones</div>
                <div style={{ fontSize: 13 }}>La primera se pre-llena con el avance físico registrado en el cronograma.</div>
              </div>
            )
            : (
              <table className="bt">
                <thead><tr>
                  <th style={{ width: 60 }}>No.</th>
                  <th style={{ width: 200 }}>Periodo</th>
                  <th style={{ width: 110 }}>Estado</th>
                  <th className="num">Subtotal</th>
                  <th className="num">Neto a cobrar</th>
                  <th style={{ width: 200 }}></th>
                </tr></thead>
                <tbody>
                  {lista.map(e => {
                    const t = totalesDe(e)
                    return (
                      <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setSel(e)}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{e.numero}</td>
                        <td style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{e.periodo_inicio || '—'} → {e.periodo_fin || '—'}</td>
                        <td><ChipEstado estado={e.estado} /></td>
                        <td className="num">{money(t.sub)}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(t.neto)}</td>
                        <td className="actions" onClick={ev => ev.stopPropagation()}>
                          <button className="btn xs" onClick={() => setSel(e)}>Abrir</button>
                          <button className="btn xs ghost" style={{ marginLeft: 4 }} onClick={() => pdf(e)}><FileText size={11} /> PDF</button>
                          {e.estado === 'borrador' && canElaborar && (
                            <button className="btn xs danger icon" style={{ marginLeft: 4 }} onClick={() => eliminar(e)}><Trash2 size={11} /></button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </Fragment>
  )
}
