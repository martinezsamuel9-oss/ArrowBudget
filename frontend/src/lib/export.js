// =====================================================================
// ARROW BUDGET — Exportación PDF y Excel
// =====================================================================
import { calcItem, calcFicha, conceptoCost, money, fmt } from './calc'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── ESTILOS EXCEL ────────────────────────────────────────────────────
const X = {
  titleFill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1115' } },
  titleFont:   { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFBBF24' } },
  headerFill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } },
  headerFont:  { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  capFill:     { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1115' } },
  capFont:     { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFBBF24' } },
  subcapFill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } },
  subcapFont:  { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  subtotalFill:{ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  totalFill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1115' } },
  totalFont:   { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFBBF24' } },
  border: {
    top:    { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left:   { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right:  { style: 'thin', color: { argb: 'FFCBD5E1' } },
  },
  ac: { vertical: 'middle', horizontal: 'center', wrapText: true },
  ar: { vertical: 'middle', horizontal: 'right' },
  al: { vertical: 'middle', horizontal: 'left', wrapText: true },
}
const MFMT = '"$"#,##0.00'
const NFMT = '#,##0.0000'

const setC = (ws, addr, val, opts = {}) => {
  const c = ws.getCell(addr)
  c.value = val
  if (opts.fill)   c.fill = opts.fill
  if (opts.font)   c.font = opts.font
  c.alignment = opts.alignment || X.al
  if (opts.numFmt) c.numFmt = opts.numFmt
  c.border = opts.border || X.border
  return c
}

const writeHeaderXLSX = (ws, budget) => {
  ws.mergeCells('A1:F1')
  setC(ws, 'A1', 'PRESUPUESTO DE OBRA', { fill: X.titleFill, font: X.titleFont, alignment: X.ac })
  ws.getRow(1).height = 28
  setC(ws, 'A2', 'Cotizante:',  { font: { bold: true } }); setC(ws, 'B2', budget.cotizante || '')
  setC(ws, 'D2', 'Cliente:',    { font: { bold: true } }); setC(ws, 'E2', budget.cliente   || '')
  setC(ws, 'A3', 'Proyecto:',   { font: { bold: true } }); setC(ws, 'B3', budget.nombre_proyecto || '')
  setC(ws, 'D3', 'Fecha:',      { font: { bold: true } }); setC(ws, 'E3', budget.fecha     || '')
  setC(ws, 'A4', 'Lugar:',      { font: { bold: true } }); setC(ws, 'B4', budget.lugar     || '')
  setC(ws, 'D4', 'Rev:',        { font: { bold: true } }); setC(ws, 'E4', budget.revision  || 1)
  setC(ws, 'F4', budget.moneda  || 'USD', { font: { bold: true } })
  return 6
}

// ─── PDF HEADER ────────────────────────────────────────────────────────
const drawPDFHeader = (doc, budget, subtitle) => {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(15, 17, 21)
  doc.rect(0, 0, w, 32, 'F')
  doc.setTextColor(245, 158, 11); doc.setFontSize(15); doc.setFont(undefined, 'bold')
  doc.text(subtitle, w / 2, 12, { align: 'center' })
  doc.setTextColor(255); doc.setFontSize(11)
  doc.text(budget.nombre_proyecto || '', w / 2, 19, { align: 'center' })
  doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(220, 220, 220)
  doc.text(`Rev ${budget.revision || 1} · ${budget.estado || 'Borrador'} · ${budget.moneda || 'USD'} · ${budget.fecha || ''}`, w / 2, 25, { align: 'center' })
  doc.setTextColor(0)
  let y = 38; doc.setFontSize(9)
  doc.setFont(undefined, 'bold'); doc.text('Cotizante:', 10, y)
  doc.setFont(undefined, 'normal'); doc.text(budget.cotizante || '—', 32, y)
  doc.setFont(undefined, 'bold'); doc.text('Cliente:', w / 2, y)
  doc.setFont(undefined, 'normal'); doc.text(budget.cliente || '—', w / 2 + 18, y)
  y += 5
  doc.setFont(undefined, 'bold'); doc.text('Lugar:', 10, y)
  doc.setFont(undefined, 'normal'); doc.text(budget.lugar || '—', 32, y)
  y += 4
  doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5); doc.line(10, y, w - 10, y)
  return y + 4
}

// ─── PDF PRESUPUESTO ───────────────────────────────────────────────────
export const exportPDFPresupuesto = (budget) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const ctx = { pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad }
  const y = drawPDFHeader(doc, budget, 'PRESUPUESTO DE OBRA')
  const rows = []
  const walk = (its, d = 0) => {
    for (const it of its) {
      const c = calcItem(it, ctx)
      const ind = '  '.repeat(d)
      if (it.tipo === 'capitulo') {
        rows.push([
          { content: it.codigo, styles: { fontStyle: 'bold', fillColor: [15, 17, 21], textColor: 255 } },
          { content: ind + it.descripcion, styles: { fontStyle: 'bold', fillColor: [15, 17, 21], textColor: 255 } },
          '', '', '',
          { content: money(c.subtotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [15, 17, 21], textColor: 245 } }
        ])
        if (it.children) walk(it.children, d + 1)
      } else if (it.tipo === 'subcapitulo') {
        rows.push([
          { content: it.codigo, styles: { fontStyle: 'bold', fillColor: [71, 85, 105], textColor: 255 } },
          { content: ind + it.descripcion, styles: { fontStyle: 'bold', fillColor: [71, 85, 105], textColor: 255 } },
          '', '', '',
          { content: money(c.subtotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [71, 85, 105], textColor: 255 } }
        ])
        if (it.children) walk(it.children, d + 1)
      } else {
        rows.push([it.codigo, ind + it.descripcion, it.unidad, fmt(it.cantidad), money(c.precioUnitario), { content: money(c.subtotal), styles: { halign: 'right' } }])
      }
    }
  }
  walk(budget.items, 0)
  const tot = budget.items.reduce((s, it) => s + calcItem(it, ctx).subtotal, 0)
  rows.push([
    { content: 'TOTAL GENERAL', colSpan: 5, styles: { fillColor: [15, 17, 21], textColor: 245, fontStyle: 'bold', halign: 'right' } },
    { content: money(tot), styles: { fillColor: [15, 17, 21], textColor: 245, fontStyle: 'bold', halign: 'right' } }
  ])
  autoTable(doc, {
    startY: y,
    head: [['ID', 'Descripción', 'Unidad', 'Cantidad', 'P. Unitario', 'Subtotal']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 17, 21], textColor: 245 },
    columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'center', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 20 }, 4: { halign: 'right', cellWidth: 25 }, 5: { halign: 'right', cellWidth: 28 } }
  })
  doc.save((budget.nombre_proyecto || 'Presupuesto').replace(/[^\w]+/g, '_') + '_Presupuesto.pdf')
}

