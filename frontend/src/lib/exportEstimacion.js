// ============ EXPORT ESTIMACIÓN (Fase III) ============
// PDF de estimación de cobro: líneas por capítulo, resumen financiero,
// acumulados de contrato y bloque de firmas. Usa el tema del proyecto.
import { getJsPDF, pdfTheme, drawApuHeader, drawApuFooter, drawContinuationBand } from './export'
import { makeMoneyFmt, fmt, round2 } from './calc'

export const exportPDFEstimacion = async (budget, est, acum, empresa = {}) => {
  const jsPDF = await getJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const T = pdfTheme(budget, empresa)
  const money = makeMoneyFmt(budget.moneda)
  const pw = doc.internal.pageSize.getWidth()

  let y = await drawApuHeader(doc, budget, empresa, { title: `ESTIMACIÓN No. ${est.numero}` })
  doc.setFontSize(9); doc.setTextColor(70, 70, 70)
  const periodo = `Periodo: ${est.periodo_inicio || '—'} al ${est.periodo_fin || '—'}   ·   Estado: ${(est.estado || 'borrador').toUpperCase()}`
  doc.text(periodo, pw / 2, y + 2, { align: 'center' })
  y += 7

  // ── Líneas por capítulo (solo con cantidad > 0) ──
  const rows = []
  let lastCap = null
  for (const l of (est.lineas_json || [])) {
    if (!(+l.cantidad > 0)) continue
    if (l.capId !== lastCap) {
      lastCap = l.capId
      rows.push([{ content: `${l.capId} · ${l.capDesc || ''}`, colSpan: 6, styles: { fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } }])
    }
    rows.push([
      l.actividadId,
      l.descripcion,
      { content: l.unidad || '—', styles: { halign: 'center' } },
      { content: fmt(l.cantidad), styles: { halign: 'right' } },
      { content: money(l.pu), styles: { halign: 'right' } },
      { content: money(round2((+l.cantidad || 0) * (+l.pu || 0))), styles: { halign: 'right', fontStyle: 'bold' } },
    ])
  }
  if (!rows.length) rows.push([{ content: '(sin cantidades en este periodo)', colSpan: 6, styles: { halign: 'center', fontStyle: 'italic', textColor: 150 } }])

  doc.autoTable({
    startY: y,
    head: [['ID', 'Actividad', 'Und', 'Cantidad', 'P. Unitario', 'Importe']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 17 }, 2: { cellWidth: 13 }, 3: { cellWidth: 22 }, 4: { cellWidth: 26 }, 5: { cellWidth: 28 } },
    margin: { top: 18, left: 12, right: 12, bottom: 16 },
    rowPageBreak: 'avoid',
    didDrawPage: d => { if (d.pageNumber > 1) drawContinuationBand(doc, budget, T, `ESTIMACIÓN No. ${est.numero}`) },
  })

  // ── Resumen financiero + acumulados ──
  let ry = doc.lastAutoTable.finalY + 6
  doc.autoTable({
    startY: ry, tableWidth: 92, margin: { left: pw - 92 - 12, right: 12, top: 18, bottom: 16 },
    pageBreak: 'avoid', rowPageBreak: 'avoid',
    head: [[{ content: 'RESUMEN DE LA ESTIMACIÓN', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', halign: 'left' } }]],
    body: [
      ['Subtotal ejecutado', { content: money(acum.sub), styles: { halign: 'right' } }],
      [`Retención (${fmt(est.pct_retencion || 0)}%)`, { content: `− ${money(acum.ret)}`, styles: { halign: 'right' } }],
      [`Amortización anticipo (${fmt(est.pct_amortizacion || 0)}%)`, { content: `− ${money(acum.amo)}`, styles: { halign: 'right' } }],
      [
        { content: 'NETO A COBRAR', styles: { fontStyle: 'bold', fillColor: T.bg, textColor: T.acc } },
        { content: money(acum.neto), styles: { fontStyle: 'bold', halign: 'right', fillColor: T.bg, textColor: T.acc } },
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2 },
    theme: 'grid',
  })
  const finResumen = doc.lastAutoTable.finalY

  doc.autoTable({
    startY: ry, tableWidth: 92, margin: { left: 12, right: 12, top: 18, bottom: 16 },
    pageBreak: 'avoid', rowPageBreak: 'avoid',
    head: [[{ content: 'ACUMULADOS DEL CONTRATO', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', halign: 'left' } }]],
    body: [
      ['Monto del contrato', { content: money(acum.contrato), styles: { halign: 'right' } }],
      ['Acumulado anterior', { content: money(acum.acumAnterior), styles: { halign: 'right' } }],
      ['Esta estimación', { content: money(acum.sub), styles: { halign: 'right' } }],
      ['Acumulado actual', { content: money(acum.acumActual), styles: { halign: 'right', fontStyle: 'bold' } }],
      [`Avance financiero`, { content: `${acum.pctContrato}%`, styles: { halign: 'right' } }],
      ['Saldo por estimar', { content: money(acum.saldo), styles: { halign: 'right' } }],
    ],
    styles: { fontSize: 8.5, cellPadding: 2 },
    theme: 'grid',
  })

  // ── Firmas ──
  let fy = Math.max(finResumen, doc.lastAutoTable.finalY) + 24
  const ph = doc.internal.pageSize.getHeight()
  if (fy > ph - 40) { doc.addPage(); drawContinuationBand(doc, budget, T, `ESTIMACIÓN No. ${est.numero}`); fy = 50 }
  const wCol = (pw - 24 - 20) / 3
  ;['ELABORÓ', 'REVISÓ', 'APROBÓ'].forEach((t, i) => {
    const x = 12 + i * (wCol + 10)
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3)
    doc.line(x, fy, x + wCol, fy)
    doc.setFontSize(8); doc.setTextColor(80, 80, 80); doc.setFont(undefined, 'bold')
    doc.text(t, x + wCol / 2, fy + 5, { align: 'center' })
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130)
    const sub = i === 0 ? (budget.cotizante || '') : i === 2 ? (budget.cliente || '') : ''
    if (sub) doc.text(sub, x + wCol / 2, fy + 10, { align: 'center' })
  })

  const tp = doc.internal.getNumberOfPages()
  for (let i = 1; i <= tp; i++) { doc.setPage(i); drawApuFooter(doc, budget, i, tp, empresa) }
  doc.save(`${(budget.nombreProyecto || 'Proyecto').replace(/[^\w]+/g, '_')}_Estimacion_${est.numero}.pdf`)
}
