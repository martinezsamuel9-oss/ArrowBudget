// ============ ASISTENTE IA DE PRESUPUESTO — Motor B3 (histórico) ============
// Genera presupuestos aprendiendo de los proyectos terminados de la propia
// organización: por tipología, promedia el rendimiento (cantidad/m²) de cada
// actividad y arrastra su mejor ficha (APU). Determinístico, en el navegador,
// CERO tokens — y mejora solo con cada proyecto nuevo.
import { uid, normalize, CATEGORIAS } from './calc'

const m2De = p => +(p.m2Construccion || 0) || +(p.m2Estructura || 0) || 0

// Actividades de un proyecto con la descripción de su capítulo (colapsa subcapítulos)
const actividadesDe = p => {
  const out = []
  const walk = (its, capDesc) => {
    for (const it of (its || [])) {
      if (it.tipo === 'capitulo') walk(it.children, it.descripcion)
      else if (it.tipo === 'subcapitulo') walk(it.children, capDesc)
      else if (it.tipo === 'actividad') out.push({ capDesc: capDesc || 'GENERALES', ...it })
    }
  }
  walk(p.items)
  return out
}

const fichaLen = f => (f ? CATEGORIAS.reduce((s, c) => s + (f[c.key] || []).length, 0) : 0)

// Tipologías con suficiente data (al menos un proyecto con m² y actividades)
export const tiposParaIA = proyectos => {
  const m = {}
  for (const p of (proyectos || [])) {
    if (m2De(p) <= 0) continue
    if (!actividadesDe(p).length) continue
    const t = p.tipo || 'General'
    if (!m[t]) m[t] = { tipo: t, proyectos: [] }
    m[t].proyectos.push({ id: p.id, nombre: p.nombreProyecto, m2: m2De(p) })
  }
  return Object.values(m).sort((a, b) => b.proyectos.length - a.proyectos.length)
}

// Aprende un modelo de presupuesto para una tipología (opcionalmente acotado
// a ciertos proyectos fuente). Promedia rendimientos y elige la ficha más completa.
export const aprenderTipo = (proyectos, tipo, fuenteIds = null) => {
  const fuentes = (proyectos || []).filter(p =>
    (p.tipo || 'General') === tipo && m2De(p) > 0 &&
    (!fuenteIds || fuenteIds.includes(p.id)))

  const capOrder = []
  const capMap = {}
  for (const p of fuentes) {
    const m2 = m2De(p)
    for (const a of actividadesDe(p)) {
      const capKey = normalize(a.capDesc)
      if (!capMap[capKey]) { capMap[capKey] = { desc: a.capDesc, acts: {}, actOrder: [] }; capOrder.push(capKey) }
      const actKey = normalize(a.descripcion)
      const acts = capMap[capKey].acts
      if (!acts[actKey]) { acts[actKey] = { desc: a.descripcion, unidades: {}, rendSum: 0, n: 0, samples: [] }; capMap[capKey].actOrder.push(actKey) }
      const rend = (+a.cantidad || 0) / m2
      acts[actKey].rendSum += rend
      acts[actKey].n++
      const u = a.unidad || ''
      acts[actKey].unidades[u] = (acts[actKey].unidades[u] || 0) + 1
      acts[actKey].samples.push({ ficha: a.ficha, len: fichaLen(a.ficha), cat: p.catalogos })
    }
  }

  const capitulos = capOrder.map(ck => {
    const c = capMap[ck]
    const actividades = c.actOrder.map(ak => {
      const a = c.acts[ak]
      const unidad = Object.entries(a.unidades).sort((x, y) => y[1] - x[1])[0][0]
      const best = a.samples.slice().sort((x, y) => y.len - x.len)[0]
      return {
        desc: a.desc, unidad,
        rendPorM2: a.rendSum / a.n,
        ficha: best.ficha, catFuente: best.cat,
        muestras: a.n, conFicha: best.len > 0,
      }
    })
    return { desc: c.desc, actividades }
  })

  return {
    tipo,
    fuentes: fuentes.map(p => ({ id: p.id, nombre: p.nombreProyecto, m2: m2De(p) })),
    capitulos,
    nActividades: capitulos.reduce((s, c) => s + c.actividades.length, 0),
    nConFicha: capitulos.reduce((s, c) => s + c.actividades.filter(a => a.conFicha).length, 0),
  }
}

// Genera el árbol de items + catálogos para un m² destino a partir del modelo.
// Arrastra las fichas remapeando insumos a un catálogo nuevo deduplicado.
export const generarDesdeModelo = (modelo, m2Destino, capsActivos = null) => {
  const catalogos = { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const idx = { materiales: {}, manoObra: {}, herramientaEquipo: {}, subcontratos: {} }
  const keyIns = i => normalize(i.descripcion) + '|' + normalize(i.unidad || '')
  const ensureIns = (catFuente, k, srcId) => {
    const src = (catFuente?.[k] || []).find(i => i.id === srcId)
    if (!src) return null
    const kk = keyIns(src)
    if (idx[k][kk]) return idx[k][kk]
    const ni = { ...src, id: uid() }
    catalogos[k].push(ni); idx[k][kk] = ni.id
    return ni.id
  }

  const caps = modelo.capitulos.filter((_, i) => !capsActivos || capsActivos.includes(i))
  let capN = 0
  const items = caps.map(c => {
    capN++
    const capId = String(capN)
    let actN = 0
    const children = c.actividades.map(a => {
      actN++
      const cantidad = Math.round(a.rendPorM2 * m2Destino * 100) / 100
      const ficha = { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
      if (a.ficha) for (const cat of CATEGORIAS) {
        for (const concepto of (a.ficha[cat.key] || [])) {
          const nid = ensureIns(a.catFuente, cat.key, concepto.insumoId)
          if (nid) ficha[cat.key].push({ ...concepto, id: uid(), insumoId: nid })
        }
      }
      return { id: `${capId}.${String(actN).padStart(2, '0')}`, tipo: 'actividad', descripcion: a.desc, unidad: a.unidad, cantidad, ficha }
    })
    return { id: capId, tipo: 'capitulo', descripcion: c.desc, children }
  })
  return { items, catalogos }
}
