// ============ CRONOGRAMA (Fase II) ============
// Cálculo de fechas del cronograma: aplanado de actividades del presupuesto
// y forward pass encadenando predecesoras. Días calendario (sin feriados).

export const addDays = (date, days) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export const fmtFecha = d => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })
}

export const hoyISO = () => new Date().toISOString().slice(0, 10)

// Aplana el árbol del presupuesto a la lista de actividades con su capítulo
export const flattenActividades = items => {
  const acts = []
  const walk = (its, capId = '', capDesc = '') => {
    for (const it of (its || [])) {
      if (it.tipo === 'capitulo') walk(it.children, it.id, it.descripcion)
      else if (it.tipo === 'subcapitulo') walk(it.children, capId, capDesc)
      else if (it.tipo === 'actividad') acts.push({ id: it.id, descripcion: it.descripcion, unidad: it.unidad, cantidad: it.cantidad, capId, capDesc })
    }
  }
  walk(items)
  return acts
}

// Forward pass: fecha de inicio de cada actividad = máx(fin de sus predecesoras),
// o la fecha de inicio del proyecto si no tiene. fin = inicio + duración (exclusivo).
// Tolera ciclos (los corta) y predecesoras inexistentes (las ignora).
export const calcularFechas = (acts, fechaInicio, datosActividades = {}) => {
  const ids = new Set(acts.map(a => a.id))
  const inicioProyecto = fechaInicio ? new Date(fechaInicio + 'T00:00:00') : new Date()
  const map = {}
  const visitando = new Set()

  const resolver = id => {
    if (map[id]) return map[id]
    const d = datosActividades[id] || {}
    const dur = Math.max(1, Math.round(+d.duracion) || 7)
    if (visitando.has(id)) {
      // ciclo: se ancla al inicio del proyecto para no recursar infinito
      return (map[id] = { inicio: inicioProyecto, fin: addDays(inicioProyecto, dur), dur, circular: true })
    }
    visitando.add(id)
    let inicio = inicioProyecto
    for (const p of (d.predecesoras || [])) {
      if (p === id || !ids.has(p)) continue
      const f = resolver(p)
      if (f.fin > inicio) inicio = f.fin
    }
    visitando.delete(id)
    return (map[id] = { inicio, fin: addDays(inicio, dur), dur })
  }

  acts.forEach(a => resolver(a.id))
  return map
}

// Resumen global: inicio, fin y duración total del proyecto según el cronograma
export const resumenCronograma = (acts, fechas) => {
  let inicio = null, fin = null
  for (const a of acts) {
    const f = fechas[a.id]
    if (!f) continue
    if (!inicio || f.inicio < inicio) inicio = f.inicio
    if (!fin || f.fin > fin) fin = f.fin
  }
  const dias = inicio && fin ? Math.round((fin - inicio) / 86400000) : 0
  return { inicio, fin, dias }
}

// Parsea el input de predecesoras: "1.01, 1.02" → ['1.01','1.02'] (solo ids válidos)
export const parsePredecesoras = (texto, idsValidos, propioId) =>
  String(texto || '')
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(s => s && s !== propioId && idsValidos.has(s))

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ── Flujo de caja (módulo 4) ──
// Reparte el costo de cada actividad uniformemente en sus días programados
// y agrega por periodo (semana que inicia lunes, o mes calendario).
const lunesDe = d => {
  const m = new Date(d); m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

export const flujoDeCaja = (acts, fechas, datos, pesos, modo = 'semana') => {
  const buckets = new Map()
  for (const a of acts) {
    const f = fechas[a.id]
    if (!f || !datos[a.id]) continue
    const costo = pesos[a.id] || 0
    if (!costo || !f.dur) continue
    const porDia = costo / f.dur
    for (let i = 0; i < f.dur; i++) {
      const d = addDays(f.inicio, i)
      const ini = modo === 'mes' ? new Date(d.getFullYear(), d.getMonth(), 1) : lunesDe(d)
      const key = ini.getTime()
      buckets.set(key, (buckets.get(key) || 0) + porDia)
    }
  }
  const rows = [...buckets.entries()].sort((x, y) => x[0] - y[0]).map(([t, monto]) => {
    const ini = new Date(t)
    const label = modo === 'mes'
      ? `${MESES_CORTOS[ini.getMonth()]} ${String(ini.getFullYear()).slice(2)}`
      : `${String(ini.getDate()).padStart(2, '0')} ${MESES_CORTOS[ini.getMonth()]}`
    return { inicio: ini, label, monto }
  })
  let acum = 0
  const total = rows.reduce((s, r) => s + r.monto, 0)
  rows.forEach(r => { acum += r.monto; r.acumulado = acum; r.pctAcum = total > 0 ? Math.round((acum / total) * 100) : 0 })
  return { rows, total }
}

// ── Avance físico (módulo 3) ──

// % planificado de una actividad a una fecha dada (avance lineal en su duración)
export const pctPlanificado = (f, fecha) => {
  if (!f) return 0
  const d = new Date(fecha); d.setHours(0, 0, 0, 0)
  if (d < f.inicio) return 0
  if (d >= f.fin) return 100
  return Math.round(((d - f.inicio) / (f.fin - f.inicio)) * 100)
}

// Último % real registrado a una fecha de corte (avances ordenados por fecha)
export const pctReal = (avances, fecha) => {
  let pct = 0
  for (const a of (avances || [])) {
    if (!fecha || a.fecha <= fecha) pct = Math.max(pct, +a.pct || 0)
  }
  return Math.min(100, pct)
}

// Avance global plan vs real a una fecha, ponderado por peso (costo) de cada actividad
export const avanceGlobal = (acts, fechas, datos, pesos, fecha) => {
  let totalPeso = 0, plan = 0, real = 0
  for (const a of acts) {
    if (!datos[a.id] || !fechas[a.id]) continue
    const w = pesos[a.id] ?? 1
    totalPeso += w
    plan += w * pctPlanificado(fechas[a.id], fecha)
    real += w * pctReal(datos[a.id].avances, fecha)
  }
  if (!totalPeso) return { plan: 0, real: 0 }
  return { plan: Math.round(plan / totalPeso), real: Math.round(real / totalPeso) }
}
