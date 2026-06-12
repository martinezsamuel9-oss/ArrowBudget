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

// ── Calendario laboral ──
// calendario = { diasSemana: [0-6 laborables], feriados: ['YYYY-MM-DD'] }
// Default: 7 días laborables sin feriados → idéntico al comportamiento previo.
const isoDe = d => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const normCal = cal => {
  const ds = Array.isArray(cal?.diasSemana) && cal.diasSemana.length ? cal.diasSemana : [0, 1, 2, 3, 4, 5, 6]
  return { dias: new Set(ds), feriados: new Set(cal?.feriados || []) }
}
const esLabC = (d, C) => C.dias.has(d.getDay()) && !C.feriados.has(isoDe(d))
export const esLaborable = (d, cal) => esLabC(new Date(d), normCal(cal))

// Desliza hacia adelante hasta el primer día laborable
const sigLab = (d, C) => { let x = new Date(d), g = 0; while (!esLabC(x, C) && g++ < 370) x = addDays(x, 1); return x }

// fin = día siguiente al último de `dur` días laborables desde `inicio`
const finLaborable = (inicio, dur, C) => {
  let x = new Date(inicio), count = 0, g = 0
  while (count < dur && g++ < 4000) { if (esLabC(x, C)) count++; x = addDays(x, 1) }
  return x
}
// inicio = primer día de `dur` días laborables que terminan en `fin` (exclusivo)
const inicioDesdeFin = (fin, dur, C) => {
  let x = addDays(fin, -1), count = 0, g = 0
  while (g++ < 4000) { if (esLabC(x, C)) { count++; if (count >= dur) return x } x = addDays(x, -1) }
  return x
}
// Suma/resta n días laborables (para desfases +/-)
const addLab = (d, n, C) => {
  if (!n) return new Date(d)
  let x = new Date(d), step = n > 0 ? 1 : -1, left = Math.abs(n), g = 0
  while (left > 0 && g++ < 4000) { x = addDays(x, step); if (esLabC(x, C)) left-- }
  return x
}
// Feriados cívicos fijos de Honduras (Semana Santa se agrega manualmente)
export const feriadosFijosHN = year =>
  [`${year}-01-01`, `${year}-04-14`, `${year}-05-01`, `${year}-09-15`, `${year}-10-03`, `${year}-10-12`, `${year}-10-21`, `${year}-12-25`]

// Normaliza una predecesora: acepta el formato viejo (string id) y el nuevo
// ({ id, tipo, lag }). Tipos estilo MS Project: FC fin→comienzo (default),
// CC comienzo→comienzo, FF fin→fin, CF comienzo→fin. lag en días (+/-).
export const normPred = p => {
  if (!p) return null
  if (typeof p === 'string') return { id: p, tipo: 'FC', lag: 0 }
  if (!p.id) return null
  return { id: p.id, tipo: ['FC', 'CC', 'FF', 'CF'].includes(p.tipo) ? p.tipo : 'FC', lag: Math.round(+p.lag) || 0 }
}

// Forward pass con tipos de vínculo: la fecha de inicio respeta TODAS las
// restricciones de sus predecesoras (y nunca antes del inicio del proyecto).
// Tolera ciclos (los corta) y predecesoras inexistentes (las ignora).
export const calcularFechas = (acts, fechaInicio, datosActividades = {}, calendario = null) => {
  const ids = new Set(acts.map(a => a.id))
  const C = normCal(calendario)
  const inicioProyecto = sigLab(fechaInicio ? new Date(fechaInicio + 'T00:00:00') : new Date(), C)
  const map = {}
  const visitando = new Set()

  const resolver = id => {
    if (map[id]) return map[id]
    const d = datosActividades[id] || {}
    const dur = Math.max(1, Math.round(+d.duracion) || 7)
    if (visitando.has(id)) {
      // ciclo: se ancla al inicio del proyecto para no recursar infinito
      return (map[id] = { inicio: inicioProyecto, fin: finLaborable(inicioProyecto, dur, C), dur, circular: true })
    }
    visitando.add(id)
    let inicio = inicioProyecto
    for (const pr of (d.predecesoras || [])) {
      const p = normPred(pr)
      if (!p || p.id === id || !ids.has(p.id)) continue
      const f = resolver(p.id)
      let candidato
      switch (p.tipo) {
        case 'CC': candidato = addLab(f.inicio, p.lag, C); break                                  // comienza con la predecesora
        case 'FF': candidato = inicioDesdeFin(addLab(f.fin, p.lag, C), dur, C); break             // termina cuando termina la predecesora
        case 'CF': candidato = inicioDesdeFin(addLab(f.inicio, p.lag, C), dur, C); break          // termina cuando comienza la predecesora
        default:   candidato = addLab(f.fin, p.lag, C)                                            // FC: comienza al terminar la predecesora
      }
      if (candidato > inicio) inicio = candidato
    }
    visitando.delete(id)
    inicio = sigLab(inicio, C)
    return (map[id] = { inicio, fin: finLaborable(inicio, dur, C), dur })
  }

  acts.forEach(a => resolver(a.id))
  return map
}