// ─── PDF FICHA ─────────────────────────────────────────────────────────
export const exportPDFFicha = (budget, act) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const ctx = { pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad }
  let y = drawPDFHeader(doc, budget, 'FICHA DE COSTO UNITARIO')
  doc.setFontSize(11); doc.setFont(undefined, 'bold')
  doc.text(`${act.codigo} — ${act.descripcion}`, 10, y); y += 5
  doc.setFontSize(9); doc.setFont(undefined, 'normal')
  doc.text(`Cantidad: ${fmt(act.cantidad)} ${act.unidad || ''}`, 10, y); y += 4
  const f = act.ficha || { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const calc = calcFicha(f, ctx.pctIndirectos, ctx.pctImprevistos, ctx.pctUtilidad)
  const sect = (title, k, total) => {
    const rs = (f[k] || []).map((c, i) => [
      i + 1, c.descripcion, c.unidad || '', fmt(c.rendimiento),
      fmt(c.desperdicio) + '%', money(c.costoUnitario ?? 0), money(conceptoCost(c))
    ])
    if (rs.length === 0) rs.push([{ content: '(sin conceptos)', colSpan: 7, styles: { halign: 'center', fontStyle: 'italic', textColor: 150 } }])
    rs.push([{ content: 'SUBTOTAL ' + title, colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } }, { content: money(total), styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } }])
    autoTable(doc, {
      startY: y,
      head: [[{ content: title, colSpan: 7, styles: { fillColor: [30, 41, 59], textColor: 255, halign: 'left', fontStyle: 'bold' } }],
             ['#', 'Descripción', 'Und', 'Rend.', 'Desp.', 'C. Unit.', 'Subtotal']],
      body: rs,
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: [71, 85, 105], textColor: 255 }
    })
    y = doc.lastAutoTable.finalY + 3
  }
  sect('MATERIALES', 'materiales', calc.totMat)
  sect('MANO DE OBRA', 'manoObra', calc.totMo)
  sect('HERRAMIENTA + EQUIPO', 'herramientaEquipo', calc.totHe)
  sect('SUBCONTRATO', 'subcontratos', calc.totSub)
  autoTable(doc, {
    startY: y,
    body: [
      ['Costo Directo', money(calc.costoDirecto)],
      [`Indirectos (${ctx.pctIndirectos}%)`, money(calc.indirectos)],
      [`Imprevistos (${ctx.pctImprevistos}%)`, money(calc.imprevistos)],
      [`Utilidad (${ctx.pctUtilidad}%)`, money(calc.utilidad)],
      [{ content: 'PRECIO UNITARIO TOTAL', styles: { fontStyle: 'bold', fillColor: [15, 17, 21], textColor: 245 } },
       { content: money(calc.precioUnitario), styles: { fontStyle: 'bold', fillColor: [15, 17, 21], textColor: 245, halign: 'right' } }]
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { halign: 'right', fontStyle: 'bold' }, 1: { halign: 'right', cellWidth: 50 } },
    theme: 'grid'
  })
  doc.save(`Ficha_${act.codigo}.pdf`)
}

