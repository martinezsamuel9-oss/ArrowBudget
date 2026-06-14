// ============ EXPORT INFORME EJECUTIVO (Fase III) ============
import { getJsPDF, pdfTheme, drawApuHeader, drawApuFooter, drawContinuationBand } from './export'
import { makeMoneyFmt, round2 } from './calc'

export const exportPDFInforme = async (budget, d, empresa = {}) => {
  const jsPDF = await getJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const T = pdfTheme(budget, empresa)
  const money = makeMoneyFmt(budget.moneda)
  const pw = doc.internal.pageSize.getWidth()

  let y = await drawApuHeader(doc, budget, empresa, { title: 'INFORME EJECUTIVO' })
  doc.setFontSize(9); doc.setTextColor(70, 70, 70)
  doc.text(`${budget.cliente || ''}   ·   ${new Date().toLocaleDateString('es-HN')}`, pw / 2, y + 1, { align: 'center' })
  y += 8

  // KPIs en tarjetas
  const kpis = [
    ['CONTRATO VIGENTE', money(d.contratoVigente)],
    ['AVANCE FÍSICO', `${d.avanceFisico}%`],
    ['AVANCE FINANCIERO', `${d.avanceFinanciero}%`],
    ['MARGEN EN EJECUCIÓN', money(d.margenReal)],
  ]
  const gap = 4, bw = (pw - 24 - gap * 3) / 4, bh = 20
  kpis.forEach((k, i) => {
    const bx = 12 + i * (bw + gap)
    doc.setFillColor(T.bg[0], T.bg[1], T.bg[2]); doc.roundedRect(bx, y, bw, bh, 1.5, 1.5, 'F')
    doc.setTextColor(T.acc[0], T.acc[1], T.acc[2]); doc.setFontSize(6); doc.setFont(undefined, 'bold')
    doc.text(k[0], bx + bw / 2, y + 7, { align: 'center' })
    doc.setTextColor(255); doc.setFontSize(10)
    doc.text(String(k[1]), bx + bw / 2, y + 15, { align: 'center' })
  })
  y += bh + 8

  // Cobrado / Pagado lado a lado
  doc.autoTable({
    startY: y, tableWidth: (pw - 28) / 2, margin: { left: 12, top: 18, bottom: 16 },
    pageBreak: 'avoid', rowPageBreak: 'avoid',
    head: [[{ content: 'COBRADO AL CLIENTE', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', halign: 'left' } }]],
    body: [
      ['Obra ejecutada (bruto)', { content: money(d.cobradoBruto), styles: { halign: 'right' } }],
      ['(−) Retención de calidad', { content: money(d.retCliente), styles: { halign: 'right' } }],
      ['(−) Amortización anticipo', { content: money(d.amoCliente), styles: { halign: 'right' } }],
      [{ content: 'Neto cobrado', styles: { fontStyle: 'bold' } }, { content: money(d.cobradoNeto), styles: { halign: 'right', fontStyle: 'bold' } }],
    ],
    styles: { fontSize: 8, cellPadding: 1.8 }, theme: 'grid',
  })
  doc.autoTable({
    startY: y, tableWidth: (pw - 28) / 2, margin: { left: 12 + (pw - 28) / 2 + 4, top: 18, bottom: 16 },
    pageBreak: 'avoid', rowPageBreak: 'avoid',
    head: [[{ content: 'PAGADO A CONTRATISTAS', colSpan: 2, styles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold', halign: 'left' } }]],
    body: [
      ['Obra + personal (bruto)', { content: money(d.gastoBruto), styles: { halign: 'right' } }],
      ['(−) Retención', { content: money(d.retContrat), styles: { halign: 'right' } }],
      ['(−) Amortización anticipo', { content: money(d.amoContrat), styles: { halign: 'right' } }],
      ['(−) Otras deducciones', { content: money(d.dedContrat), styles: { halign: 'right' } }],
      [{ content: 'Neto pagado', styles: { fontStyle: 'bold' } }, { content: money(d.pagadoNeto), styles: { halign: 'right', fontStyle: 'bold' } }],
    ],
    styles: { fontSize: 8, cellPadding: 1.8 }, theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 6

  // Por capítulo
  const caps = d.capitulos || []
  doc.autoTable({
    startY: y,
    head: [['Capítulo', 'Venta', 'Cobrado', 'Gastado', 'Margen', '%']],
    body: caps.map(c => [
      `${c.capId} · ${c.capDesc}`,
      { content: money(c.venta), styles: { halign: 'right' } },
      { content: money(c.cobrado), styles: { halign: 'right' } },
      { content: money(c.gastado), styles: { halign: 'right' } },
      { content: money(c.margen), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${c.pctFin}%`, styles: { halign: 'right' } },
    ]),
    foot: [[
      { content: 'TOTAL', styles: { fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: money(round2(caps.reduce((s, c) => s + c.venta, 0))), styles: { halign: 'right', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: money(round2(caps.reduce((s, c) => s + c.cobrado, 0))), styles: { halign: 'right', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: money(round2(caps.reduce((s, c) => s + c.gastado, 0))), styles: { halign: 'right', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: money(round2(caps.reduce((s, c) => s + c.margen, 0))), styles: { halign: 'right', fillColor: T.bg, textColor: T.acc, fontStyle: 'bold' } },
      { content: '', styles: { fillColor: T.bg } },
    ]],
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    headStyles: { fillColor: T.mid, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { cellWidth: 26 }, 2: { cellWidth: 26 }, 3: { cellWidth: 26 }, 4: { cellWidth: 26 }, 5: { cellWidth: 14 } },
    margin: { top: 18, left: 12, right: 12, bottom: 16 },
    rowPageBreak: 'avoid',
    didDrawPage: dd => { if (dd.pageNumber > 1) drawContinuationBand(doc, budget, T, 'INFORME EJECUTIVO') },
  })

  const tp = doc.internal.getNumberOfPages()
  for (let i = 1; i <= tp; i++) { doc.setPage(i); drawApuFooter(doc, budget, i, tp, empresa) }
  doc.save(`${(budget.nombreProyecto || 'Proyecto').replace(/[^\w]+/g, '_')}_Informe_Ejecutivo.pdf`)
}
