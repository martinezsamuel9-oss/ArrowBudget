// ============ INFORMES EJECUTIVOS + KPIs (Fase III · módulo 4) ============
// Cierra el círculo financiero cruzando presupuesto, órdenes de cambio,
// estimaciones (cobrado al cliente) y planillas (gastado en contratistas),
// con avance físico del cronograma. KPIs: avance financiero, retenciones,
// amortización de anticipo, otras deducciones y margen real por capítulo.
import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { calcItem, calcResumenFinanciero, makeMoneyFmt, round2 } from '../lib/calc'
import { flattenActividades, calcularFechas, avanceGlobal, hoyISO } from '../lib/cronograma'
import { efectoOC, deltaCantPorActividad, obraNuevaAprobada } from '../lib/contrato'
import { exportPDFInforme } from '../lib/exportInforme'
import { BarChart2, FileText, Coins, Activity, TrendingUp, Receipt, HardHat, DollarSign } from 'lucide-react'

const sumLineasDestajoPorCap = planillas => {
  // gasto real por capítulo (solo líneas destajo de planillas aprobadas/pagadas)
  const m = {}
  for (const p of planillas) {
    if (!['aprobada', 'pagada'].includes(p.estado)) continue
    for (const l of (p.lineas_json || [])) {
      if (l.tipo !== 'destajo' || !l.capId) continue
      // P.U. neto: el descuento se aplica una vez sobre el precio unitario
      m[l.capId] = round2((m[l.capId] || 0) + (+l.cantidad || 0) * (+l.pu || 0) * (1 - (+l.descuento || 0) / 100))
    }
  }
  return m
}
const sumCobradoPorCap = estimaciones => {
  const m = {}
  for (const e of estimaciones) {
    if (!['aprobada', 'pagada'].includes(e.estado)) continue
    for (const l of (e.lineas_json || [])) {
      if (!l.capId) continue
      m[l.capId] = round2((m[l.capId] || 0) + (+l.cantidad || 0) * (+l.pu || 0))
    }
  }
  return m
}