// ─── EXCEL PRESUPUESTO ─────────────────────────────────────────────────
export const exportExcelPresupuesto = async (budget) => {
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')
  const ctx = { pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad }
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Presupuesto')
  ws.columns = [{ width: 10 }, { width: 50 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 18 }]
  let row = writeHeaderXLSX(ws, budget)
  ;['ID', 'Descripción', 'Unidad', 'Cantidad', 'P. Unitario', 'Subtotal'].forEach((h, i) =>
    setC(ws, String.fromCharCode(65 + i) + row, h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac })
  )
  ws.getRow(row).height = 22; row++
  const walk = (its, d = 0) => {
    for (const it of its) {
      const c = calcItem(it, ctx)
      const ind = '   '.repeat(d)
      if (it.tipo === 'capitulo') {
        setC(ws, 'A' + row, it.codigo,           { fill: X.capFill, font: X.capFont, alignment: X.ac })
        setC(ws, 'B' + row, ind + it.descripcion, { fill: X.capFill, font: X.capFont, alignment: X.al })
        ;['C', 'D', 'E'].forEach(cc => setC(ws, cc + row, '', { fill: X.capFill }))
        setC(ws, 'F' + row, c.subtotal,           { fill: X.capFill, font: X.capFont, alignment: X.ar, numFmt: MFMT })
        row++
        if (it.children) walk(it.children, d + 1)
        ;['A', 'B', 'C', 'D', 'E', 'F'].forEach(cc =>
          setC(ws, cc + row, cc === 'B' ? ind + 'SUBTOTAL Cap. ' + it.codigo : cc === 'F' ? c.subtotal : '',
            { fill: X.subtotalFill, font: { italic: true, bold: true }, alignment: cc === 'F' ? X.ar : X.al, numFmt: cc === 'F' ? MFMT : undefined })
        )
        row++
      } else if (it.tipo === 'subcapitulo') {
        setC(ws, 'A' + row, it.codigo,           { fill: X.subcapFill, font: X.subcapFont, alignment: X.ac })
        setC(ws, 'B' + row, ind + it.descripcion, { fill: X.subcapFill, font: X.subcapFont, alignment: X.al })
        ;['C', 'D', 'E'].forEach(cc => setC(ws, cc + row, '', { fill: X.subcapFill }))
        setC(ws, 'F' + row, c.subtotal,           { fill: X.subcapFill, font: X.subcapFont, alignment: X.ar, numFmt: MFMT })
        row++
        if (it.children) walk(it.children, d + 1)
      } else {
        setC(ws, 'A' + row, it.codigo,            { alignment: X.ac })
        setC(ws, 'B' + row, ind + it.descripcion, { alignment: X.al })
        setC(ws, 'C' + row, it.unidad || '',       { alignment: X.ac })
        setC(ws, 'D' + row, Number(it.cantidad) || 0, { alignment: X.ar, numFmt: NFMT })
        setC(ws, 'E' + row, c.precioUnitario,     { alignment: X.ar, numFmt: MFMT })
        setC(ws, 'F' + row, c.subtotal,           { alignment: X.ar, numFmt: MFMT, font: { bold: true } })
        row++
      }
    }
  }
  walk(budget.items, 0)
  const tot = budget.items.reduce((s, it) => s + calcItem(it, ctx).subtotal, 0)
  row++
  ws.mergeCells('A' + row + ':E' + row)
  setC(ws, 'A' + row, 'TOTAL GENERAL', { fill: X.totalFill, font: X.totalFont, alignment: X.ar })
  setC(ws, 'F' + row, tot,             { fill: X.totalFill, font: X.totalFont, alignment: X.ar, numFmt: MFMT })
  ws.getRow(row).height = 26
  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]), (budget.nombre_proyecto || 'Presupuesto').replace(/[^\w]+/g, '_') + '_Presupuesto.xlsx')
}

