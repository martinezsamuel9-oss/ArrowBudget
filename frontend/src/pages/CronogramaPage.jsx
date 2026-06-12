// ============ CRONOGRAMA PAGE (Fase II · módulo 1) ============
// Crear cronograma desde el presupuesto, editar duración/predecesoras por
// actividad y fecha de inicio del proyecto. Tabs: Gantt, Flujo de caja,
// Avance físico, Avance financiero, Curva S (los demás módulos se montan aquí).
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { calcItem, makeMoneyFmt, moneyK } from '../lib/calc'
import { flattenActividades, calcularFechas, resumenCronograma, parsePredecesoras, fmtFecha, hoyISO, addDays, pctPlanificado, pctReal, avanceGlobal, flujoDeCaja } from '../lib/cronograma'
import {
  CalendarRange, BarChart2, Coins, Activity, TrendingUp, LineChart,
  Plus, FileText, AlertTriangle,
} from 'lucide-react'

const TABS = [
  { k: 'gantt',      label: 'Gantt',             Icon: BarChart2 },
  { k: 'flujo',      label: 'Flujo de Caja',     Icon: Coins },
  { k: 'fisico',     label: 'Avance Físico',     Icon: Activity },
  { k: 'financiero', label: 'Avance Financiero', Icon: TrendingUp },
  { k: 'curvas',     label: 'Curva S',           Icon: LineChart },
]

