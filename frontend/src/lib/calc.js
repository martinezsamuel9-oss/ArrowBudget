// ============ CONSTANTES ============
export const CATEGORIAS = [
  { key: 'materiales',         label: 'Materiales',            icon: '🧱' },
  { key: 'manoObra',           label: 'Mano de Obra',          icon: '👷' },
  { key: 'herramientaEquipo',  label: 'Herramienta y Equipo',  icon: '🔧' },
  { key: 'subcontratos',       label: 'Subcontratos',          icon: '🏢' },
]

export const EMPTY_CATALOGOS = {
  materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [],
}

// ============ HELPERS ============
export const round2  = n => Math.round((+n || 0) * 100) / 100
export const fmt     = n => round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const money   = n => '$' + fmt(n)
export const moneyK  = n => {
  const v = +n || 0
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}
export const uid       = () => Math.random().toString(36).slice(2, 10)
export const normalize = s => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')

// ============ CATÁLOGO ============
export const findInsumo = (cat, k, id) =>
  (cat && cat[k] ? cat[k] : []).find(i => i.id === id)

const isHerramientaMenor = ins =>
  normalize(ins?.descripcion) === 'herramienta menor'

// opts.moTotal: si el insumo es "Herramienta Menor", usa moTotal como costoBase
export const conceptoCost = (c, cat, k, opts = {}) => {
  const ins = findInsumo(cat, k, c.insumoId)
  if (!ins) return 0
  const base = (k === 'herramientaEquipo' && isHerramientaMenor(ins) && opts.moTotal !== undefined)
    ? opts.moTotal
    : (+ins.costoBase || 0)
  return round2((+c.rendimiento || 0) * base * (1 + (+c.desperdicio || 0) / 100))
}

const sumCat = (arr, cat, k, opts = {}) =>
  (arr || []).reduce((s, c) => s + conceptoCost(c, cat, k, opts), 0)

// ============ CÁLCULOS PRINCIPALES ============
export const calcFicha = (f, cat, p) => {
  f = f || { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const totMat = round2(sumCat(f.materiales,        cat, 'materiales'))
  const totMo  = round2(sumCat(f.manoObra,          cat, 'manoObra'))
  // Herramienta: items con unidad "% (MO)" usan el total MO como costoBase
  const totHe  = round2(sumCat(f.herramientaEquipo, cat, 'herramientaEquipo', { moTotal: totMo }))
  const totSub = round2(sumCat(f.subcontratos,      cat, 'subcontratos'))
  const cd      = round2(totMat + totMo + totHe + totSub)
  const ind     = round2(cd * (p.pctIndirectos  / 100))
  const imp     = round2((cd + ind) * (p.pctImprevistos / 100))
  const uti     = round2((cd + ind) * (p.pctUtilidad    / 100))
  const sinTax  = round2(cd + ind + imp + uti)
  const tax     = round2(sinTax * (p.pctImpuesto / 100))
  const pu      = round2(sinTax + tax)
  return {
    totMat, totMo, totHe, totSub,
    costoDirecto: cd, indirectos: ind, imprevistos: imp, utilidad: uti,
    subtotalSinImpuesto: sinTax, impuesto: tax, precioUnitario: pu,
  }
}

export const calcItem = (it, cat, p) => {
  if (it.tipo === 'actividad') {
    const f = calcFicha(it.ficha, cat, p)
    return { precioUnitario: f.precioUnitario, subtotal: round2(f.precioUnitario * (+it.cantidad || 0)) }
  }
  let s = 0
  for (const c of it.children || []) s += calcItem(c, cat, p).subtotal
  return { subtotal: round2(s) }
}

export const calcKPIs = b => {
  const p = {
    pctIndirectos: b.pctIndirectos, pctImprevistos: b.pctImprevistos,
    pctUtilidad:   b.pctUtilidad,   pctImpuesto:    b.pctImpuesto,
  }
  let totDir = 0, totInd = 0, totImp = 0, totUti = 0, total = 0, nActs = 0
  const walk = its => {
    for (const it of its) {
      if (it.tipo === 'actividad') {
        const f = calcFicha(it.ficha, b.catalogos, p)
        const q = +it.cantidad || 0
        totDir += f.costoDirecto   * q
        totInd += f.indirectos     * q
        totImp += f.imprevistos    * q
        totUti += f.utilidad       * q
        total  += f.precioUnitario * q
        nActs++
      } else if (it.children) walk(it.children)
    }
  }
  walk(b.items)
  return {
    totDir: round2(totDir), totInd: round2(totInd),
    totImp: round2(totImp), totUti: round2(totUti),
    total:  round2(total),
    nActividades: nActs,
    nCapitulos:   b.items.filter(i => i.tipo === 'capitulo').length,
  }
}

// ============ UTILIDADES DE CATÁLOGO ============
export const findOrCreateInsumo = (cat, k, desc) => {
  const n = normalize(desc)
  if (!n) return null
  const ex = (cat[k] || []).find(i => normalize(i.descripcion) === n)
  if (ex) return { catalogos: cat, insumo: ex }
  const ni = { id: uid(), codigo: '', descripcion: desc.trim(), unidad: 'und', costoBase: 0, proveedor: '', notas: '' }
  return { catalogos: { ...cat, [k]: [...(cat[k] || []), ni] }, insumo: ni }
}

export const findPathById = (items, id, path = []) => {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return [...path, i]
    if (items[i].children) {
      const r = findPathById(items[i].children, id, [...path, i])
      if (r) return r
    }
  }
  return null
}
