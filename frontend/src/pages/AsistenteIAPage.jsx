// ============ ASISTENTE IA DE PRESUPUESTO (Fase III · módulo IA · B3) ============
// Genera un presupuesto borrador aprendiendo del histórico de la organización:
// elige tipología + m² destino y el asistente arma capítulos, actividades,
// unidades, cantidades (escaladas por m²) y APUs de tu propio catálogo.
import { useState, useMemo, useRef, Fragment } from 'react'
import { calcResumenFinanciero, makeMoneyFmt, fmt, round2 } from '../lib/calc'
import { tiposParaIA, aprenderTipo, generarDesdeModelo } from '../lib/iaPresupuesto'
import { procesarIFC } from '../lib/ifc'
import { Sparkles, Building2, Check, ArrowRight, Layers, FileText, AlertTriangle, Wand2, Box, Upload, Cpu } from 'lucide-react'

export default function AsistenteIAPage({ proyectos, onCrear, moneda = 'USD' }) {
  const [modo, setModo] = useState('historico')   // 'historico' (B3) | 'bim' (B1)
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

  // ── B1: modelo BIM (Revit/IFC) ──
  const fileRef = useRef(null)
  const [bimNombre, setBimNombre] = useState('')
  const [bimTipo, setBimTipo] = useState('Residencial')
  const [bimM2, setBimM2] = useState('')
  const [cats, setCats] = useState(null)        // categorías extraídas
  const [procesando, setProcesando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [errIfc, setErrIfc] = useState(null)
  const [archivo, setArchivo] = useState('')

  const subirIFC = async e => {
    const f = e.target.files?.[0]; if (!f) return
    setArchivo(f.name); setErrIfc(null); setCats(null); setProcesando(true); setProgreso(0)
    if (!bimNombre.trim()) setBimNombre(f.name.replace(/\.ifc$/i, ''))
    try {
      const buf = await f.arrayBuffer()
      const r = await procesarIFC(buf, setProgreso)
      if (!r.length) { setErrIfc('No se detectaron elementos en el modelo. Verifica que sea un IFC válido exportado desde Revit/ArchiCAD.'); setProcesando(false); return }
      if (r.sinBaseQuantities) setErrIfc('⚠️ El modelo no incluye "Base Quantities", por eso las áreas/longitudes salieron en 0 (el conteo de puertas/ventanas sí funciona). Vuelve a exportar el IFC desde Revit activando "Exportar cantidades base / Base Quantities" para obtener m², ml y m³.')
      setCats(r.map(c => ({ ...c, incluir: c.magnitud === 'count' || c.conCantidad > 0, descripcion: c.label, pu: 0 })))
    } catch (err) {
      console.error('[IFC]', err)
      setErrIfc('No se pudo leer el archivo IFC: ' + (err.message || err) + '. Asegúrate de que sea un .ifc válido exportado desde Revit/ArchiCAD.')
    }
    setProcesando(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const bimTotal = useMemo(() => round2((cats || []).filter(c => c.incluir).reduce((s, c) => s + (+c.cantidad || 0) * (+c.pu || 0), 0)), [cats])

  const crearBIM = async () => {
    const incl = (cats || []).filter(c => c.incluir && +c.cantidad > 0)
    if (!incl.length) return alert('Selecciona al menos una categoría con cantidad.')
    if (!bimNombre.trim()) return alert('Ponle un nombre al proyecto.')
    setCreando(true)
    const children = incl.map((c, i) => ({
      id: `1.${String(i + 1).padStart(2, '0')}`, tipo: 'actividad',
      descripcion: c.descripcion || c.label, unidad: c.unidad, cantidad: c.cantidad,
      precioManual: +c.pu || 0,
      ficha: { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] },
    }))
    const items = [{ id: '1', tipo: 'capitulo', descripcion: 'ELEMENTOS DEL MODELO BIM', children }]
    await onCrear({
      nombreProyecto: bimNombre.trim(), tipo: bimTipo, moneda,
      m2Construccion: +bimM2 || 0, items,
      catalogos: { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] },
    })
    setCreando(false)
  }

  // Sin data suficiente
  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="var(--c-accent)" /> Asistente IA de presupuesto
          </div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>
            {modo === 'historico'
              ? `Aprende de ${proyectos.length} proyecto${proyectos.length !== 1 ? 's' : ''} de tu organización · sin costo por uso`
              : 'Lee tu modelo Revit/BIM (.ifc) y extrae cantidades reales · sin costo por uso'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg)', padding: 3, borderRadius: 10 }}>
          <button className={`btn sm ${modo === 'historico' ? 'primary' : 'ghost'}`} onClick={() => setModo('historico')}><Wand2 size={13} /> Desde histórico</button>
          <button className={`btn sm ${modo === 'bim' ? 'primary' : 'ghost'}`} onClick={() => setModo('bim')}><Box size={13} /> Desde modelo BIM</button>
        </div>
      </div>

      {/* ═══════ MODO BIM (B1 · Revit/IFC) ═══════ */}
      {modo === 'bim' && (
        <div className="page-body">
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-3)', marginBottom: 10 }}>1 · Sube tu modelo BIM (.ifc exportado desde Revit / ArchiCAD)</div>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="field"><label className="field-label">Nombre del proyecto *</label><input className="input" value={bimNombre} onChange={e => setBimNombre(e.target.value)} placeholder="ej: Torre Norte" /></div>
              <div className="field"><label className="field-label">Tipo</label><input className="input" value={bimTipo} onChange={e => setBimTipo(e.target.value)} /></div>
              <div className="field"><label className="field-label">Área m² (opcional)</label><input type="number" className="input" value={bimM2} onChange={e => setBimM2(e.target.value)} placeholder="para costo/m²" /></div>
            </div>
            <input ref={fileRef} type="file" accept=".ifc" onChange={subirIFC} style={{ display: 'none' }} />
            <button className="btn brand" onClick={() => fileRef.current?.click()} disabled={procesando}>
              <Upload size={14} /> {procesando ? 'Procesando modelo…' : archivo ? `Cambiar archivo (${archivo})` : 'Seleccionar archivo .ifc'}
            </button>
            {procesando && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-text-2)', marginBottom: 6 }}>
                  <Cpu size={14} className="ico" /> Leyendo geometría y cantidades del modelo… {Math.round(progreso * 100)}%
                </div>
                <div style={{ height: 8, background: 'var(--c-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--c-line-2)' }}>
                  <div style={{ width: `${progreso * 100}%`, height: '100%', background: 'var(--c-accent)', transition: 'width .2s' }} />
                </div>
              </div>
            )}
            {errIfc && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#fee2e2', color: '#991b1b' }}>{errIfc}</div>}
          </div>

          {cats && (
            <Fragment>
              <div className="kpi-row" style={{ marginBottom: 14 }}>
                <div className="kpi"><div className="kpi-label"><Box size={12} className="ico" /> Categorías detectadas</div><div className="kpi-val" style={{ fontSize: 18 }}>{cats.length}</div></div>
                <div className="kpi"><div className="kpi-label"><Layers size={12} className="ico" /> Elementos en el modelo</div><div className="kpi-val" style={{ fontSize: 18 }}>{cats.reduce((s, c) => s + c.elementos, 0)}</div></div>
                <div className="kpi highlight"><div className="kpi-label"><FileText size={12} className="ico" /> Costo directo (con P.U.)</div><div className="kpi-val" style={{ fontSize: 18 }}>{money(bimTotal)}</div><div className="kpi-foot">asigna precios unitarios abajo</div></div>
              </div>
              <div className="card" style={{ padding: 0, marginBottom: 16 }}>
                <div className="card-header"><div className="card-title"><Box size={15} /> Cantidades extraídas del BIM</div><div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>cantidades reales del modelo — ajusta descripción y P.U.</div></div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="bt">
                    <thead><tr>
                      <th style={{ width: 40 }}></th>
                      <th>Categoría BIM → Actividad</th>
                      <th style={{ width: 60, textAlign: 'center' }}>Und</th>
                      <th className="num" style={{ width: 110 }}>Cantidad</th>
                      <th style={{ width: 90, textAlign: 'center' }}>Elementos</th>
                      <th className="num" style={{ width: 120 }}>P. Unitario</th>
                      <th className="num" style={{ width: 120 }}>Importe</th>
                    </tr></thead>
                    <tbody>
                      {cats.map((c, i) => (
                        <tr key={i} style={{ opacity: c.incluir ? 1 : 0.45 }}>
                          <td style={{ textAlign: 'center' }}><input type="checkbox" checked={c.incluir} onChange={() => setCats(cs => cs.map((x, j) => j === i ? { ...x, incluir: !x.incluir } : x))} style={{ width: 15, height: 15, accentColor: 'var(--c-accent)' }} /></td>
                          <td>
                            <input className="input sm" value={c.descripcion} onChange={e => setCats(cs => cs.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} style={{ width: '100%' }} />
                            <div style={{ fontSize: 10, color: 'var(--c-text-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{c.ifc} · {c.conCantidad}/{c.elementos} con cantidad</div>
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{c.unidad}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{fmt(c.cantidad)}</td>
                          <td style={{ textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12 }}>{c.elementos}</td>
                          <td className="num"><input type="number" min="0" step="any" className="input sm" value={c.pu} onFocus={e => e.target.select()} onChange={e => setCats(cs => cs.map((x, j) => j === i ? { ...x, pu: e.target.value } : x))} style={{ width: 106, textAlign: 'right' }} /></td>
                          <td className="num" style={{ fontWeight: 700 }}>{money(round2((+c.cantidad || 0) * (+c.pu || 0)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>Las cantidades vienen del modelo; podrás detallar APUs después.</span>
                <button className="btn brand" disabled={creando || !bimNombre.trim()} onClick={crearBIM} style={{ padding: '11px 22px', fontSize: 14 }}>
                  {creando ? 'Creando…' : <><Check size={15} strokeWidth={2.5} /> Crear proyecto desde BIM <ArrowRight size={15} /></>}
                </button>
              </div>
            </Fragment>
          )}
          {!cats && !procesando && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-3)' }}>
              <Box size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
              <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-2)' }}>Sube un modelo .ifc para extraer cantidades</div>
              <div style={{ fontSize: 13, maxWidth: 520, margin: '0 auto' }}>En Revit: <b>Exportar → IFC</b>, y activa "Exportar cantidades base (Base Quantities)" para que el asistente pueda leer áreas, longitudes y volúmenes.</div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ MODO HISTÓRICO (B3) ═══════ */}
      {modo === 'historico' && !tipos.length && (
        <div className="page-body">
          <div style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--c-ink)', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}><Wand2 size={30} color="var(--c-accent)" /></div>
            <h2 style={{ margin: '0 0 8px', color: 'var(--c-text)' }}>Aprender del histórico</h2>
            <p style={{ fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
              Necesita al menos <b>un proyecto con área (m²) y actividades con fichas</b> para aprender.
              Mientras tanto, puedes generar desde un <b>modelo BIM</b> con el botón de arriba.
            </p>
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--c-accent-soft)', fontSize: 13, color: 'var(--c-text-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={15} style={{ color: 'var(--c-warn)' }} /> Define los m² en Configuración de tus proyectos para alimentar al asistente.
            </div>
          </div>
        </div>
      )}

      {modo === 'historico' && tipos.length > 0 && (
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
      )}
    </Fragment>
  )
}
