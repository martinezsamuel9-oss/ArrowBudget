// ============ ÓRDENES DE CAMBIO PAGE (Fase III · módulo 2) ============
// Modificaciones al contrato (aditivas/deductivas) con líneas libres,
// correlativo, flujo de aprobación y efecto sobre el monto del contrato.
import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { calcItem, makeMoneyFmt, fmt, round2, uid } from '../lib/calc'
import { exportPDFOrdenCambio } from '../lib/exportOrdenCambio'
import {
  ClipboardList, Plus, FileText, Check, X, Send, ChevronLeft, Trash2, DollarSign, TrendingUp,
} from 'lucide-react'

const ESTADOS_OC = {
  borrador:  { label: 'Borrador',  bg: '#9ca3af22', fg: '#6b7280' },
  enviada:   { label: 'Enviada',   bg: '#fef3c7',   fg: '#92400e' },
  aprobada:  { label: 'Aprobada',  bg: '#d1fae5',   fg: '#065f46' },
  rechazada: { label: 'Rechazada', bg: '#fee2e2',   fg: '#991b1b' },
}

const ChipOC = ({ estado }) => {
  const e = ESTADOS_OC[estado] || ESTADOS_OC.borrador
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: e.bg, color: e.fg, whiteSpace: 'nowrap' }}>{e.label}</span>
}