// ── Gantt visual (módulo 2): barras por actividad agrupadas por capítulo ──
const DAY_MS = 86400000
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function GanttChart({ acts, fechas, datos }) {
  const [pxDia, setPxDia] = useState(8)   // 24 = día, 8 = semana, 2.5 = mes

  const programadas = acts.filter(a => datos[a.id] && fechas[a.id])
  let min = null, max = null
  for (const a of programadas) {
    const f = fechas[a.id]
    if (!min || f.inicio < min) min = f.inicio
    if (!max || f.fin > max) max = f.fin
  }
  if (!min) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin actividades programadas.</div>

  const start = addDays(min, -2)
  const end   = addDays(max, 7)
  const dias  = Math.round((end - start) / DAY_MS)
  const X     = d => ((d - start) / DAY_MS) * pxDia
  const W     = dias * pxDia
  const LBL   = 250   // ancho de la columna fija de etiquetas

  // Encabezado de meses
  const meses = []
  { let c = new Date(start)
    while (c < end) {
      const finMes = new Date(c.getFullYear(), c.getMonth() + 1, 1)
      const hasta = finMes < end ? finMes : end
      meses.push({ label: `${MESES_CORTOS[c.getMonth()]} ${String(c.getFullYear()).slice(2)}`, left: X(c), width: X(hasta) - X(c) })
      c = finMes
    } }

  // Ticks semanales (lunes)
  const semanas = []
  { let c = new Date(start)
    c.setDate(c.getDate() + ((8 - c.getDay()) % 7))   // próximo lunes
    while (c < end) { semanas.push({ left: X(c), dia: c.getDate() }); c = addDays(c, 7) } }

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const hoyX = (hoy >= start && hoy <= end) ? X(hoy) : null

  // Agrupar por capítulo con su rango global
  const caps = []
  for (const a of programadas) {
    let g = caps.find(c => c.capId === a.capId)
    if (!g) { g = { capId: a.capId, capDesc: a.capDesc, acts: [], min: null, max: null }; caps.push(g) }
    const f = fechas[a.id]
    g.acts.push(a)
    if (!g.min || f.inicio < g.min) g.min = f.inicio
    if (!g.max || f.fin > g.max) g.max = f.fin
  }

  const ROW = 30
  const filaBase = { display: 'flex', alignItems: 'center', height: ROW, borderBottom: '1px solid var(--c-line-2)' }
  const lblBase  = { position: 'sticky', left: 0, zIndex: 2, width: LBL, minWidth: LBL, padding: '0 12px', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid var(--c-line)', height: '100%', display: 'flex', alignItems: 'center' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '10px 14px 0' }}>
        {[['Día', 24], ['Semana', 8], ['Mes', 2.5]].map(([lbl, v]) => (
          <button key={lbl} className={`btn xs ${pxDia === v ? 'primary' : 'ghost'}`} onClick={() => setPxDia(v)}>{lbl}</button>
        ))}
      </div>
      <div style={{ overflowX: 'auto', margin: '10px 0 4px' }}>
        <div style={{ width: LBL + W, minWidth: '100%' }}>
          {/* Encabezado: meses + semanas */}
          <div style={{ ...filaBase, height: 26, borderBottom: '1px solid var(--c-line)' }}>
            <div style={{ ...lblBase, background: 'var(--c-surface)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-3)' }}>Actividad</div>
            <div style={{ position: 'relative', width: W, height: '100%' }}>
              {meses.map((m, i) => (
                <div key={i} style={{ position: 'absolute', left: m.left, width: m.width, top: 0, bottom: 0, borderLeft: '1px solid var(--c-line)', fontSize: 10, fontWeight: 700, color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', paddingLeft: 6, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden' }}>
                  {m.width > 34 ? m.label : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Filas */}
          {caps.map(g => (
            <Fragment key={g.capId || 'sin-cap'}>
              {/* Banda del capítulo con barra resumen */}
              <div style={{ ...filaBase, background: 'var(--c-bg)' }}>
                <div style={{ ...lblBase, background: 'var(--c-bg)', fontWeight: 700, color: 'var(--c-text)' }}>
                  {g.capId} · {g.capDesc}
                </div>
                <div style={{ position: 'relative', width: W, height: '100%' }}>
                  {semanas.map((s, i) => pxDia >= 4 && <div key={i} style={{ position: 'absolute', left: s.left, top: 0, bottom: 0, borderLeft: '1px dashed var(--c-line-2)' }} />)}
                  <div title={`${fmtFecha(g.min)} → ${fmtFecha(addDays(g.max, -1))}`}
                    style={{ position: 'absolute', left: X(g.min), width: Math.max(3, X(g.max) - X(g.min)), top: 11, height: 7, borderRadius: 4, background: 'var(--c-ink)' }} />
                  {hoyX != null && <div style={{ position: 'absolute', left: hoyX, top: 0, bottom: 0, borderLeft: '2px solid var(--c-danger)', opacity: 0.55 }} />}
                </div>
              </div>
              {/* Actividades */}
              {g.acts.map(a => {
                const f = fechas[a.id]
                const w = Math.max(3, X(f.fin) - X(f.inicio))
                const avance = pctReal(datos[a.id]?.avances)
                return (
                  <div key={a.id} style={filaBase}>
                    <div style={{ ...lblBase, background: 'var(--c-surface)', color: 'var(--c-text-2)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-text-3)', marginRight: 6, flexShrink: 0 }}>{a.id}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.descripcion}</span>
                    </div>
                    <div style={{ position: 'relative', width: W, height: '100%' }}>
                      {semanas.map((s, i) => pxDia >= 4 && <div key={i} style={{ position: 'absolute', left: s.left, top: 0, bottom: 0, borderLeft: '1px dashed var(--c-line-2)' }} />)}
                      <div title={`${a.id} — ${a.descripcion}\n${fmtFecha(f.inicio)} → ${fmtFecha(addDays(f.fin, -1))} · ${f.dur} días · avance ${avance}%`}
                        style={{ position: 'absolute', left: X(f.inicio), width: w, top: 7, height: 16, borderRadius: 5, background: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {/* Relleno de avance real registrado */}
                        {avance > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${avance}%`, background: 'var(--c-success)', opacity: 0.85 }} />}
                        {w > 44 && <span style={{ position: 'relative', fontSize: 9.5, color: '#fff', fontWeight: 700 }}>{avance > 0 ? `${avance}%` : `${f.dur}d`}</span>}
                      </div>
                      {hoyX != null && <div style={{ position: 'absolute', left: hoyX, top: 0, bottom: 0, borderLeft: '2px solid var(--c-danger)', opacity: 0.55 }} />}
                    </div>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, padding: '8px 14px 12px', fontSize: 11, color: 'var(--c-text-3)', alignItems: 'center' }}>
        <span><span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 3, background: 'var(--c-primary)', marginRight: 5, verticalAlign: 'middle' }}></span>Programado</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 3, background: 'var(--c-success)', marginRight: 5, verticalAlign: 'middle' }}></span>Avance real</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 5, borderRadius: 3, background: 'var(--c-ink)', marginRight: 5, verticalAlign: 'middle' }}></span>Capítulo</span>
        <span><span style={{ display: 'inline-block', width: 2, height: 12, background: 'var(--c-danger)', marginRight: 5, verticalAlign: 'middle' }}></span>Hoy</span>
      </div>
    </div>
  )
}

// Chip de estado de una actividad según plan vs real a la fecha de corte
function EstadoAvance({ plan, real }) {
  let txt, bg, fg
  if (real >= 100)           { txt = 'Completada'; bg = 'var(--c-success)'; fg = '#fff' }
  else if (plan === 0 && real === 0) { txt = 'No iniciada'; bg = '#9ca3af22'; fg = '#6b7280' }
  else if (real < plan - 3)  { txt = 'Atrasada'; bg = '#fee2e2'; fg = '#991b1b' }
  else if (real > plan + 3)  { txt = 'Adelantada'; bg = '#dbeafe'; fg = '#1d4ed8' }
  else                       { txt = 'Al día'; bg = '#d1fae5'; fg = '#065f46' }
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: bg, color: fg, whiteSpace: 'nowrap' }}>{txt}</span>
}

export default function CronogramaPage({ budget, projectRole, user, params }) {
  const [crono, setCrono] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('gantt')
  const [vistaGantt, setVistaGantt] = useState('gantt')   // 'gantt' visual | 'editar' programación
  const [corte, setCorte] = useState(hoyISO())            // fecha de corte del avance físico
  const [modoFlujo, setModoFlujo] = useState('semana')    // 'semana' | 'mes'
  const [saving, setSaving] = useState(false)
  const loadedIdRef = useRef(null)
  const pendingRef = useRef(null)
  const savingRef = useRef(false)

  const canEdit = puedeHacer(projectRole, 'editarPresupuesto')

  // ── Cargar el cronograma del proyecto activo ──
  useEffect(() => {
    let cancel = false
    const cargar = async () => {
      if (!budget?.id) { setCrono(null); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase.from('cronogramas').select('*').eq('presupuesto_id', budget.id).maybeSingle()
      if (!cancel) { setCrono(data || null); loadedIdRef.current = data?.id || null; setLoading(false) }
    }
    cargar()
    return () => { cancel = true }
  }, [budget?.id])

  // ── Auto-guardado con debounce (mismo patrón que el presupuesto) ──
  const flushSave = async () => {
    if (savingRef.current || !pendingRef.current) return
    savingRef.current = true; setSaving(true)
    const c = pendingRef.current
    pendingRef.current = null
    const { error } = await supabase.from('cronogramas')
      .update({ fecha_inicio: c.fecha_inicio, datos_json: c.datos_json, updated_at: new Date().toISOString() })
      .eq('id', c.id)
    if (error) console.error('[cronograma] Error al guardar:', error.message)
    savingRef.current = false; setSaving(false)
    if (pendingRef.current) flushSave()
  }
  useEffect(() => {
    if (!crono || crono.id !== loadedIdRef.current) { loadedIdRef.current = crono?.id || null; return }
    pendingRef.current = crono
    const t = setTimeout(flushSave, 1200)
    return () => clearTimeout(t)
  }, [crono]) // eslint-disable-line

  // ── Derivados ──
  const acts = useMemo(() => flattenActividades(budget?.items || []), [budget?.items])
  const datos = crono?.datos_json?.actividades || {}
  const fechas = useMemo(
    () => calcularFechas(acts, crono?.fecha_inicio, datos),
    [acts, crono?.fecha_inicio, datos],
  )
  const resumen = useMemo(() => resumenCronograma(acts, fechas), [acts, fechas])
  const idsValidos = useMemo(() => new Set(acts.map(a => a.id)), [acts])

  // Peso de cada actividad = su costo en el presupuesto (para el avance ponderado)
  const pesos = useMemo(() => {
    const map = {}
    const walk = its => { for (const it of (its || [])) {
      if (it.tipo === 'actividad') map[it.id] = calcItem(it, budget?.catalogos, params).subtotal || 1
      else if (it.children) walk(it.children)
    } }
    walk(budget?.items || [])
    return map
  }, [budget?.items, budget?.catalogos, params])

  const global = useMemo(() => avanceGlobal(acts, fechas, datos, pesos, corte), [acts, fechas, datos, pesos, corte])
  const flujo = useMemo(() => flujoDeCaja(acts, fechas, datos, pesos, modoFlujo), [acts, fechas, datos, pesos, modoFlujo])
  const money = makeMoneyFmt(budget?.moneda)

  // Registrar % real de una actividad en la fecha de corte activa
  const registrarAvance = (id, pct) => {
    const v = Math.max(0, Math.min(100, Math.round(+pct) || 0))
    const d = datos[id] || { duracion: 7, predecesoras: [] }
    const avances = [...(d.avances || [])].filter(x => x.fecha !== corte)
    avances.push({ fecha: corte, pct: v })
    avances.sort((a, b) => a.fecha.localeCompare(b.fecha))
    updActividad(id, { avances })
  }

  const updActividad = (id, patch) => {
    const actividades = { ...(crono.datos_json?.actividades || {}) }
    actividades[id] = { ...(actividades[id] || { duracion: 7, predecesoras: [] }), ...patch }
    setCrono({ ...crono, datos_json: { ...crono.datos_json, actividades } })
  }

  const crear = async () => {
    if (!acts.length) return alert('El presupuesto no tiene actividades aún. Agrega actividades antes de crear el cronograma.')
    const actividades = {}
    acts.forEach(a => { actividades[a.id] = { duracion: 7, predecesoras: [], avances: [] } })
    const { data, error } = await supabase.from('cronogramas').insert({
      presupuesto_id: budget.id,
      fecha_inicio: hoyISO(),
      datos_json: { actividades },
      created_by: user?.id || null,
    }).select().single()
    if (error) {
      alert('Error al crear el cronograma: ' + error.message +
        (/cronogramas/.test(error.message) ? '\n\n(¿Se ejecutó supabase/fase2/fase2_01_cronograma.sql?)' : ''))
      return
    }
    loadedIdRef.current = data.id
    setCrono(data)
  }

  // Actividades nuevas en el presupuesto que aún no están en el cronograma
  const sinProgramar = acts.filter(a => !datos[a.id])
  const incorporar = () => {
    const actividades = { ...(crono.datos_json?.actividades || {}) }
    sinProgramar.forEach(a => { actividades[a.id] = { duracion: 7, predecesoras: [], avances: [] } })
    setCrono({ ...crono, datos_json: { ...crono.datos_json, actividades } })
  }

  // ── Estados vacíos ──
  if (!budget) return (
    <div className="page-body">
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-3)' }}>
        <CalendarRange size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
        <div style={{ fontSize: 13 }}>Abre un proyecto desde la sección Proyectos para trabajar su cronograma.</div>
      </div>
    </div>
  )
  if (loading) return <div className="page-body" style={{ padding: 60, textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando cronograma…</div>

  if (!crono) return (
    <div className="page-body">
      <div style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--c-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <CalendarRange size={30} color="var(--c-accent)" />
        </div>
        <h2 style={{ margin: '0 0 8px', color: 'var(--c-text)' }}>Cronograma de ejecución</h2>
        <p style={{ fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.6, marginBottom: 6 }}>
          Genera el cronograma de <b>{budget.nombreProyecto}</b> a partir de sus{' '}
          <b>{acts.length} actividades</b>: asigna duraciones, encadena predecesoras y obtén
          el Gantt, flujo de caja y curva S automáticamente.
        </p>
        {canEdit ? (
          <button className="btn brand" style={{ marginTop: 14, padding: '12px 24px', fontSize: 14 }} onClick={crear}>
            <Plus size={15} strokeWidth={2.5} /> Crear cronograma desde presupuesto
          </button>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Tu rol no permite crear el cronograma — pídelo a un gerente o ing. de costos.</p>
        )}
      </div>
    </div>
  )

  // ── Vista principal ──
  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Cronograma — {budget.nombreProyecto}</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>
            {acts.length} actividades · {saving ? 'Guardando…' : 'Guardado'}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ padding: '14px 24px 0' }}>
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label"><CalendarRange size={12} className="ico" /> Fecha de inicio</div>
            <input type="date" className="input" disabled={!canEdit}
              value={crono.fecha_inicio || hoyISO()}
              onChange={e => setCrono({ ...crono, fecha_inicio: e.target.value })}
              style={{ marginTop: 4, fontWeight: 700 }} />
          </div>
          <div className="kpi">
            <div className="kpi-label"><Activity size={12} className="ico" /> Duración total</div>
            <div className="kpi-val">{resumen.dias} días</div>
            <div className="kpi-foot">camino más largo según predecesoras</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><FileText size={12} className="ico" /> Fin estimado</div>
            <div className="kpi-val" style={{ fontSize: 18 }}>{resumen.fin ? fmtFecha(addDays(resumen.fin, -1)) : '—'}</div>
            <div className="kpi-foot">última actividad programada</div>
          </div>
        </div>

        {sinProgramar.length > 0 && (
          <div style={{ margin: '12px 0 0', padding: '10px 14px', borderRadius: 10, background: 'var(--c-accent-soft)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <AlertTriangle size={15} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Hay <b>{sinProgramar.length} actividad(es) nuevas</b> en el presupuesto que no están en el cronograma.</span>
            {canEdit && <button className="btn sm primary" onClick={incorporar}>Incorporarlas</button>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ borderBottom: '1px solid var(--c-line)', margin: '14px 0 0', padding: '0 24px' }}>
        {TABS.map(({ k, label, Icon }) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="page-body">
        {tab === 'gantt' && (
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <div className="card-title"><BarChart2 size={15} /> {vistaGantt === 'gantt' ? 'Diagrama de Gantt' : 'Programación de actividades'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {vistaGantt === 'editar' && <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Predecesoras: IDs separados por coma (ej: 1.01, 1.02)</span>}
                <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg)', padding: 3, borderRadius: 8 }}>
                  <button className={`btn xs ${vistaGantt === 'gantt' ? 'primary' : 'ghost'}`} onClick={() => setVistaGantt('gantt')}>Gantt</button>
                  <button className={`btn xs ${vistaGantt === 'editar' ? 'primary' : 'ghost'}`} onClick={() => setVistaGantt('editar')}>Editar programación</button>
                </div>
              </div>
            </div>
            {vistaGantt === 'gantt' && <GanttChart acts={acts} fechas={fechas} datos={datos} />}
            {vistaGantt === 'editar' && (
            <div style={{ overflowX: 'auto' }}>
              <table className="bt">
                <thead><tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>Actividad</th>
                  <th className="num" style={{ width: 100 }}>Duración (días)</th>
                  <th style={{ width: 160 }}>Predecesoras</th>
                  <th style={{ width: 100 }}>Inicio</th>
                  <th style={{ width: 100 }}>Fin</th>
                </tr></thead>
                <tbody>
                  {(() => {
                    const rows = []
                    let lastCap = null
                    for (const a of acts) {
                      if (a.capId !== lastCap) {
                        lastCap = a.capId
                        rows.push(
                          <tr key={`cap-${a.capId}`}>
                            <td colSpan={6} style={{ background: 'var(--c-ink)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 12, padding: '7px 14px' }}>
                              {a.capId} · {a.capDesc}
                            </td>
                          </tr>
                        )
                      }
                      const d = datos[a.id] || {}
                      const f = fechas[a.id]
                      rows.push(
                        <tr key={a.id} style={{ opacity: datos[a.id] ? 1 : 0.45 }}>
                          <td className="id">{a.id}</td>
                          <td style={{ fontWeight: 500 }}>{a.descripcion}</td>
                          <td className="num">
                            <input type="number" min="1" className="input sm" disabled={!canEdit || !datos[a.id]}
                              value={d.duracion ?? 7}
                              onFocus={e => e.target.select()}
                              onChange={e => updActividad(a.id, { duracion: Math.max(1, parseInt(e.target.value) || 1) })}
                              style={{ width: 72, textAlign: 'right' }} />
                          </td>
                          <td>
                            <input className="input sm" disabled={!canEdit || !datos[a.id]}
                              defaultValue={(d.predecesoras || []).join(', ')}
                              placeholder="—"
                              onBlur={e => updActividad(a.id, { predecesoras: parsePredecesoras(e.target.value, idsValidos, a.id) })}
                              style={{ width: 140, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                            {f?.circular && <span title="Referencia circular — se ancló al inicio del proyecto" style={{ color: 'var(--c-danger)', marginLeft: 4 }}>⚠</span>}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{f ? fmtFecha(f.inicio) : '—'}</td>
                          <td style={{ fontSize: 12, fontWeight: 600 }}>{f ? fmtFecha(addDays(f.fin, -1)) : '—'}</td>
                        </tr>
                      )
                    }
                    return rows
                  })()}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {tab === 'fisico' && (
          <Fragment>
            {/* KPIs del avance a la fecha de corte */}
            <div className="kpi-row" style={{ marginBottom: 14 }}>
              <div className="kpi">
                <div className="kpi-label"><CalendarRange size={12} className="ico" /> Fecha de corte</div>
                <input type="date" className="input" value={corte} onChange={e => setCorte(e.target.value || hoyISO())} style={{ marginTop: 4, fontWeight: 700 }} />
              </div>
              <div className="kpi highlight">
                <div className="kpi-label"><Activity size={12} className="ico" /> Avance real</div>
                <div className="kpi-val">{global.real}%</div>
                <div className="kpi-foot">ponderado por costo de actividad</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><TrendingUp size={12} className="ico" /> Avance planificado</div>
                <div className="kpi-val">{global.plan}%</div>
                <div className="kpi-foot">según el Gantt a la fecha de corte</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><AlertTriangle size={12} className="ico" /> Desviación</div>
                <div className="kpi-val" style={{ color: global.real - global.plan < -3 ? 'var(--c-danger)' : global.real - global.plan > 3 ? 'var(--c-primary)' : 'var(--c-success)' }}>
                  {global.real - global.plan > 0 ? '+' : ''}{global.real - global.plan}%
                </div>
                <div className="kpi-foot">{global.real - global.plan < -3 ? 'proyecto atrasado' : global.real - global.plan > 3 ? 'proyecto adelantado' : 'al día'}</div>
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <div className="card-title"><Activity size={15} /> Avance físico por actividad</div>
                <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>El % se registra con la fecha de corte seleccionada — cada corte queda en el historial</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="bt">
                  <thead><tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th>Actividad</th>
                    <th style={{ width: 130 }}>Programada</th>
                    <th className="num" style={{ width: 80 }}>% Plan</th>
                    <th className="num" style={{ width: 96 }}>% Real</th>
                    <th style={{ width: 150 }}>Progreso</th>
                    <th style={{ width: 100 }}>Estado</th>
                  </tr></thead>
                  <tbody>
                    {(() => {
                      const rows = []
                      let lastCap = null
                      for (const a of acts) {
                        if (!datos[a.id]) continue
                        if (a.capId !== lastCap) {
                          lastCap = a.capId
                          rows.push(
                            <tr key={`cap-${a.capId}`}>
                              <td colSpan={7} style={{ background: 'var(--c-ink)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 12, padding: '7px 14px' }}>
                                {a.capId} · {a.capDesc}
                              </td>
                            </tr>
                          )
                        }
                        const f = fechas[a.id]
                        const plan = pctPlanificado(f, corte)
                        const real = pctReal(datos[a.id].avances, corte)
                        rows.push(
                          <tr key={a.id}>
                            <td className="id">{a.id}</td>
                            <td style={{ fontWeight: 500 }}>{a.descripcion}</td>
                            <td style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{f ? `${fmtFecha(f.inicio)} → ${fmtFecha(addDays(f.fin, -1))}` : '—'}</td>
                            <td className="num" style={{ color: 'var(--c-text-3)' }}>{plan}%</td>
                            <td className="num">
                              <input type="number" min="0" max="100" className="input sm" disabled={!canEdit}
                                value={real} onFocus={e => e.target.select()}
                                onChange={e => registrarAvance(a.id, e.target.value)}
                                style={{ width: 70, textAlign: 'right', fontWeight: 700 }} />
                            </td>
                            <td>
                              <div style={{ position: 'relative', height: 10, background: 'var(--c-bg)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--c-line-2)' }}>
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${plan}%`, background: 'var(--c-line)' }} title={`Plan: ${plan}%`} />
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${real}%`, background: real >= plan - 3 ? 'var(--c-success)' : 'var(--c-warn)', borderRadius: 5 }} title={`Real: ${real}%`} />
                              </div>
                            </td>
                            <td><EstadoAvance plan={plan} real={real} /></td>
                          </tr>
                        )
                      }
                      return rows
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </Fragment>
        )}

        {tab === 'flujo' && (() => {
          const maxMonto = Math.max(...flujo.rows.map(r => r.monto), 1)
          const pico = flujo.rows.reduce((p, r) => (r.monto > (p?.monto || 0) ? r : p), null)
          return (
            <Fragment>
              <div className="kpi-row" style={{ marginBottom: 14 }}>
                <div className="kpi highlight">
                  <div className="kpi-label"><Coins size={12} className="ico" /> Costo directo programado</div>
                  <div className="kpi-val" style={{ fontSize: 18 }}>{money(flujo.total)}</div>
                  <div className="kpi-foot">distribuido en {flujo.rows.length} {modoFlujo === 'mes' ? 'meses' : 'semanas'}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><TrendingUp size={12} className="ico" /> Periodo pico</div>
                  <div className="kpi-val" style={{ fontSize: 18 }}>{pico ? money(pico.monto) : '—'}</div>
                  <div className="kpi-foot">{pico ? (modoFlujo === 'mes' ? pico.label : `semana del ${pico.label}`) : ''}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><Activity size={12} className="ico" /> Promedio por periodo</div>
                  <div className="kpi-val" style={{ fontSize: 18 }}>{flujo.rows.length ? money(flujo.total / flujo.rows.length) : '—'}</div>
                  <div className="kpi-foot">para planificar desembolsos</div>
                </div>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div className="card-header">
                  <div className="card-title"><Coins size={15} /> Flujo de caja programado</div>
                  <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg)', padding: 3, borderRadius: 8 }}>
                    <button className={`btn xs ${modoFlujo === 'semana' ? 'primary' : 'ghost'}`} onClick={() => setModoFlujo('semana')}>Semanal</button>
                    <button className={`btn xs ${modoFlujo === 'mes' ? 'primary' : 'ghost'}`} onClick={() => setModoFlujo('mes')}>Mensual</button>
                  </div>
                </div>

                {/* Gráfico de barras */}
                <div style={{ padding: '20px 20px 8px', overflowX: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, minWidth: flujo.rows.length * 34 }}>
                    {flujo.rows.map((r, i) => (
                      <div key={i} title={`${modoFlujo === 'mes' ? r.label : 'Semana del ' + r.label}\n${money(r.monto)} · acumulado ${money(r.acumulado)} (${r.pctAcum}%)`}
                        style={{ flex: 1, minWidth: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 9, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>{moneyK(r.monto, budget?.moneda)}</span>
                        <div style={{ width: '100%', height: `${Math.max(3, (r.monto / maxMonto) * 130)}px`, background: 'var(--c-primary)', borderRadius: '4px 4px 0 0', opacity: 0.9 }} />
                        <span style={{ fontSize: 9, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabla */}
                <table className="bt">
                  <thead><tr>
                    <th>{modoFlujo === 'mes' ? 'Mes' : 'Semana del'}</th>
                    <th className="num" style={{ width: 150 }}>Egreso del periodo</th>
                    <th className="num" style={{ width: 150 }}>Acumulado</th>
                    <th style={{ width: 180 }}>% Acumulado</th>
                  </tr></thead>
                  <tbody>
                    {flujo.rows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.label}</td>
                        <td className="num">{money(r.monto)}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(r.acumulado)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 8, background: 'var(--c-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--c-line-2)' }}>
                              <div style={{ width: `${r.pctAcum}%`, height: '100%', background: 'var(--c-accent)' }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--c-text-3)', width: 34, textAlign: 'right' }}>{r.pctAcum}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>TOTAL</td>
                      <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(flujo.total)}</td>
                      <td colSpan={2} style={{ background: 'var(--c-ink)' }}></td>
                    </tr>
                  </tfoot>
                </table>
                <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--c-text-3)' }}>
                  Basado en el costo directo de cada actividad distribuido uniformemente en su duración programada.
                </div>
              </div>
            </Fragment>
          )
        })()}

        {tab !== 'gantt' && tab !== 'fisico' && tab !== 'flujo' && (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🚧</div>
            <div style={{ fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 4 }}>
              {TABS.find(t => t.k === tab)?.label} — en construcción
            </div>
            <div style={{ fontSize: 13 }}>
              Este módulo de la Fase II se habilita en las próximas iteraciones. La programación
              del Gantt que definas aquí alimentará automáticamente esta vista.
            </div>
          </div>
        )}
      </div>
    </Fragment>
  )
}
