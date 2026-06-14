// ============ EXPORT PLANILLA A CONTRATISTA (Fase III) ============
import { getJsPDF, pdfTheme, drawApuHeader, drawApuFooter, drawContinuationBand } from './export'
import { makeMoneyFmt, fmt, round2 } from './calc'

export const exportPDFPlanilla = async (budget, pla, tot, empresa = {}) => {
  const jsPDF = await getJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const T = pdfTheme(budget, empresa)
  const money = makeMoneyFmt(budget.moneda)
  const pw = doc.internal.pageSize.getWidth()

  let y = await drawApuHeader(doc, budget, empresa, { title: `PLANILLA No. ${pla.numero}` })
  doc.setFontSize(9); doc.setTextColor(70, 70, 70)
  doc.text(`Contratista: ${pla.contratista || '—'}`, pw / 2, y + 1, { align: 'center' })
  doc.setFontSize(8.5)
  doc.text(`Periodo: ${pla.periodo_inicio || '—'} al ${pla.periodo_fin || '—'}   ·   Estado: ${(pla.estado || 'borrador').toUpperCase()}`, pw / 2, y + 6, { align: 'center' })
  y += 11

  const lineasTipo = (titulo, tipo) => {
    const ls = (pla.lineas_json || []).filter(l => l.tipo === tipo && (l.descripcion || '').trim() && (+l.cantidad > 0))
    if (!ls.length) return
    doc.autoTable({
      startY: y,
      head: [[{ content: titulo, colSpan: 5, styles: { fillColor: T.bg, textColor: T.acc, halign: 'left', fontStyle: 'bold' } }],
             ['Descripción', 'Und', 'Cantidad', 'P. Unitario', 'Importe']],
      body: ls.map(l => [
        l.descripcion,
        { content: l.unidad || '—', styles: { halign: 'center' } },
        { content: fmt(l.cantidad), styles: { halign: 'right' } },
        { content: money(l.pu), styles: { halign: 'right' } },
        { content: money(round2((+l.cantidad || 0) * (+l.pu || 0))), styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      styles: { fontSize: 8, cellPadding: 1.7 },
      headStyles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { cellWidth: 14 }, 2: { cellWidth: 24 }, 3: { cellWidth: 28 }, 4: { cellWidth: 30 } },
      margin: { top: 18, left: 12, right: 12, bottom: 16 },
      rowPageBreak: 'avoid',
      didDrawPage: d => { if (d.pageNumber > 1) drawContinuationBand(doc, budget, T, `PLANILLA No. ${pla.numero}`) },
    })
    y = doc.lastAutoTable.finalY + 5
  }
  lineasTipo('OBRA POR DESTAJO (avance ejecutado)', 'destajo')
  lineasTipo('PERSONAL AL DÍA / OBRAS VARIAS', 'dia')

  const ded = (pla.deducciones_json || []).filter(d => (d.descripcion || '').trim() && (+d.monto))
  if (ded.length) {
    doc.autoTable({
      startY: y,
      head: [[{ content: 'DEDUCCIONES VARIAS', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, halign: 'left', fontStyle: 'bold' } }]],
      body: ded.map(d => [d.descripcion, { content: `− ${money(d.monto)}`, styles: { halign: 'right' } }]),
      styles: { fontSize: 8, cellPadding: 1.7 },
      margin: { top: 18, left: 12, right: 90, bottom: 16 },
      rowPageBreak: 'avoid',
    })
    y = doc.lastAutoTable.finalY + 5
  }

  // Resumen de pago
  doc.autoTable({
    startY: y, tableWidth: 96, margin: { left: pw - 96 - 12, right: 12, top: 18, bottom: 16 },
    pageBreak: 'avoid', rowPageBreak: 'avoid',
    head: [[{ content: 'RESUMEN DE PAGO', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', halign: 'left' } }]],
    body: [
      ['Obra por destajo', { content: money(tot.destajo), styles: { halign: 'right' } }],
      ['Personal al día', { content: money(tot.dia), styles: { halign: 'right' } }],
      ['Subtotal', { content: money(tot.sub), styles: { halign: 'right', fontStyle: 'bold' } }],
      [`Retención (${fmt(pla.pct_retencion || 0)}%)`, { content: `− ${money(tot.ret)}`, styles: { halign: 'right' } }],
      [`Amortización anticipo (${fmt(pla.pct_amortizacion || 0)}%)`, { content: `− ${money(tot.amo)}`, styles: { halign: 'right' } }],
      ['Otras deducciones', { content: `− ${money(tot.ded)}`, styles: { halign: 'right' } }],
      [
        { content: 'NETO A PAGAR', styles: { fontStyle: 'bold', fillColor: T.bg, textColor: T.acc } },
        { content: money(tot.neto), styles: { fontStyle: 'bold', halign: 'right', fillColor: T.bg, textColor: T.acc } },
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2 },
    theme: 'grid',
  })

  // Firmas
  let fy = doc.lastAutoTable.finalY + 26
  const ph = doc.internal.pageSize.getHeight()
  if (fy > ph - 40) { doc.addPage(); drawContinuationBand(doc, budget, T, `PLANILLA No. ${pla.numero}`); fy = 50 }
  const wCol = (pw - 24 - 20) / 3
  ;['ELABORÓ', 'REVISÓ / SUPERVISÓ', 'RECIBÍ CONFORME'].forEach((t, i) => {
    const x = 12 + i * (wCol + 10)
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3)
    doc.line(x, fy, x + wCol, fy)
    doc.setFontSize(8); doc.setTextColor(80, 80, 80); doc.setFont(undefined, 'bold')
    doc.text(t, x + wCol / 2, fy + 5, { align: 'center' })
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130)
    const sub = i === 0 ? (budget.cotizante || '') : i === 2 ? (pla.contratista || '') : ''
    if (sub) doc.text(sub, x + wCol / 2, fy + 10, { align: 'center' })
  })

  const tp = doc.internal.getNumberOfPages()
  for (let i = 1; i <= tp; i++) { doc.setPage(i); drawApuFooter(doc, budget, i, tp, empresa) }
  doc.save(`${(budget.nombreProyecto || 'Proyecto').replace(/[^\w]+/g, '_')}_Planilla_${(pla.contratista || '').replace(/[^\w]+/g, '_')}_${pla.numero}.pdf`)
}