export default function OrdenesCambioPage({ budget, projectRole, user, params }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)

  const money = makeMoneyFmt(budget?.moneda)
  const canElaborar = puedeHacer(projectRole, 'elaborarOrdenCambio')
  const canAprobar  = puedeHacer(projectRole, 'aprobarOrdenCambio')

  const contratoOriginal = useMemo(() => {
    if (!budget) return 0
    return round2(budget.items.reduce((s, it) => s + calcItem(it, budget.catalogos, params).subtotal, 0))
  }, [budget, params])

  useEffect(() => {
    let cancel = false
    const cargar = async () => {
      if (!budget?.id) { setLista([]); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase.from('ordenes_cambio').select('*').eq('presupuesto_id', budget.id).order('numero')
      if (!cancel) { setLista(data || []); setLoading(false) }
    }
    cargar()
    setSel(null)
    return () => { cancel = true }
  }, [budget?.id])

  const montoDe = oc => round2((oc.lineas_json || []).reduce((s, l) => s + (+l.cantidad || 0) * (+l.pu || 0), 0))
  const efectoDe = oc => (oc.tipo === 'deductiva' ? -1 : 1) * montoDe(oc)

  // Contrato vigente ANTES de una OC dada (original ± OC aprobadas anteriores)
  const contratoAntesDe = numero => round2(
    contratoOriginal + lista.filter(o => o.estado === 'aprobada' && o.numero < numero).reduce((s, o) => s + efectoDe(o), 0)
  )
  const ocAprobadas = round2(lista.filter(o => o.estado === 'aprobada').reduce((s, o) => s + efectoDe(o), 0))
  const contratoActualizado = round2(contratoOriginal + ocAprobadas)

  const nueva = async () => {
    const numero = lista.reduce((mx, o) => Math.max(mx, o.numero), 0) + 1
    const { data, error } = await supabase.from('ordenes_cambio').insert({
      presupuesto_id: budget.id, numero,
      lineas_json: [{ id: uid(), descripcion: '', unidad: '', cantidad: 1, pu: 0 }],
      creado_por: user?.id || null,
    }).select().single()
    if (error) {
      alert('Error al crear la orden de cambio: ' + error.message +
        (/ordenes_cambio/.test(error.message) ? '\n\n(¿Se ejecutó supabase/fase3/fase3_02_ordenes_cambio.sql?)' : ''))
      return
    }
    setLista(p => [...p, data])
    setSel(data)
  }

  const guardar = async (oc, extra = {}) => {
    setBusy(true)
    const { error } = await supabase.from('ordenes_cambio').update({
      fecha: oc.fecha, concepto: oc.concepto || null, tipo: oc.tipo,
      lineas_json: oc.lineas_json, monto: montoDe(oc), notas: oc.notas || null,
      updated_at: new Date().toISOString(),
      ...extra,
    }).eq('id', oc.id)
    setBusy(false)
    if (error) { alert('Error al guardar: ' + error.message); return false }
    const actualizada = { ...oc, ...extra, monto: montoDe(oc) }
    setLista(p => p.map(x => x.id === oc.id ? actualizada : x))
    return actualizada
  }

  const cambiarEstado = async (oc, estado, msj) => {
    if (msj && !confirm(msj)) return
    const extra = { estado }
    if (estado === 'aprobada') extra.aprobado_por = user?.id || null
    const r = await guardar(oc, extra)
    if (r) setSel(r)
  }

  const eliminar = async oc => {
    if (!confirm(`¿Eliminar la Orden de Cambio No. ${oc.numero}?\n\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('ordenes_cambio').delete().eq('id', oc.id)
    if (error) return alert('Error: ' + error.message)
    setLista(p => p.filter(x => x.id !== oc.id))
    if (sel?.id === oc.id) setSel(null)
  }

  const pdf = oc => exportPDFOrdenCambio(budget, oc,
    { monto: montoDe(oc), contratoVigente: contratoAntesDe(oc.numero), contratoNuevo: round2(contratoAntesDe(oc.numero) + efectoDe(oc)) },
    { logo: budget.logoOfertante, logoCliente: budget.logoCliente, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText })

  if (!budget) return (
    <div className="page-body">
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-3)' }}>
        <ClipboardList size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
        <div style={{ fontSize: 13 }}>Abre un proyecto para gestionar sus órdenes de cambio.</div>
      </div>
    </div>
  )
  if (loading) return <div className="page-body" style={{ padding: 60, textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando órdenes de cambio…</div>

  // ════════ EDITOR ════════
  if (sel) {
    const editable = sel.estado === 'borrador' && canElaborar
    const monto = montoDe(sel)
    const vigente = contratoAntesDe(sel.numero)
    const signo = sel.tipo === 'deductiva' ? -1 : 1
    const updLinea = (id, patch) => setSel({ ...sel, lineas_json: sel.lineas_json.map(l => l.id === id ? { ...l, ...patch } : l) })
    const addLinea = () => setSel({ ...sel, lineas_json: [...sel.lineas_json, { id: uid(), descripcion: '', unidad: '', cantidad: 1, pu: 0 }] })
    const delLinea = id => setSel({ ...sel, lineas_json: sel.lineas_json.filter(l => l.id !== id) })
    return (
      <Fragment>
        <div className="page-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn sm ghost" onClick={() => setSel(null)}><ChevronLeft size={14} /> Órdenes de cambio</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 10 }}>
                Orden de Cambio No. {sel.numero} <ChipOC estado={sel.estado} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{budget.nombreProyecto}</div>
            </div>
          </div>
          <div className="page-head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editable && <button className="btn primary" disabled={busy} onClick={async () => { if (await guardar(sel)) alert('💾 Orden de cambio guardada.') }}><Check size={13} /> {busy ? 'Guardando…' : 'Guardar'}</button>}
            {editable && <button className="btn brand" disabled={busy} onClick={() => cambiarEstado(sel, 'enviada', '¿Enviar la orden de cambio para aprobación del cliente?')}><Send size={13} /> Enviar</button>}
            {sel.estado === 'enviada' && canAprobar && (
              <Fragment>
                <button className="btn" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff' }} disabled={busy}
                  onClick={() => cambiarEstado(sel, 'aprobada', '¿Aprobar esta orden de cambio? El monto del contrato se actualizará.')}><Check size={13} /> Aprobar</button>
                <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} disabled={busy}
                  onClick={() => cambiarEstado(sel, 'rechazada')}><X size={13} /> Rechazar</button>
              </Fragment>
            )}
            {sel.estado === 'rechazada' && canElaborar && (
              <button className="btn" disabled={busy} onClick={() => cambiarEstado(sel, 'borrador')}>Reabrir como borrador</button>
            )}
            <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} onClick={() => pdf(sel)}><FileText size={13} /> PDF</button>
          </div>
        </div>

        <div className="page-body">
          <div className="kpi-row" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <div className="kpi-label">Fecha</div>
              <input type="date" className="input" disabled={!editable} value={sel.fecha || ''} onChange={e => setSel({ ...sel, fecha: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">Tipo</div>
              <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg)', padding: 3, borderRadius: 8, marginTop: 4 }}>
                <button className={`btn xs ${sel.tipo === 'aditiva' ? 'primary' : 'ghost'}`} disabled={!editable} onClick={() => setSel({ ...sel, tipo: 'aditiva' })} style={{ flex: 1 }}>Aditiva (+)</button>
                <button className={`btn xs ${sel.tipo === 'deductiva' ? 'primary' : 'ghost'}`} disabled={!editable} onClick={() => setSel({ ...sel, tipo: 'deductiva' })} style={{ flex: 1 }}>Deductiva (−)</button>
              </div>
            </div>
            <div className="kpi" style={{ gridColumn: 'span 2' }}>
              <div className="kpi-label">Concepto / motivo del cambio</div>
              <input className="input" disabled={!editable} placeholder="ej: Cliente solicita cambio de piso en nivel 2"
                value={sel.concepto || ''} onChange={e => setSel({ ...sel, concepto: e.target.value })} style={{ marginTop: 4 }} />
            </div>
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title"><ClipboardList size={15} /> Líneas de la orden</div>
              {editable && <button className="btn sm" onClick={addLinea}><Plus size={13} /> Agregar línea</button>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="bt">
                <thead><tr>
                  <th>Descripción</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Unidad</th>
                  <th className="num" style={{ width: 110 }}>Cantidad</th>
                  <th className="num" style={{ width: 130 }}>P. Unitario</th>
                  <th className="num" style={{ width: 130 }}>Importe</th>
                  <th style={{ width: 50 }}></th>
                </tr></thead>
                <tbody>
                  {(sel.lineas_json || []).map(l => (
                    <tr key={l.id}>
                      <td><input className="input sm" disabled={!editable} placeholder="Descripción del trabajo" value={l.descripcion} onChange={e => updLinea(l.id, { descripcion: e.target.value })} style={{ width: '100%' }} /></td>
                      <td><input className="input sm" disabled={!editable} placeholder="m², ml…" value={l.unidad} onChange={e => updLinea(l.id, { unidad: e.target.value })} style={{ width: 80, textAlign: 'center' }} /></td>
                      <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={l.cantidad} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { cantidad: e.target.value })} style={{ width: 96, textAlign: 'right' }} /></td>
                      <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={l.pu} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { pu: e.target.value })} style={{ width: 110, textAlign: 'right' }} /></td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(round2((+l.cantidad || 0) * (+l.pu || 0)))}</td>
                      <td>{editable && <button className="btn xs danger icon" onClick={() => delLinea(l.id)}><Trash2 size={11} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>
                      TOTAL {sel.tipo === 'deductiva' ? 'DEDUCTIVO' : 'ADITIVO'}
                    </td>
                    <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{signo < 0 ? '− ' : ''}{money(monto)}</td>
                    <td style={{ background: 'var(--c-ink)' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 0, maxWidth: 460 }}>
            <div className="card-header"><div className="card-title"><TrendingUp size={15} /> Efecto sobre el contrato</div></div>
            {[
              ['Contrato vigente', money(vigente), false],
              [`Esta orden (${sel.tipo})`, `${signo < 0 ? '− ' : '+ '}${money(monto)}`, false],
              ['CONTRATO ACTUALIZADO', money(round2(vigente + signo * monto)), true],
            ].map(([l, v, b]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderTop: '1px solid var(--c-line-2)', background: b ? 'var(--c-ink)' : 'transparent' }}>
                <span style={{ fontSize: 13, fontWeight: b ? 800 : 500, color: b ? '#fff' : 'var(--c-text-2)' }}>{l}</span>
                <span style={{ fontSize: b ? 15 : 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: b ? 'var(--c-accent)' : 'var(--c-text)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </Fragment>
    )
  }

  // ════════ LISTA ════════
  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Órdenes de Cambio — {budget.nombreProyecto}</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{lista.length} orden{lista.length !== 1 ? 'es' : ''}</div>
        </div>
        {canElaborar && <button className="btn brand" onClick={nueva}><Plus size={14} strokeWidth={2.5} /> Nueva orden de cambio</button>}
      </div>

      <div className="page-body">
        <div className="kpi-row" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-label"><DollarSign size={12} className="ico" /> Contrato original</div>
            <div className="kpi-val" style={{ fontSize: 17 }}>{money(contratoOriginal)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><ClipboardList size={12} className="ico" /> Órdenes aprobadas</div>
            <div className="kpi-val" style={{ fontSize: 17, color: ocAprobadas < 0 ? 'var(--c-danger)' : ocAprobadas > 0 ? 'var(--c-success)' : undefined }}>
              {ocAprobadas < 0 ? '− ' : ocAprobadas > 0 ? '+ ' : ''}{money(Math.abs(ocAprobadas))}
            </div>
            <div className="kpi-foot">{lista.filter(o => o.estado === 'aprobada').length} aprobada(s)</div>
          </div>
          <div className="kpi highlight">
            <div className="kpi-label"><TrendingUp size={12} className="ico" /> Contrato actualizado</div>
            <div className="kpi-val" style={{ fontSize: 17 }}>{money(contratoActualizado)}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {lista.length === 0
            ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <ClipboardList size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-2)' }}>Aún no hay órdenes de cambio</div>
                <div style={{ fontSize: 13 }}>Registra aquí los trabajos adicionales o deducciones acordadas con el cliente.</div>
              </div>
            )
            : (
              <table className="bt">
                <thead><tr>
                  <th style={{ width: 60 }}>No.</th>
                  <th style={{ width: 100 }}>Fecha</th>
                  <th>Concepto</th>
                  <th style={{ width: 100 }}>Tipo</th>
                  <th style={{ width: 110 }}>Estado</th>
                  <th className="num" style={{ width: 140 }}>Monto</th>
                  <th style={{ width: 180 }}></th>
                </tr></thead>
                <tbody>
                  {lista.map(oc => {
                    const m = montoDe(oc)
                    return (
                      <tr key={oc.id} style={{ cursor: 'pointer' }} onClick={() => setSel(oc)}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{oc.numero}</td>
                        <td style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{oc.fecha || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{oc.concepto || <span style={{ color: 'var(--c-text-4)', fontStyle: 'italic' }}>Sin concepto</span>}</td>
                        <td style={{ fontSize: 12, fontWeight: 700, color: oc.tipo === 'deductiva' ? 'var(--c-danger)' : 'var(--c-success)' }}>
                          {oc.tipo === 'deductiva' ? '− Deductiva' : '+ Aditiva'}
                        </td>
                        <td><ChipOC estado={oc.estado} /></td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(m)}</td>
                        <td className="actions" onClick={ev => ev.stopPropagation()}>
                          <button className="btn xs" onClick={() => setSel(oc)}>Abrir</button>
                          <button className="btn xs ghost" style={{ marginLeft: 4 }} onClick={() => pdf(oc)}><FileText size={11} /> PDF</button>
                          {oc.estado === 'borrador' && canElaborar && (
                            <button className="btn xs danger icon" style={{ marginLeft: 4 }} onClick={() => eliminar(oc)}><Trash2 size={11} /></button>
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
