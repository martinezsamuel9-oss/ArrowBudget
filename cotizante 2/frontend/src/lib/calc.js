// =====================================================================
// Lógica de cálculo de costos — funciones puras
// =====================================================================

export const fmt = (n) =>
  (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })

export const money = (n, currency = '$') => `${currency}${fmt(n)}`

// Costo de un concepto individual:
//   rendimiento × costoUnitario × (1 + desperdicio/100)
export const conceptoCost = (c) => {
  const rend = Number(c.rendimiento) || 0
  const desp = Number(c.desperdicio) || 0
  const cu = Number(c.costoUnitario ?? c.costo_unitario) || 0
  return rend * cu * (1 + desp / 100)
}

export const sumConceptos = (arr) =>
  (arr || []).reduce((s, c) => s + conceptoCost(c), 0)

// Cálculo completo de una ficha de costo
export const calcFicha = (ficha, pctIndirectos = 10, pctImprevistos = 1, pctUtilidad = 8) => {
  const f = ficha || { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const totMat = sumConceptos(f.materiales)
  const totMo = sumConceptos(f.manoObra)
  const totHe = sumConceptos(f.herramientaEquipo)
  const totSub = sumConceptos(f.subcontratos)
  const costoDirecto = totMat + totMo + totHe + totSub
  const indirectos = costoDirecto * (pctIndirectos / 100)
  const imprevistos = (costoDirecto + indirectos) * (pctImprevistos / 100)
  const utilidad = (costoDirecto + indirectos) * (pctUtilidad / 100)
  const precioUnitario = costoDirecto + indirectos + imprevistos + utilidad
  return {
    totMat, totMo, totHe, totSub,
    costoDirecto, indirectos, imprevistos, utilidad,
    precioUnitario,
  }
}

// Subtotal recursivo de un item del árbol (capítulo, sub-capítulo o actividad)
export const calcItem = (item, ctx) => {
  if (item.tipo === 'actividad') {
    const f = calcFicha(item.ficha, ctx.pctIndirectos, ctx.pctImprevistos, ctx.pctUtilidad)
    return {
      precioUnitario: f.precioUnitario,
      subtotal: f.precioUnitario * (Number(item.cantidad) || 0),
    }
  }
  let subtotal = 0
  for (const child of item.children || []) {
    subtotal += calcItem(child, ctx).subtotal
  }
  return { subtotal }
}

export const totalGeneral = (items, ctx) =>
  items.reduce((s, it) => s + calcItem(it, ctx).subtotal, 0)
