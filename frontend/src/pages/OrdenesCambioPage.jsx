// ============ ÓRDENES DE CAMBIO PAGE (Fase III · módulo 2, formato SALCO) ============
// Cuadro por partida: cada actividad del contrato puede tener aumento o
// disminución de obra (ajuste de cantidad), más obra nueva. El efecto neto
// modifica el contrato y, al aprobarse, ajusta la cantidad de contrato por
// actividad que usan las estimaciones (destraba el tope "salvo OC").
import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { calcItem, makeMoneyFmt, fmt, round2, uid } from '../lib/calc'
import { flattenActividades } from '../lib/cronograma'
import { normLineasOC, montoAjuste, efectoOC, desgloseOC } from '../lib/contrato'
import { exportPDFOrdenCambio } from '../lib/exportOrdenCambio'
import { Dropdown } from '../components/ui'
import {
  ClipboardList, Plus, FileText, Check, X, ChevronLeft, Trash2, DollarSign, TrendingUp, ChevronDown, MessageSquare,
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

// Desplegable de estado (como el de la planilla): Borrador → Enviada →
// Aprobada/Rechazada, según permisos del rol.
const TRANS_OC = { borrador: ['enviada'], enviada: ['aprobada', 'rechazada'], aprobada: [], rechazada: [] }
function EstadoOCMenu({ estado, canElaborar, canAprobar, onChange }) {
  const allowed = (TRANS_OC[estado] || []).filter(() => (estado === 'enviada' ? canAprobar : canElaborar))
  if (!allowed.length) return <ChipOC estado={estado} />
  return (
    <Dropdown align="left" minWidth={180} trigger={
      <button className="btn sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ChipOC estado={estado} /><ChevronDown size={12} />
      </button>
    }>
      <div style={{ padding: '6px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-3)', padding: '4px 12px 8px' }}>Cambiar estado</div>
        {Object.keys(ESTADOS_OC).map(v => {
          const can = allowed.includes(v)
          return (
            <button key={v} onClick={() => can && onChange(v)}
              style={{ width: '100%', textAlign: 'left', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', fontSize: 13, cursor: can ? 'pointer' : 'default', opacity: can ? 1 : 0.35 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ESTADOS_OC[v].fg, flexShrink: 0 }}></span>
              {ESTADOS_OC[v].label}
              {v === estado && <Check size={13} style={{ marginLeft: 'auto', color: 'var(--c-success)' }} />}
            </button>
          )
        })}
      </div>
    </Dropdown>
  )
}

export default function OrdenesCambioPage({ budget, projectRole, user, params }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)

  const money = makeMoneyFmt(budget?.moneda)
  const canElaborar = puedeHacer(projectRole, 'elaborarOrdenCambio')
  const canAprobar  = puedeHacer(projectRole, 'aprobarOrdenCambio')

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
  const actById = useMemo(() => Object.fromEntries(acts.map(a => [a.id, a])), [acts])

  const contratoOriginal = useMemo(
    () => round2(budget ? budget.items.reduce((s, it) => s + calcItem(it, budget.catalogos, params).subtotal, 0) : 0),
    [budget, params],
  )

  useEffect(() => {
    let cancel = false
    const cargar = async () => {
      if (!budget?.id) { setLista([]); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase.from('ordenes_cambio').select('*').eq('presupuesto_id', budget.id).order('numero')
      if (!cancel) { setLista(data || []); setLoading(false) }
    }
    cargar(); setSel(null)
    return () => { cancel = true }
  }, [budget?.id])

  const contratoAntesDe = numero => round2(
    contratoOriginal + lista.filter(o => o.estado === 'aprobada' && o.numero < numero).reduce((s, o) => s + efectoOC(o), 0))
  const ocAprobadas = round2(lista.filter(o => o.estado === 'aprobada').reduce((s, o) => s + efectoOC(o), 0))
  const contratoActualizado = round2(contratoOriginal + ocAprobadas)

  const nueva = async () => {
    const numero = lista.reduce((mx, o) => Math.max(mx, o.numero), 0) + 1
    const { data, error } = await supabase.from('ordenes_cambio').insert({
      presupuesto_id: budget.id, numero, tipo: 'aditiva',
      lineas_json: [], creado_por: user?.id || null,
    }).select().single()
    if (error) {
      alert('Error al crear la orden de cambio: ' + error.message +
        (/ordenes_cambio/.test(error.message) ? '\n\n(¿Se ejecutó supabase/fase3/fase3_02_ordenes_cambio.sql?)' : ''))
      return
    }
    setLista(p => [...p, data]); setSel(data)
  }

  const guardar = async (oc, extra = {}) => {
    setBusy(true)
    const efecto = efectoOC(oc)
    const { error } = await supabase.from('ordenes_cambio').update({
      fecha: oc.fecha, concepto: oc.concepto || null,
      tipo: efecto < 0 ? 'deductiva' : 'aditiva',
      lineas_json: oc.lineas_json, monto: efecto, notas: oc.notas || null,
      updated_at: new Date().toISOString(), ...extra,
    }).eq('id', oc.id)
    setBusy(false)
    if (error) { alert('Error al guardar: ' + error.message); return false }
    const act = { ...oc, ...extra, monto: efecto }
    setLista(p => p.map(x => x.id === oc.id ? act : x))
    return act
  }

  const cambiarEstado = async (oc, estado, msj) => {
    if (msj && !confirm(msj)) return
    const extra = { estado }
    if (estado === 'aprobada') extra.aprobado_por = user?.id || null
    const r = await guardar(oc, extra); if (r) setSel(r)
  }

  // Guarda SOLO la revisión por partida (aprobacion_json). Va en columna aparte
  // para que el cliente/supervisión (rol de solo-lectura) pueda guardarla sin
  // que el trigger de blindaje lo bloquee por tocar las líneas.
  const guardarAprobacion = async oc => {
    const { error } = await supabase.from('ordenes_cambio')
      .update({ aprobacion_json: oc.aprobacion_json || {}, updated_at: new Date().toISOString() })
      .eq('id', oc.id)
    if (error) { alert('Error al guardar la revisión: ' + error.message); return false }
    setLista(p => p.map(x => x.id === oc.id ? { ...x, aprobacion_json: oc.aprobacion_json || {} } : x))
    return true
  }

  const reabrirComoNueva = async oc => {
    const numero = lista.reduce((mx, x) => Math.max(mx, x.numero), 0) + 1
    if (!confirm(`La Orden de Cambio No. ${oc.numero} fue rechazada.\n\n¿Generar la No. ${numero} como versión corregida?`)) return
    const { data, error } = await supabase.from('ordenes_cambio').insert({
      presupuesto_id: budget.id, numero, fecha: oc.fecha, concepto: oc.concepto,
      tipo: oc.tipo, lineas_json: oc.lineas_json, notas: oc.notas, creado_por: user?.id || null,
    }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    setLista(p => [...p, data]); setSel(data)
  }

  const eliminar = async oc => {
    if (!confirm(`¿Eliminar la Orden de Cambio No. ${oc.numero}?\n\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('ordenes_cambio').delete().eq('id', oc.id)
    if (error) return alert('Error: ' + error.message)
    setLista(p => p.filter(x => x.id !== oc.id)); if (sel?.id === oc.id) setSel(null)
  }

  const pdf = oc => exportPDFOrdenCambio(budget, oc,
    { contratoVigente: contratoAntesDe(oc.numero), contratoNuevo: round2(contratoAntesDe(oc.numero) + efectoOC(oc)) },
    { logo: budget.logoOfertante, logoCliente: budget.logoCliente, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText })

  if (!budget) return (
    <div className="page-body"><div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-3)' }}>
      <ClipboardList size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
      <div style={{ fontSize: 13 }}>Abre un proyecto para gestionar sus órdenes de cambio.</div>
    </div></div>
  )
  if (loading) return <div className="page-body" style={{ padding: 60, textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando órdenes de cambio…</div>

  // ════════ EDITOR ════════
  if (sel) {
    const editable = sel.estado === 'borrador' && canElaborar
    const { ajustes, nuevas } = normLineasOC(sel)
    const dz = desgloseOC(sel)
    const vigente = contratoAntesDe(sel.numero)
    const setLineas = lineas_json => setSel({ ...sel, lineas_json })
    // Revisión por partida (cliente / supervisión) cuando la OC está enviada
    const aprob = sel.aprobacion_json || {}
    const puedeRevisar = canAprobar && sel.estado === 'enviada'
    const hayRevision = Object.keys(aprob).length > 0
    const setAprobLinea = async (lineId, estado) => {
      const cur = aprob[lineId]?.estado
      const next = { ...aprob, [lineId]: { ...(aprob[lineId] || {}), estado: cur === estado ? null : estado } }
      const oc = { ...sel, aprobacion_json: next }; setSel(oc); await guardarAprobacion(oc)
    }
    const setComentario = (lineId, comentario) => setSel({ ...sel, aprobacion_json: { ...aprob, [lineId]: { ...(aprob[lineId] || {}), comentario } } })
    // Celda de revisión por partida (estado + comentario)
    const celdaRevision = lineId => {
      const est = aprob[lineId]?.estado
      return (
        <td style={{ minWidth: 200, verticalAlign: 'top' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {puedeRevisar ? (
                <Fragment>
                  <button className="btn xs" title="Aprobar partida" onClick={() => setAprobLinea(lineId, 'aprobada')}
                    style={{ background: est === 'aprobada' ? 'var(--c-success)' : 'transparent', color: est === 'aprobada' ? '#fff' : 'var(--c-success)', borderColor: 'var(--c-success)', padding: '2px 7px' }}><Check size={11} /></button>
                  <button className="btn xs" title="Rechazar partida" onClick={() => setAprobLinea(lineId, 'rechazada')}
                    style={{ background: est === 'rechazada' ? 'var(--c-danger)' : 'transparent', color: est === 'rechazada' ? '#fff' : 'var(--c-danger)', borderColor: 'var(--c-danger)', padding: '2px 7px' }}><X size={11} /></button>
                </Fragment>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: est === 'aprobada' ? 'var(--c-success)' : est === 'rechazada' ? 'var(--c-danger)' : 'var(--c-text-3)' }}>
                  {est === 'aprobada' ? '✓ Aprobada' : est === 'rechazada' ? '✕ Rechazada' : 'Pendiente'}
                </span>
              )}
            </div>
            {(puedeRevisar || aprob[lineId]?.comentario) && (
              <input className="input sm" placeholder="Comentario…" disabled={!puedeRevisar}
                value={aprob[lineId]?.comentario || ''} onChange={e => setComentario(lineId, e.target.value)}
                onBlur={() => puedeRevisar && guardarAprobacion(sel)} style={{ width: '100%', fontSize: 11 }} />
            )}
          </div>
        </td>
      )
    }
    const idsAjustados = new Set(ajustes.map(a => a.actividadId))

    const agregarAjuste = actId => {
      const a = actById[actId]; if (!a) return
      const linea = { id: uid(), tipo: 'ajuste', actividadId: actId, capId: a.capId, capDesc: a.capDesc,
        descripcion: a.descripcion, unidad: a.unidad, pu: round2(puDe[actId] || 0),
        cantOriginal: +a.cantidad || 0, cantNueva: +a.cantidad || 0 }
      setLineas([...(sel.lineas_json || []), linea])
    }
    const updLinea = (id, patch) => setLineas(sel.lineas_json.map(l => l.id === id ? { ...l, ...patch } : l))
    const delLinea = id => setLineas(sel.lineas_json.filter(l => l.id !== id))
    const addNueva = () => setLineas([...(sel.lineas_json || []), { id: uid(), tipo: 'nueva', descripcion: '', unidad: '', cantidad: 1, pu: 0 }])

    return (
      <Fragment>
        <div className="page-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn sm ghost" onClick={() => setSel(null)}><ChevronLeft size={14} /> Órdenes de cambio</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 10 }}>
                Orden de Cambio No. {sel.numero}
                <EstadoOCMenu estado={sel.estado} canElaborar={canElaborar} canAprobar={canAprobar}
                  onChange={v => cambiarEstado(sel, v, {
                    enviada: '¿Enviar la orden de cambio para aprobación del cliente?',
                    aprobada: '¿Aprobar esta orden de cambio? El contrato y las cantidades de las partidas ajustadas se actualizarán.',
                    rechazada: '¿Rechazar la orden de cambio?',
                  }[v])} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{budget.nombreProyecto}</div>
            </div>
          </div>
          <div className="page-head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editable && <button className="btn primary" disabled={busy} onClick={async () => { if (await guardar(sel)) alert('💾 Orden de cambio guardada.') }}><Check size={13} /> {busy ? 'Guardando…' : 'Guardar'}</button>}
            {/* Aprobación del cliente / supervisión sobre la orden completa */}
            {puedeRevisar && <button className="btn" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff' }} disabled={busy}
              onClick={() => cambiarEstado(sel, 'aprobada', '¿Aprobar la orden de cambio? Solo las partidas aprobadas modificarán el contrato.')}><Check size={13} /> Aprobar orden</button>}
            {puedeRevisar && <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} disabled={busy}
              onClick={() => cambiarEstado(sel, 'rechazada', '¿Rechazar la orden de cambio completa?')}><X size={13} /> Rechazar orden</button>}
            {sel.estado === 'rechazada' && canElaborar && <button className="btn brand" disabled={busy} onClick={() => reabrirComoNueva(sel)}>Generar siguiente orden corregida</button>}
            <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }} onClick={() => pdf(sel)}><FileText size={13} /> PDF</button>
          </div>
        </div>

        <div className="page-body">
          {/* Aviso de fase del flujo */}
          {(editable || puedeRevisar) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14, borderRadius: 10, background: editable ? 'var(--c-accent-soft)' : '#fef3c7', border: `1px solid ${editable ? 'var(--c-line)' : '#f59e0b'}` }}>
              <MessageSquare size={17} style={{ color: editable ? 'var(--c-text-3)' : '#b45309', flexShrink: 0 }} />
              <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45 }}>
                {editable
                  ? <>Estás en <b>Borrador</b>: configuración por el <b>ejecutor / contratista principal</b>. Define ajustes y obra nueva; al <b>Enviar</b>, el cliente/supervisión revisa cada partida.</>
                  : <>Revisión del <b>cliente / supervisión</b>: aprueba o rechaza <b>cada partida</b> con su comentario y luego <b>Aprobar orden</b>. Solo las partidas <b>aprobadas</b> modifican el contrato.</>}
              </div>
            </div>
          )}
          <div className="kpi-row" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <div className="kpi-label">Fecha</div>
              <input type="date" className="input" disabled={!editable} value={sel.fecha || ''} onChange={e => setSel({ ...sel, fecha: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi" style={{ gridColumn: 'span 3' }}>
              <div className="kpi-label">Concepto / motivo del cambio</div>
              <input className="input" disabled={!editable} placeholder="ej: Ajustes por condiciones de sitio y obra adicional solicitada"
                value={sel.concepto || ''} onChange={e => setSel({ ...sel, concepto: e.target.value })} style={{ marginTop: 4 }} />
            </div>
          </div>

          {/* Ajuste de partidas del contrato */}
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title"><ClipboardList size={15} /> Ajuste de partidas del contrato (aumento / disminución de obra)</div>
              {editable && (
                <Dropdown align="right" minWidth={360} trigger={<button className="btn sm"><Plus size={13} /> Agregar partida <ChevronDown size={12} /></button>}>
                  <div style={{ padding: '6px 0', maxHeight: 340, overflowY: 'auto' }}>
                    {acts.filter(a => !idsAjustados.has(a.id)).map(a => (
                      <button key={a.id} onClick={() => agregarAjuste(a.id)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <b style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)', marginRight: 6 }}>{a.id}</b>{a.descripcion}
                      </button>
                    ))}
                    {acts.filter(a => !idsAjustados.has(a.id)).length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--c-text-3)' }}>Todas las partidas ya están en la orden.</div>}
                  </div>
                </Dropdown>
              )}
            </div>
            {ajustes.length === 0
              ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin ajustes de partidas. {editable && 'Usa "Agregar partida" para aumentar o disminuir cantidades del contrato.'}</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="bt">
                    <thead><tr>
                      <th style={{ width: 64 }}>ID</th>
                      <th>Partida</th>
                      <th style={{ width: 50, textAlign: 'center' }}>Und</th>
                      <th className="num" style={{ width: 96 }}>P. Unitario</th>
                      <th className="num" style={{ width: 90 }}>Cant. orig.</th>
                      <th className="num" style={{ width: 96 }}>Cant. nueva</th>
                      <th className="num" style={{ width: 80 }}>Δ Cant.</th>
                      <th className="num" style={{ width: 120 }}>Monto</th>
                      {(puedeRevisar || hayRevision) && <th style={{ width: 210 }}>Revisión cliente/sup.</th>}
                      <th style={{ width: 40 }}></th>
                    </tr></thead>
                    <tbody>
                      {ajustes.map(a => {
                        const delta = round2((+a.cantNueva || 0) - (+a.cantOriginal || 0))
                        const monto = montoAjuste(a)
                        return (
                          <tr key={a.id}>
                            <td className="id">{a.actividadId}</td>
                            <td style={{ fontWeight: 500 }}>{a.descripcion}</td>
                            <td style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{a.unidad || '—'}</td>
                            <td className="num">{money(a.pu)}</td>
                            <td className="num" style={{ color: 'var(--c-text-3)' }}>{fmt(a.cantOriginal)}</td>
                            <td className="num">
                              <input type="number" min="0" step="any" className="input sm" disabled={!editable}
                                value={a.cantNueva} onFocus={e => e.target.select()}
                                onChange={e => updLinea(a.id, { cantNueva: Math.max(0, +e.target.value || 0) })}
                                style={{ width: 82, textAlign: 'right', fontWeight: 700 }} />
                            </td>
                            <td className="num" style={{ fontWeight: 700, color: delta > 0 ? 'var(--c-success)' : delta < 0 ? 'var(--c-danger)' : 'var(--c-text-3)' }}>{delta > 0 ? '+' : ''}{fmt(delta)}</td>
                            <td className="num" style={{ fontWeight: 700, color: monto > 0 ? 'var(--c-success)' : monto < 0 ? 'var(--c-danger)' : 'var(--c-text-3)' }}>{monto < 0 ? '− ' : monto > 0 ? '+ ' : ''}{money(Math.abs(monto))}</td>
                            {(puedeRevisar || hayRevision) && celdaRevision(a.id)}
                            <td>{editable && <button className="btn xs danger icon" onClick={() => delLinea(a.id)}><Trash2 size={11} /></button>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          {/* Obra nueva */}
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title"><Plus size={15} /> Obra nueva (no contemplada en el contrato)</div>
              {editable && <button className="btn sm" onClick={addNueva}><Plus size={13} /> Agregar línea</button>}
            </div>
            {nuevas.length === 0
              ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin obra nueva.</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="bt">
                    <thead><tr>
                      <th>Descripción</th>
                      <th style={{ width: 80, textAlign: 'center' }}>Unidad</th>
                      <th className="num" style={{ width: 100 }}>Cantidad</th>
                      <th className="num" style={{ width: 120 }}>P. Unitario</th>
                      <th className="num" style={{ width: 120 }}>Monto</th>
                      {(puedeRevisar || hayRevision) && <th style={{ width: 210 }}>Revisión cliente/sup.</th>}
                      <th style={{ width: 40 }}></th>
                    </tr></thead>
                    <tbody>
                      {nuevas.map(n => (
                        <tr key={n.id}>
                          <td><input className="input sm" disabled={!editable} placeholder="Descripción de la obra nueva" value={n.descripcion} onChange={e => updLinea(n.id, { descripcion: e.target.value })} style={{ width: '100%' }} /></td>
                          <td><input className="input sm" disabled={!editable} placeholder="m², ml…" value={n.unidad} onChange={e => updLinea(n.id, { unidad: e.target.value })} style={{ width: 70, textAlign: 'center' }} /></td>
                          <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={n.cantidad} onFocus={e => e.target.select()} onChange={e => updLinea(n.id, { cantidad: e.target.value })} style={{ width: 86, textAlign: 'right' }} /></td>
                          <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={n.pu} onFocus={e => e.target.select()} onChange={e => updLinea(n.id, { pu: e.target.value })} style={{ width: 106, textAlign: 'right' }} /></td>
                          <td className="num" style={{ fontWeight: 700, color: 'var(--c-success)' }}>+ {money(round2((+n.cantidad || 0) * (+n.pu || 0)))}</td>
                          {(puedeRevisar || hayRevision) && celdaRevision(n.id)}
                          <td>{editable && <button className="btn xs danger icon" onClick={() => delLinea(n.id)}><Trash2 size={11} /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          {/* Resumen estilo cuadro SALCO */}
          <div className="card" style={{ padding: 0, maxWidth: 520 }}>
            <div className="card-header"><div className="card-title"><TrendingUp size={15} /> Efecto sobre el contrato</div></div>
            {[
              ['Aumento de obra', `+ ${money(dz.aumento)}`, 'var(--c-success)'],
              ['Disminución de obra', `${money(dz.disminucion)}`, 'var(--c-danger)'],
              ['Obra nueva', `+ ${money(dz.obraNueva)}`, 'var(--c-success)'],
              ['Efecto neto de la orden', `${dz.neto < 0 ? '− ' : '+ '}${money(Math.abs(dz.neto))}`, dz.neto < 0 ? 'var(--c-danger)' : 'var(--c-success)'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--c-line-2)' }}>
                <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--c-line-2)' }}>
              <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>Contrato vigente</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{money(vigente)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--c-ink)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>CONTRATO MODIFICADO</span>
              <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--c-accent)' }}>{money(round2(vigente + dz.neto))}</span>
            </div>
            {hayRevision && <div style={{ fontSize: 11, color: 'var(--c-text-3)', padding: '8px 16px' }}>Efecto propuesto. Solo las partidas <b>aprobadas</b> por el cliente/supervisión modifican realmente el contrato.</div>}
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
            ? <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <ClipboardList size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-2)' }}>Aún no hay órdenes de cambio</div>
                <div style={{ fontSize: 13 }}>Ajusta cantidades de partidas existentes o agrega obra nueva acordada con el cliente.</div>
              </div>
            : (
              <table className="bt">
                <thead><tr>
                  <th style={{ width: 60 }}>No.</th>
                  <th style={{ width: 100 }}>Fecha</th>
                  <th>Concepto</th>
                  <th style={{ width: 110 }}>Estado</th>
                  <th className="num" style={{ width: 150 }}>Efecto neto</th>
                  <th style={{ width: 180 }}></th>
                </tr></thead>
                <tbody>
                  {lista.map(oc => {
                    const ef = efectoOC(oc)
                    return (
                      <tr key={oc.id} style={{ cursor: 'pointer' }} onClick={() => setSel(oc)}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{oc.numero}</td>
                        <td style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{oc.fecha || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{oc.concepto || <span style={{ color: 'var(--c-text-4)', fontStyle: 'italic' }}>Sin concepto</span>}</td>
                        <td><ChipOC estado={oc.estado} /></td>
                        <td className="num" style={{ fontWeight: 700, color: ef < 0 ? 'var(--c-danger)' : 'var(--c-success)' }}>{ef < 0 ? '− ' : '+ '}{money(Math.abs(ef))}</td>
                        <td className="actions" onClick={ev => ev.stopPropagation()}>
                          <button className="btn xs" onClick={() => setSel(oc)}>Abrir</button>
                          <button className="btn xs ghost" style={{ marginLeft: 4 }} onClick={() => pdf(oc)}><FileText size={11} /> PDF</button>
                          {oc.estado === 'borrador' && canElaborar && <button className="btn xs danger icon" style={{ marginLeft: 4 }} onClick={() => eliminar(oc)}><Trash2 size={11} /></button>}
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
