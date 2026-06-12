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
