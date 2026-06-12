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

const CURRENCY_SYMBOLS = { USD:'$', HNL:'L', GTQ:'Q', NIO:'C$', CRC:'₡', MXN:'$', EUR:'€' }
export const currencySymbol = (cur = 'USD') => CURRENCY_SYMBOLS[cur] || '$'
// money(n) — mantiene compatibilidad con llamadas existentes (muestra $)
// money(n, moneda) — usa el símbolo correcto
export const money   = (n, cur = 'USD') => currencySymbol(cur) + fmt(n)
export const moneyK  = (n, cur = 'USD') => {
  const s = currencySymbol(cur)
  const v = +n || 0
  if (v >= 1e6) return s + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return s + (v / 1e3).toFixed(1) + 'K'
  return s + v.toFixed(0)
}
// Crea un formateador local atado a una moneda específica
export const makeMoneyFmt = (cur = 'USD') => (n => money(n, cur))
export const uid       = () => Math.random().toString(36).slice(2, 10)
export const normalize = s => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')

// ============ CATÁLOGO ============
export const findInsumo = (cat, k, id) =>
  (cat && cat[k] ? cat[k] : []).find(i => i.id === id)

const isHerramientaMenor = ins =>
  normalize(ins?.descripcion) === 'herramienta menor'

// opts.moTotal: si el insumo es "Herramienta Menor", rendimiento = % directo del MO total
// Ej: rendimiento=5 → 5% de moTotal → base = moTotal/100 para que rend*base = rend% × moTotal
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
    // Si la ficha está vacía y hay un precio importado manualmente, usarlo como fallback
    const pu = (f.precioUnitario === 0 && it.precioManual > 0) ? +it.precioManual : f.precioUnitario
    return { precioUnitario: pu, subtotal: round2(pu * (+it.cantidad || 0)) }
  }
  let s = 0
  for (const c of it.children || []) s += calcItem(c, cat, p).subtotal
  return { subtotal: round2(s) }
}

// Desglose financiero del presupuesto SIN doble conteo.
// El PU de cada ficha YA incluye indirectos/imprevistos/utilidad/impuesto,
// así que: total general = Σ PU×cantidad, y el costo directo se obtiene de
// los componentes de la ficha. Para actividades con precio manual (PU final
// importado), se desagrega quitando los porcentajes hacia atrás:
//   PU = CD × (1+ind) × (1 + imprev + util) × (1 + impuesto)
export const calcResumenFinanciero = (items, cat, p) => {
  const i = (+p.pctIndirectos || 0) / 100
  const v = (+p.pctImprevistos || 0) / 100
  const u = (+p.pctUtilidad || 0) / 100
  const t = (+p.pctImpuesto || 0) / 100
  let direct = 0, indirectos = 0, imprevistos = 0, utilidad = 0, impuesto = 0, total = 0
  const walk = its => {
    for (const it of (its || [])) {
      if (it.tipo === 'actividad') {
        const q = +it.cantidad || 0
        const f = calcFicha(it.ficha, cat, p)
        if (f.precioUnitario === 0 && it.precioManual > 0) {
          const pu = +it.precioManual
          const sinTax = pu / (1 + t)
          const cd = sinTax / ((1 + i) * (1 + v + u))
          direct      += cd * q
          indirectos  += cd * i * q
          imprevistos += cd * (1 + i) * v * q
          utilidad    += cd * (1 + i) * u * q
          impuesto    += (pu - sinTax) * q
          total       += pu * q
        } else {
          direct      += f.costoDirecto * q
          indirectos  += f.indirectos * q
          imprevistos += f.imprevistos * q
          utilidad    += f.utilidad * q
          impuesto    += f.impuesto * q
          total       += f.precioUnitario * q
        }
      } else if (it.children) walk(it.children)
    }
  }
  walk(items)
  const subtotal = round2(direct + indirectos + imprevistos)
  const subtotalConU = round2(subtotal + utilidad)
  return {
    direct: round2(direct), indirectos: round2(indirectos), imprevistos: round2(imprevistos),
    subtotal, utilidad: round2(utilidad), subtotalConU,
    impuesto: round2(impuesto), total: round2(total),
  }
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
        const pu = (f.precioUnitario === 0 && it.precioManual > 0) ? +it.precioManual : f.precioUnitario
        const q = +it.cantidad || 0
        totDir += f.costoDirecto   * q
        totInd += f.indirectos     * q
        totImp += f.imprevistos    * q
        totUti += f.utilidad       * q
        total  += pu               * q
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

// ============ EXPLOSIÓN DE INSUMOS ============
// Consolida todas las fichas del presupuesto y suma cantidades/costos por insumo.
// filterFn(actividad) → incluir esa actividad (null = todas)
export const calcExplosionInsumos = (items, catalogos, params, filterFn = null) => {
  const CATS = ['materiales', 'manoObra', 'herramientaEquipo', 'subcontratos']
  const map = { materiales: {}, manoObra: {}, herramientaEquipo: {}, subcontratos: {} }

  const walk = its => {
    its.forEach(it => {
      if (it.tipo === 'actividad') {
        if (filterFn && !filterFn(it)) return
        const actQty = +it.cantidad || 0
        if (actQty === 0) return
        const f = it.ficha || {}

        // Calcular costo MO por unidad de actividad (base para Herramienta Menor)
        const totMo = round2(
          (f.manoObra || []).reduce((s, c) => {
            const ins = findInsumo(catalogos, 'manoObra', c.insumoId)
            return s + round2((+c.rendimiento || 0) * (+ins?.costoBase || 0) * (1 + (+c.desperdicio || 0) / 100))
          }, 0)
        )

        CATS.forEach(cat => {
          ;(f[cat] || []).forEach(c => {
            if (!c.insumoId) return
            const ins = findInsumo(catalogos, cat, c.insumoId)
            if (!ins) return
            const isHM = cat === 'herramientaEquipo' && normalize(ins.descripcion) === 'herramienta menor'
            let cantTotal, costoTotal
            if (isHM) {
              // HM: su costo = rendimiento (%) × totMo × cantidad actividad
              costoTotal = round2(actQty * (+c.rendimiento || 0) * totMo * (1 + (+c.desperdicio || 0) / 100))
              cantTotal = 0
            } else {
              cantTotal = round2(actQty * (+c.rendimiento || 0) * (1 + (+c.desperdicio || 0) / 100))
              costoTotal = round2(cantTotal * (+ins.costoBase || 0))
            }
            if (!map[cat][ins.id]) {
              map[cat][ins.id] = {
                id: ins.id, codigo: ins.codigo || '', descripcion: ins.descripcion,
                unidad: ins.unidad, costoBase: +ins.costoBase || 0,
                cantTotal: 0, costoTotal: 0, isHM,
              }
            }
            map[cat][ins.id].cantTotal = round2(map[cat][ins.id].cantTotal + cantTotal)
            map[cat][ins.id].costoTotal = round2(map[cat][ins.id].costoTotal + costoTotal)
          })
        })
      } else if (it.children) walk(it.children)
    })
  }
  walk(items)

  const result = {}
  CATS.forEach(cat => {
    result[cat] = Object.values(map[cat]).sort((a, b) => b.costoTotal - a.costoTotal)
  })
  return result
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
