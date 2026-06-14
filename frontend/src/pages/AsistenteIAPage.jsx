// ============ ASISTENTE IA DE PRESUPUESTO (Fase III · módulo IA · B3) ============
// Genera un presupuesto borrador aprendiendo del histórico de la organización:
// elige tipología + m² destino y el asistente arma capítulos, actividades,
// unidades, cantidades (escaladas por m²) y APUs de tu propio catálogo.
import { useState, useMemo, Fragment } from 'react'
import { calcResumenFinanciero, makeMoneyFmt, fmt, round2 } from '../lib/calc'
import { tiposParaIA, aprenderTipo, generarDesdeModelo } from '../lib/iaPresupuesto'
import { Sparkles, Building2, Check, ArrowRight, Layers, FileText, AlertTriangle, Wand2 } from 'lucide-react'

export default function AsistenteIAPage({ proyectos, onCrear, moneda = 'USD' }) {
  const [tipo, setTipo] = useState(null)
  const [fuenteIds, setFuenteIds] = useState(null)   // null = todas las del tipo
  const [m2, setM2] = useState('')
  const [nombre, setNombre] = useState('')
  const [capsActivos, setCapsActivos] = useState(null)
  const [creando, setCreando] = useState(false)
  const money = makeMoneyFmt(moneda)

  const tipos = useMemo(() => tiposParaIA(proyectos), [proyectos])
  const modelo = useMemo(() => tipo ? aprenderTipo(proyectos, tipo, fuenteIds) : null, [proyectos, tipo, fuenteIds])

  // Vista previa generada (en vivo según m²)
  const preview = useMemo(() => {
    if (!modelo || !(+m2 > 0)) return null
    const { items, catalogos } = generarDesdeModelo(modelo, +m2, capsActivos)
    const budget = { items, catalogos }
    const R = calcResumenFinanciero(items, catalogos, { pctIndirectos: 10, pctImprevistos: 1, pctUtilidad: 8, pctImpuesto: 15 })
    return { items, catalogos, total: R.total, costoM2: round2(R.total / (+m2)) }
  }, [modelo, m2, capsActivos])

  const crear = async () => {
    if (!preview) return
    if (!nombre.trim()) return alert('Ponle un nombre al proyecto.')
    setCreando(true)
    await onCrear({
      nombreProyecto: nombre.trim(), tipo, moneda,
      m2Construccion: +m2, items: preview.items, catalogos: preview.catalogos,
    })
    setCreando(false)
  }

  // Sin data suficiente
  if (!tipos.length) return (
    <div className="page-body">
      <div style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--c-ink)', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
          <Sparkles size={30} color="var(--c-accent)" />
        </div>
        <h2 style={{ margin: '0 0 8px', color: 'var(--c-text)' }}>Asistente IA de presupuesto</h2>
        <p style={{ fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          El asistente aprende de tus proyectos terminados para generar presupuestos nuevos al instante.
          Aún no hay suficiente historial: necesita al menos <b>un proyecto con área (m²) y actividades con fichas</b>.
        </p>
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--c-accent-soft)', fontSize: 13, color: 'var(--c-text-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={15} style={{ color: 'var(--c-warn)' }} /> Define los m² de construcción en Configuración de tus proyectos para alimentar al asistente.
        </div>
      </div>
    </div>
  )

  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="var(--c-accent)" /> Asistente IA de presupuesto
          </div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>
            Aprende de {proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} de tu organización · sin costo por uso
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Paso 1 — Tipología */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-3)', marginBottom: 10 }}>1 · ¿Qué tipo de proyecto vas a presupuestar?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {tipos.map(t => (
              <button key={t.tipo} onClick={() => { setTipo(t.tipo); setFuenteIds(null); setCapsActivos(null) }}
                className="card" style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'left', minWidth: 180,
                  border: tipo === t.tipo ? '2px solid var(--c-accent)' : '1px solid var(--c-line)', background: tipo === t.tipo ? 'var(--c-accent-soft)' : 'var(--c-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={16} color="var(--c-text-2)" />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{t.tipo}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 4 }}>{t.proyectos.length} proyecto{t.proyectos.length !== 1 ? 's' : ''} de referencia</div>
              </button>
            ))}
          </div>
        </div>

        {modelo && (
          <Fragment>
            {/* Lo que aprendió */}
            <div className="card card-pad" style={{ marginBottom: 16, background: 'var(--c-ink)', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Wand2 size={16} color="var(--c-accent)" />
                <span style={{ fontWeight: 700 }}>Lo que aprendí de tus proyectos {modelo.tipo}</span>
              </div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }}>
                <div><b style={{ fontSize: 22, color: 'var(--c-accent)' }}>{modelo.capitulos.length}</b><div style={{ color: 'rgba(255,255,255,0.6)' }}>capítulos</div></div>
                <div><b style={{ fontSize: 22, color: 'var(--c-accent)' }}>{modelo.nActividades}</b><div style={{ color: 'rgba(255,255,255,0.6)' }}>actividades</div></div>
                <div><b style={{ fontSize: 22, color: 'var(--c-accent)' }}>{modelo.nConFicha}</b><div style={{ color: 'rgba(255,255,255,0.6)' }}>con ficha/APU</div></div>
                <div><b style={{ fontSize: 22, color: 'var(--c-accent)' }}>{modelo.fuentes.length}</b><div style={{ color: 'rgba(255,255,255,0.6)' }}>proyectos fuente</div></div>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 10 }}>
                Rendimientos promediados de: {modelo.fuentes.map(f => `${f.nombre} (${fmt(f.m2)} m²)`).join(' · ')}
              </div>
            </div>

            {/* Paso 2 — m² y nombre */}
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-3)', marginBottom: 10 }}>2 · Datos del nuevo proyecto</div>
              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="field">
                  <label className="field-label">Nombre del proyecto *</label>
                  <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="ej: Residencial Las Lomas" autoFocus />
                </div>
                <div className="field">
                  <label className="field-label">Área de construcción (m²) *</label>
                  <input type="number" min="0" step="any" className="input" value={m2} onFocus={e => e.target.select()} onChange={e => setM2(e.target.value)} placeholder="ej: 850" style={{ fontWeight: 700 }} />
                </div>
              </div>
            </div>

            {/* Paso 3 — Vista previa */}
            {preview && (
              <Fragment>
                <div className="kpi-row" style={{ marginBottom: 14 }}>
                  <div className="kpi highlight">
                    <div className="kpi-label"><FileText size={12} className="ico" /> Total estimado</div>
                    <div className="kpi-val" style={{ fontSize: 18 }}>{money(preview.total)}</div>
                    <div className="kpi-foot">incluye indirectos/utilidad/impuesto por defecto</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label"><Layers size={12} className="ico" /> Costo / m²</div>
                    <div className="kpi-val" style={{ fontSize: 18 }}>{money(preview.costoM2)}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label"><Building2 size={12} className="ico" /> Estructura</div>
                    <div className="kpi-val" style={{ fontSize: 18 }}>{preview.items.length} cap.</div>
                    <div className="kpi-foot">{preview.items.reduce((s, c) => s + (c.children?.length || 0), 0)} actividades</div>
                  </div>
                </div>

                <div className="card" style={{ padding: 0, marginBottom: 16 }}>
                  <div className="card-header"><div className="card-title"><Sparkles size={15} /> Vista previa del presupuesto generado</div></div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    <table className="bt">
                      <thead><tr><th style={{ width: 70 }}>ID</th><th>Descripción</th><th style={{ width: 70, textAlign: 'center' }}>Und</th><th className="num" style={{ width: 100 }}>Cantidad</th></tr></thead>
                      <tbody>
                        {preview.items.map(cap => (
                          <Fragment key={cap.id}>
                            <tr><td colSpan={4} style={{ background: 'var(--c-ink)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 12, padding: '7px 14px' }}>{cap.id} · {cap.descripcion}</td></tr>
                            {(cap.children || []).map(a => (
                              <tr key={a.id}>
                                <td className="id">{a.id}</td>
                                <td>{a.descripcion}</td>
                                <td style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{a.unidad || '—'}</td>
                                <td className="num" style={{ fontWeight: 600 }}>{fmt(a.cantidad)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>Se creará como borrador, editable como cualquier proyecto.</span>
                  <button className="btn brand" disabled={creando || !nombre.trim()} onClick={crear} style={{ padding: '11px 22px', fontSize: 14 }}>
                    {creando ? 'Creando…' : <><Check size={15} strokeWidth={2.5} /> Crear proyecto <ArrowRight size={15} /></>}
                  </button>
                </div>
              </Fragment>
            )}

            {!preview && (+m2 <= 0) && (
              <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>
                Ingresa el área en m² para ver la vista previa del presupuesto generado.
              </div>
            )}
          </Fragment>
        )}
      </div>
    </Fragment>
  )
}
