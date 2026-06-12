// ============ EXPORT CRONOGRAMA (Fase II · módulo 6) ============
// PDF y Excel del cronograma: programación con avance, flujo de caja y
// Curva S. Reutiliza el tema y helpers del export de Fase I.
import { saveAs } from 'file-saver'
import { getJsPDF, getExcelJS, X, setC, pdfTheme, drawApuHeader, drawApuFooter, drawContinuationBand } from './export'
import { makeMoneyFmt } from './calc'
import { fmtFecha, addDays, hoyISO, pctPlanificado, pctReal, avanceGlobal, flujoDeCaja, curvaS, rutaCritica, MESES_CORTOS } from './cronograma'

const estadoDe = (plan, real) =>
  real >= 100 ? 'Completada'
  : plan === 0 && real === 0 ? 'No iniciada'
  : real < plan - 3 ? 'ATRASADA'
  : real > plan + 3 ? 'Adelantada'
  : 'Al día'

// ── PDF: programación + flujo de caja + curva S ──
export const exportPDFCronograma = async (budget, acts, fechas, datos, pesos, resumen, empresa = {}) => {
  const jsPDF = await getJsPDF()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const T = pdfTheme(budget, empresa)
  const money = makeMoneyFmt(budget.moneda)
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const corte = hoyISO()

  // ── Página 1+: programación con avance ──
  let y = await drawApuHeader(doc, budget, empresa, { title: 'CRONOGRAMA DE EJECUCIÓN' })
  const g = avanceGlobal(acts, fechas, datos, pesos, corte)
  doc.setFontSize(9); doc.setTextColor(70, 70, 70)
  doc.text(
    `Inicio: ${fmtFecha(resumen.inicio)}   ·   Fin estimado: ${resumen.fin ? fmtFecha(addDays(resumen.fin, -1)) : '—'}   ·   Duración: ${resumen.dias} días   ·   Avance real: ${g.real}%  (plan a hoy: ${g.plan}%)`,
    pw / 2, y + 2, { align: 'center' },
  )
  y += 7

  const rows = []
  let lastCap = null
  for (const a of acts) {
    if (!datos[a.id] || !fechas[a.id]) continue
    if (a.capId !== lastCap) {
      lastCap = a.capId
      rows.push([{ content: `${a.capId} · ${a.capDesc}`, colSpan: 8, styles: { fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } }])
    }
    const f = fechas[a.id]
    const plan = pctPlanificado(f, corte)
    const real = pctReal(datos[a.id].avances, corte)
    const estado = estadoDe(plan, real)
    rows.push([
      a.id, a.descripcion,
      { content: `${f.dur}d`, styles: { halign: 'center' } },
      fmtFecha(f.inicio), fmtFecha(addDays(f.fin, -1)),
      { content: `${plan}%`, styles: { halign: 'right' } },
      { content: `${real}%`, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: estado, styles: { halign: 'center', fontStyle: estado === 'ATRASADA' ? 'bold' : 'normal', textColor: estado === 'ATRASADA' ? [185, 28, 28] : [70, 70, 70] } },
    ])
  }
  doc.autoTable({
    startY: y,
    head: [['ID', 'Actividad', 'Dur.', 'Inicio', 'Fin', '% Plan', '% Real', 'Estado']],
    body: rows,
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    headStyles: { fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 12 }, 3: { cellWidth: 24 }, 4: { cellWidth: 24 }, 5: { cellWidth: 16 }, 6: { cellWidth: 16 }, 7: { cellWidth: 26 } },
    margin: { top: 18, left: 10, right: 10, bottom: 16 },
    rowPageBreak: 'avoid',
    didDrawPage: d => { if (d.pageNumber > 1) drawContinuationBand(doc, budget, T, 'CRONOGRAMA DE EJECUCIÓN') },
  })

  // ── Páginas: diagrama de Gantt dibujado ──
  const criticas = rutaCritica(acts, fechas, datos)
  const programadas = acts.filter(a => datos[a.id] && fechas[a.id])
  const idToSeq = Object.fromEntries(acts.map((a, i) => [a.id, i + 1]))
  if (programadas.length && resumen.inicio && resumen.fin) {
    const filas = []
    let lc = null
    for (const a of programadas) {
      if (a.capId !== lc) { lc = a.capId; filas.push({ t: 'cap', capId: a.capId, capDesc: a.capDesc }) }
      filas.push({ t: 'act', a })
    }
    const gStart = addDays(resumen.inicio, -1)
    const gEnd = addDays(resumen.fin, 3)
    const totalDias = Math.max(1, Math.round((gEnd - gStart) / 86400000))
    const MX = 10, LBLW = 78
    const tlX = MX + LBLW
    const tlW = pw - MX - tlX
    const GX = d => tlX + (((d - gStart) / 86400000) / totalDias) * tlW
    const rowH = 4.6, topY = 26
    const porPagina = Math.floor((ph - topY - 18) / rowH)

    for (let off = 0; off < filas.length; off += porPagina) {
      doc.addPage()
      drawContinuationBand(doc, budget, T, `DIAGRAMA DE GANTT${filas.length > porPagina ? ` (${Math.floor(off / porPagina) + 1}/${Math.ceil(filas.length / porPagina)})` : ''}`)
      const nFilas = Math.min(porPagina, filas.length - off)
      const fondoH = nFilas * rowH

      // Ticks de meses
      doc.setFontSize(6.5); doc.setTextColor(130, 130, 130)
      { const c = new Date(gStart); c.setDate(1)
        if (c < gStart) c.setMonth(c.getMonth() + 1)
        while (c <= gEnd) {
          doc.setDrawColor(228, 232, 238); doc.setLineWidth(0.15)
          doc.line(GX(c), topY - 4, GX(c), topY + fondoH)
          doc.text(`${MESES_CORTOS[c.getMonth()]} ${String(c.getFullYear()).slice(2)}`, GX(c) + 0.8, topY - 5.5)
          c.setMonth(c.getMonth() + 1)
        } }
      // Línea de HOY
      const hoyD = new Date(); hoyD.setHours(0, 0, 0, 0)
      if (hoyD >= gStart && hoyD <= gEnd) {
        doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.4)
        doc.line(GX(hoyD), topY - 4, GX(hoyD), topY + fondoH)
      }

      let gy = topY
      for (const r of filas.slice(off, off + porPagina)) {
        if (r.t === 'cap') {
          doc.setFillColor(238, 242, 247)
          doc.rect(MX, gy - 3.2, pw - 2 * MX, rowH, 'F')
          doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(30, 30, 30)
          doc.text(`${r.capId} · ${r.capDesc}`.slice(0, 64), MX + 1, gy)
          doc.setFont(undefined, 'normal')
        } else {
          const a = r.a, f = fechas[a.id]
          const esCrit = criticas.has(a.id)
          doc.setFontSize(6.5); doc.setTextColor(90, 90, 90)
          doc.text(`${idToSeq[a.id]}  ${a.descripcion}`.slice(0, 52), MX + 1, gy)
          const bx = GX(f.inicio)
          const bw = Math.max(1.4, GX(f.fin) - bx)
          if (esCrit) doc.setFillColor(220, 38, 38); else doc.setFillColor(T.mid[0], T.mid[1], T.mid[2])
          doc.roundedRect(bx, gy - 2.6, bw, 3.4, 0.7, 0.7, 'F')
          const av = pctReal(datos[a.id]?.avances)
          if (av > 0) { doc.setFillColor(5, 150, 105); doc.roundedRect(bx, gy - 2.6, Math.max(1, bw * av / 100), 3.4, 0.7, 0.7, 'F') }
        }
        gy += rowH
      }
      // Leyenda
      doc.setFontSize(6.5); doc.setTextColor(120, 120, 120)
      doc.text('■ Programado   ■ Avance real (verde)   ■ Ruta crítica (rojo)   | Hoy (línea roja)', MX, topY + fondoH + 5)
    }
  }

  // ── Página: flujo de caja semanal ──
  doc.addPage()
  drawContinuationBand(doc, budget, T, 'FLUJO DE CAJA PROGRAMADO — SEMANAL')
  const fl = flujoDeCaja(acts, fechas, datos, pesos, 'semana')

  // Gráfico de barras del flujo
  let flujoTablaY = 20
  if (fl.rows.length) {
    const chX = 16, chW = pw - 32, chY = 24, chH = 38
    const maxM = Math.max(...fl.rows.map(r => r.monto), 1)
    const bw = chW / fl.rows.length
    doc.setDrawColor(210, 214, 222); doc.setLineWidth(0.2)
    doc.line(chX, chY + chH, chX + chW, chY + chH)
    fl.rows.forEach((r, i) => {
      const h = Math.max(0.8, (r.monto / maxM) * chH)
      doc.setFillColor(T.mid[0], T.mid[1], T.mid[2])
      doc.rect(chX + i * bw + bw * 0.18, chY + chH - h, bw * 0.64, h, 'F')
    })
    doc.setFontSize(6.5); doc.setTextColor(120, 120, 120)
    doc.text(fl.rows[0].label, chX, chY + chH + 4)
    doc.text(fl.rows[fl.rows.length - 1].label, chX + chW, chY + chH + 4, { align: 'right' })
    doc.text(`máx: ${money(maxM)}`, chX + chW, chY - 1, { align: 'right' })
    flujoTablaY = chY + chH + 9
  }

  doc.autoTable({
    startY: flujoTablaY,
    head: [['Semana del', 'Egreso del periodo', 'Acumulado', '% Acum.']],
    body: fl.rows.map(r => [
      r.label,
      { content: money(r.monto), styles: { halign: 'right' } },
      { content: money(r.acumulado), styles: { halign: 'right' } },
      { content: `${r.pctAcum}%`, styles: { halign: 'right' } },
    ]),
    foot: [[
      { content: 'TOTAL', styles: { fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: money(fl.total), styles: { halign: 'right', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: '', styles: { fillColor: T.bg } },
      { content: '', styles: { fillColor: T.bg } },
    ]],
    styles: { fontSize: 8, cellPadding: 1.9 },
    headStyles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { top: 18, left: 55, right: 55, bottom: 16 },
    rowPageBreak: 'avoid',
    didDrawPage: d => { if (d.pageNumber > 1) drawContinuationBand(doc, budget, T, 'FLUJO DE CAJA PROGRAMADO — SEMANAL') },
  })

  // ── Página: curva S ──
  doc.addPage()
  drawContinuationBand(doc, budget, T, 'CURVA S — PLANIFICADO VS REAL')
  const { plan, real } = curvaS(acts, fechas, datos, pesos, resumen)
  if (plan.length) {
    const L = 30, R = 18, Tt = 32, B = 26
    const IW = pw - L - R, IH = ph - Tt - B
    const x0 = plan[0].fecha.getTime()
    const x1 = Math.max(plan[plan.length - 1].fecha.getTime(), ...real.map(p => p.fecha.getTime()), x0 + 1)
    const PX = f => L + ((f.getTime() - x0) / (x1 - x0)) * IW
    const PY = p => Tt + ((100 - p) / 100) * IH

    doc.setFontSize(8); doc.setTextColor(120, 120, 120); doc.setLineWidth(0.2); doc.setDrawColor(215, 219, 228)
    for (const p of [0, 25, 50, 75, 100]) {
      doc.line(L, PY(p), pw - R, PY(p))
      doc.text(`${p}%`, L - 3, PY(p) + 1, { align: 'right' })
    }
    // plan punteada (color del tema)
    doc.setLineDashPattern([2, 1.5], 0); doc.setLineWidth(0.7); doc.setDrawColor(T.mid[0], T.mid[1], T.mid[2])
    for (let i = 1; i < plan.length; i++) doc.line(PX(plan[i - 1].fecha), PY(plan[i - 1].pct), PX(plan[i].fecha), PY(plan[i].pct))
    doc.setLineDashPattern([], 0)
    // real sólida verde con puntos
    if (real.length) {
      doc.setLineWidth(1); doc.setDrawColor(5, 150, 105)
      for (let i = 1; i < real.length; i++) doc.line(PX(real[i - 1].fecha), PY(real[i - 1].pct), PX(real[i].fecha), PY(real[i].pct))
      doc.setFillColor(5, 150, 105)
      for (const p of real) doc.circle(PX(p.fecha), PY(p.pct), 1.2, 'F')
    }
    // leyenda y extremos del eje X
    doc.setFontSize(8.5)
    doc.setTextColor(T.mid[0], T.mid[1], T.mid[2]); doc.text('– – – Planificado', L, Tt - 5)
    doc.setTextColor(5, 150, 105); doc.text('——— Real', L + 42, Tt - 5)
    doc.setTextColor(110, 110, 110)
    doc.text(fmtFecha(new Date(x0)), L, ph - B + 7)
    doc.text(fmtFecha(new Date(x1)), pw - R, ph - B + 7, { align: 'right' })
  }

  const tp = doc.internal.getNumberOfPages()
  for (let i = 1; i <= tp; i++) { doc.setPage(i); drawApuFooter(doc, budget, i, tp, empresa) }
  doc.save((budget.nombreProyecto || 'Proyecto').replace(/[^\w]+/g, '_') + '_Cronograma.pdf')
}

// ── Excel: hojas de programación, flujo de caja y curva S ──
export const exportExcelCronograma = async (budget, acts, fechas, datos, pesos, resumen) => {
  const ExcelJS = await getExcelJS()
  const wb = new ExcelJS.Workbook()
  const money = `"${budget.moneda === 'HNL' ? 'L' : '$'}"#,##0.00`
  const corte = hoyISO()

  // Hoja 1: Programación
  const ws = wb.addWorksheet('Programación')
  ws.columns = [{ width: 10 }, { width: 50 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 13 }]
  ws.mergeCells('A1:H1')
  setC(ws, 'A1', `CRONOGRAMA — ${budget.nombreProyecto || ''}`, { fill: X.titleFill, font: X.titleFont, alignment: X.ac })
  ws.getRow(1).height = 26
  ;['ID', 'Actividad', 'Dur.', 'Inicio', 'Fin', '% Plan', '% Real', 'Estado'].forEach((h, i) =>
    setC(ws, String.fromCharCode(65 + i) + '3', h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac }))
  let r = 4
  let lastCap = null
  for (const a of acts) {
    if (!datos[a.id] || !fechas[a.id]) continue
    if (a.capId !== lastCap) {
      lastCap = a.capId
      ws.mergeCells(`A${r}:H${r}`)
      setC(ws, 'A' + r, `${a.capId} · ${a.capDesc}`, { fill: X.capFill, font: X.capFont, alignment: X.al }); r++
    }
    const f = fechas[a.id]
    const plan = pctPlanificado(f, corte)
    const real = pctReal(datos[a.id].avances, corte)
    setC(ws, 'A' + r, a.id, { alignment: X.ac, font: { name: 'Consolas', size: 10 } })
    setC(ws, 'B' + r, a.descripcion, { alignment: X.al })
    setC(ws, 'C' + r, f.dur, { alignment: X.ac })
    setC(ws, 'D' + r, fmtFecha(f.inicio), { alignment: X.ac })
    setC(ws, 'E' + r, fmtFecha(addDays(f.fin, -1)), { alignment: X.ac })
    setC(ws, 'F' + r, plan / 100, { alignment: X.ar, numFmt: '0%' })
    setC(ws, 'G' + r, real / 100, { alignment: X.ar, numFmt: '0%', font: { bold: true } })
    setC(ws, 'H' + r, estadoDe(plan, real), { alignment: X.ac })
    r++
  }

  // Hoja 2: Flujo de caja (semanal y mensual)
  const wf = wb.addWorksheet('Flujo de Caja')
  wf.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 4 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 10 }]
  wf.mergeCells('A1:I1')
  setC(wf, 'A1', 'FLUJO DE CAJA PROGRAMADO', { fill: X.titleFill, font: X.titleFont, alignment: X.ac })
  wf.getRow(1).height = 24
  const fls = flujoDeCaja(acts, fechas, datos, pesos, 'semana')
  const flm = flujoDeCaja(acts, fechas, datos, pesos, 'mes')
  ;['Semana del', 'Egreso', 'Acumulado', '% Acum.'].forEach((h, i) => setC(wf, String.fromCharCode(65 + i) + '3', h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac }))
  ;['Mes', 'Egreso', 'Acumulado', '% Acum.'].forEach((h, i) => setC(wf, String.fromCharCode(70 + i) + '3', h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac }))
  fls.rows.forEach((row, i) => {
    const rr = 4 + i
    setC(wf, 'A' + rr, row.label, { alignment: X.ac })
    setC(wf, 'B' + rr, row.monto, { alignment: X.ar, numFmt: money })
    setC(wf, 'C' + rr, row.acumulado, { alignment: X.ar, numFmt: money, font: { bold: true } })
    setC(wf, 'D' + rr, row.pctAcum / 100, { alignment: X.ar, numFmt: '0%' })
  })
  flm.rows.forEach((row, i) => {
    const rr = 4 + i
    setC(wf, 'F' + rr, row.label, { alignment: X.ac })
    setC(wf, 'G' + rr, row.monto, { alignment: X.ar, numFmt: money })
    setC(wf, 'H' + rr, row.acumulado, { alignment: X.ar, numFmt: money, font: { bold: true } })
    setC(wf, 'I' + rr, row.pctAcum / 100, { alignment: X.ar, numFmt: '0%' })
  })

  // Hoja 3: Curva S (datos)
  const wc = wb.addWorksheet('Curva S')
  wc.columns = [{ width: 14 }, { width: 12 }, { width: 4 }, { width: 14 }, { width: 12 }]
  wc.mergeCells('A1:E1')
  setC(wc, 'A1', 'CURVA S — PLANIFICADO VS REAL', { fill: X.titleFill, font: X.titleFont, alignment: X.ac })
  wc.getRow(1).height = 24
  const { plan, real } = curvaS(acts, fechas, datos, pesos, resumen)
  ;['Fecha', '% Plan'].forEach((h, i) => setC(wc, String.fromCharCode(65 + i) + '3', h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac }))
  ;['Corte', '% Real'].forEach((h, i) => setC(wc, String.fromCharCode(68 + i) + '3', h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac }))
  plan.forEach((p, i) => {
    setC(wc, 'A' + (4 + i), fmtFecha(p.fecha), { alignment: X.ac })
    setC(wc, 'B' + (4 + i), p.pct / 100, { alignment: X.ar, numFmt: '0%' })
  })
  real.forEach((p, i) => {
    setC(wc, 'D' + (4 + i), fmtFecha(p.fecha), { alignment: X.ac })
    setC(wc, 'E' + (4 + i), p.pct / 100, { alignment: X.ar, numFmt: '0%', font: { bold: true } })
  })

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]), (budget.nombreProyecto || 'Proyecto').replace(/[^\w]+/g, '_') + '_Cronograma.xlsx')
}