// ─── EXCEL FICHA ───────────────────────────────────────────────────────
export const exportExcelFicha = async (budget, act) => {
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')
  const ctx = { pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad }
  const f = act.ficha || { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const calc = calcFicha(f, ctx.pctIndirectos, ctx.pctImprevistos, ctx.pctUtilidad)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Ficha')
  ws.columns = [{ width: 6 }, { width: 38 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 18 }]
  ws.mergeCells('A1:G1')
  setC(ws, 'A1', 'FICHA DE COSTO UNITARIO', { fill: X.titleFill, font: X.titleFont, alignment: X.ac })
  ws.getRow(1).height = 26
  ws.mergeCells('A2:G2')
  setC(ws, 'A2', `${act.codigo} — ${act.descripcion}`, { font: { bold: true, size: 12 }, alignment: X.ac })
  setC(ws, 'A3', 'Cantidad:', { font: { bold: true } })
  setC(ws, 'B3', `${fmt(act.cantidad)} ${act.unidad || ''}`)
  setC(ws, 'D3', 'Proyecto:', { font: { bold: true } })
  setC(ws, 'E3', budget.nombre_proyecto || '')
  let row = 5
  const sect = (title, k, total) => {
    ws.mergeCells('A' + row + ':G' + row)
    setC(ws, 'A' + row, title, { fill: X.headerFill, font: X.headerFont, alignment: { vertical: 'middle', horizontal: 'left' } })
    row++
    ;['#', 'Descripción', 'Unidad', 'Rend.', 'Desp.%', 'C. Unit.', 'Subtotal'].forEach((h, i) =>
      setC(ws, String.fromCharCode(65 + i) + row, h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac })
    )
    row++
    ;(f[k] || []).forEach((c, i) => {
      setC(ws, 'A' + row, i + 1,                { alignment: X.ac })
      setC(ws, 'B' + row, c.descripcion || '',   { alignment: X.al })
      setC(ws, 'C' + row, c.unidad || '',         { alignment: X.ac })
      setC(ws, 'D' + row, Number(c.rendimiento) || 0, { alignment: X.ar, numFmt: NFMT })
      setC(ws, 'E' + row, Number(c.desperdicio) || 0, { alignment: X.ar, numFmt: '0.00"%"' })
      setC(ws, 'F' + row, Number(c.costoUnitario) || 0, { alignment: X.ar, numFmt: MFMT })
      setC(ws, 'G' + row, conceptoCost(c),       { alignment: X.ar, numFmt: MFMT, font: { bold: true } })
      row++
    })
    ws.mergeCells('A' + row + ':F' + row)
    setC(ws, 'A' + row, 'SUBTOTAL ' + title, { fill: X.subtotalFill, font: { bold: true }, alignment: X.ar })
    setC(ws, 'G' + row, total,               { fill: X.subtotalFill, font: { bold: true }, alignment: X.ar, numFmt: MFMT })
    row += 2
  }
  sect('MATERIALES',          'materiales',         calc.totMat)
  sect('MANO DE OBRA',        'manoObra',           calc.totMo)
  sect('HERRAMIENTA + EQUIPO','herramientaEquipo',  calc.totHe)
  sect('SUBCONTRATO',         'subcontratos',       calc.totSub)
  ;[
    ['Costo Directo',                            calc.costoDirecto],
    [`Indirectos (${ctx.pctIndirectos}%)`,       calc.indirectos],
    [`Imprevistos (${ctx.pctImprevistos}%)`,     calc.imprevistos],
    [`Utilidad (${ctx.pctUtilidad}%)`,           calc.utilidad],
  ].forEach(([label, val]) => {
    ws.mergeCells('A' + row + ':F' + row)
    setC(ws, 'A' + row, label, { alignment: X.ar, font: { bold: true } })
    setC(ws, 'G' + row, val,   { alignment: X.ar, numFmt: MFMT })
    row++
  })
  ws.mergeCells('A' + row + ':F' + row)
  setC(ws, 'A' + row, 'PRECIO UNITARIO TOTAL', { fill: X.totalFill, font: X.totalFont, alignment: X.ar })
  setC(ws, 'G' + row, calc.precioUnitario,     { fill: X.totalFill, font: X.totalFont, alignment: X.ar, numFmt: MFMT })
  ws.getRow(row).height = 26
  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]), `Ficha_${act.codigo}.xlsx`)
}
