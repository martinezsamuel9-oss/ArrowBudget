// ============ CRONOGRAMA PAGE (Fase II · módulo 1) ============
// Crear cronograma desde el presupuesto, editar duración/predecesoras por
// actividad y fecha de inicio del proyecto. Tabs: Gantt, Flujo de caja,
// Avance físico, Avance financiero, Curva S (los demás módulos se montan aquí).
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { puedeHacer } from '../lib/permissions'
import { flattenActividades, calcularFechas, resumenCronograma, parsePredecesoras, fmtFecha, hoyISO, addDays } from '../lib/cronograma'
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

export default function CronogramaPage({ budget, projectRole, user }) {
  const [crono, setCrono] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('gantt')
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
              <div className="card-title"><BarChart2 size={15} /> Programación de actividades</div>
              <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Predecesoras: IDs separados por coma (ej: 1.01, 1.02)</div>
            </div>
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
          </div>
        )}

        {tab !== 'gantt' && (
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
