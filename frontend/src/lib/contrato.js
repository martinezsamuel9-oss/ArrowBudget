// ============ CONTRATO MODIFICADO (Fase III) ============
// Órdenes de cambio al formato SALCO: cada OC ajusta partidas existentes
// (aumento/disminución de obra) y/o agrega obra nueva. Estos helpers
// calculan el efecto sobre el contrato y la cantidad de contrato ajustada
// por actividad — que es lo que destrabla el tope de las estimaciones.
import { round2 } from './calc'

// Normaliza las líneas de una OC. Compatibilidad: las líneas del formato
// viejo (sin `tipo`) se tratan como obra nueva.
export const normLineasOC = oc => {
  const ajustes = [], nuevas = []
  for (const l of (oc?.lineas_json || [])) {
    if (l.tipo === 'ajuste') ajustes.push(l)
    else nuevas.push(l.tipo === 'nueva' ? l : { ...l, tipo: 'nueva' })
  }
  return { ajustes, nuevas }
}

// Ajuste de una partida: (cantNueva − cantOriginal) × P.U. — positivo aumento, negativo disminución
export const montoAjuste = a => round2(((+a.cantNueva || 0) - (+a.cantOriginal || 0)) * (+a.pu || 0))
export const montoNueva  = n => round2((+n.cantidad || 0) * (+n.pu || 0))

// Efecto monetario neto de una OC (suma de ajustes + obra nueva)
export const efectoOC = oc => {
  const { ajustes, nuevas } = normLineasOC(oc)
  return round2(ajustes.reduce((s, a) => s + montoAjuste(a), 0) + nuevas.reduce((s, n) => s + montoNueva(n), 0))
}

// Desglose aumento / disminución / obra nueva de una OC
export const desgloseOC = oc => {
  const { ajustes, nuevas } = normLineasOC(oc)
  let aumento = 0, disminucion = 0
  for (const a of ajustes) {
    const m = montoAjuste(a)
    if (m >= 0) aumento += m; else disminucion += m
  }
  const obraNueva = nuevas.reduce((s, n) => s + montoNueva(n), 0)
  return { aumento: round2(aumento), disminucion: round2(disminucion), obraNueva: round2(obraNueva), neto: round2(aumento + disminucion + obraNueva) }
}

// ¿Cuenta esta partida? Si la OC tiene revisión por partida (aprobacion_json),
// solo cuentan las marcadas 'aprobada'. Sin revisión por partida (legado) →
// cuentan todas (la aprobación global de la OC basta).
export const lineaCuenta = (oc, lineId) => {
  const ap = oc?.aprobacion_json || {}
  if (!Object.keys(ap).length) return true
  return ap[lineId]?.estado === 'aprobada'
}

// Δ cantidad de contrato por actividad, según OCs APROBADAS (suma de ajustes
// de las partidas aprobadas)
export const deltaCantPorActividad = ordenes => {
  const d = {}
  for (const oc of (ordenes || [])) {
    if (oc.estado !== 'aprobada') continue
    for (const a of normLineasOC(oc).ajustes) {
      if (!a.actividadId || !lineaCuenta(oc, a.id)) continue
      d[a.actividadId] = round2((d[a.actividadId] || 0) + ((+a.cantNueva || 0) - (+a.cantOriginal || 0)))
    }
  }
  return d
}

// Obra nueva aprobada como partidas estimables (id estable OC#-linea)
export const obraNuevaAprobada = ordenes => {
  const out = []
  for (const oc of (ordenes || [])) {
    if (oc.estado !== 'aprobada') continue
    for (const n of normLineasOC(oc).nuevas) {
      if (!(n.descripcion || '').trim() || !lineaCuenta(oc, n.id)) continue
      out.push({
        actividadId: `OC${oc.numero}·${n.id}`,
        descripcion: n.descripcion, unidad: n.unidad || '',
        cantidad: +n.cantidad || 0, pu: +n.pu || 0,
        capId: `OC-${oc.numero}`, capDesc: `Orden de cambio No. ${oc.numero}`,
        esObraNueva: true,
      })
    }
  }
  return out
}