export default function InformesPage({ budget, params, userEmpresa }) {
  const [est, setEst] = useState([])
  const [pla, setPla] = useState([])
  const [oc, setOc] = useState([])
  const [crono, setCrono] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumen')

  const money = makeMoneyFmt(budget?.moneda)

  useEffect(() => {
    let cancel = false
    const cargar = async () => {
      if (!budget?.id) { setLoading(false); return }
      setLoading(true)
      const [e, p, o, c] = await Promise.all([
        supabase.from('estimaciones').select('*').eq('presupuesto_id', budget.id),
        supabase.from('planillas').select('*').eq('presupuesto_id', budget.id),
        supabase.from('ordenes_cambio').select('*').eq('presupuesto_id', budget.id),
        supabase.from('cronogramas').select('datos_json, fecha_inicio').eq('presupuesto_id', budget.id).maybeSingle(),
      ])
      if (cancel) return
      setEst(e.data || []); setPla(p.data || []); setOc(o.data || []); setCrono(c.data || null)
      setLoading(false)
    }
    cargar()
    return () => { cancel = true }
  }, [budget?.id])

  const acts = useMemo(() => flattenActividades(budget?.items || []), [budget?.items])
  const pus = useMemo(() => {
    const m = {}
    const walk = its => { for (const it of (its || [])) {
      if (it.tipo === 'actividad') m[it.id] = calcItem(it, budget?.catalogos, params).precioUnitario
      else if (it.children) walk(it.children)
    } }
    walk(budget?.items || [])
    return m
  }, [budget?.items, budget?.catalogos, params])

  const data = useMemo(() => {
    if (!budget) return null
    const R = calcResumenFinanciero(budget.items, budget.catalogos, params)
    const contratoOriginal = R.total
    const tot = arr => arr.filter(x => ['aprobada', 'pagada'].includes(x.estado))
    // OC aprobadas — usa efectoOC (ajuste = (cantNueva−cantOriginal)×pu) para no
    // descuadrar contra Órdenes de Cambio y Estimaciones
    const ocAprob = round2(oc.filter(o => o.estado === 'aprobada').reduce((s, o) => s + efectoOC(o), 0))
    const contratoVigente = round2(contratoOriginal + ocAprob)
    // Estimaciones (cobrado al cliente)
    const estA = tot(est)
    const cobradoBruto = round2(estA.reduce((s, e) => s + (+e.subtotal || 0), 0))
    const retCliente = round2(estA.reduce((s, e) => s + (+e.retencion || 0), 0))
    const amoCliente = round2(estA.reduce((s, e) => s + (+e.amortizacion || 0), 0))
    const cobradoNeto = round2(estA.reduce((s, e) => s + (+e.neto || 0), 0))
    // Planillas (gastado en contratistas)
    const plaA = tot(pla)
    const gastoBruto = round2(plaA.reduce((s, p) => s + (+p.subtotal || 0), 0))
    const retContrat = round2(plaA.reduce((s, p) => s + (+p.retencion || 0), 0))
    const amoContrat = round2(plaA.reduce((s, p) => s + (+p.amortizacion || 0), 0))
    const dedContrat = round2(plaA.reduce((s, p) => s + (+p.deducciones || 0), 0))
    const pagadoNeto = round2(plaA.reduce((s, p) => s + (+p.neto || 0), 0))
    // Avance físico (cronograma)
    let avanceFisico = 0
    if (crono?.datos_json?.actividades) {
      const datos = crono.datos_json.actividades
      const fechas = calcularFechas(acts, crono.fecha_inicio, datos, crono.datos_json.calendario)
      const pesos = {}; acts.forEach(a => { pesos[a.id] = (pus[a.id] || 0) * (+a.cantidad || 0) })
      avanceFisico = avanceGlobal(acts, fechas, datos, pesos, hoyISO()).real
    }
    const avanceFinanciero = contratoVigente > 0 ? Math.round(cobradoBruto / contratoVigente * 100) : 0
    // Por capítulo — venta = contrato VIGENTE (cantidad ajustada por OC aprobadas)
    const cobradoCap = sumCobradoPorCap(est)
    const gastoCap = sumLineasDestajoPorCap(pla)
    const delta = deltaCantPorActividad(oc)
    const capsMap = new Map()
    const ensureCap = (capId, capDesc) => { if (!capsMap.has(capId)) capsMap.set(capId, { capId, capDesc, venta: 0 }); return capsMap.get(capId) }
    for (const a of acts) {
      const c = ensureCap(a.capId, a.capDesc)
      const cant = (+a.cantidad || 0) + (delta[a.id] || 0)
      c.venta = round2(c.venta + (pus[a.id] || 0) * cant)
    }
    // Obra nueva aprobada → pseudo-capítulos OC-N (con su venta)
    for (const n of obraNuevaAprobada(oc)) {
      const c = ensureCap(n.capId, n.capDesc)
      c.venta = round2(c.venta + (+n.cantidad || 0) * (+n.pu || 0))
    }
    const capitulos = [...capsMap.values()].map(c => {
      const cobrado = cobradoCap[c.capId] || 0
      const gastado = gastoCap[c.capId] || 0
      return { ...c, cobrado, gastado, margen: round2(cobrado - gastado), pctFin: c.venta > 0 ? Math.round(cobrado / c.venta * 100) : 0 }
    })
    // Fila "Otros": personal al día y destajo sin capítulo → para que los
    // totales de la tabla cuadren con el resumen (cobrado/gasto bruto)
    const otrosCobrado = round2(cobradoBruto - capitulos.reduce((s, c) => s + c.cobrado, 0))
    const otrosGastado = round2(gastoBruto - capitulos.reduce((s, c) => s + c.gastado, 0))
    if (otrosCobrado > 0.01 || otrosGastado > 0.01) {
      capitulos.push({ capId: '—', capDesc: 'Personal al día / sin capítulo', venta: 0, cobrado: otrosCobrado, gastado: otrosGastado, margen: round2(otrosCobrado - otrosGastado), pctFin: 0, esOtros: true })
    }
    return {
      contratoOriginal, ocAprob, contratoVigente, costoDirecto: R.direct,
      cobradoBruto, retCliente, amoCliente, cobradoNeto,
      gastoBruto, retContrat, amoContrat, dedContrat, pagadoNeto,
      avanceFisico, avanceFinanciero,
      margenReal: round2(cobradoBruto - gastoBruto),
      capitulos,
    }
  }, [budget, params, est, pla, oc, crono, acts, pus])

  if (!budget) return (
    <div className="page-body"><div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-3)' }}>
      <BarChart2 size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
      <div style={{ fontSize: 13 }}>Abre un proyecto para ver su informe ejecutivo.</div>
    </div></div>
  )
  if (loading || !data) return <div className="page-body" style={{ padding: 60, textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando informe…</div>

  const Barra = ({ pct, color }) => (
    <div style={{ flex: 1, height: 8, background: 'var(--c-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--c-line-2)' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
    </div>
  )

  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Informe ejecutivo — {budget.nombreProyecto}</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>{budget.cliente || 'Sin cliente'}</div>
        </div>
        <button className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }}
          onClick={() => exportPDFInforme(budget, data, { nombre: userEmpresa, logo: budget.logoOfertante, logoCliente: budget.logoCliente, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText })}>
          <FileText size={13} /> PDF
        </button>
      </div>

      <div className="tabs" style={{ borderBottom: '1px solid var(--c-line)', margin: '0 0 0', padding: '0 24px' }}>
        {[['resumen', 'Resumen ejecutivo', BarChart2], ['capitulos', 'Por capítulo', Coins]].map(([k, l, Icon]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}><Icon size={14} /> {l}</button>
        ))}
      </div>

      <div className="page-body">
        {tab === 'resumen' && (
          <Fragment>
            {/* Avances */}
            <div className="kpi-row" style={{ marginBottom: 14 }}>
              <div className="kpi highlight">
                <div className="kpi-label"><DollarSign size={12} className="ico" /> Contrato vigente</div>
                <div className="kpi-val" style={{ fontSize: 17 }}>{money(data.contratoVigente)}</div>
                <div className="kpi-foot">{data.ocAprob !== 0 ? `original ${money(data.contratoOriginal)} ${data.ocAprob > 0 ? '+' : '−'} ${money(Math.abs(data.ocAprob))} OC` : 'sin órdenes de cambio'}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><Activity size={12} className="ico" /> Avance físico</div>
                <div className="kpi-val">{data.avanceFisico}%</div>
                <div className="kpi-foot">obra ejecutada (cronograma)</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><TrendingUp size={12} className="ico" /> Avance financiero</div>
                <div className="kpi-val">{data.avanceFinanciero}%</div>
                <div className="kpi-foot">cobrado / contrato</div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><Coins size={12} className="ico" /> Margen en ejecución</div>
                <div className="kpi-val" style={{ fontSize: 17, color: data.margenReal >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }}>{money(data.margenReal)}</div>
                <div className="kpi-foot">cobrado − gastado contratistas</div>
              </div>
            </div>

            {/* Cobrado vs gastado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card" style={{ padding: 0 }}>
                <div className="card-header"><div className="card-title"><Receipt size={15} /> Cobrado al cliente (estimaciones)</div></div>
                {[
                  ['Obra ejecutada (bruto)', money(data.cobradoBruto)],
                  ['(−) Retención de calidad', `− ${money(data.retCliente)}`],
                  ['(−) Amortización de anticipo', `− ${money(data.amoCliente)}`],
                  ['Neto cobrado', money(data.cobradoNeto)],
                ].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderTop: '1px solid var(--c-line-2)', background: i === arr.length - 1 ? 'var(--c-bg)' : 'transparent' }}>
                    <span style={{ fontSize: 13, fontWeight: i === arr.length - 1 ? 700 : 500, color: 'var(--c-text-2)' }}>{l}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 0 }}>
                <div className="card-header"><div className="card-title"><HardHat size={15} /> Pagado a contratistas (planillas)</div></div>
                {[
                  ['Obra + personal (bruto)', money(data.gastoBruto)],
                  ['(−) Retención', `− ${money(data.retContrat)}`],
                  ['(−) Amortización de anticipo', `− ${money(data.amoContrat)}`],
                  ['(−) Otras deducciones', `− ${money(data.dedContrat)}`],
                  ['Neto pagado', money(data.pagadoNeto)],
                ].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderTop: '1px solid var(--c-line-2)', background: i === arr.length - 1 ? 'var(--c-bg)' : 'transparent' }}>
                    <span style={{ fontSize: 13, fontWeight: i === arr.length - 1 ? 700 : 500, color: 'var(--c-text-2)' }}>{l}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 12 }}>
              Solo se contabilizan estimaciones y planillas en estado <b>aprobada</b> o <b>pagada</b>.
            </div>
          </Fragment>
        )}

        {tab === 'capitulos' && (
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header"><div className="card-title"><Coins size={15} /> Resultado por capítulo</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="bt">
                <thead><tr>
                  <th>Capítulo</th>
                  <th className="num" style={{ width: 140 }}>Venta (contrato)</th>
                  <th className="num" style={{ width: 140 }}>Cobrado</th>
                  <th className="num" style={{ width: 140 }}>Gastado (destajo)</th>
                  <th className="num" style={{ width: 130 }}>Margen</th>
                  <th style={{ width: 150 }}>% Cobrado</th>
                </tr></thead>
                <tbody>
                  {data.capitulos.map(c => (
                    <tr key={c.capId}>
                      <td style={{ fontWeight: 600 }}>{c.capId} · {c.capDesc}</td>
                      <td className="num">{money(c.venta)}</td>
                      <td className="num">{money(c.cobrado)}</td>
                      <td className="num" style={{ color: 'var(--c-text-2)' }}>{money(c.gastado)}</td>
                      <td className="num" style={{ fontWeight: 700, color: c.margen >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }}>{money(c.margen)}</td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Barra pct={c.pctFin} color="var(--c-accent)" /><span style={{ fontSize: 11, color: 'var(--c-text-3)', width: 32, textAlign: 'right' }}>{c.pctFin}%</span></div></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>TOTAL</td>
                    <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: '#fff' }}>{money(round2(data.capitulos.reduce((s, c) => s + c.venta, 0)))}</td>
                    <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(round2(data.capitulos.reduce((s, c) => s + c.cobrado, 0)))}</td>
                    <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'rgba(255,255,255,0.7)' }}>{money(round2(data.capitulos.reduce((s, c) => s + c.gastado, 0)))}</td>
                    <td className="num" style={{ fontWeight: 800, background: 'var(--c-ink)', color: 'var(--c-accent)' }}>{money(round2(data.capitulos.reduce((s, c) => s + c.margen, 0)))}</td>
                    <td style={{ background: 'var(--c-ink)' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', padding: '10px 16px' }}>
              Venta = contrato vigente (incluye órdenes de cambio aprobadas). Gastado = destajo de planillas aprobadas/pagadas ligado al capítulo. El personal al día y el destajo sin capítulo se agrupan en "Personal al día / sin capítulo" para que los totales cuadren con el resumen.
            </div>
          </div>
        )}
      </div>
    </Fragment>
  )
}