// ── Ruta crítica (CPM) ──
// Pase hacia atrás: holgura = LS − ES. Actividades con holgura ~0 son críticas
// (cualquier atraso en ellas atrasa el fin del proyecto).
const DAY = 86400000
export const rutaCritica = (acts, fechas, datos = {}, calendario = null) => {
  const ids = new Set(acts.map(a => a.id))
  const C = normCal(calendario)
  // Mapa de sucesores con su tipo de vínculo
  const succ = {}
  for (const a of acts) {
    for (const pr of (datos[a.id]?.predecesoras || [])) {
      const p = normPred(pr)
      if (!p || !ids.has(p.id) || p.id === a.id) continue
      ;(succ[p.id] = succ[p.id] || []).push({ id: a.id, tipo: p.tipo, lag: p.lag })
    }
  }
  let finProyecto = null
  for (const a of acts) { const f = fechas[a.id]; if (f && (!finProyecto || f.fin > finProyecto)) finProyecto = f.fin }
  if (!finProyecto) return new Set()

  const memo = {}
  const visitando = new Set()
  const LS = id => {                       // Latest Start (Date), en días laborables
    if (memo[id]) return memo[id]
    const f = fechas[id]
    if (!f) return null
    if (visitando.has(id)) return f.inicio   // ciclo: neutral
    visitando.add(id)
    let ls = null
    for (const s of (succ[id] || [])) {
      const sf = fechas[s.id]; if (!sf) continue
      const sLS = LS(s.id); if (!sLS) continue
      const sLF = finLaborable(sLS, sf.dur, C)
      let cand
      switch (s.tipo) {
        case 'CC': cand = addLab(sLS, -s.lag, C); break                                  // LS ≤ LS_suc − lag
        case 'FF': cand = inicioDesdeFin(addLab(sLF, -s.lag, C), f.dur, C); break        // LF ≤ LF_suc − lag
        case 'CF': cand = addLab(sLF, -s.lag, C); break                                  // inicio ≤ LF_suc − lag
        default:   cand = inicioDesdeFin(addLab(sLS, -s.lag, C), f.dur, C)               // FC: LF ≤ LS_suc − lag
      }
      if (!ls || cand < ls) ls = cand
    }
    if (!ls) ls = inicioDesdeFin(finProyecto, f.dur, C)   // sin sucesores: pega al fin
    visitando.delete(id)
    return (memo[id] = ls)
  }

  const criticas = new Set()
  for (const a of acts) {
    const f = fechas[a.id]
    if (!f || !datos[a.id]) continue
    const ls = LS(a.id)
    if (ls && ls.getTime() - f.inicio.getTime() < DAY / 2) criticas.add(a.id)   // holgura ~0
  }
  return criticas
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

// Parsea el input de predecesoras estilo Project usando el # de fila:
//   "3" → fila 3 con FC · "3CC" · "5FF" · "3CC+2" · "4FC-1"
// También acepta el ID del presupuesto directamente ("1.1.01CC").
// seqToId: array donde seqToId[n-1] = id de la actividad en la fila n.
export const parsePredecesoras = (texto, idsValidos, propioId, seqToId = []) => {
  const out = []
  for (const token of String(texto || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
    const m = token.match(/^([\w.\-]+?)(fc|cc|ff|cf)?([+-]\d+)?$/i)
    if (!m) continue
    const base = m[1]
    let id = null
    if (/^\d+$/.test(base)) id = seqToId[parseInt(base, 10) - 1] || null   // # de fila
    else if (idsValidos.has(base)) id = base                               // ID del presupuesto
    if (!id || id === propioId) continue
    const pred = { id, tipo: (m[2] || 'FC').toUpperCase(), lag: parseInt(m[3] || '0', 10) || 0 }
    const i = out.findIndex(x => x.id === id)
    if (i >= 0) out[i] = pred; else out.push(pred)
  }
  return out
}

// Texto del input a partir de las predecesoras guardadas: "3CC+2, 5"
export const predsATexto = (preds, idToSeq = {}) =>
  (preds || []).map(pr => {
    const p = normPred(pr)
    if (!p) return null
    const n = idToSeq[p.id] ?? p.id
    return `${n}${p.tipo !== 'FC' ? p.tipo : ''}${p.lag ? (p.lag > 0 ? '+' : '') + p.lag : ''}`
  }).filter(Boolean).join(', ')

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ── Flujo de caja (módulo 4) ──
// Reparte el costo de cada actividad uniformemente en sus días programados
// y agrega por periodo (semana que inicia lunes, o mes calendario).
const lunesDe = d => {
  const m = new Date(d); m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

export const flujoDeCaja = (acts, fechas, datos, pesos, modo = 'semana', calendario = null) => {
  const C = normCal(calendario)
  const buckets = new Map()
  for (const a of acts) {
    const f = fechas[a.id]
    if (!f || !datos[a.id]) continue
    const costo = pesos[a.id] || 0
    if (!costo || !f.dur) continue
    const porDia = costo / f.dur
    // recorre el rango real de la actividad y deposita solo en días laborables
    for (let d = new Date(f.inicio); d < f.fin; d = addDays(d, 1)) {
      if (!esLabC(d, C)) continue
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

// ── Curva S (módulo 5) ──
// Serie planificada (muestreo semanal del Gantt, 0→100%) y serie real
// (un punto por cada fecha de corte con avances registrados).
const isoLocal = d => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const curvaS = (acts, fechas, datos, pesos, resumen) => {
  if (!resumen?.inicio || !resumen?.fin) return { plan: [], real: [] }
  const plan = []
  let d = new Date(resumen.inicio)
  while (d < resumen.fin) {
    plan.push({ fecha: new Date(d), pct: avanceGlobal(acts, fechas, datos, pesos, isoLocal(d)).plan })
    d = addDays(d, 7)
  }
  plan.push({ fecha: new Date(resumen.fin), pct: 100 })

  const cortes = new Set()
  for (const a of acts) for (const av of (datos[a.id]?.avances || [])) if (av.fecha) cortes.add(av.fecha)
  const real = [...cortes].sort().map(f => ({
    fecha: new Date(f + 'T00:00:00'),
    pct: avanceGlobal(acts, fechas, datos, pesos, f).real,
  }))
  return { plan, real }
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
