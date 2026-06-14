// ============ PLANILLAS A CONTRATISTAS (Fase III · módulo 3) ============
// Pago periódico a subcontratistas con dos tipos de línea: destajo (obra
// ejecutada × P.U., opcionalmente ligada a una actividad del presupuesto
// para control de gastos) y personal al día / obras varias. Más deducciones,
// retención y amortización de anticipo. Flujo borrador → ... → pagada.
import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { calcItem, calcFicha, conceptoCost, makeMoneyFmt, fmt, round2, uid } from '../lib/calc'
import { flattenActividades, hoyISO } from '../lib/cronograma'
import { Modal } from '../components/ui'
import { exportPDFPlanilla } from '../lib/exportPlanilla'
import {
  HardHat, Plus, FileText, Check, X, Send, ChevronLeft, Trash2, DollarSign, Users, Coins, Wand2,
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

// Importe de una línea = cantidad × P.U. × (1 − descuento%). El descuento es
// el único valor editable de las líneas ligadas al presupuesto.
const importeLinea = l => round2((+l.cantidad || 0) * (+l.pu || 0) * (1 - (+l.descuento || 0) / 100))

// Modal para generar líneas de destajo desde el presupuesto (alcance del
// contratista), con cantidad pendiente desde el avance físico y P.U. = mano
// de obra unitaria. Componente top-level para no perder foco.
function GenerarDestajoModal({ open, onClose, acts, moUnit, money, yaEnContrato, onConfirmar }) {
  const [sel, setSel] = useState({})
  useEffect(() => { if (open) setSel({}) }, [open])
  if (!open) return null
  const disponibles = acts.filter(a => !yaEnContrato.has(a.id))
  const ids = Object.keys(sel).filter(k => sel[k])
  // Agrupar por capítulo
  const porCap = []
  let lastCap = null
  for (const a of disponibles) {
    if (a.capId !== lastCap) { lastCap = a.capId; porCap.push({ cap: { id: a.capId, desc: a.capDesc }, acts: [] }) }
    porCap[porCap.length - 1].acts.push(a)
  }
  const toggle = id => setSel(p => ({ ...p, [id]: !p[id] }))
  const toggleCap = (capActs, on) => setSel(p => { const n = { ...p }; capActs.forEach(a => n[a.id] = on); return n })

  return (
    <Modal open={open} onClose={onClose} title="Generar destajo desde el presupuesto"
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn brand" disabled={!ids.length} onClick={() => onConfirmar(ids)}>
          <Check size={13} /> Agregar {ids.length} actividad{ids.length !== 1 ? 'es' : ''}
        </button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', background: 'var(--c-accent-soft)', padding: '8px 12px', borderRadius: 8, lineHeight: 1.5 }}>
          Marca las actividades que contratas a este destajista. Se crea una línea por actividad con la
          <b> cantidad del presupuesto</b> y el P.U. de <b>mano de obra</b> de la ficha. Tú pones los materiales.
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--c-line)', borderRadius: 8 }}>
          {disponibles.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--c-text-3)' }}>Todas las actividades del presupuesto ya están en este contrato.</div>}
          {porCap.map(g => (
            <div key={g.cap.id || 'sc'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--c-ink)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 12 }}>
                <span style={{ flex: 1 }}>{g.cap.id} · {g.cap.desc}</span>
                <button className="btn xs" onClick={() => toggleCap(g.acts, true)} style={{ padding: '1px 6px' }}>todas</button>
                <button className="btn xs ghost" onClick={() => toggleCap(g.acts, false)} style={{ padding: '1px 6px', color: '#fff' }}>ninguna</button>
              </div>
              {g.acts.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--c-line-2)', cursor: 'pointer', background: sel[a.id] ? 'var(--c-accent-soft)' : 'transparent' }}>
                  <input type="checkbox" checked={!!sel[a.id]} onChange={() => toggle(a.id)} style={{ width: 15, height: 15, accentColor: 'var(--c-accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.descripcion}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{fmt(a.cantidad)} {a.unidad} · m.o. {money(moUnit[a.id] || 0)}/{a.unidad}</div>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// Modal para generar destajo POR OFICIO (mano de obra): elige uno o varios
// oficios del catálogo y discrimina las actividades que los usan. Top-level.
function GenerarPorOficioModal({ open, onClose, porOficio, money, yaCombos, onConfirmar }) {
  const [step, setStep] = useState('oficios')
  const [ofSel, setOfSel] = useState({})   // { insumoId: bool } — multi-selección de oficios
  const [sel, setSel] = useState({})        // { `${moId}|${actId}`: bool }
  useEffect(() => { if (open) { setStep('oficios'); setOfSel({}); setSel({}) } }, [open])
  if (!open) return null

  const oficios = Object.entries(porOficio).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.acts.length - a.acts.length)
  const ofIds = Object.keys(ofSel).filter(k => ofSel[k])
  const secciones = ofIds
    .map(id => ({ id, insumo: porOficio[id].insumo, acts: porOficio[id].acts.filter(a => !yaCombos.has(`${a.id}|${id}`)) }))
    .filter(s => s.acts.length)
  const combosDisp = secciones.flatMap(s => s.acts.map(a => `${s.id}|${a.id}`))
  const selIds = Object.keys(sel).filter(k => sel[k])
  const toggleOf = id => setOfSel(p => ({ ...p, [id]: !p[id] }))
  const toggle = key => setSel(p => ({ ...p, [key]: !p[key] }))
  const marcarTodo = on => { const n = {}; if (on) combosDisp.forEach(k => n[k] = true); setSel(n) }

  return (
    <Modal open={open} onClose={onClose} title="Generar por mano de obra (oficio)"
      footer={step === 'oficios'
        ? <>
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button className="btn brand" disabled={!ofIds.length} onClick={() => { setSel({}); setStep('acts') }}>Continuar ({ofIds.length}) →</button>
          </>
        : <>
            <button className="btn ghost" onClick={() => setStep('oficios')}>← Oficios</button>
            <button className="btn brand" disabled={!selIds.length} onClick={() => onConfirmar(selIds.map(k => { const i = k.indexOf('|'); return { moId: k.slice(0, i), actId: k.slice(i + 1) } }))}>
              <Check size={13} /> Agregar {selIds.length} actividad{selIds.length !== 1 ? 'es' : ''}
            </button>
          </>}>
      {step === 'oficios' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', background: 'var(--c-accent-soft)', padding: '8px 12px', borderRadius: 8, lineHeight: 1.5 }}>
            Marca <b>uno o varios oficios</b> que ejecuta este contratista. Luego eliges en qué actividades aplica cada uno; cada combinación será una línea con su cantidad y el costo del oficio por unidad.
          </div>
          {oficios.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--c-text-3)' }}>No hay mano de obra usada en las fichas del presupuesto.</div>}
          {oficios.map(o => (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--c-line)', cursor: 'pointer', background: ofSel[o.id] ? 'var(--c-accent-soft)' : 'var(--c-surface)' }}>
              <input type="checkbox" checked={!!ofSel[o.id]} onChange={() => toggleOf(o.id)} style={{ width: 15, height: 15, accentColor: 'var(--c-accent)' }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{o.insumo.descripcion}</span>
              <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{o.acts.length} actividad{o.acts.length !== 1 ? 'es' : ''}</span>
            </label>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, alignSelf: 'flex-start' }}>
            <input type="checkbox"
              checked={combosDisp.length > 0 && combosDisp.every(k => sel[k])}
              ref={el => { if (el) el.indeterminate = selIds.length > 0 && selIds.length < combosDisp.length }}
              onChange={e => marcarTodo(e.target.checked)}
              style={{ width: 17, height: 17, accentColor: 'var(--c-accent)' }} />
            Todo
          </label>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--c-line)', borderRadius: 8 }}>
            {secciones.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--c-text-3)' }}>Todas las actividades de los oficios elegidos ya están en el contrato.</div>}
            {secciones.map(s => (
              <div key={s.id}>
                <div style={{ padding: '7px 12px', background: 'var(--c-ink)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 12 }}>{s.insumo.descripcion}</div>
                {s.acts.map(a => {
                  const key = `${s.id}|${a.id}`
                  return (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--c-line-2)', cursor: 'pointer', background: sel[key] ? 'var(--c-accent-soft)' : 'transparent' }}>
                      <input type="checkbox" checked={!!sel[key]} onChange={() => toggle(key)} style={{ width: 15, height: 15, accentColor: 'var(--c-accent)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)', marginRight: 6 }}>{a.id}</span>{a.descripcion}</div>
                        <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{fmt(a.cantidad)} {a.unidad} · {money(a.pu)}/{a.unidad}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function PlanillasPage({ budget, projectRole, user, params }) {
  const [contratos, setContratos] = useState([])
  const [planillas, setPlanillas] = useState([])
  const [loading, setLoading] = useState(true)
  const [selContrato, setSelContrato] = useState(null)
  const [selPlanilla, setSelPlanilla] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [showGenMO, setShowGenMO] = useState(false)

  const money = makeMoneyFmt(budget?.moneda)
  const canElaborar = puedeHacer(projectRole, 'elaborarPlanilla')
  const canAprobar  = puedeHacer(projectRole, 'aprobarPlanilla')

  const acts = useMemo(() => flattenActividades(budget?.items || []), [budget?.items])
  const actById = useMemo(() => Object.fromEntries(acts.map(a => [a.id, a])), [acts])
  // Mano de obra unitaria por actividad (lo que se le paga al destajista; los
  // materiales los pone la empresa) y cantidad de contrato
  const moUnit = useMemo(() => {
    const m = {}
    const walk = its => { for (const it of (its || [])) {
      if (it.tipo === 'actividad') m[it.id] = round2(calcFicha(it.ficha, budget?.catalogos, params).totMo)
      else if (it.children) walk(it.children)
    } }
    walk(budget?.items || [])
    return m
  }, [budget?.items, budget?.catalogos, params])

  // Por oficio (insumo de mano de obra) → actividades que lo usan, con el costo
  // del oficio por unidad de actividad (rendimiento × costo del insumo M.O.)
  const porOficio = useMemo(() => {
    const cat = budget?.catalogos
    const moById = Object.fromEntries((cat?.manoObra || []).map(i => [i.id, i]))
    const map = {}
    const walk = (its, capId, capDesc) => { for (const it of (its || [])) {
      if (it.tipo === 'capitulo') walk(it.children, it.id, it.descripcion)
      else if (it.tipo === 'subcapitulo') walk(it.children, capId, capDesc)
      else if (it.tipo === 'actividad') {
        const porIns = {}
        for (const c of (it.ficha?.manoObra || [])) {
          if (!c.insumoId || !moById[c.insumoId]) continue
          porIns[c.insumoId] = round2((porIns[c.insumoId] || 0) + conceptoCost(c, cat, 'manoObra'))
        }
        for (const [insId, puUnit] of Object.entries(porIns)) {
          if (!map[insId]) map[insId] = { insumo: moById[insId], acts: [] }
          map[insId].acts.push({ id: it.id, descripcion: it.descripcion, unidad: it.unidad, cantidad: +it.cantidad || 0, capId, capDesc, pu: puUnit })
        }
      }
    } }
    walk(budget?.items || [])
    return map
  }, [budget?.items, budget?.catalogos, params])

  useEffect(() => {
    let cancel = false
    const cargar = async () => {
      if (!budget?.id) { setContratos([]); setPlanillas([]); setLoading(false); return }
      setLoading(true)
      const [{ data: cs }, { data: ps }] = await Promise.all([
        supabase.from('contratos_obra').select('*').eq('presupuesto_id', budget.id).order('created_at'),
        supabase.from('planillas').select('*').eq('presupuesto_id', budget.id).order('created_at'),
      ])
      if (cancel) return
      setContratos(cs || [])
      setPlanillas(ps || [])
      setLoading(false)
    }
    cargar(); setSelContrato(null); setSelPlanilla(null)
    return () => { cancel = true }
  }, [budget?.id])

  const totalesDe = p => {
    const ls = p.lineas_json || []
    const destajo = round2(ls.filter(l => l.tipo === 'destajo').reduce((s, l) => s + importeLinea(l), 0))
    const dia = round2(ls.filter(l => l.tipo === 'dia').reduce((s, l) => s + importeLinea(l), 0))
    const sub = round2(destajo + dia)
    const ret = round2(sub * (+p.pct_retencion || 0) / 100)
    const amo = round2(sub * (+p.pct_amortizacion || 0) / 100)
    const ded = round2((p.deducciones_json || []).reduce((s, d) => s + (+d.monto || 0), 0))
    return { destajo, dia, sub, ret, amo, ded, neto: round2(sub - ret - amo - ded) }
  }

  // Monto del contrato = Σ subtotales de sus líneas (importeLinea con la
  // cantidad contractual y el descuento por línea).
  const montoContrato = c => round2((c.lineas_json || []).reduce((s, l) => s + importeLinea(l), 0))

  // Acumulado de líneas destajo de las planillas ANTERIORES del MISMO CONTRATO
  // (número menor, no rechazadas). Key: actividadId|manoObraId.
  const acumAntDe = p => {
    const m = {}
    for (const q of planillas) {
      if (q.id === p.id || q.estado === 'rechazada' || q.contrato_id !== p.contrato_id) continue
      if ((+q.numero || 0) >= (+p.numero || 0)) continue
      for (const l of (q.lineas_json || [])) {
        if (l.tipo !== 'destajo') continue
        const k = `${l.actividadId || ''}|${l.manoObraId || ''}`
        if (!m[k]) m[k] = { cant: 0, total: 0 }
        m[k].cant = round2(m[k].cant + (+l.cantidad || 0))
        m[k].total = round2(m[k].total + importeLinea(l))
      }
    }
    return m
  }

  // ── CRUD Contrato de Obra ──
  const nuevoContrato = async () => {
    const contratista = prompt('Nombre del contratista (destajista):')
    if (!contratista || !contratista.trim()) return
    const { data, error } = await supabase.from('contratos_obra').insert({
      presupuesto_id: budget.id, contratista: contratista.trim(),
      lineas_json: [], pct_retencion: 0, pct_amortizacion: 0, creado_por: user?.id || null,
    }).select().single()
    if (error) {
      alert('Error al crear el contrato: ' + error.message +
        (/contratos_obra/.test(error.message) ? '\n\n(¿Se ejecutó supabase/fase3/fase3_05_contratos_obra.sql?)' : ''))
      return
    }
    setContratos(c => [...c, data]); setSelContrato(data)
  }

  const guardarContrato = async (c, extra = {}) => {
    setBusy(true)
    const monto = montoContrato(c)
    const { error } = await supabase.from('contratos_obra').update({
      contratista: c.contratista, lineas_json: c.lineas_json,
      pct_retencion: +c.pct_retencion || 0, pct_amortizacion: +c.pct_amortizacion || 0,
      monto_contrato: monto, notas: c.notas || null,
      updated_at: new Date().toISOString(), ...extra,
    }).eq('id', c.id)
    setBusy(false)
    if (error) { alert('Error al guardar el contrato: ' + error.message); return false }
    const act = { ...c, ...extra, monto_contrato: monto }
    setContratos(prev => prev.map(x => x.id === c.id ? act : x))
    return act
  }

  const eliminarContrato = async c => {
    const n = planillas.filter(p => p.contrato_id === c.id).length
    if (!confirm(`¿Eliminar el contrato de ${c.contratista}?` +
      (n ? `\n\nSe eliminarán también sus ${n} planilla(s).` : '') + '\n\nEsta acción no se puede deshacer.')) return
    const { error } = await supabase.from('contratos_obra').delete().eq('id', c.id)
    if (error) return alert('Error: ' + error.message)
    setContratos(prev => prev.filter(x => x.id !== c.id))
    setPlanillas(prev => prev.filter(p => p.contrato_id !== c.id))
    if (selContrato?.id === c.id) setSelContrato(null)
  }

  // Genera una nueva planilla a partir de las líneas del contrato (snapshot):
  // cantContrato = cantidad del contrato; cantidad (este período) vacía.
  const generarPlanilla = async c => {
    if (!(c.lineas_json || []).length) return alert('El contrato no tiene líneas. Agrega actividades primero.')
    const numero = planillas.filter(p => p.contrato_id === c.id).reduce((mx, p) => Math.max(mx, p.numero), 0) + 1
    const lineas = (c.lineas_json || []).map(l => ({
      id: uid(), tipo: 'destajo', actividadId: l.actividadId || '', manoObraId: l.manoObraId, capId: l.capId,
      descripcion: l.descripcion, unidad: l.unidad, cantContrato: +l.cantidad || 0, cantidad: '', pu: +l.pu || 0, descuento: +l.descuento || 0,
    }))
    const { data, error } = await supabase.from('planillas').insert({
      presupuesto_id: budget.id, contrato_id: c.id, numero, contratista: c.contratista,
      periodo_inicio: hoyISO(), periodo_fin: hoyISO(),
      lineas_json: lineas, deducciones_json: [],
      pct_retencion: +c.pct_retencion || 0, pct_amortizacion: +c.pct_amortizacion || 0,
      creado_por: user?.id || null,
    }).select().single()
    if (error) { alert('Error al generar la planilla: ' + error.message); return }
    setPlanillas(p => [...p, data]); setSelPlanilla(data)
  }

  // ── CRUD Planilla ──
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
    setPlanillas(prev => prev.map(x => x.id === p.id ? act : x))
    return act
  }

  const cambiarEstado = async (p, estado, msj) => {
    if (msj && !confirm(msj)) return
    const extra = { estado }
    if (estado === 'aprobada') extra.aprobado_por = user?.id || null
    const r = await guardar(p, extra); if (r) setSelPlanilla(r)
  }

  const reabrirComoNueva = async p => {
    const numero = planillas.filter(x => x.contrato_id === p.contrato_id)
      .reduce((mx, x) => Math.max(mx, x.numero), 0) + 1
    if (!confirm(`La Planilla No. ${p.numero} de ${p.contratista} fue rechazada.\n\n¿Generar la No. ${numero} como versión corregida?`)) return
    const { data, error } = await supabase.from('planillas').insert({
      presupuesto_id: budget.id, contrato_id: p.contrato_id, numero, contratista: p.contratista,
      periodo_inicio: p.periodo_inicio, periodo_fin: p.periodo_fin,
      lineas_json: p.lineas_json, deducciones_json: p.deducciones_json,
      pct_retencion: p.pct_retencion, pct_amortizacion: p.pct_amortizacion,
      creado_por: user?.id || null,
    }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    setPlanillas(prev => [...prev, data]); setSelPlanilla(data)
  }

  const eliminar = async p => {
    if (!confirm(`¿Eliminar la Planilla No. ${p.numero} de ${p.contratista}?\n\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('planillas').delete().eq('id', p.id)
    if (error) return alert('Error: ' + error.message)
    setPlanillas(prev => prev.filter(x => x.id !== p.id)); if (selPlanilla?.id === p.id) setSelPlanilla(null)
  }

  const pdf = p => exportPDFPlanilla(budget, p, totalesDe(p),
    { logo: budget.logoOfertante, logoCliente: budget.logoCliente, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText },
    acumAntDe(p))

  if (!budget) return (
    <div className="page-body"><div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-3)' }}>
      <HardHat size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
      <div style={{ fontSize: 13 }}>Abre un proyecto para gestionar los contratos de obra.</div>
    </div></div>
  )
  if (loading) return <div className="page-body" style={{ padding: 60, textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando contratos…</div>

  // ════════ EDITOR DE PLANILLA (estimación acumulada de 4 partes) ════════
  if (selPlanilla) {
    const sel = selPlanilla
    const setSel = setSelPlanilla
    const editable = sel.estado === 'borrador' && canElaborar
    const t = totalesDe(sel)
    const setLineas = lineas_json => setSel({ ...sel, lineas_json })
    const addLinea = tipo => setLineas([...(sel.lineas_json || []), { id: uid(), tipo, actividadId: '', descripcion: '', unidad: '', cantidad: tipo === 'dia' ? 1 : '', pu: 0 }])
    const updLinea = (id, patch) => setLineas(sel.lineas_json.map(l => l.id === id ? { ...l, ...patch } : l))
    const delLinea = id => setLineas(sel.lineas_json.filter(l => l.id !== id))
    // Acumulado anterior por línea (cant + total) desde planillas previas del
    // mismo contrato (número menor). Bloqueado en el cuadro.
    const acumAnt = acumAntDe(sel)
    const anteriorDe = l => acumAnt[`${l.actividadId || ''}|${l.manoObraId || ''}`] || { cant: 0, total: 0 }
    const contratoDe = l => +l.cantContrato || (+actById[l.actividadId]?.cantidad) || 0
    const setDed = deducciones_json => setSel({ ...sel, deducciones_json })

    // ── DESTAJO: cuadro de estimación acumulada (Contrato | Anterior | Este
    // período | Acumulado). Contrato y acumulados bloqueados; editable solo la
    // cantidad de este período y el descuento. ──
    const lsDestajo = (sel.lineas_json || []).filter(l => l.tipo === 'destajo')
    const HG = { background: 'var(--c-ink)', color: 'var(--c-accent)', fontSize: 10, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }
    const renderDestajo = () => (
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><HardHat size={15} /> Obra por destajo</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="bt" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: 150 }}>Actividad</th>
                <th rowSpan={2}>Descripción</th>
                <th colSpan={3} style={HG}>Contrato de obra</th>
                <th colSpan={2} style={HG}>Período anterior</th>
                <th colSpan={2} style={HG}>Este período</th>
                <th colSpan={3} style={HG}>Acumulado</th>
              </tr>
              <tr>
                <th className="num" style={{ width: 70 }}>Cant.</th><th style={{ width: 48, textAlign: 'center' }}>Und</th><th className="num" style={{ width: 84 }}>P.U.</th>
                <th className="num" style={{ width: 70 }}>Cant.</th><th className="num" style={{ width: 96 }}>Total</th>
                <th className="num" style={{ width: 78 }}>Cant.</th><th className="num" style={{ width: 96 }}>Total</th>
                <th className="num" style={{ width: 70 }}>Cant.</th><th className="num" style={{ width: 96 }}>Total</th><th className="num" style={{ width: 54 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {lsDestajo.length === 0 && <tr><td colSpan={12} className="empty" style={{ padding: 18, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Esta planilla no tiene líneas de contrato.</td></tr>}
              {lsDestajo.map(l => {
                const cc = contratoDe(l)
                const ant = anteriorDe(l)
                const totEste = importeLinea(l)
                const cantAcum = round2(ant.cant + (+l.cantidad || 0))
                const totAcum = round2(ant.total + totEste)
                const pct = cc > 0 ? Math.round(cantAcum / cc * 100) : 0
                const num = { fontSize: 12, color: 'var(--c-text-2)' }
                return (
                  <tr key={l.id}>
                    <td style={{ verticalAlign: 'top', fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)', paddingTop: 8 }}>{l.actividadId || '—'}</td>
                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ fontSize: 12, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'justify', minWidth: 220, maxWidth: 380, paddingTop: 6 }}>{l.descripcion}</div>
                    </td>
                    {/* Contrato (bloqueado) */}
                    <td className="num" style={num}>{cc ? fmt(cc) : '—'}</td>
                    <td style={{ textAlign: 'center', ...num }}>{l.unidad || '—'}</td>
                    <td className="num" style={num}>{money(l.pu)}{(+l.descuento || 0) > 0 && <span style={{ fontSize: 9, color: 'var(--c-warn)', display: 'block' }}>−{fmt(l.descuento)}%</span>}</td>
                    {/* Período anterior (bloqueado) */}
                    <td className="num" style={num}>{fmt(ant.cant)}</td>
                    <td className="num" style={num}>{money(ant.total)}</td>
                    {/* Este período: SOLO la cantidad es editable, total formulado */}
                    <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={l.cantidad ?? ''} placeholder="0" onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { cantidad: e.target.value })} style={{ width: 72, textAlign: 'right', fontWeight: 700 }} /></td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(totEste)}</td>
                    {/* Acumulado (bloqueado) */}
                    <td className="num" style={{ ...num, fontWeight: 600 }}>{fmt(cantAcum)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(totAcum)}</td>
                    <td className="num" style={{ ...num, fontWeight: 700, color: pct >= 100 ? 'var(--c-success)' : 'var(--c-text-2)' }}>{cc ? `${pct}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            {lsDestajo.length > 0 && (
              <tfoot><tr>
                <td colSpan={8} style={{ textAlign: 'right', fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>SUBTOTAL ESTE PERÍODO</td>
                <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(t.destajo)}</td>
                <td colSpan={3} style={{ background: 'var(--c-ink)' }}></td>
              </tr></tfoot>
            )}
          </table>
        </div>
        {editable && <div style={{ fontSize: 11, color: 'var(--c-text-3)', padding: '8px 16px' }}>El contrato (cantidad, P.U., descuento) y los acumulados están bloqueados. Solo editas la <b>cantidad de este período</b> por línea.</div>}
      </div>
    )

    // ── PERSONAL AL DÍA / obras varias: tabla simple, sin contrato ──
    const lsDia = (sel.lineas_json || []).filter(l => l.tipo === 'dia')
    const renderDia = () => (
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><Users size={15} /> Personal al día / Obras varias</div>
          {editable && <button className="btn sm" onClick={() => addLinea('dia')}><Plus size={13} /> Agregar línea</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="bt">
            <thead><tr>
              <th>Descripción</th>
              <th style={{ width: 90, textAlign: 'center' }}>Unidad</th>
              <th className="num" style={{ width: 100 }}>Cantidad</th>
              <th className="num" style={{ width: 120 }}>P. Unitario</th>
              <th className="num" style={{ width: 120 }}>Importe</th>
              <th style={{ width: 44 }}></th>
            </tr></thead>
            <tbody>
              {lsDia.length === 0 && <tr><td colSpan={6} className="empty" style={{ padding: 18, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin líneas. {editable && 'Usa "Agregar línea".'}</td></tr>}
              {lsDia.map(l => (
                <tr key={l.id}>
                  <td><input className="input sm" disabled={!editable} placeholder="Descripción" value={l.descripcion} onChange={e => updLinea(l.id, { descripcion: e.target.value })} style={{ width: '100%' }} /></td>
                  <td><input className="input sm" disabled={!editable} placeholder="día, hora…" value={l.unidad} onChange={e => updLinea(l.id, { unidad: e.target.value })} style={{ width: 80, textAlign: 'center' }} /></td>
                  <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={l.cantidad} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { cantidad: e.target.value })} style={{ width: 86, textAlign: 'right' }} /></td>
                  <td className="num"><input type="number" min="0" step="any" className="input sm" disabled={!editable} value={l.pu} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { pu: e.target.value })} style={{ width: 106, textAlign: 'right' }} /></td>
                  <td className="num" style={{ fontWeight: 700 }}>{money(importeLinea(l))}</td>
                  <td>{editable && <button className="btn xs danger icon" onClick={() => delLinea(l.id)}><Trash2 size={11} /></button>}</td>
                </tr>
              ))}
            </tbody>
            {lsDia.length > 0 && (
              <tfoot><tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>SUBTOTAL PERSONAL AL DÍA</td>
                <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(t.dia)}</td>
                <td style={{ background: 'var(--c-ink)' }}></td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
    )

    return (
      <Fragment>
        <div className="page-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn sm ghost" onClick={() => setSel(null)}><ChevronLeft size={14} /> Contrato</button>
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

          {renderDestajo()}
          {renderDia()}

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
              {((+sel.pct_retencion || 0) + (+sel.pct_amortizacion || 0) > 100 || t.neto < 0) && (
                <div style={{ padding: '8px 16px', background: '#fee2e2', color: '#991b1b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <X size={14} /> {t.neto < 0 ? 'El neto a pagar es negativo.' : 'Retención + amortización superan el 100%.'} Revisa los porcentajes/deducciones.
                </div>
              )}
            </div>
          </div>
        </div>
      </Fragment>
    )
  }

  // ════════ EDITOR DE CONTRATO DE OBRA ════════
  if (selContrato) {
    const c = selContrato
    const setC = setSelContrato
    const cEditable = canElaborar && c.estado !== 'cerrado'
    const lineas = c.lineas_json || []
    const monto = montoContrato(c)
    const setLineas = lineas_json => setC({ ...c, lineas_json })
    const addLinea = () => setLineas([...lineas, { id: uid(), tipo: 'destajo', actividadId: '', descripcion: '', unidad: '', cantidad: 0, pu: 0, descuento: 0 }])
    const updLinea = (id, patch) => setLineas(lineas.map(l => l.id === id ? { ...l, ...patch } : l))
    const delLinea = id => setLineas(lineas.filter(l => l.id !== id))
    const descComun = lineas.length && lineas.every(l => (+l.descuento || 0) === (+lineas[0].descuento || 0)) ? (+lineas[0].descuento || 0) : ''
    const setDescTodas = v => setLineas(lineas.map(l => ({ ...l, descuento: v })))
    const yaEnContrato = new Set(lineas.filter(l => l.actividadId && !l.manoObraId).map(l => l.actividadId))
    const yaCombos = new Set(lineas.filter(l => l.manoObraId).map(l => `${l.actividadId}|${l.manoObraId}`))
    const generarActividad = ids => {
      const nuevas = ids.map(id => {
        const a = actById[id]
        return { id: uid(), tipo: 'destajo', actividadId: id, capId: a.capId, descripcion: a.descripcion, unidad: a.unidad, cantidad: +a.cantidad || 0, pu: round2(moUnit[id] || 0), descuento: 0 }
      })
      setLineas([...lineas, ...nuevas]); setShowGen(false)
    }
    const generarOficio = combos => {
      const nuevas = combos.map(({ moId, actId }) => {
        const o = porOficio[moId]; const a = o?.acts.find(x => x.id === actId)
        if (!o || !a) return null
        return { id: uid(), tipo: 'destajo', actividadId: actId, manoObraId: moId, capId: a.capId, descripcion: `${o.insumo.descripcion} · ${a.descripcion}`, unidad: a.unidad, cantidad: +a.cantidad || 0, pu: round2(a.pu), descuento: 0 }
      }).filter(Boolean)
      setLineas([...lineas, ...nuevas]); setShowGenMO(false)
    }
    const planillasContrato = planillas.filter(p => p.contrato_id === c.id).sort((a, b) => a.numero - b.numero)

    return (
      <Fragment>
        <div className="page-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn sm ghost" onClick={() => setSelContrato(null)}><ChevronLeft size={14} /> Contratos</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Contrato de Obra</div>
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{c.contratista} · {budget.nombreProyecto}</div>
            </div>
          </div>
          <div className="page-head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cEditable && <button className="btn primary" disabled={busy} onClick={async () => { if (await guardarContrato(c)) alert('💾 Contrato guardado.') }}><Check size={13} /> {busy ? 'Guardando…' : 'Guardar'}</button>}
            {canElaborar && <button className="btn brand" disabled={busy} onClick={async () => { await guardarContrato(c); generarPlanilla(c) }}><FileText size={13} /> Generar nueva planilla</button>}
          </div>
        </div>

        <div className="page-body">
          <div className="kpi-row" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <div className="kpi-label">Contratista</div>
              <input className="input" disabled={!cEditable} value={c.contratista || ''} onChange={e => setC({ ...c, contratista: e.target.value })} style={{ marginTop: 4, fontWeight: 700 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">Retención %</div>
              <input type="number" min="0" max="100" step="any" className="input" disabled={!cEditable} value={c.pct_retencion ?? 0} onFocus={e => e.target.select()} onChange={e => setC({ ...c, pct_retencion: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi">
              <div className="kpi-label">Amortización anticipo %</div>
              <input type="number" min="0" max="100" step="any" className="input" disabled={!cEditable} value={c.pct_amortizacion ?? 0} onFocus={e => e.target.select()} onChange={e => setC({ ...c, pct_amortizacion: e.target.value })} style={{ marginTop: 4 }} />
            </div>
            <div className="kpi highlight">
              <div className="kpi-label"><DollarSign size={12} className="ico" /> Monto del contrato</div>
              <div className="kpi-val" style={{ fontSize: 18 }}>{money(monto)}</div>
            </div>
          </div>

          {/* Líneas del contrato */}
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title"><HardHat size={15} /> Obra por destajo (contrato)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {lineas.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Descuento % a todas:</span>
                    <input type="number" min="0" max="100" step="any" className="input sm" disabled={!cEditable} value={descComun} placeholder="0"
                      onChange={e => setDescTodas(Math.max(0, Math.min(100, +e.target.value || 0)))} style={{ width: 64, textAlign: 'right', fontWeight: 700 }} />
                  </div>
                )}
                {cEditable && <button className="btn sm brand" onClick={() => setShowGen(true)}><Wand2 size={13} /> Generar por actividad</button>}
                {cEditable && <button className="btn sm" onClick={() => setShowGenMO(true)}><HardHat size={13} /> Generar por oficio</button>}
                {cEditable && <button className="btn sm" onClick={addLinea}><Plus size={13} /> Agregar línea</button>}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="bt" style={{ minWidth: 980 }}>
                <thead><tr>
                  <th style={{ width: 120 }}>Actividad</th>
                  <th>Descripción</th>
                  <th className="num" style={{ width: 96 }}>Cantidad</th>
                  <th style={{ width: 64, textAlign: 'center' }}>Und</th>
                  <th className="num" style={{ width: 110 }}>P. Unitario</th>
                  <th className="num" style={{ width: 84 }}>Desc. %</th>
                  <th className="num" style={{ width: 130 }}>Subtotal</th>
                  <th style={{ width: 40 }}></th>
                </tr></thead>
                <tbody>
                  {lineas.length === 0 && <tr><td colSpan={8} className="empty" style={{ padding: 18, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin líneas. {cEditable && 'Usa "Generar por actividad/oficio" o "Agregar línea".'}</td></tr>}
                  {lineas.map(l => {
                    const ligada = !!l.actividadId
                    const lock = !cEditable || ligada
                    const num = { fontSize: 12, color: 'var(--c-text-2)' }
                    return (
                      <tr key={l.id}>
                        <td style={{ verticalAlign: 'top', fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)', paddingTop: 8 }}>{l.actividadId || '—'}</td>
                        <td style={{ verticalAlign: 'top' }}>
                          {lock
                            ? <div style={{ fontSize: 12, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'justify', minWidth: 220, maxWidth: 420, paddingTop: 6 }}>{l.descripcion}</div>
                            : <input className="input sm" value={l.descripcion} onChange={e => updLinea(l.id, { descripcion: e.target.value })} style={{ width: '100%', minWidth: 220 }} />}
                        </td>
                        <td className="num">{lock ? <span style={num}>{fmt(l.cantidad)}</span> : <input type="number" min="0" step="any" className="input sm" value={l.cantidad} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { cantidad: e.target.value })} style={{ width: 88, textAlign: 'right' }} />}</td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 8 }}>{lock ? <span style={num}>{l.unidad || '—'}</span> : <input className="input sm" value={l.unidad} onChange={e => updLinea(l.id, { unidad: e.target.value })} style={{ width: 56, textAlign: 'center' }} />}</td>
                        <td className="num">{lock ? <span style={num}>{money(l.pu)}</span> : <input type="number" min="0" step="any" className="input sm" value={l.pu} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { pu: e.target.value })} style={{ width: 96, textAlign: 'right' }} />}</td>
                        <td className="num"><input type="number" min="0" max="100" step="any" className="input sm" disabled={!cEditable} value={l.descuento ?? 0} onFocus={e => e.target.select()} onChange={e => updLinea(l.id, { descuento: Math.max(0, Math.min(100, +e.target.value || 0)) })} style={{ width: 70, textAlign: 'right' }} /></td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(importeLinea(l))}</td>
                        <td>{cEditable && <button className="btn xs danger icon" onClick={() => delLinea(l.id)}><Trash2 size={11} /></button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {lineas.length > 0 && (
                  <tfoot><tr>
                    <td colSpan={6} style={{ textAlign: 'right', fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>MONTO DEL CONTRATO</td>
                    <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(monto)}</td>
                    <td style={{ background: 'var(--c-ink)' }}></td>
                  </tr></tfoot>
                )}
              </table>
            </div>
            {cEditable && <div style={{ fontSize: 11, color: 'var(--c-text-3)', padding: '8px 16px' }}>El descuento se aplica sobre el P. Unitario de cada actividad. <b>Subtotal = Cantidad × P.U. × (1 − descuento%)</b>. Las planillas se generan a partir de este contrato.</div>}
          </div>

          {/* Planillas del contrato */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <div className="card-title"><FileText size={15} /> Planillas de este contrato</div>
              {canElaborar && <button className="btn sm brand" disabled={busy} onClick={async () => { await guardarContrato(c); generarPlanilla(c) }}><Plus size={13} /> Generar nueva planilla</button>}
            </div>
            {planillasContrato.length === 0
              ? <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Aún no hay planillas. Genera la primera estimación periódica desde este contrato.</div>
              : (
                <table className="bt">
                  <thead><tr>
                    <th style={{ width: 60 }}>No.</th>
                    <th style={{ width: 200 }}>Periodo</th>
                    <th style={{ width: 110 }}>Estado</th>
                    <th className="num">Neto a pagar</th>
                    <th style={{ width: 170 }}></th>
                  </tr></thead>
                  <tbody>
                    {planillasContrato.map(p => (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSelPlanilla(p)}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{p.numero}</td>
                        <td style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{p.periodo_inicio || '—'} → {p.periodo_fin || '—'}</td>
                        <td><Chip estado={p.estado} /></td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(totalesDe(p).neto)}</td>
                        <td className="actions" onClick={ev => ev.stopPropagation()}>
                          <button className="btn xs" onClick={() => setSelPlanilla(p)}>Abrir</button>
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
        <GenerarDestajoModal open={showGen} onClose={() => setShowGen(false)} acts={acts} moUnit={moUnit}
          money={money} yaEnContrato={yaEnContrato} onConfirmar={generarActividad} />
        <GenerarPorOficioModal open={showGenMO} onClose={() => setShowGenMO(false)} porOficio={porOficio}
          money={money} yaCombos={yaCombos} onConfirmar={generarOficio} />
      </Fragment>
    )
  }

  // ════════ LISTA DE CONTRATOS ════════
  const totalPagado = round2(planillas.filter(p => ['aprobada', 'pagada'].includes(p.estado)).reduce((s, p) => s + totalesDe(p).neto, 0))
  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Contratos de Obra — {budget.nombreProyecto}</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{contratos.length} contrato{contratos.length !== 1 ? 's' : ''}</div>
        </div>
        {canElaborar && <button className="btn brand" onClick={nuevoContrato}><Plus size={14} strokeWidth={2.5} /> Nuevo Contrato de Obra</button>}
      </div>

      <div className="page-body">
        <div className="kpi-row" style={{ marginBottom: 16 }}>
          <div className="kpi highlight">
            <div className="kpi-label"><DollarSign size={12} className="ico" /> Pagado a contratistas</div>
            <div className="kpi-val" style={{ fontSize: 18 }}>{money(totalPagado)}</div>
            <div className="kpi-foot">planillas aprobadas + pagadas</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><Users size={12} className="ico" /> Contratos</div>
            <div className="kpi-val" style={{ fontSize: 18 }}>{contratos.length}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {contratos.length === 0
            ? <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <HardHat size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-2)' }}>Aún no hay contratos de obra</div>
                <div style={{ fontSize: 13 }}>Crea un contrato con un destajista: elige sus actividades, fija el descuento y genera las planillas periódicas.</div>
              </div>
            : (
              <table className="bt">
                <thead><tr>
                  <th>Contratista</th>
                  <th style={{ width: 110, textAlign: 'center' }}>Planillas</th>
                  <th className="num">Monto del contrato</th>
                  <th style={{ width: 150 }}></th>
                </tr></thead>
                <tbody>
                  {contratos.map(c => {
                    const nPlan = planillas.filter(p => p.contrato_id === c.id).length
                    return (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelContrato(c)}>
                        <td style={{ fontWeight: 600 }}>{c.contratista || '—'}</td>
                        <td style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{nPlan}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(c.monto_contrato ?? montoContrato(c))}</td>
                        <td className="actions" onClick={ev => ev.stopPropagation()}>
                          <button className="btn xs" onClick={() => setSelContrato(c)}>Abrir</button>
                          {canElaborar && <button className="btn xs danger icon" style={{ marginLeft: 4 }} onClick={() => eliminarContrato(c)}><Trash2 size={11} /></button>}
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
