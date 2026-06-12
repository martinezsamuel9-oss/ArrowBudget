// ============ CRONOGRAMA PAGE (Fase II · módulo 1) ============
// Crear cronograma desde el presupuesto, editar duración/predecesoras por
// actividad y fecha de inicio del proyecto. Tabs: Gantt, Flujo de caja,
// Avance físico, Avance financiero, Curva S (los demás módulos se montan aquí).
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { calcItem, makeMoneyFmt, moneyK, fmt } from '../lib/calc'
import { flattenActividades, calcularFechas, resumenCronograma, parsePredecesoras, predsATexto, normPred, rutaCritica, fmtFecha, hoyISO, addDays, pctPlanificado, pctReal, avanceGlobal, flujoDeCaja, curvaS, MESES_CORTOS as MESES_LIB } from '../lib/cronograma'
import { exportPDFCronograma, exportExcelCronograma } from '../lib/exportCronograma'
import { Dropdown } from '../components/ui'
import {
  CalendarRange, BarChart2, Coins, Activity, TrendingUp, LineChart,
  Plus, FileText, AlertTriangle, FileSpreadsheet, ChevronDown,
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

function GanttChart({ acts, fechas, datos, idToSeq = {} }) {
  const [pxDia, setPxDia] = useState(8)        // 24 = día, 8 = semana, 2.5 = mes
  const [lblW, setLblW] = useState(250)        // ancho de la columna de nombres (arrastrable)
  const [verCritica, setVerCritica] = useState(false)
  const [verLineas, setVerLineas] = useState(true)

  // Arrastre del divisor entre nombres y barras
  const startDrag = e => {
    e.preventDefault()
    const x0 = e.clientX, w0 = lblW
    const move = ev => setLblW(Math.max(150, Math.min(600, w0 + ev.clientX - x0)))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const criticas = useMemo(() => rutaCritica(acts, fechas, datos), [acts, fechas, datos])

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
  const LBL   = lblW
  const HDR   = 26
  const ROW   = 30

  // Encabezado de meses
  const meses = []
  { let c = new Date(start)
    while (c < end) {
      const finMes = new Date(c.getFullYear(), c.getMonth() + 1, 1)
      const hasta = finMes < end ? finMes : end
      meses.push({ label: `${MESES_LIB[c.getMonth()]} ${String(c.getFullYear()).slice(2)}`, left: X(c), width: X(hasta) - X(c) })
      c = finMes
    } }

  // Ticks semanales (lunes)
  const semanas = []
  { let c = new Date(start)
    c.setDate(c.getDate() + ((8 - c.getDay()) % 7))
    while (c < end) { semanas.push({ left: X(c) }); c = addDays(c, 7) } }

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const hoyX = (hoy >= start && hoy <= end) ? X(hoy) : null

  // Filas planas (banda de capítulo + actividades) para posicionar conexiones
  const flat = []
  { let lastCap = null
    for (const a of programadas) {
      if (a.capId !== lastCap) {
        lastCap = a.capId
        const delCap = programadas.filter(x => x.capId === a.capId)
        let gMin = null, gMax = null
        for (const x of delCap) { const f = fechas[x.id]; if (!gMin || f.inicio < gMin) gMin = f.inicio; if (!gMax || f.fin > gMax) gMax = f.fin }
        flat.push({ t: 'cap', capId: a.capId, capDesc: a.capDesc, min: gMin, max: gMax })
      }
      flat.push({ t: 'act', a })
    } }
  const idxAct = {}
  flat.forEach((r, i) => { if (r.t === 'act') idxAct[r.a.id] = i })
  const totalH = flat.length * ROW
  const yCentro = id => idxAct[id] * ROW + ROW / 2

  // Conexiones predecesora → sucesora (con su tipo de vínculo)
  const lineas = []
  if (verLineas) {
    for (const a of programadas) {
      for (const pr of (datos[a.id]?.predecesoras || [])) {
        const p = normPred(pr)
        if (!p || idxAct[p.id] === undefined) continue
        const fp = fechas[p.id], fa = fechas[a.id]
        const x1 = (p.tipo === 'CC' || p.tipo === 'CF') ? X(fp.inicio) : X(fp.fin)
        const x2 = (p.tipo === 'FF') ? X(fa.fin) : X(fa.inicio)
        const critica = criticas.has(p.id) && criticas.has(a.id)
        lineas.push({ x1, y1: yCentro(p.id), x2, y2: yCentro(a.id), critica, key: `${p.id}>${a.id}` })
      }
    }
  }

  const filaBase = { display: 'flex', alignItems: 'center', height: ROW, borderBottom: '1px solid var(--c-line-2)' }
  const lblBase  = { position: 'sticky', left: 0, zIndex: 2, width: LBL, minWidth: LBL, padding: '0 12px', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid var(--c-line)', height: '100%', display: 'flex', alignItems: 'center' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 14px 0', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn xs ${verCritica ? 'primary' : 'ghost'}`} onClick={() => setVerCritica(v => !v)}
            title="Resalta las actividades sin holgura: si se atrasan, se atrasa el proyecto">
            Ruta crítica
          </button>
          <button className={`btn xs ${verLineas ? 'primary' : 'ghost'}`} onClick={() => setVerLineas(v => !v)}>
            Conexiones
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['Día', 24], ['Semana', 8], ['Mes', 2.5]].map(([lbl, v]) => (
            <button key={lbl} className={`btn xs ${pxDia === v ? 'primary' : 'ghost'}`} onClick={() => setPxDia(v)}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto', margin: '10px 0 4px' }}>
        <div style={{ width: LBL + W, minWidth: '100%', position: 'relative' }}>
          {/* Encabezado: meses */}
          <div style={{ ...filaBase, height: HDR, borderBottom: '1px solid var(--c-line)' }}>
            <div style={{ ...lblBase, background: 'var(--c-surface)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-3)', justifyContent: 'space-between' }}>
              <span>Actividad</span>
              <span onMouseDown={startDrag} title="Arrastra para ajustar el ancho"
                style={{ cursor: 'col-resize', padding: '0 4px', marginRight: -10, color: 'var(--c-text-3)', fontSize: 12, userSelect: 'none' }}>⋮⋮</span>
            </div>
            <div style={{ position: 'relative', width: W, height: '100%' }}>
              {meses.map((m, i) => (
                <div key={i} style={{ position: 'absolute', left: m.left, width: m.width, top: 0, bottom: 0, borderLeft: '1px solid var(--c-line)', fontSize: 10, fontWeight: 700, color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', paddingLeft: 6, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden' }}>
                  {m.width > 34 ? m.label : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Filas */}
          {flat.map((r, i) => r.t === 'cap' ? (
            <div key={`cap-${r.capId || i}`} style={{ ...filaBase, background: 'var(--c-bg)' }}>
              <div style={{ ...lblBase, background: 'var(--c-bg)', fontWeight: 700, color: 'var(--c-text)' }}>
                {r.capId} · {r.capDesc}
              </div>
              <div style={{ position: 'relative', width: W, height: '100%' }}>
                {semanas.map((s, j) => pxDia >= 4 && <div key={j} style={{ position: 'absolute', left: s.left, top: 0, bottom: 0, borderLeft: '1px dashed var(--c-line-2)' }} />)}
                <div title={`${fmtFecha(r.min)} → ${fmtFecha(addDays(r.max, -1))}`}
                  style={{ position: 'absolute', left: X(r.min), width: Math.max(3, X(r.max) - X(r.min)), top: 11, height: 7, borderRadius: 4, background: 'var(--c-ink)' }} />
                {hoyX != null && <div style={{ position: 'absolute', left: hoyX, top: 0, bottom: 0, borderLeft: '2px solid var(--c-danger)', opacity: 0.55 }} />}
              </div>
            </div>
          ) : (() => {
            const a = r.a
            const f = fechas[a.id]
            const w = Math.max(3, X(f.fin) - X(f.inicio))
            const avance = pctReal(datos[a.id]?.avances)
            const esCritica = verCritica && criticas.has(a.id)
            return (
              <div key={a.id} style={{ ...filaBase, opacity: verCritica && !esCritica ? 0.45 : 1 }}>
                <div style={{ ...lblBase, background: 'var(--c-surface)', color: 'var(--c-text-2)' }} title={`#${idToSeq[a.id] || ''} · ${a.id} — ${a.descripcion}${criticas.has(a.id) ? ' · RUTA CRÍTICA' : ''}`}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--c-text-3)', marginRight: 7, flexShrink: 0, minWidth: 18, textAlign: 'right' }}>{idToSeq[a.id]}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.descripcion}</span>
                </div>
                <div style={{ position: 'relative', width: W, height: '100%' }}>
                  {semanas.map((s, j) => pxDia >= 4 && <div key={j} style={{ position: 'absolute', left: s.left, top: 0, bottom: 0, borderLeft: '1px dashed var(--c-line-2)' }} />)}
                  <div title={`${a.id} — ${a.descripcion}\n${fmtFecha(f.inicio)} → ${fmtFecha(addDays(f.fin, -1))} · ${f.dur} días · avance ${avance}%${criticas.has(a.id) ? ' · RUTA CRÍTICA' : ''}`}
                    style={{ position: 'absolute', left: X(f.inicio), width: w, top: 7, height: 16, borderRadius: 5, background: esCritica ? 'var(--c-danger)' : 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {avance > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${avance}%`, background: 'var(--c-success)', opacity: 0.85 }} />}
                    {w > 44 && <span style={{ position: 'relative', fontSize: 9.5, color: '#fff', fontWeight: 700 }}>{avance > 0 ? `${avance}%` : `${f.dur}d`}</span>}
                  </div>
                  {hoyX != null && <div style={{ position: 'absolute', left: hoyX, top: 0, bottom: 0, borderLeft: '2px solid var(--c-danger)', opacity: 0.55 }} />}
                </div>
              </div>
            )
          })())}

          {/* Conexiones predecesora → sucesora */}
          {verLineas && lineas.length > 0 && (
            <svg width={W} height={totalH} style={{ position: 'absolute', left: LBL, top: HDR, pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}>
              <defs>
                <marker id="flecha" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                </marker>
                <marker id="flechaCrit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--c-danger)" />
                </marker>
              </defs>
              {lineas.map(l => {
                const crit = verCritica && l.critica
                const xm = l.x1 + 6
                const yDir = l.y2 > l.y1 ? 1 : -1
                const path = `M${l.x1},${l.y1} L${xm},${l.y1} L${xm},${l.y2 - yDir * 0} L${l.x2 - 4},${l.y2}`
                return <path key={l.key} d={path} fill="none"
                  stroke={crit ? 'var(--c-danger)' : '#64748b'} strokeWidth={crit ? 1.8 : 1.2}
                  opacity={crit ? 0.9 : 0.55} markerEnd={`url(#${crit ? 'flechaCrit' : 'flecha'})`} />
              })}
            </svg>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, padding: '8px 14px 12px', fontSize: 11, color: 'var(--c-text-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 3, background: 'var(--c-primary)', marginRight: 5, verticalAlign: 'middle' }}></span>Programado</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 3, background: 'var(--c-success)', marginRight: 5, verticalAlign: 'middle' }}></span>Avance real</span>
        {verCritica && <span><span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 3, background: 'var(--c-danger)', marginRight: 5, verticalAlign: 'middle' }}></span>Ruta crítica ({criticas.size})</span>}
        <span><span style={{ display: 'inline-block', width: 14, height: 5, borderRadius: 3, background: 'var(--c-ink)', marginRight: 5, verticalAlign: 'middle' }}></span>Capítulo</span>
        <span><span style={{ display: 'inline-block', width: 2, height: 12, background: 'var(--c-danger)', marginRight: 5, verticalAlign: 'middle' }}></span>Hoy</span>
      </div>
    </div>
  )
}

// ── Curva S (módulo 5): SVG plan vs real ──
function CurvaSChart({ plan, real, resumen }) {
  if (!plan.length) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>Sin programación aún.</div>
  const VW = 860, VH = 320, L = 46, R = 16, T = 18, B = 34
  const IW = VW - L - R, IH = VH - T - B
  const x0 = plan[0].fecha.getTime()
  const x1 = Math.max(plan[plan.length - 1].fecha.getTime(), ...real.map(p => p.fecha.getTime()), x0 + 1)
  const X = f => L + ((f.getTime() - x0) / (x1 - x0)) * IW
  const Y = pct => T + ((100 - pct) / 100) * IH
  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.fecha).toFixed(1)},${Y(p.pct).toFixed(1)}`).join(' ')

  // Ticks de meses en X
  const meses = []
  { const c = new Date(x0); c.setDate(1)
    if (c.getTime() < x0) c.setMonth(c.getMonth() + 1)
    while (c.getTime() <= x1) { meses.push(new Date(c)); c.setMonth(c.getMonth() + 1) } }

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const hoyVisible = hoy.getTime() >= x0 && hoy.getTime() <= x1

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid horizontal 0/25/50/75/100 */}
      {[0, 25, 50, 75, 100].map(p => (
        <g key={p}>
          <line x1={L} y1={Y(p)} x2={VW - R} y2={Y(p)} stroke="var(--c-line)" strokeWidth="1" strokeDasharray={p ? '0' : '0'} />
          <text x={L - 8} y={Y(p) + 3.5} textAnchor="end" fontSize="10" fill="var(--c-text-3)">{p}%</text>
        </g>
      ))}
      {/* Ticks de meses */}
      {meses.map((m, i) => (
        <g key={i}>
          <line x1={X(m)} y1={T} x2={X(m)} y2={VH - B} stroke="var(--c-line-2)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={X(m)} y={VH - B + 14} textAnchor="middle" fontSize="10" fill="var(--c-text-3)">
            {MESES_LIB[m.getMonth()]} {String(m.getFullYear()).slice(2)}
          </text>
        </g>
      ))}
      {/* Línea de HOY */}
      {hoyVisible && (
        <g>
          <line x1={X(hoy)} y1={T} x2={X(hoy)} y2={VH - B} stroke="var(--c-danger)" strokeWidth="1.5" opacity="0.55" />
          <text x={X(hoy)} y={T - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--c-danger)">HOY</text>
        </g>
      )}
      {/* Curva planificada */}
      <path d={path(plan)} fill="none" stroke="var(--c-primary)" strokeWidth="2.5" strokeDasharray="6 4" strokeLinecap="round" />
      {/* Curva real */}
      {real.length > 0 && (
        <g>
          <path d={path(real)} fill="none" stroke="var(--c-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {real.map((p, i) => (
            <circle key={i} cx={X(p.fecha)} cy={Y(p.pct)} r="4" fill="var(--c-success)" stroke="#fff" strokeWidth="1.5">
              <title>{`${fmtFecha(p.fecha)} — avance real ${p.pct}%`}</title>
            </circle>
          ))}
        </g>
      )}
    </svg>
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
  const [capsFlujo, setCapsFlujo] = useState([])          // capítulos filtrados ([] = todos)
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
  // # de fila estilo Project: 1, 2, 3… en el orden del presupuesto
  const seqToId = useMemo(() => acts.map(a => a.id), [acts])
  const idToSeq = useMemo(() => Object.fromEntries(acts.map((a, i) => [a.id, i + 1])), [acts])

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
  // Capítulos del proyecto (para el filtro del flujo de caja)
  const capitulos = useMemo(() => {
    const m = new Map()
    acts.forEach(a => { if (!m.has(a.capId)) m.set(a.capId, a.capDesc) })
    return [...m.entries()].map(([capId, capDesc]) => ({ capId, capDesc }))
  }, [acts])
  const actsFlujo = useMemo(
    () => capsFlujo.length ? acts.filter(a => capsFlujo.includes(a.capId)) : acts,
    [acts, capsFlujo],
  )
  const flujo = useMemo(() => flujoDeCaja(actsFlujo, fechas, datos, pesos, modoFlujo), [actsFlujo, fechas, datos, pesos, modoFlujo])
  const curva = useMemo(() => curvaS(acts, fechas, datos, pesos, resumen), [acts, fechas, datos, pesos, resumen])
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
        <div className="page-head-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }}
            onClick={() => exportPDFCronograma(budget, acts, fechas, datos, pesos, resumen, { logo: budget.logoOfertante, logoCliente: budget.logoCliente, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText })}>
            <FileText size={13} /> PDF
          </button>
          <button className="btn" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff' }}
            onClick={() => exportExcelCronograma(budget, acts, fechas, datos, pesos, resumen)}>
            <FileSpreadsheet size={13} /> Excel
          </button>
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
                {vistaGantt === 'editar' && <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Predecesoras con # de fila estilo Project: <b>3</b> (FC) · <b>3CC</b> · <b>3FF</b> · <b>3CF</b> · desfase <b>3CC+2</b></span>}
                <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg)', padding: 3, borderRadius: 8 }}>
                  <button className={`btn xs ${vistaGantt === 'gantt' ? 'primary' : 'ghost'}`} onClick={() => setVistaGantt('gantt')}>Gantt</button>
                  <button className={`btn xs ${vistaGantt === 'editar' ? 'primary' : 'ghost'}`} onClick={() => setVistaGantt('editar')}>Editar programación</button>
                </div>
              </div>
            </div>
            {vistaGantt === 'gantt' && <GanttChart acts={acts} fechas={fechas} datos={datos} idToSeq={idToSeq} />}
            {vistaGantt === 'editar' && (
            <div style={{ overflowX: 'auto' }}>
              <table className="bt">
                <thead><tr>
                  <th style={{ width: 42 }}>#</th>
                  <th style={{ width: 70 }}>ID</th>
                  <th>Actividad</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Unidad</th>
                  <th className="num" style={{ width: 90 }}>Cantidad</th>
                  <th className="num" style={{ width: 100 }}>Duración (días)</th>
                  <th style={{ width: 170 }}>Predecesoras</th>
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
                            <td colSpan={9} style={{ background: 'var(--c-ink)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 12, padding: '7px 14px' }}>
                              {a.capId} · {a.capDesc}
                            </td>
                          </tr>
                        )
                      }
                      const d = datos[a.id] || {}
                      const f = fechas[a.id]
                      const predTexto = predsATexto(d.predecesoras, idToSeq)
                      rows.push(
                        <tr key={a.id} style={{ opacity: datos[a.id] ? 1 : 0.45 }}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-text-3)', textAlign: 'center' }}>{idToSeq[a.id]}</td>
                          <td className="id">{a.id}</td>
                          <td style={{ fontWeight: 500 }}>{a.descripcion}</td>
                          <td style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{a.unidad || '—'}</td>
                          <td className="num" style={{ color: 'var(--c-text-2)' }}>{fmt(a.cantidad || 0)}</td>
                          <td className="num">
                            <input type="number" min="1" className="input sm" disabled={!canEdit || !datos[a.id]}
                              value={d.duracion ?? 7}
                              onFocus={e => e.target.select()}
                              onChange={e => updActividad(a.id, { duracion: Math.max(1, parseInt(e.target.value) || 1) })}
                              style={{ width: 72, textAlign: 'right' }} />
                          </td>
                          <td>
                            <input className="input sm" disabled={!canEdit || !datos[a.id]}
                              key={`${a.id}:${predTexto}`}
                              defaultValue={predTexto}
                              placeholder="ej: 3, 5CC+2"
                              title="Usa el # de fila. Tipos: 3 = FC (fin→comienzo) · 3CC · 3FF · 3CF · desfase: 3CC+2, 4FC-1"
                              onBlur={e => {
                                // Validar auto-dependencia: una actividad no puede ser su propia predecesora
                                const propia = e.target.value.split(/[,;]+/).map(s => s.trim()).filter(Boolean).some(t => {
                                  const m = t.match(/^([\w.\-]+?)(fc|cc|ff|cf)?([+-]\d+)?$/i)
                                  if (!m) return false
                                  return m[1] === a.id || (/^\d+$/.test(m[1]) && parseInt(m[1], 10) === idToSeq[a.id])
                                })
                                if (propia) alert(`⚠️ La actividad #${idToSeq[a.id]} (${a.id}) no puede depender de sí misma.\n\nSe ignoró esa referencia.`)
                                updActividad(a.id, { predecesoras: parsePredecesoras(e.target.value, idsValidos, a.id, seqToId) })
                              }}
                              style={{ width: 150, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
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
                  <div className="kpi-label"><Coins size={12} className="ico" /> Costo total programado</div>
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

                {/* Filtro por capítulos — lista desplegable (escala a muchos capítulos) */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--c-line-2)' }}>
                  <Dropdown align="left" minWidth={320} trigger={
                    <button className="btn sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Capítulos: <b>{capsFlujo.length === 0 ? 'Todos' : `${capsFlujo.length} de ${capitulos.length}`}</b>
                      <ChevronDown size={13} />
                    </button>
                  }>
                    <div style={{ padding: '6px 0', maxHeight: 320, overflowY: 'auto' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--c-line-2)' }}>
                        <input type="checkbox" checked={capsFlujo.length === 0} onChange={() => setCapsFlujo([])}
                          style={{ width: 15, height: 15, accentColor: 'var(--c-accent)' }} />
                        Todos los capítulos
                      </label>
                      {capitulos.map(c => (
                        <label key={c.capId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <input type="checkbox" checked={capsFlujo.includes(c.capId)}
                            onChange={() => setCapsFlujo(prev => prev.includes(c.capId) ? prev.filter(x => x !== c.capId) : [...prev, c.capId])}
                            style={{ width: 15, height: 15, accentColor: 'var(--c-accent)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.capDesc}>
                            <b style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)', marginRight: 6 }}>{c.capId}</b>
                            {c.capDesc}
                          </span>
                        </label>
                      ))}
                    </div>
                  </Dropdown>
                  {capsFlujo.length > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                      Filtrando capítulos: <b>{capsFlujo.join(', ')}</b>
                      <button className="btn xs ghost" style={{ marginLeft: 8 }} onClick={() => setCapsFlujo([])}>Limpiar</button>
                    </span>
                  )}
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
                  Basado en el costo total de cada actividad distribuido uniformemente en su duración programada.
                </div>
              </div>
            </Fragment>
          )
        })()}

        {tab === 'curvas' && (() => {
          const planHoy = avanceGlobal(acts, fechas, datos, pesos, hoyISO()).plan
          const ultimoReal = curva.real.length ? curva.real[curva.real.length - 1] : null
          const realPct = ultimoReal?.pct ?? 0
          const desv = realPct - planHoy
          return (
            <Fragment>
              <div className="kpi-row" style={{ marginBottom: 14 }}>
                <div className="kpi">
                  <div className="kpi-label"><TrendingUp size={12} className="ico" /> Plan a hoy</div>
                  <div className="kpi-val">{planHoy}%</div>
                  <div className="kpi-foot">según el Gantt</div>
                </div>
                <div className="kpi highlight">
                  <div className="kpi-label"><Activity size={12} className="ico" /> Real (último corte)</div>
                  <div className="kpi-val">{realPct}%</div>
                  <div className="kpi-foot">{ultimoReal ? `corte del ${fmtFecha(ultimoReal.fecha)}` : 'sin cortes registrados aún'}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><AlertTriangle size={12} className="ico" /> Desviación</div>
                  <div className="kpi-val" style={{ color: desv < -3 ? 'var(--c-danger)' : desv > 3 ? 'var(--c-primary)' : 'var(--c-success)' }}>
                    {desv > 0 ? '+' : ''}{desv}%
                  </div>
                  <div className="kpi-foot">{desv < -3 ? 'obra atrasada vs plan' : desv > 3 ? 'obra adelantada' : 'al día'}</div>
                </div>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div className="card-header">
                  <div className="card-title"><LineChart size={15} /> Curva S — planificado vs real</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--c-text-3)', alignItems: 'center' }}>
                    <span><span style={{ display: 'inline-block', width: 18, borderTop: '2.5px dashed var(--c-primary)', marginRight: 5, verticalAlign: 'middle' }}></span>Planificado</span>
                    <span><span style={{ display: 'inline-block', width: 18, borderTop: '3px solid var(--c-success)', marginRight: 5, verticalAlign: 'middle' }}></span>Real</span>
                  </div>
                </div>
                <div style={{ padding: '16px 16px 8px' }}>
                  <CurvaSChart plan={curva.plan} real={curva.real} resumen={resumen} />
                </div>
                <div style={{ padding: '6px 16px 14px', fontSize: 11, color: 'var(--c-text-3)' }}>
                  Avance ponderado por costo de actividad. La curva real se construye con cada fecha de corte
                  registrada en Avance Físico — registra cortes semanales para una curva fiel.
                </div>
              </div>
            </Fragment>
          )
        })()}

        {tab === 'financiero' && (() => {
          // Valor ganado por capítulo a la fecha de corte
          const caps = []
          const atrasadas = []
          let totCosto = 0, totVP = 0, totVG = 0
          for (const a of acts) {
            if (!datos[a.id] || !fechas[a.id]) continue
            const costo = pesos[a.id] || 0
            const plan = pctPlanificado(fechas[a.id], corte)
            const real = pctReal(datos[a.id].avances, corte)
            const vp = costo * plan / 100
            const vg = costo * real / 100
            let g = caps.find(c => c.capId === a.capId)
            if (!g) { g = { capId: a.capId, capDesc: a.capDesc, costo: 0, vp: 0, vg: 0 }; caps.push(g) }
            g.costo += costo; g.vp += vp; g.vg += vg
            totCosto += costo; totVP += vp; totVG += vg
            if (real < plan - 3 && real < 100) atrasadas.push({ ...a, plan, real, riesgo: costo * (plan - real) / 100 })
          }
          atrasadas.sort((x, y) => y.riesgo - x.riesgo)
          const variacion = totVG - totVP
          return (
            <Fragment>
              <div className="kpi-row" style={{ marginBottom: 14 }}>
                <div className="kpi">
                  <div className="kpi-label"><CalendarRange size={12} className="ico" /> Fecha de corte</div>
                  <input type="date" className="input" value={corte} onChange={e => setCorte(e.target.value || hoyISO())} style={{ marginTop: 4, fontWeight: 700 }} />
                </div>
                <div className="kpi highlight">
                  <div className="kpi-label"><Coins size={12} className="ico" /> Valor ganado</div>
                  <div className="kpi-val" style={{ fontSize: 17 }}>{money(totVG)}</div>
                  <div className="kpi-foot">obra ejecutada × costo ({totCosto > 0 ? Math.round(totVG / totCosto * 100) : 0}% del total)</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><TrendingUp size={12} className="ico" /> Valor planificado</div>
                  <div className="kpi-val" style={{ fontSize: 17 }}>{money(totVP)}</div>
                  <div className="kpi-foot">lo que debería estar ejecutado a la fecha</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label"><AlertTriangle size={12} className="ico" /> Variación</div>
                  <div className="kpi-val" style={{ fontSize: 17, color: variacion < 0 ? 'var(--c-danger)' : 'var(--c-success)' }}>
                    {variacion < 0 ? '−' : '+'}{money(Math.abs(variacion))}
                  </div>
                  <div className="kpi-foot">{variacion < 0 ? 'obra pendiente vs plan' : 'por delante del plan'}</div>
                </div>
              </div>

              <div className="card" style={{ padding: 0, marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title"><TrendingUp size={15} /> Avance financiero por capítulo</div>
                </div>
                <table className="bt">
                  <thead><tr>
                    <th>Capítulo</th>
                    <th style={{ width: 140, textAlign: 'center' }}>Costo</th>
                    <th className="num" style={{ width: 140 }}>Valor planificado</th>
                    <th className="num" style={{ width: 140 }}>Valor ganado</th>
                    <th style={{ width: 170 }}>% Financiero</th>
                  </tr></thead>
                  <tbody>
                    {caps.map(c => {
                      const pct = c.costo > 0 ? Math.round(c.vg / c.costo * 100) : 0
                      const pctPlan = c.costo > 0 ? Math.round(c.vp / c.costo * 100) : 0
                      return (
                        <tr key={c.capId}>
                          <td style={{ fontWeight: 600 }}>{c.capId} · {c.capDesc}</td>
                          <td className="num">{money(c.costo)}</td>
                          <td className="num" style={{ color: 'var(--c-text-3)' }}>{money(c.vp)}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{money(c.vg)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, position: 'relative', height: 9, background: 'var(--c-bg)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--c-line-2)' }}>
                                <div style={{ position: 'absolute', inset: 0, width: `${pctPlan}%`, background: 'var(--c-line)' }} />
                                <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: pct >= pctPlan - 3 ? 'var(--c-success)' : 'var(--c-warn)', borderRadius: 5 }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--c-text-3)', width: 34, textAlign: 'right' }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>TOTAL</td>
                      <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>{money(totCosto)}</td>
                      <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'rgba(255,255,255,0.7)' }}>{money(totVP)}</td>
                      <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(totVG)}</td>
                      <td style={{ background: 'var(--c-ink)' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Dashboard de atrasos */}
              <div className="card" style={{ padding: 0 }}>
                <div className="card-header">
                  <div className="card-title"><AlertTriangle size={15} style={{ color: atrasadas.length ? 'var(--c-danger)' : 'var(--c-success)' }} /> Actividades atrasadas ({atrasadas.length})</div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>ordenadas por monto en riesgo (atraso × costo)</div>
                </div>
                {atrasadas.length === 0
                  ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--c-success)', fontSize: 13, fontWeight: 600 }}>✓ Ninguna actividad atrasada a la fecha de corte</div>
                  : (
                    <table className="bt">
                      <thead><tr>
                        <th style={{ width: 70 }}>ID</th>
                        <th>Actividad</th>
                        <th className="num" style={{ width: 80 }}>% Plan</th>
                        <th className="num" style={{ width: 80 }}>% Real</th>
                        <th className="num" style={{ width: 90 }}>Atraso</th>
                        <th className="num" style={{ width: 140 }}>Monto en riesgo</th>
                      </tr></thead>
                      <tbody>
                        {atrasadas.slice(0, 15).map(a => (
                          <tr key={a.id}>
                            <td className="id">{a.id}</td>
                            <td style={{ fontWeight: 500 }}>{a.descripcion}</td>
                            <td className="num" style={{ color: 'var(--c-text-3)' }}>{a.plan}%</td>
                            <td className="num" style={{ fontWeight: 700 }}>{a.real}%</td>
                            <td className="num" style={{ color: 'var(--c-danger)', fontWeight: 700 }}>−{a.plan - a.real}%</td>
                            <td className="num" style={{ fontWeight: 700 }}>{money(a.riesgo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </Fragment>
          )
        })()}
      </div>
    </Fragment>
  )
}
