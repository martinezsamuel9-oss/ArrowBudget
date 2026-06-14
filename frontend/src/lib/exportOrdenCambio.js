// ============ EXPORT ORDEN DE CAMBIO (Fase III · cuadro SALCO) ============
import { getJsPDF, pdfTheme, drawApuHeader, drawApuFooter, drawContinuationBand } from './export'
import { makeMoneyFmt, fmt, round2 } from './calc'
import { normLineasOC, montoAjuste, desgloseOC } from './contrato'

export const exportPDFOrdenCambio = async (budget, oc, resumen, empresa = {}) => {
  const jsPDF = await getJsPDF()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const T = pdfTheme(budget, empresa)
  const money = makeMoneyFmt(budget.moneda)
  const pw = doc.internal.pageSize.getWidth()
  const { ajustes, nuevas } = normLineasOC(oc)
  const dz = desgloseOC(oc)

  let y = await drawApuHeader(doc, budget, empresa, { title: `ORDEN DE CAMBIO No. ${oc.numero}` })
  doc.setFontSize(9); doc.setTextColor(70, 70, 70)
  doc.text(`Fecha: ${oc.fecha || '—'}   ·   Estado: ${(oc.estado || 'borrador').toUpperCase()}`, pw / 2, y + 1, { align: 'center' })
  y += 6
  if (oc.concepto) {
    doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(40, 40, 40)
    const lines = doc.splitTextToSize(`Concepto: ${oc.concepto}`, pw - 28)
    doc.text(lines, 14, y + 2); doc.setFont(undefined, 'normal'); y += lines.length * 4.5 + 2
  }

  // Cuadro de ajuste de partidas: contrato original → contrato modificado
  if (ajustes.length) {
    doc.autoTable({
      startY: y,
      head: [[
        { content: 'CONTRATO ORIGINAL', colSpan: 5, styles: { halign: 'center', fillColor: T.mid, textColor: 255 } },
        { content: 'ORDEN DE CAMBIO', colSpan: 3, styles: { halign: 'center', fillColor: T.bg, textColor: T.acc } },
        { content: 'CONTRATO MODIFICADO', colSpan: 2, styles: { halign: 'center', fillColor: T.mid, textColor: 255 } },
      ], [
        'ID', 'Descripción', 'Und', 'Cant.', 'P.U.',
        'Δ Cant.', 'Aum./Dism.', 'Monto',
        'Cant.', 'Sub-Total',
      ]],
      body: ajustes.map(a => {
        const delta = round2((+a.cantNueva || 0) - (+a.cantOriginal || 0))
        const monto = montoAjuste(a)
        return [
          a.actividadId, a.descripcion,
          { content: a.unidad || '—', styles: { halign: 'center' } },
          { content: fmt(a.cantOriginal), styles: { halign: 'right' } },
          { content: money(a.pu), styles: { halign: 'right' } },
          { content: `${delta > 0 ? '+' : ''}${fmt(delta)}`, styles: { halign: 'right' } },
          { content: monto > 0 ? 'Aumento' : monto < 0 ? 'Disminución' : '—', styles: { halign: 'center' } },
          { content: `${monto < 0 ? '−' : ''}${money(Math.abs(monto))}`, styles: { halign: 'right' } },
          { content: fmt(a.cantNueva), styles: { halign: 'right', fontStyle: 'bold' } },
          { content: money(round2((+a.cantNueva || 0) * (+a.pu || 0))), styles: { halign: 'right', fontStyle: 'bold' } },
        ]
      }),
      styles: { fontSize: 7, cellPadding: 1.3 },
      headStyles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 12 } },
      margin: { top: 18, left: 10, right: 10, bottom: 16 },
      rowPageBreak: 'avoid',
      didDrawPage: d => { if (d.pageNumber > 1) drawContinuationBand(doc, budget, T, `ORDEN DE CAMBIO No. ${oc.numero}`) },
    })
    y = doc.lastAutoTable.finalY + 5
  }

  // Obra nueva
  if (nuevas.filter(n => (n.descripcion || '').trim()).length) {
    doc.autoTable({
      startY: y,
      head: [[{ content: 'OBRA NUEVA', colSpan: 5, styles: { halign: 'left', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } }],
             ['Descripción', 'Und', 'Cantidad', 'P.U.', 'Monto']],
      body: nuevas.filter(n => (n.descripcion || '').trim()).map(n => [
        n.descripcion,
        { content: n.unidad || '—', styles: { halign: 'center' } },
        { content: fmt(n.cantidad), styles: { halign: 'right' } },
        { content: money(n.pu), styles: { halign: 'right' } },
        { content: money(round2((+n.cantidad || 0) * (+n.pu || 0))), styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { cellWidth: 18 }, 2: { cellWidth: 28 }, 3: { cellWidth: 34 }, 4: { cellWidth: 38 } },
      margin: { top: 18, left: 10, right: 10, bottom: 16 },
      rowPageBreak: 'avoid',
    })
    y = doc.lastAutoTable.finalY + 5
  }

  // Resumen del efecto sobre el contrato
  doc.autoTable({
    startY: y, tableWidth: 120, margin: { left: pw - 120 - 10, right: 10, top: 18, bottom: 16 },
    pageBreak: 'avoid', rowPageBreak: 'avoid',
    head: [[{ content: 'EFECTO SOBRE EL CONTRATO', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', halign: 'left' } }]],
    body: [
      ['Aumento de obra', { content: `+ ${money(dz.aumento)}`, styles: { halign: 'right' } }],
      ['Disminución de obra', { content: money(dz.disminucion), styles: { halign: 'right' } }],
      ['Obra nueva', { content: `+ ${money(dz.obraNueva)}`, styles: { halign: 'right' } }],
      ['Efecto neto', { content: `${dz.neto < 0 ? '− ' : '+ '}${money(Math.abs(dz.neto))}`, styles: { halign: 'right', fontStyle: 'bold' } }],
      ['Contrato vigente', { content: money(resumen.contratoVigente), styles: { halign: 'right' } }],
      [
        { content: 'CONTRATO MODIFICADO', styles: { fontStyle: 'bold', fillColor: T.bg, textColor: T.acc } },
        { content: money(resumen.contratoNuevo), styles: { halign: 'right', fontStyle: 'bold', fillColor: T.bg, textColor: T.acc } },
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2 }, theme: 'grid',
  })

  // Firmas
  let fy = doc.lastAutoTable.finalY + 24
  const ph = doc.internal.pageSize.getHeight()
  if (fy > ph - 36) { doc.addPage(); drawContinuationBand(doc, budget, T, `ORDEN DE CAMBIO No. ${oc.numero}`); fy = 46 }
  const wCol = (pw - 20 - 20) / 3
  ;['ELABORÓ', 'REVISÓ', 'APROBÓ (CLIENTE)'].forEach((t, i) => {
    const x = 10 + i * (wCol + 10)
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3); doc.line(x, fy, x + wCol, fy)
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
