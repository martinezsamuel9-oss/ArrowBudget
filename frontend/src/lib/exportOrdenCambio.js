// ============ EXPORT ORDEN DE CAMBIO (Fase III) ============
import { getJsPDF, pdfTheme, drawApuHeader, drawApuFooter, drawContinuationBand } from './export'
import { makeMoneyFmt, fmt, round2 } from './calc'

export const exportPDFOrdenCambio = async (budget, oc, resumen, empresa = {}) => {
  const jsPDF = await getJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const T = pdfTheme(budget, empresa)
  const money = makeMoneyFmt(budget.moneda)
  const pw = doc.internal.pageSize.getWidth()
  const signo = oc.tipo === 'deductiva' ? -1 : 1

  let y = await drawApuHeader(doc, budget, empresa, { title: `ORDEN DE CAMBIO No. ${oc.numero}` })
  doc.setFontSize(9); doc.setTextColor(70, 70, 70)
  doc.text(`${oc.tipo === 'deductiva' ? 'DEDUCTIVA' : 'ADITIVA'}   ·   Fecha: ${oc.fecha || '—'}   ·   Estado: ${(oc.estado || 'borrador').toUpperCase()}`, pw / 2, y + 2, { align: 'center' })
  y += 7
  if (oc.concepto) {
    doc.setFontSize(9.5); doc.setFont(undefined, 'bold'); doc.setTextColor(40, 40, 40)
    const lines = doc.splitTextToSize(`Concepto: ${oc.concepto}`, pw - 28)
    doc.text(lines, 14, y + 2)
    doc.setFont(undefined, 'normal')
    y += lines.length * 4.5 + 3
  }

  const rows = (oc.lineas_json || []).filter(l => (l.descripcion || '').trim()).map((l, i) => [
    i + 1,
    l.descripcion,
    { content: l.unidad || '—', styles: { halign: 'center' } },
    { content: fmt(l.cantidad), styles: { halign: 'right' } },
    { content: money(l.pu), styles: { halign: 'right' } },
    { content: money(round2((+l.cantidad || 0) * (+l.pu || 0))), styles: { halign: 'right', fontStyle: 'bold' } },
  ])
  if (!rows.length) rows.push([{ content: '(sin líneas)', colSpan: 6, styles: { halign: 'center', fontStyle: 'italic', textColor: 150 } }])

  doc.autoTable({
    startY: y,
    head: [['#', 'Descripción', 'Und', 'Cantidad', 'P. Unitario', 'Importe']],
    body: rows,
    foot: [[
      { content: `TOTAL ${oc.tipo === 'deductiva' ? 'DEDUCTIVO' : 'ADITIVO'}`, colSpan: 5, styles: { halign: 'right', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: `${signo < 0 ? '− ' : ''}${money(resumen.monto)}`, styles: { halign: 'right', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
    ]],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 14 }, 3: { cellWidth: 24 }, 4: { cellWidth: 28 }, 5: { cellWidth: 30 } },
    margin: { top: 18, left: 12, right: 12, bottom: 16 },
    rowPageBreak: 'avoid',
    didDrawPage: d => { if (d.pageNumber > 1) drawContinuationBand(doc, budget, T, `ORDEN DE CAMBIO No. ${oc.numero}`) },
  })

  // Efecto sobre el contrato
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6, tableWidth: 100, margin: { left: pw - 100 - 12, right: 12, top: 18, bottom: 16 },
    pageBreak: 'avoid', rowPageBreak: 'avoid',
    head: [[{ content: 'EFECTO SOBRE EL CONTRATO', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', halign: 'left' } }]],
    body: [
      ['Contrato vigente', { content: money(resumen.contratoVigente), styles: { halign: 'right' } }],
      [`Esta orden (${oc.tipo})`, { content: `${signo < 0 ? '− ' : '+ '}${money(resumen.monto)}`, styles: { halign: 'right' } }],
      [
        { content: 'CONTRATO ACTUALIZADO', styles: { fontStyle: 'bold', fillColor: T.bg, textColor: T.acc } },
        { content: money(resumen.contratoNuevo), styles: { fontStyle: 'bold', halign: 'right', fillColor: T.bg, textColor: T.acc } },
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2 },
    theme: 'grid',
  })

  // Firmas
  let fy = doc.lastAutoTable.finalY + 26
  const ph = doc.internal.pageSize.getHeight()
  if (fy > ph - 40) { doc.addPage(); drawContinuationBand(doc, budget, T, `ORDEN DE CAMBIO No. ${oc.numero}`); fy = 50 }
  const wCol = (pw - 24 - 20) / 3
  ;['ELABORÓ', 'REVISÓ', 'APROBÓ (CLIENTE)'].forEach((t, i) => {
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
  doc.save(`${(budget.nombreProyecto || 'Proyecto').replace(/[^\w]+/g, '_')}_OC_${oc.numero}.pdf`)
}
