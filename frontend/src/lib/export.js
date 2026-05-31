import jsPDF from 'jspdf'
import 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import {
  round2, fmt, money, findInsumo, conceptoCost,
  calcItem, calcFicha, CATEGORIAS, uid, normalize,
} from './calc'

const X = {
  titleFill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1115' } },
  titleFont:   { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFF59E0B' } },
  headerFill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } },
  headerFont:  { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  capFill:     { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1115' } },
  capFont:     { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFBBF24' } },
  subcapFill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } },
  subcapFont:  { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  subtotalFill:{ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  totalFill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1115' } },
  totalFont:   { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFBBF24' } },
  border: { top:{style:'thin',color:{argb:'FFCBD5E1'}}, left:{style:'thin',color:{argb:'FFCBD5E1'}}, bottom:{style:'thin',color:{argb:'FFCBD5E1'}}, right:{style:'thin',color:{argb:'FFCBD5E1'}} },
  ac: { vertical:'middle', horizontal:'center', wrapText:true },
  ar: { vertical:'middle', horizontal:'right' },
  al: { vertical:'middle', horizontal:'left', wrapText:true },
}
const MFMT = '"$"#,##0.00'
const NFMT = '#,##0.0000'

const setC = (ws, addr, val, opts={}) => {
  const c = ws.getCell(addr)
  c.value = val
  if (opts.fill) c.fill = opts.fill
  if (opts.font) c.font = opts.font
  c.alignment = opts.alignment || X.al
  if (opts.numFmt) c.numFmt = opts.numFmt
  c.border = opts.border || X.border
  return c
}

const writeHeader = (ws, budget) => {
  ws.mergeCells('A1:F1')
  setC(ws,'A1','PRESUPUESTO DE OBRA',{fill:X.titleFill,font:X.titleFont,alignment:X.ac})
  ws.getRow(1).height=28
  setC(ws,'A2','Cotizante:',{font:{bold:true}}); setC(ws,'B2',budget.cotizante||'')
  setC(ws,'D2','Cliente:',{font:{bold:true}});   setC(ws,'E2',budget.cliente||'')
  setC(ws,'A3','Proyecto:',{font:{bold:true}});  setC(ws,'B3',budget.nombreProyecto||'')
  setC(ws,'D3','Fecha:',{font:{bold:true}});     setC(ws,'E3',budget.fecha||'')
  setC(ws,'A4','Lugar:',{font:{bold:true}});     setC(ws,'B4',budget.lugar||'')
  setC(ws,'D4','Rev:',{font:{bold:true}});       setC(ws,'E4',budget.revision||1)
  setC(ws,'F4',budget.moneda||'USD',{font:{bold:true}})
  return 6
}

const drawPDFHeader = (doc, budget, subtitle='PRESUPUESTO DE OBRA') => {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(15,17,21); doc.rect(0,0,w,32,'F')
  try { if(budget.logoOfertante) doc.addImage(budget.logoOfertante,'PNG',8,4,22,22) } catch{}
  try { if(budget.logoCliente)   doc.addImage(budget.logoCliente,'PNG',w-30,4,22,22) } catch{}
  doc.setTextColor(245,158,11); doc.setFontSize(15); doc.setFont(undefined,'bold')
  doc.text(subtitle, w/2, 12, {align:'center'})
  doc.setTextColor(255); doc.setFontSize(11)
  doc.text(budget.nombreProyecto||'', w/2, 19, {align:'center'})
  doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(220,220,220)
  doc.text(`Rev ${budget.revision||1} · ${budget.estado||'Activo'} · ${budget.moneda||'USD'} · ${budget.fecha||''}`, w/2, 25, {align:'center'})
  doc.setTextColor(0)
  let y=38; doc.setFontSize(9)
  doc.setFont(undefined,'bold'); doc.text('Cotizante:',10,y); doc.setFont(undefined,'normal'); doc.text(budget.cotizante||'—',32,y)
  doc.setFont(undefined,'bold'); doc.text('Cliente:',w/2,y); doc.setFont(undefined,'normal'); doc.text(budget.cliente||'—',w/2+18,y)
  y+=5
  doc.setFont(undefined,'bold'); doc.text('Ofertante:',10,y); doc.setFont(undefined,'normal'); doc.text(budget.ofertante||'—',32,y)
  doc.setFont(undefined,'bold'); doc.text('Ubicación:',w/2,y); doc.setFont(undefined,'normal'); doc.text(budget.lugar||'—',w/2+22,y)
  y+=5
  doc.setFont(undefined,'bold'); doc.text('Realizado por:',10,y); doc.setFont(undefined,'normal'); doc.text(budget.realizadoPor||'—',35,y)
  doc.setFont(undefined,'bold'); doc.text('Tipo:',w/2,y); doc.setFont(undefined,'normal'); doc.text(budget.tipo||'—',w/2+13,y)
  y+=4
  doc.setDrawColor(245,158,11); doc.setLineWidth(0.5); doc.line(10,y,w-10,y)
  return y+4
}

// ============ APU HEADER / FOOTER HELPERS ============
const hexToRgb = hex => {
  const h = (hex||'').replace('#','').replace(/[^0-9a-fA-F]/g,'')
  if (h.length < 6) return null
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

// Obtiene las dimensiones reales de una imagen base64 (async)
const loadImageDims = src => new Promise(res => {
  if (!src) return res(null)
  try {
    const img = new window.Image()
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => res(null)
    img.src = src
  } catch { res(null) }
})

// Inserta imagen con object-fit: contain dentro de un bounding box maxW × maxH
const addImageContain = async (doc, src, x, y, maxW, maxH) => {
  if (!src) return
  const dims = await loadImageDims(src)
  let w = maxW, h = maxH
  if (dims && dims.w && dims.h) {
    const ratio = dims.w / dims.h
    w = maxW; h = maxW / ratio
    if (h > maxH) { h = maxH; w = maxH * ratio }
  }
  const ox = x + (maxW - w) / 2
  const oy = y + (maxH - h) / 2
  try {
    // Detecta formato por header base64
    const fmt = src.startsWith('data:image/png') ? 'PNG' : src.startsWith('data:image/svg') ? 'SVG' : 'JPEG'
    doc.addImage(src, fmt, ox, oy, w, h)
  } catch {}
}

// draws the compact APU page header; returns the Y coordinate where content should start
const drawApuHeader = async (doc, budget, empresa = {}, opts = {}) => {
  const w = doc.internal.pageSize.getWidth()
  const { showPartyInfo = true } = opts
  const bg   = hexToRgb(empresa.headerBg)   || [15,17,21]
  const txt  = hexToRgb(empresa.headerText) || [245,158,11]
  const headerH = 28

  doc.setFillColor(bg[0],bg[1],bg[2]); doc.rect(0,0,w,headerH,'F')
  // Logo empresa (contain-fit dentro de 24×18mm, centrado a la izquierda)
  await addImageContain(doc, empresa.logo, 5, 5, 24, 18)
  // Títulos
  doc.setTextColor(txt[0],txt[1],txt[2]); doc.setFontSize(13); doc.setFont(undefined,'bold')
  doc.text('FICHA DE COSTO UNITARIO', w/2, 11, {align:'center'})
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont(undefined,'normal')
  doc.text(empresa.nombre||'', w/2, 18, {align:'center'})
  doc.setFontSize(7.5); doc.setTextColor(190,190,190)
  doc.text(budget.nombreProyecto||'', w/2, 24, {align:'center'})
  doc.setTextColor(0)

  let y = headerH + 3

  if (showPartyInfo) {
    doc.setFontSize(7.5)
    const pairs = [
      ['Elaboró:',       budget.cotizante   ||'—',  'Cliente:',    budget.cliente  ||'—'],
      ['Revisó/Aprobó:', budget.ofertante   ||'—',  'Ubicación:',  budget.lugar    ||'—'],
      ['Realizado por:', budget.realizadoPor||'—',  'Tipo:',       budget.tipo     ||'—'],
    ]
    const cx1=10, cx2=w/2+4
    for (const [l1,v1,l2,v2] of pairs) {
      doc.setFont(undefined,'bold');   doc.text(l1, cx1, y)
      doc.setFont(undefined,'normal'); doc.text(v1, cx1+27, y)
      doc.setFont(undefined,'bold');   doc.text(l2, cx2, y)
      doc.setFont(undefined,'normal'); doc.text(v2, cx2+24, y)
      y += 4.5
    }
    doc.setDrawColor(txt[0],txt[1],txt[2]); doc.setLineWidth(0.4); doc.line(10,y,w-10,y)
    y += 3
  }
  return y
}

// footer: rev info on left, page number on right
const drawApuFooter = (doc, budget, pageNum, totalPages) => {
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  doc.setFillColor(15,17,21); doc.rect(0,h-10,w,10,'F')
  doc.setTextColor(180,180,180); doc.setFontSize(7); doc.setFont(undefined,'normal')
  doc.text(`Rev ${budget.revision||1} · ${budget.estado||'Borrador'} · ${budget.moneda||'USD'} · ${budget.fecha||''}`, 10, h-4)
  doc.text(`Pág. ${pageNum} de ${totalPages}`, w-10, h-4, {align:'right'})
  doc.setTextColor(0)
}

// ============ PDF CATÁLOGO ============
export const exportPDFCatalogo = (budget, catKey) => {
  const cat = CATEGORIAS.find(c => c.key === catKey)
  if (!cat) return
  const ML = 14
  const cantTotalOf = id => {
    let t = 0
    const walk = its => { for (const it of its) { if (it.tipo === 'actividad') { for (const x of (it.ficha?.[catKey]||[])) if (x.insumoId === id) t += (+it.cantidad||0) * (+x.rendimiento||0) } else if (it.children) walk(it.children) } }
    walk(budget.items || [])
    return round2(t)
  }
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' })
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  // Header
  doc.setFillColor(15,17,21); doc.rect(0,0,w,20,'F')
  doc.setTextColor(245,158,11); doc.setFontSize(11); doc.setFont(undefined,'bold')
  doc.text(`LISTA DE ${cat.label.toUpperCase()}`, w/2, 11, { align:'center' })
  doc.setTextColor(220,220,220); doc.setFontSize(7.5); doc.setFont(undefined,'normal')
  doc.text(budget.nombreProyecto||'', w/2, 17, { align:'center' })
  doc.setTextColor(0)
  // Tabla
  const rows = (budget.catalogos[catKey]||[]).map(ins => {
    const cant = cantTotalOf(ins.id)
    return [
      ins.codigo||'', ins.descripcion, ins.unidad,
      cant > 0 ? fmt(cant) : '—',
      money(ins.costoBase),
      cant > 0 ? money(round2(cant*(+ins.costoBase||0))) : '—',
    ]
  })
  doc.autoTable({
    startY: 24,
    margin: { left: ML, right: ML },
    head: [[
      { content:'Código',      styles:{halign:'center'} },
      { content:'Descripción', styles:{halign:'left'  } },
      { content:'Unidad',      styles:{halign:'center'} },
      { content:'Cant. Total', styles:{halign:'right' } },
      { content:'Precio Base', styles:{halign:'right' } },
      { content:'Costo Total', styles:{halign:'right' } },
    ]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2, textColor:[15,17,21] },
    headStyles: { fillColor:[30,41,59], textColor:255, fontStyle:'bold', fontSize:8 },
    alternateRowStyles: { fillColor:[248,250,252] },
    columnStyles: {
      0:{ cellWidth:18, halign:'center' },
      2:{ cellWidth:14, halign:'center' },
      3:{ cellWidth:22, halign:'right'  },
      4:{ cellWidth:24, halign:'right'  },
      5:{ cellWidth:26, halign:'right'  },
    },
    theme: 'plain',
  })
  // Footer
  doc.setDrawColor(203,213,225); doc.setLineWidth(0.3); doc.line(ML,h-10,w-ML,h-10)
  doc.setTextColor(148,163,184); doc.setFontSize(7); doc.setFont(undefined,'normal')
  doc.text(`Arrow Budget · ${new Date().toLocaleDateString('es-HN')}`, ML, h-5)
  doc.text(`${(budget.catalogos[catKey]||[]).length} registros`, w-ML, h-5, { align:'right' })
  doc.setTextColor(0)
  doc.save(`${(budget.nombreProyecto||'Cat').replace(/[^\w]+/g,'_')}_${cat.label.replace(/\s+/g,'_')}.pdf`)
}

export const exportPDFPresupuesto = (budget, params) => {
  const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'letter'})
  const y = drawPDFHeader(doc, budget, 'PRESUPUESTO DE OBRA')
  const rows = []
  const walk = (its, d=0) => {
    for (const it of its) {
      const c = calcItem(it, budget.catalogos, params)
      const ind = '  '.repeat(d)
      if (it.tipo==='capitulo') {
        rows.push([{content:it.id,styles:{fontStyle:'bold',fillColor:[15,17,21],textColor:255}},{content:ind+it.descripcion,styles:{fontStyle:'bold',fillColor:[15,17,21],textColor:255}},'','',''  ,{content:money(c.subtotal),styles:{fontStyle:'bold',halign:'right',fillColor:[15,17,21],textColor:245}}])
        if (it.children) walk(it.children, d+1)
      } else if (it.tipo==='subcapitulo') {
        rows.push([{content:it.id,styles:{fontStyle:'bold',fillColor:[71,85,105],textColor:255}},{content:ind+it.descripcion,styles:{fontStyle:'bold',fillColor:[71,85,105],textColor:255}},'','','',{content:money(c.subtotal),styles:{fontStyle:'bold',halign:'right',fillColor:[71,85,105],textColor:255}}])
        if (it.children) walk(it.children, d+1)
      } else {
        rows.push([it.id, ind+it.descripcion, it.unidad, fmt(it.cantidad), money(c.precioUnitario), {content:money(c.subtotal),styles:{halign:'right'}}])
      }
    }
  }
  walk(budget.items, 0)
  const tot = round2(budget.items.reduce((s,it)=>s+calcItem(it,budget.catalogos,params).subtotal,0))
  rows.push([{content:'TOTAL GENERAL',colSpan:5,styles:{fillColor:[15,17,21],textColor:245,fontStyle:'bold',halign:'right'}},{content:money(tot),styles:{fillColor:[15,17,21],textColor:245,fontStyle:'bold',halign:'right'}}])
  doc.autoTable({startY:y,head:[['ID','Descripción','Unidad','Cantidad','P. Unitario','Subtotal']],body:rows,styles:{fontSize:8,cellPadding:1.5},headStyles:{fillColor:[15,17,21],textColor:245},columnStyles:{0:{cellWidth:20},2:{halign:'center',cellWidth:18},3:{halign:'right',cellWidth:20},4:{halign:'right',cellWidth:25},5:{halign:'right',cellWidth:28}}})
  doc.save((budget.nombreProyecto||'Presupuesto').replace(/[^\w]+/g,'_')+'_Presupuesto.pdf')
}

// empresa = { nombre, logo, headerBg, headerText }
export const exportPDFFicha = async (budget, act, params, empresa = {}) => {
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'letter'})
  const h   = doc.internal.pageSize.getHeight()
  const calc = calcFicha(act.ficha, budget.catalogos, params)
  let y = await drawApuHeader(doc, budget, empresa, { showPartyInfo: true })

  // Activity title bar
  doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.setTextColor(0)
  doc.text(`${act.id} — ${act.descripcion}`, 10, y); y+=5
  doc.setFontSize(8.5); doc.setFont(undefined,'normal'); doc.setTextColor(80,80,80)
  doc.text(`Cantidad: ${fmt(act.cantidad)} ${act.unidad}`, 10, y); doc.setTextColor(0); y+=5

  const sectApu = (title, k, total, moTotal = 0) => {
    const rs = (act.ficha[k]||[]).map((c,i)=>{
      const ins = findInsumo(budget.catalogos,k,c.insumoId)
      if (!ins) return null
      const isMoBased = k==='herramientaEquipo' && normalize(ins?.descripcion)==='herramienta menor'
      const effectiveBase = isMoBased ? moTotal : (+ins.costoBase||0)
      return [ins.codigo||String(i+1), ins.descripcion, ins.unidad, fmt(c.rendimiento), fmt(c.desperdicio)+'%', money(effectiveBase), money(conceptoCost(c,budget.catalogos,k,{moTotal}))]
    }).filter(Boolean)
    if (!rs.length) rs.push([{content:'(sin conceptos)',colSpan:7,styles:{halign:'center',fontStyle:'italic',textColor:150}}])
    rs.push([{content:'SUBTOTAL '+title,colSpan:6,styles:{halign:'right',fontStyle:'bold',fillColor:[226,232,240]}},{content:money(total),styles:{halign:'right',fontStyle:'bold',fillColor:[226,232,240]}}])
    doc.autoTable({startY:y,head:[[{content:title,colSpan:7,styles:{fillColor:[30,41,59],textColor:255,halign:'left',fontStyle:'bold'}}],['Cód.','Insumo','Und','Rend.','Desp.','C.Base','Subtotal']],body:rs,styles:{fontSize:7.5,cellPadding:1.1},headStyles:{fillColor:[71,85,105],textColor:255},columnStyles:{0:{cellWidth:18,halign:'center'},2:{cellWidth:14,halign:'center'},3:{cellWidth:16,halign:'right'},4:{cellWidth:14,halign:'right'},5:{cellWidth:22,halign:'right'},6:{cellWidth:24,halign:'right'}},margin:{bottom:14}})
    y = doc.lastAutoTable.finalY + 3
  }
  sectApu('MATERIALES','materiales',calc.totMat)
  sectApu('MANO DE OBRA','manoObra',calc.totMo)
  sectApu('HERRAMIENTA + EQUIPO','herramientaEquipo',calc.totHe,calc.totMo)
  sectApu('SUBCONTRATO','subcontratos',calc.totSub)

  // Resumen compacto a la derecha (igual que UI)
  y += 6
  const C2 = { ink:[15,17,21], dark:[30,41,59], bg:[248,250,252] }
  const pw2 = doc.internal.pageSize.getWidth()
  const tW2 = 105
  doc.autoTable({startY:y, tableWidth:tW2, margin:{left:pw2-tW2-10, right:10, bottom:14},
    head:[[{content:'RESUMEN',colSpan:2,styles:{fillColor:C2.dark,textColor:255,fontStyle:'bold',fontSize:8,halign:'left'}}]],
    body:[
      [{content:'Materiales',         styles:{halign:'left'}},{content:money(calc.totMat),         styles:{halign:'right'}}],
      [{content:'Mano de Obra',       styles:{halign:'left'}},{content:money(calc.totMo),          styles:{halign:'right'}}],
      [{content:'Herramientas y Equipo',styles:{halign:'left'}},{content:money(calc.totHe),        styles:{halign:'right'}}],
      [{content:'Subcontratos',       styles:{halign:'left'}},{content:money(calc.totSub),         styles:{halign:'right'}}],
      [{content:'COSTO DIRECTO',      styles:{fontStyle:'bold',halign:'left',fillColor:C2.bg}},{content:money(calc.costoDirecto),styles:{fontStyle:'bold',halign:'right',fillColor:C2.bg}}],
      [{content:`Indirectos (${params.pctIndirectos}%)`,   styles:{halign:'left'}},{content:money(calc.indirectos),  styles:{halign:'right'}}],
      [{content:`Imprevistos (${params.pctImprevistos}%)`, styles:{halign:'left'}},{content:money(calc.imprevistos), styles:{halign:'right'}}],
      [{content:`Utilidad (${params.pctUtilidad}%)`,       styles:{halign:'left'}},{content:money(calc.utilidad),    styles:{halign:'right'}}],
      [{content:`Impuesto (${params.pctImpuesto}%)`,       styles:{halign:'left'}},{content:money(calc.impuesto),    styles:{halign:'right'}}],
      [{content:'PRECIO UNITARIO TOTAL',styles:{fontStyle:'bold',halign:'left',fillColor:C2.ink,textColor:255}},{content:money(calc.precioUnitario),styles:{fontStyle:'bold',halign:'right',fillColor:C2.ink,textColor:255}}],
    ],
    styles:{fontSize:8,cellPadding:1.8,textColor:C2.ink},
    alternateRowStyles:{fillColor:[255,255,255]},
    columnStyles:{0:{cellWidth:59},1:{cellWidth:46}},
    theme:'grid'
  })

  // Footers on all pages
  const total = doc.internal.getNumberOfPages()
  for (let i=1;i<=total;i++) { doc.setPage(i); drawApuFooter(doc,budget,i,total) }
  doc.save(`Ficha_${act.id}.pdf`)
}

export const exportPDFGeneral = (budget, params, empresa = {}) => {
  exportPDFPresupuesto(budget, params)
  const acts=[]; const collect=its=>{for(const it of its){if(it.tipo==='actividad')acts.push(it);else if(it.children)collect(it.children)}}
  collect(budget.items)
  acts.forEach((act,i)=>setTimeout(()=>exportPDFFicha(budget,act,params,empresa),(i+1)*700))
}

// Exports all selected activities as ONE combined PDF (party info only on first page)
export const exportPDFRangoFichas = async (budget, params, ids, empresa = {}) => {
  const acts=[]; const collect=its=>{for(const it of its){if(it.tipo==='actividad'&&ids.includes(it.id))acts.push(it);else if(it.children)collect(it.children)}}
  collect(budget.items)
  if(!acts.length) return alert('No hay actividades seleccionadas.')

  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'letter'})

  for (const [actIdx, act] of acts.entries()) {
    if (actIdx > 0) doc.addPage()
    const calc = calcFicha(act.ficha, budget.catalogos, params)
    let y = await drawApuHeader(doc, budget, empresa, { showPartyInfo: actIdx === 0 })

    doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.setTextColor(0)
    doc.text(`${act.id} — ${act.descripcion}`, 10, y); y+=5
    doc.setFontSize(8.5); doc.setFont(undefined,'normal'); doc.setTextColor(80,80,80)
    doc.text(`Cantidad: ${fmt(act.cantidad)} ${act.unidad}`, 10, y); doc.setTextColor(0); y+=5

    const sectApu = (title, k, total, moTotal = 0) => {
      const rs = (act.ficha[k]||[]).map((c,i)=>{
        const ins = findInsumo(budget.catalogos,k,c.insumoId)
        if (!ins) return null
        const isMoBased = k==='herramientaEquipo' && normalize(ins?.descripcion)==='herramienta menor'
        const effectiveBase = isMoBased ? moTotal : (+ins.costoBase||0)
        return [ins.codigo||String(i+1), ins.descripcion, ins.unidad, fmt(c.rendimiento), fmt(c.desperdicio)+'%', money(effectiveBase), money(conceptoCost(c,budget.catalogos,k,{moTotal}))]
      }).filter(Boolean)
      if (!rs.length) rs.push([{content:'(sin conceptos)',colSpan:7,styles:{halign:'center',fontStyle:'italic',textColor:150}}])
      rs.push([{content:'SUBTOTAL '+title,colSpan:6,styles:{halign:'right',fontStyle:'bold',fillColor:[226,232,240]}},{content:money(total),styles:{halign:'right',fontStyle:'bold',fillColor:[226,232,240]}}])
      doc.autoTable({startY:y,head:[[{content:title,colSpan:7,styles:{fillColor:[30,41,59],textColor:255,halign:'left',fontStyle:'bold'}}],['Cód.','Insumo','Und','Rend.','Desp.','C.Base','Subtotal']],body:rs,styles:{fontSize:7.5,cellPadding:1.1},headStyles:{fillColor:[71,85,105],textColor:255},columnStyles:{0:{cellWidth:18,halign:'center'},2:{cellWidth:14,halign:'center'},3:{cellWidth:16,halign:'right'},4:{cellWidth:14,halign:'right'},5:{cellWidth:22,halign:'right'},6:{cellWidth:24,halign:'right'}},margin:{bottom:14}})
      y = doc.lastAutoTable.finalY + 3
    }
    sectApu('MATERIALES','materiales',calc.totMat)
    sectApu('MANO DE OBRA','manoObra',calc.totMo)
    sectApu('HERRAMIENTA + EQUIPO','herramientaEquipo',calc.totHe,calc.totMo)
    sectApu('SUBCONTRATO','subcontratos',calc.totSub)

    y += 6
    const CR = { ink:[15,17,21], dark:[30,41,59], bg:[248,250,252] }
    const pwR = doc.internal.pageSize.getWidth()
    const tWR = 105
    doc.autoTable({startY:y, tableWidth:tWR, margin:{left:pwR-tWR-10, right:10, bottom:14},
      head:[[{content:'RESUMEN',colSpan:2,styles:{fillColor:CR.dark,textColor:255,fontStyle:'bold',fontSize:8,halign:'left'}}]],
      body:[
        [{content:'Materiales',          styles:{halign:'left'}},{content:money(calc.totMat),         styles:{halign:'right'}}],
        [{content:'Mano de Obra',        styles:{halign:'left'}},{content:money(calc.totMo),          styles:{halign:'right'}}],
        [{content:'Herramientas y Equipo',styles:{halign:'left'}},{content:money(calc.totHe),         styles:{halign:'right'}}],
        [{content:'Subcontratos',        styles:{halign:'left'}},{content:money(calc.totSub),         styles:{halign:'right'}}],
        [{content:'COSTO DIRECTO',       styles:{fontStyle:'bold',halign:'left',fillColor:CR.bg}},{content:money(calc.costoDirecto),styles:{fontStyle:'bold',halign:'right',fillColor:CR.bg}}],
        [{content:`Indirectos (${params.pctIndirectos}%)`,   styles:{halign:'left'}},{content:money(calc.indirectos),  styles:{halign:'right'}}],
        [{content:`Imprevistos (${params.pctImprevistos}%)`, styles:{halign:'left'}},{content:money(calc.imprevistos), styles:{halign:'right'}}],
        [{content:`Utilidad (${params.pctUtilidad}%)`,       styles:{halign:'left'}},{content:money(calc.utilidad),    styles:{halign:'right'}}],
        [{content:`Impuesto (${params.pctImpuesto}%)`,       styles:{halign:'left'}},{content:money(calc.impuesto),    styles:{halign:'right'}}],
        [{content:'PRECIO UNITARIO TOTAL',styles:{fontStyle:'bold',halign:'left',fillColor:CR.ink,textColor:255}},{content:money(calc.precioUnitario),styles:{fontStyle:'bold',halign:'right',fillColor:CR.ink,textColor:255}}],
      ],
      styles:{fontSize:8,cellPadding:1.8,textColor:CR.ink},
      alternateRowStyles:{fillColor:[255,255,255]},
      columnStyles:{0:{cellWidth:59},1:{cellWidth:46}},
      theme:'grid'
    })
  }

  // Footers on every page
  const totalPages = doc.internal.getNumberOfPages()
  for (let i=1;i<=totalPages;i++) { doc.setPage(i); drawApuFooter(doc,budget,i,totalPages) }
  doc.save((budget.nombreProyecto||'Fichas').replace(/[^\w]+/g,'_')+'_APU.pdf')
}

export async function exportExcelPresupuesto(budget, params) {
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Presupuesto')
  ws.columns=[{width:10},{width:50},{width:10},{width:12},{width:16},{width:18}]
  let row=writeHeader(ws,budget)
  ;['ID','Descripción','Unidad','Cantidad','P. Unitario','Subtotal'].forEach((h,i)=>setC(ws,String.fromCharCode(65+i)+row,h,{fill:X.headerFill,font:X.headerFont,alignment:X.ac}))
  ws.getRow(row).height=22; row++
  const walk=(its,d=0)=>{
    for(const it of its){
      const c=calcItem(it,budget.catalogos,params); const ind='   '.repeat(d)
      if(it.tipo==='capitulo'){
        setC(ws,'A'+row,it.id,{fill:X.capFill,font:X.capFont,alignment:X.ac})
        setC(ws,'B'+row,ind+it.descripcion,{fill:X.capFill,font:X.capFont,alignment:X.al})
        ;['C','D','E'].forEach(cc=>setC(ws,cc+row,'',{fill:X.capFill}))
        setC(ws,'F'+row,c.subtotal,{fill:X.capFill,font:X.capFont,alignment:X.ar,numFmt:MFMT})
        row++; if(it.children)walk(it.children,d+1)
        ;['A','B','C','D','E','F'].forEach(cc=>setC(ws,cc+row,cc==='B'?`${ind}SUBTOTAL Cap. ${it.id}`:cc==='F'?c.subtotal:'',{fill:X.subtotalFill,font:{italic:true,bold:true},alignment:cc==='F'?X.ar:X.al,numFmt:cc==='F'?MFMT:undefined}))
        row++
      } else if(it.tipo==='subcapitulo'){
        setC(ws,'A'+row,it.id,{fill:X.subcapFill,font:X.subcapFont,alignment:X.ac})
        setC(ws,'B'+row,ind+it.descripcion,{fill:X.subcapFill,font:X.subcapFont,alignment:X.al})
        ;['C','D','E'].forEach(cc=>setC(ws,cc+row,'',{fill:X.subcapFill}))
        setC(ws,'F'+row,c.subtotal,{fill:X.subcapFill,font:X.subcapFont,alignment:X.ar,numFmt:MFMT})
        row++; if(it.children)walk(it.children,d+1)
      } else {
        setC(ws,'A'+row,it.id,{alignment:X.ac}); setC(ws,'B'+row,ind+it.descripcion,{alignment:X.al})
        setC(ws,'C'+row,it.unidad,{alignment:X.ac}); setC(ws,'D'+row,round2(it.cantidad),{alignment:X.ar,numFmt:NFMT})
        setC(ws,'E'+row,c.precioUnitario,{alignment:X.ar,numFmt:MFMT}); setC(ws,'F'+row,c.subtotal,{alignment:X.ar,numFmt:MFMT,font:{bold:true}})
        row++
      }
    }
  }
  walk(budget.items,0)
  const tot=round2(budget.items.reduce((s,it)=>s+calcItem(it,budget.catalogos,params).subtotal,0))
  row++; ws.mergeCells(`A${row}:E${row}`)
  setC(ws,'A'+row,'TOTAL GENERAL',{fill:X.totalFill,font:X.totalFont,alignment:X.ar})
  setC(ws,'F'+row,tot,{fill:X.totalFill,font:X.totalFont,alignment:X.ar,numFmt:MFMT})
  ws.getRow(row).height=26
  const buf=await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]),(budget.nombreProyecto||'Pres').replace(/[^\w]+/g,'_')+'_Presupuesto.xlsx')
}

export async function exportExcelCatalogo(budget, catKey) {
  const cat=CATEGORIAS.find(c=>c.key===catKey)
  // Calcula la cantidad total consumida por un insumo: Σ (actividad.cantidad × rendimiento)
  const cantTotalOf = id => {
    let t = 0
    const walk = its => { for (const it of its) { if (it.tipo === 'actividad') { for (const x of (it.ficha?.[catKey]||[])) if (x.insumoId === id) t += (+it.cantidad||0) * (+x.rendimiento||0) } else if (it.children) walk(it.children) } }
    walk(budget.items || [])
    return round2(t)
  }
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet(cat.label)
  ws.columns=[{width:14},{width:45},{width:12},{width:18},{width:18},{width:22}]
  ws.mergeCells('A1:F1')
  setC(ws,'A1',`LISTA DE ${cat.label.toUpperCase()} — ${budget.nombreProyecto}`,{fill:X.titleFill,font:X.titleFont,alignment:X.ac})
  ws.getRow(1).height=26
  ;['Código','Descripción','Unidad','Cant. Total','Precio Base','Costo Total'].forEach((h,i)=>setC(ws,String.fromCharCode(65+i)+'3',h,{fill:X.headerFill,font:X.headerFont,alignment:X.ac}))
  ws.getRow(3).height=22
  ;(budget.catalogos[catKey]||[]).forEach((ins,idx)=>{
    const r=4+idx
    const cant=cantTotalOf(ins.id)
    const costoTotal=round2(cant*(+ins.costoBase||0))
    setC(ws,'A'+r,ins.codigo||'',{alignment:X.ac,font:{name:'Consolas',size:10}})
    setC(ws,'B'+r,ins.descripcion,{alignment:X.al}); setC(ws,'C'+r,ins.unidad,{alignment:X.ac})
    setC(ws,'D'+r,cant,{alignment:X.ar,numFmt:NFMT})
    setC(ws,'E'+r,round2(ins.costoBase),{alignment:X.ar,numFmt:MFMT})
    setC(ws,'F'+r,costoTotal,{alignment:X.ar,numFmt:MFMT,font:{bold:true}})
  })
  // Total row
  const total=round2((budget.catalogos[catKey]||[]).reduce((s,ins)=>s+round2(cantTotalOf(ins.id)*(+ins.costoBase||0)),0))
  const tot=4+(budget.catalogos[catKey]||[]).length+1
  ws.mergeCells(`A${tot}:E${tot}`)
  setC(ws,'A'+tot,'TOTAL',{fill:X.totalFill,font:X.totalFont,alignment:X.ar})
  setC(ws,'F'+tot,total,{fill:X.totalFill,font:X.totalFont,alignment:X.ar,numFmt:MFMT})
  ws.getRow(tot).height=24
  const buf=await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]),(budget.nombreProyecto||'Cat').replace(/[^\w]+/g,'_')+'_'+cat.label.replace(/\s+/g,'_')+'.xlsx')
}

export async function exportExcelFicha(budget, act, params) {
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Ficha')
  ws.columns=[{width:6},{width:38},{width:14},{width:12},{width:12},{width:12},{width:18}]
  ws.mergeCells('A1:G1')
  setC(ws,'A1','FICHA DE COSTO UNITARIO',{fill:X.titleFill,font:X.titleFont,alignment:X.ac}); ws.getRow(1).height=26
  ws.mergeCells('A2:G2')
  setC(ws,'A2',`${act.id} — ${act.descripcion}`,{font:{bold:true,size:12},alignment:X.ac})
  setC(ws,'A3','Cantidad:',{font:{bold:true}}); setC(ws,'B3',`${fmt(act.cantidad)} ${act.unidad}`)
  setC(ws,'D3','Proyecto:',{font:{bold:true}}); setC(ws,'E3',budget.nombreProyecto||'')
  const calc=calcFicha(act.ficha,budget.catalogos,params)
  let row=5
  const sect=(title,k,total)=>{
    ws.mergeCells(`A${row}:G${row}`)
    setC(ws,'A'+row,title,{fill:X.headerFill,font:X.headerFont,alignment:{vertical:'middle',horizontal:'left'}}); row++
    ;['#','Insumo','Código','Unidad','Rend.','Desp.%','Subtotal'].forEach((h,i)=>setC(ws,String.fromCharCode(65+i)+row,h,{fill:X.headerFill,font:X.headerFont,alignment:X.ac})); row++
    ;(act.ficha[k]||[]).forEach((c,i)=>{
      const ins=findInsumo(budget.catalogos,k,c.insumoId); if(!ins)return
      setC(ws,'A'+row,i+1,{alignment:X.ac}); setC(ws,'B'+row,ins.descripcion,{alignment:X.al})
      setC(ws,'C'+row,ins.codigo,{alignment:X.ac,font:{name:'Consolas',size:10}}); setC(ws,'D'+row,ins.unidad,{alignment:X.ac})
      setC(ws,'E'+row,round2(c.rendimiento),{alignment:X.ar,numFmt:NFMT}); setC(ws,'F'+row,round2(c.desperdicio),{alignment:X.ar,numFmt:'0.00"%"'})
      setC(ws,'G'+row,conceptoCost(c,budget.catalogos,k),{alignment:X.ar,numFmt:MFMT,font:{bold:true}}); row++
    })
    ws.mergeCells(`A${row}:F${row}`)
    setC(ws,'A'+row,'SUBTOTAL '+title,{fill:X.subtotalFill,font:{bold:true},alignment:X.ar})
    setC(ws,'G'+row,total,{fill:X.subtotalFill,font:{bold:true},alignment:X.ar,numFmt:MFMT}); row+=2
  }
  sect('MATERIALES','materiales',calc.totMat)
  sect('MANO DE OBRA','manoObra',calc.totMo)
  sect('HERRAMIENTA + EQUIPO','herramientaEquipo',calc.totHe)
  sect('SUBCONTRATO','subcontratos',calc.totSub)
  ;[['Costo Directo',calc.costoDirecto],[`Indirectos (${params.pctIndirectos}%)`,calc.indirectos],[`Imprevistos (${params.pctImprevistos}%)`,calc.imprevistos],[`Utilidad (${params.pctUtilidad}%)`,calc.utilidad],['Subtotal antes de impuestos',calc.subtotalSinImpuesto],[`Impuesto (${params.pctImpuesto}%)`,calc.impuesto]].forEach(([l,v])=>{
    ws.mergeCells(`A${row}:F${row}`); setC(ws,'A'+row,l,{alignment:X.ar,font:{bold:true}}); setC(ws,'G'+row,v,{alignment:X.ar,numFmt:MFMT}); row++
  })
  ws.mergeCells(`A${row}:F${row}`)
  setC(ws,'A'+row,'PRECIO UNITARIO TOTAL',{fill:X.totalFill,font:X.totalFont,alignment:X.ar})
  setC(ws,'G'+row,calc.precioUnitario,{fill:X.totalFill,font:X.totalFont,alignment:X.ar,numFmt:MFMT}); ws.getRow(row).height=26
  const buf=await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]),`Ficha_${act.id}.xlsx`)
}

// Todas las fichas seleccionadas en UN solo workbook, una hoja por actividad
export async function exportExcelRangoFichas(budget, params, ids) {
  const acts=[]; const collect=its=>{for(const it of its){if(it.tipo==='actividad'&&ids.includes(it.id))acts.push(it);else if(it.children)collect(it.children)}}
  collect(budget.items)
  if(!acts.length) return alert('No hay actividades seleccionadas.')

  const wb=new ExcelJS.Workbook()

  for(const act of acts){
    const sheetName=`${act.id} ${act.descripcion}`.slice(0,31).replace(/[\\\/\*\?\:\[\]]/g,'_')
    const ws=wb.addWorksheet(sheetName)
    ws.columns=[{width:6},{width:38},{width:14},{width:12},{width:12},{width:12},{width:18}]
    ws.mergeCells('A1:G1')
    setC(ws,'A1','FICHA DE COSTO UNITARIO',{fill:X.titleFill,font:X.titleFont,alignment:X.ac}); ws.getRow(1).height=26
    ws.mergeCells('A2:G2')
    setC(ws,'A2',`${act.id} — ${act.descripcion}`,{font:{bold:true,size:12},alignment:X.ac})
    setC(ws,'A3','Cantidad:',{font:{bold:true}}); setC(ws,'B3',`${fmt(act.cantidad)} ${act.unidad}`)
    setC(ws,'D3','Proyecto:',{font:{bold:true}}); setC(ws,'E3',budget.nombreProyecto||'')
    const calc=calcFicha(act.ficha,budget.catalogos,params)
    let row=5
    const sect=(title,k,total,moTotal=0)=>{
      ws.mergeCells(`A${row}:G${row}`)
      setC(ws,'A'+row,title,{fill:X.headerFill,font:X.headerFont,alignment:{vertical:'middle',horizontal:'left'}}); row++
      ;['#','Insumo','Código','Unidad','Rend.','Desp.%','Subtotal'].forEach((h,i)=>setC(ws,String.fromCharCode(65+i)+row,h,{fill:X.headerFill,font:X.headerFont,alignment:X.ac})); row++
      ;(act.ficha[k]||[]).forEach((c,i)=>{
        const ins=findInsumo(budget.catalogos,k,c.insumoId); if(!ins)return
        setC(ws,'A'+row,i+1,{alignment:X.ac}); setC(ws,'B'+row,ins.descripcion,{alignment:X.al})
        setC(ws,'C'+row,ins.codigo||'',{alignment:X.ac,font:{name:'Consolas',size:10}}); setC(ws,'D'+row,ins.unidad,{alignment:X.ac})
        setC(ws,'E'+row,round2(c.rendimiento),{alignment:X.ar,numFmt:NFMT}); setC(ws,'F'+row,round2(c.desperdicio),{alignment:X.ar,numFmt:'0.00"%"'})
        setC(ws,'G'+row,conceptoCost(c,budget.catalogos,k,{moTotal}),{alignment:X.ar,numFmt:MFMT,font:{bold:true}}); row++
      })
      ws.mergeCells(`A${row}:F${row}`)
      setC(ws,'A'+row,'SUBTOTAL '+title,{fill:X.subtotalFill,font:{bold:true},alignment:X.ar})
      setC(ws,'G'+row,total,{fill:X.subtotalFill,font:{bold:true},alignment:X.ar,numFmt:MFMT}); row+=2
    }
    sect('MATERIALES','materiales',calc.totMat)
    sect('MANO DE OBRA','manoObra',calc.totMo)
    sect('HERRAMIENTA + EQUIPO','herramientaEquipo',calc.totHe,calc.totMo)
    sect('SUBCONTRATO','subcontratos',calc.totSub)
    ;[['Costo Directo',calc.costoDirecto],[`Indirectos (${params.pctIndirectos}%)`,calc.indirectos],[`Imprevistos (${params.pctImprevistos}%)`,calc.imprevistos],[`Utilidad (${params.pctUtilidad}%)`,calc.utilidad],['Subtotal antes de impuestos',calc.subtotalSinImpuesto],[`Impuesto (${params.pctImpuesto}%)`,calc.impuesto]].forEach(([l,v])=>{
      ws.mergeCells(`A${row}:F${row}`); setC(ws,'A'+row,l,{alignment:X.ar,font:{bold:true}}); setC(ws,'G'+row,v,{alignment:X.ar,numFmt:MFMT}); row++
    })
    ws.mergeCells(`A${row}:F${row}`)
    setC(ws,'A'+row,'PRECIO UNITARIO TOTAL',{fill:X.totalFill,font:X.totalFont,alignment:X.ar})
    setC(ws,'G'+row,calc.precioUnitario,{fill:X.totalFill,font:X.totalFont,alignment:X.ar,numFmt:MFMT}); ws.getRow(row).height=26
  }

  const buf=await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]),(budget.nombreProyecto||'Fichas').replace(/[^\w]+/g,'_')+'_APU.xlsx')
}

export async function exportExcelGeneral(budget, params) {
  await exportExcelPresupuesto(budget, params)
  const acts=[]; const collect=its=>{for(const it of its){if(it.tipo==='actividad')acts.push(it);else if(it.children)collect(it.children)}}
  collect(budget.items)
  if(acts.length) await exportExcelRangoFichas(budget,params,acts.map(a=>a.id))
}

export async function exportPlantilla(tipo) {
  const cfgs={
    presupuesto:{title:'PLANTILLA PRESUPUESTO',headers:['ID','Descripción','Unidad','Cantidad','P. Unitario','Subtotal'],sample:[['1','Cimentaciones','','','',''],['1.1','Cimentaciones Superficiales','','','',''],['1.1.01','Excavación a mano','m³',100,0,0]],notas:'Usá IDs jerárquicos: 1, 1.1, 1.1.01'},
    materiales:{title:'PLANTILLA MATERIALES',headers:['Código','Descripción','Unidad','Precio Base','Proveedor','Notas'],sample:[['MAT-001','Cemento gris','saco',7.50,'Cemex',''],['MAT-002','Arena fina','m³',18.00,'Local','']],notas:'El sistema impedirá duplicados por descripción.'},
    manoObra:{title:'PLANTILLA MANO DE OBRA',headers:['Código','Descripción','Unidad','Precio Base','Proveedor','Notas'],sample:[['MO-001','Peón','jornada',15,'',''],['MO-002','Albañil','jornada',25,'','']],notas:'Unidades: jornada, hora.'},
    herramientaEquipo:{title:'PLANTILLA HERRAMIENTAS/EQUIPO',headers:['Código','Descripción','Unidad','Precio Base','Proveedor','Notas'],sample:[['HE-001','Mezcladora','día',35,'',''],['HE-002','Vibrador','hora',5,'','']],notas:'Herramienta menor, equipo, maquinaria.'},
    subcontratos:{title:'PLANTILLA SUBCONTRATOS',headers:['Código','Descripción','Unidad','Precio Base','Proveedor','Notas'],sample:[['SC-001','Instalación eléctrica','GBL',5500,'Electro S.A.','']],notas:'Servicios contratados a terceros.'},
  }
  const c=cfgs[tipo]; if(!c) return
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Plantilla')
  ws.columns=c.headers.map((_,i)=>({width:tipo==='presupuesto'&&i===1?50:18}))
  const last=String.fromCharCode(64+c.headers.length)
  ws.mergeCells(`A1:${last}1`); setC(ws,'A1',c.title,{fill:X.titleFill,font:X.titleFont,alignment:X.ac}); ws.getRow(1).height=28
  ws.mergeCells(`A2:${last}2`); setC(ws,'A2',c.notas,{font:{italic:true,color:{argb:'FF64748B'}},alignment:X.ac})
  c.headers.forEach((h,i)=>setC(ws,String.fromCharCode(65+i)+'4',h,{fill:X.headerFill,font:X.headerFont,alignment:X.ac})); ws.getRow(4).height=22
  c.sample.forEach((r,ri)=>r.forEach((v,ci)=>{
    const isM=(tipo==='presupuesto'&&(ci===4||ci===5))||(tipo!=='presupuesto'&&ci===3); const isN=tipo==='presupuesto'&&ci===3
    setC(ws,String.fromCharCode(65+ci)+(5+ri),v,{alignment:typeof v==='number'?X.ar:X.al,numFmt:isM?MFMT:isN?NFMT:undefined,font:isM?{bold:true}:undefined})
  }))
  const buf=await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]),`Plantilla_${tipo}.xlsx`)
}

// ============ PLANTILLA FICHAS APU ============
export async function exportPlantillaFicha() {
  const wb = new ExcelJS.Workbook()

  // ── Hoja de datos ──────────────────────────────────────────────
  const ws = wb.addWorksheet('Fichas APU')
  ws.columns = [{width:14},{width:46},{width:12},{width:12},{width:22},{width:14},{width:40},{width:14},{width:14},{width:16}]

  ws.mergeCells('A1:J1')
  setC(ws,'A1','PLANTILLA DE FICHAS APU (COSTOS UNITARIOS)',{fill:X.titleFill,font:X.titleFont,alignment:X.ac}); ws.getRow(1).height=28
  ws.mergeCells('A2:J2')
  setC(ws,'A2','Cada fila = un concepto (insumo) dentro de la ficha. Repita las columnas A-D iguales para todos los conceptos de la misma actividad.',{font:{italic:true,color:{argb:'FF64748B'}},alignment:X.ac})

  const hdrs = ['ID Actividad','Descripción Actividad','Unidad Act.','Cantidad','Categoría','Cód. Insumo','Descripción Insumo','Unidad Insumo','Rendimiento','Desperdicio %']
  hdrs.forEach((h,i)=>setC(ws,String.fromCharCode(65+i)+'4',h,{fill:X.headerFill,font:X.headerFont,alignment:X.ac}))
  ws.getRow(4).height=22

  const fill1 = {type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF2FF'}}
  const fill2 = {type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF7ED'}}
  const sample = [
    ['1.01','FUNDICIÓN ZAPATA AISLADA Z-1 1.20x1.20 e=35cm','m³',8,'materiales','MAT-011','CONCRETO 210 kg/cm2','m³',1,5],
    ['1.01','FUNDICIÓN ZAPATA AISLADA Z-1 1.20x1.20 e=35cm','m³',8,'materiales','MAT-015','VARILLA ACERO CORRUGADA 3/8"','LANCE',8,5],
    ['1.01','FUNDICIÓN ZAPATA AISLADA Z-1 1.20x1.20 e=35cm','m³',8,'materiales','MAT-021','ALAMBRE DE AMARRE','LB',1.5,0],
    ['1.01','FUNDICIÓN ZAPATA AISLADA Z-1 1.20x1.20 e=35cm','m³',8,'manoObra','MO-002','ALBAÑIL','JRD',0.25,0],
    ['1.01','FUNDICIÓN ZAPATA AISLADA Z-1 1.20x1.20 e=35cm','m³',8,'manoObra','MO-001','PEÓN','JRD',0.5,0],
    ['1.01','FUNDICIÓN ZAPATA AISLADA Z-1 1.20x1.20 e=35cm','m³',8,'herramientaEquipo','HE-001','HERRAMIENTA MENOR','% (MO)',0.05,0],
    ['1.02','RELLENO Y COMPACTACIÓN CON MATERIAL SELECTO','m³',120,'manoObra','MO-001','PEÓN','JRD',0.18,0],
    ['1.02','RELLENO Y COMPACTACIÓN CON MATERIAL SELECTO','m³',120,'herramientaEquipo','HE-003','COMPACTADORA VIBRATORIA','HRA',0.5,0],
    ['1.02','RELLENO Y COMPACTACIÓN CON MATERIAL SELECTO','m³',120,'subcontratos','SC-001','ALQUILER COMPACTADOR','DÍA',0.05,0],
  ]
  sample.forEach((r,ri)=>{
    const row = 5+ri; const fill = r[0]==='1.01' ? fill1 : fill2
    r.forEach((v,ci)=>{
      setC(ws,String.fromCharCode(65+ci)+row,v,{fill,alignment:ci===0?X.ac:(typeof v==='number'?X.ar:X.al),
        font:ci===0?{bold:true,name:'Consolas',size:10}:undefined,
        numFmt:(ci>=8)?NFMT:(ci===3)?NFMT:undefined})
    })
  })

  // ── Hoja de instrucciones ──────────────────────────────────────
  const wi = wb.addWorksheet('Instrucciones')
  wi.columns = [{width:28},{width:66}]
  const inst = [
    ['INSTRUCCIONES',''],['',''],
    ['Columna','Descripción'],
    ['ID Actividad','ID de la actividad en el presupuesto (ej: 1.01, 1.1.02)'],
    ['Descripción Actividad','Nombre completo de la actividad'],
    ['Unidad Act.','Unidad de la actividad (m³, ml, m², und, etc.)'],
    ['Cantidad','Cantidad de la actividad en el presupuesto'],
    ['Categoría','materiales | manoObra | herramientaEquipo | subcontratos'],
    ['Cód. Insumo','Código del insumo (se busca primero por código, luego por descripción)'],
    ['Descripción Insumo','Nombre del insumo. Si no existe se crea automáticamente con precio $0.00'],
    ['Unidad Insumo','Unidad del insumo (m³, kg, JRD, und, % (MO), etc.)'],
    ['Rendimiento','Cantidad de insumo por unidad de actividad (número decimal)'],
    ['Desperdicio %','Porcentaje de desperdicio: 5 = 5%. Usar 0 si no aplica.'],
    ['',''],
    ['NOTAS',''],
    ['','Repita las columnas A-D en cada fila de la misma actividad.'],
    ['','Herramienta Menor: Categoría=herramientaEquipo, Unidad=% (MO), Rendimiento=0.05 para 5%.'],
    ['','El ID de la actividad debe existir en el presupuesto activo para que se importe.'],
    ['','Si crea nuevos insumos, actualice su precio en el Catálogo después de importar.'],
  ]
  inst.forEach((r,ri)=>{
    const isTitle = r[0]==='INSTRUCCIONES'||r[0]==='Columna'||r[0]==='NOTAS'
    ;['A','B'].forEach((col,ci)=>setC(wi,col+(ri+1),r[ci],{fill:isTitle?X.headerFill:undefined,font:isTitle?X.headerFont:{name:'Calibri',size:11},border:undefined,alignment:X.al}))
  })

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]),'Plantilla_Fichas_APU.xlsx')
}

// ============ IMPORTAR FICHAS APU ============
export async function importExcelFichas(file, budget, setBudget) {
  if (!budget) return alert('No hay proyecto activo. Abre un proyecto antes de importar.')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:''})

  // Buscar fila de encabezado
  let h = rows.findIndex(r=>r.some(c=>/activ|categor/i.test(String(c))))
  if (h<0) h = rows.findIndex(r=>r.some(c=>/^\s*id\s*$/i.test(String(c))))
  if (h<0) h = 3

  const dataRows = []
  for (let i=h+1;i<rows.length;i++){
    const r=rows[i]; const actId=String(r[0]||'').trim(); if(!actId) continue
    dataRows.push({ actId, catRaw:String(r[4]||'').trim().toLowerCase(),
      insCod:String(r[5]||'').trim(), insDesc:String(r[6]||'').trim(),
      insUnid:String(r[7]||'und').trim(), rend:parseFloat(r[8])||0, desp:parseFloat(r[9])||0 })
  }
  if (!dataRows.length) return alert('No se encontraron filas válidas. Verifica que usas la plantilla correcta.')

  const resolveKat = raw => {
    if (/mat/i.test(raw)) return 'materiales'
    if (/mano|obra|\bmo\b/i.test(raw)) return 'manoObra'
    if (/herr|equip|\bhe\b/i.test(raw)) return 'herramientaEquipo'
    if (/sub/i.test(raw)) return 'subcontratos'
    return null
  }

  const grouped = {}
  dataRows.forEach(r=>{ if(!grouped[r.actId]) grouped[r.actId]=[]; grouped[r.actId].push(r) })
  const actIds = Object.keys(grouped)
  if (!confirm(`Se encontraron ${actIds.length} actividad(es): ${actIds.join(', ')}.\n¿Importar y reemplazar sus fichas actuales?`)) return

  const newCat = {
    materiales:        [...(budget.catalogos?.materiales||[])],
    manoObra:          [...(budget.catalogos?.manoObra||[])],
    herramientaEquipo: [...(budget.catalogos?.herramientaEquipo||[])],
    subcontratos:      [...(budget.catalogos?.subcontratos||[])],
  }
  const findOrCreate = (k,cod,desc,unid) => {
    const list=newCat[k]
    if (cod){ const byCod=list.find(i=>i.codigo&&normalize(i.codigo)===normalize(cod)); if(byCod) return byCod.id }
    if (desc){ const byDesc=list.find(i=>normalize(i.descripcion)===normalize(desc)); if(byDesc) return byDesc.id }
    if (!desc) return null
    const ni={id:uid(),codigo:cod||'',descripcion:desc,unidad:unid||'und',costoBase:0,proveedor:'',notas:''}
    list.push(ni); return ni.id
  }

  const cloneItems = its => its.map(it=>({...it,
    ficha:it.ficha?{materiales:[...it.ficha.materiales],manoObra:[...it.ficha.manoObra],herramientaEquipo:[...it.ficha.herramientaEquipo],subcontratos:[...it.ficha.subcontratos]}:undefined,
    children:it.children?cloneItems(it.children):undefined,
  }))
  const findAct = (its,id)=>{ for(const it of its){ if(it.id===id) return it; if(it.children){const f=findAct(it.children,id);if(f)return f} } return null }

  const newItems = cloneItems(budget.items)
  let imported=0, notFound=[]

  for (const [actId,rws] of Object.entries(grouped)){
    const act=findAct(newItems,actId)
    if (!act){ notFound.push(actId); continue }
    const nf={materiales:[],manoObra:[],herramientaEquipo:[],subcontratos:[]}
    for (const r of rws){
      const k=resolveKat(r.catRaw); if(!k) continue
      const insId=findOrCreate(k,r.insCod,r.insDesc,r.insUnid); if(!insId) continue
      nf[k].push({id:uid(),insumoId:insId,rendimiento:r.rend,desperdicio:r.desp})
    }
    act.ficha=nf; imported++
  }

  setBudget({...budget,catalogos:newCat,items:newItems})
  let msg=`Importación completada: ${imported} ficha(s) actualizada(s).`
  if (notFound.length) msg+=`\nActividades no encontradas (verifique el ID): ${notFound.join(', ')}.`
  alert(msg)
}

export async function importExcelPresupuesto(file, budget, setBudget) {
  const buf=await file.arrayBuffer(); const wb=XLSX.read(buf)
  const ws=wb.Sheets[wb.SheetNames[0]]
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''})
  let h=rows.findIndex(r=>r.some(c=>/^\s*id\s*$/i.test(String(c)))); if(h<0)h=0
  const newItems=[]
  for(let i=h+1;i<rows.length;i++){
    const r=rows[i]; const id=String(r[0]||'').trim(); const desc=String(r[1]||'').trim()
    if(!id||/^subtotal|^total/i.test(desc)) continue
    const parts=id.split('.')
    if(parts.length===1) newItems.push({id,tipo:'capitulo',descripcion:desc,children:[]})
    else if(parts.length===2){ const cap=newItems.find(x=>x.id===parts[0]); const it={id,tipo:'subcapitulo',descripcion:desc,children:[]}; (cap?cap.children:newItems).push(it) }
    else { const cap=newItems.find(x=>x.id===parts[0]); const sub=cap?.children?.find(x=>x.id===parts.slice(0,2).join('.')); const precioManual=parseFloat(String(r[4]||'').replace(/[^0-9.-]/g,''))||0; const it={id,tipo:'actividad',descripcion:desc,unidad:String(r[2]||'und').trim(),cantidad:parseFloat(r[3])||0,...(precioManual>0?{precioManual}:{}),ficha:{materiales:[],manoObra:[],herramientaEquipo:[],subcontratos:[]}}; ((sub||cap)?(sub||cap).children:newItems).push(it) }
  }
  if(!newItems.length) return alert('No se detectaron filas válidas.')
  if(!confirm(`Se detectaron ${newItems.length} capítulo(s). ¿Reemplazar el presupuesto?`)) return
  setBudget({...budget,items:newItems})
}

export async function importExcelCatalogo(file, budget, setBudget, catKey) {
  const cat=CATEGORIAS.find(c=>c.key===catKey)
  const buf=await file.arrayBuffer(); const wb=XLSX.read(buf)
  const ws=wb.Sheets[wb.SheetNames[0]]
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''})
  let h=rows.findIndex(r=>r.some(c=>/c[oó]digo/i.test(String(c)))&&r.some(c=>/descripci[oó]n/i.test(String(c)))); if(h<0)h=0
  const list=[...(budget.catalogos[catKey]||[])]; let ag=0,du=0
  for(let i=h+1;i<rows.length;i++){
    const r=rows[i]; const desc=String(r[1]||'').trim(); if(!desc) continue
    const n=normalize(desc)
    if(list.find(x=>normalize(x.descripcion)===n)){du++;continue}
    list.push({id:uid(),codigo:String(r[0]||'').trim(),descripcion:desc,unidad:String(r[2]||'und').trim(),costoBase:parseFloat(r[3])||0,proveedor:String(r[4]||'').trim(),notas:String(r[5]||'').trim()}); ag++
  }
  if(!ag&&!du) return alert('No se detectaron filas válidas.')
  if(!confirm(`Se agregarán ${ag} ${cat.label.toLowerCase()} (${du} duplicados omitidos). ¿Continuar?`)) return
  setBudget({...budget,catalogos:{...budget.catalogos,[catKey]:list}})
  alert(`Importación completada: ${ag} agregados, ${du} omitidos.`)
}

// ============ RESUMEN EJECUTIVO PDF ============
export const exportPDFResumenEjecutivo = async (budget, params) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const ML = 14   // margen lateral uniforme
  const CW = w - ML * 2   // ancho de contenido

  // ── Paleta monocromática ──────────────────────────────────────
  const C = {
    ink:   [15,  17,  21],
    dark:  [30,  41,  59],
    mid:   [71,  85, 105],
    muted: [148,163,184],
    rule:  [203,213,225],
    bg:    [248,250,252],
    white: [255,255,255],
  }

  // ── Calcular totales ──────────────────────────────────────────
  const directReal  = round2(budget.items.reduce((s, it) => s + calcItem(it, budget.catalogos, params).subtotal, 0))
  const indirectos  = round2(directReal * (params.pctIndirectos / 100))
  const imprevistos = round2((directReal + indirectos) * (params.pctImprevistos / 100))
  const subtotal    = round2(directReal + indirectos + imprevistos)
  const utilidad    = round2(subtotal * (params.pctUtilidad / 100))
  const subtotalU   = round2(subtotal + utilidad)
  const impuesto    = round2(subtotalU * (params.pctImpuesto / 100))
  const total       = round2(subtotalU + impuesto)

  // ── Header (barra oscura) ─────────────────────────────────────
  const hdrH = 56
  doc.setFillColor(...C.ink); doc.rect(0, 0, w, hdrH, 'F')

  // Logos con aspect-ratio correcto (contain-fit 28×28)
  await addImageContain(doc, budget.logoOfertante, ML, 6, 28, 28)
  await addImageContain(doc, budget.logoCliente,   w - ML - 28, 6, 28, 28)

  // Título y proyecto
  doc.setTextColor(...C.muted); doc.setFontSize(7); doc.setFont(undefined, 'bold')
  doc.text('RESUMEN EJECUTIVO DE PRESUPUESTO', w / 2, 11, { align: 'center' })
  doc.setTextColor(...C.white); doc.setFontSize(17); doc.setFont(undefined, 'bold')
  doc.text(budget.nombreProyecto || 'Sin nombre', w / 2, 23, { align: 'center' })
  doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.muted)
  doc.text(budget.lugar || '', w / 2, 30, { align: 'center' })

  const meta = [`Rev. ${budget.revision || 1}`, budget.estado || 'Borrador', budget.moneda || 'USD', budget.tipo || ''].filter(Boolean).join('  ·  ')
  doc.setFontSize(7.5); doc.setTextColor(...C.muted)
  doc.text(meta, w / 2, 36, { align: 'center' })

  doc.setDrawColor(...C.mid); doc.setLineWidth(0.3); doc.line(ML, 40, w - ML, 40)

  doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.muted)
  const infoL = [['Cotizante:', budget.cotizante||'—'],['Ofertante:', budget.ofertante||'—'],['Realizado:', budget.realizadoPor||'—']]
  const infoR = [['Cliente:', budget.cliente||'—'],['Fecha:', budget.fecha||'—'],['Tipo:', budget.tipo||'—']]
  infoL.forEach(([lbl,val],i)=>{ doc.setFont(undefined,'bold'); doc.text(lbl,ML,44+i*4); doc.setFont(undefined,'normal'); doc.text(val,ML+22,44+i*4) })
  infoR.forEach(([lbl,val],i)=>{ doc.setFont(undefined,'bold'); doc.text(lbl,w/2+2,44+i*4); doc.setFont(undefined,'normal'); doc.text(val,w/2+20,44+i*4) })
  doc.setTextColor(0)

  // ── KPI strip ────────────────────────────────────────────────
  let y = hdrH + 7
  const kpis = [
    { label: 'COSTO DIRECTO',      value: money(directReal)             },
    { label: 'INDIRECTOS + IMPR.', value: money(indirectos+imprevistos) },
    { label: 'UTILIDAD',           value: money(utilidad)               },
    { label: 'TOTAL GENERAL',      value: money(total)                  },
  ]
  const gap = 3
  const bw  = (CW - gap * 3) / 4
  const bh  = 24
  kpis.forEach((b, i) => {
    const bx = ML + i * (bw + gap)
    doc.setFillColor(...C.dark); doc.roundedRect(bx, y, bw, bh, 1.5, 1.5, 'F')
    doc.setTextColor(...C.muted); doc.setFontSize(7.5); doc.setFont(undefined, 'bold')
    doc.text(b.label, bx + bw / 2, y + 7.5, { align: 'center' })
    doc.setTextColor(...C.white); doc.setFontSize(12); doc.setFont(undefined, 'bold')
    doc.text(b.value, bx + bw / 2, y + 18, { align: 'center' })
  })
  y += bh + 7

  // ── Tabla financiera — columnas suman exactamente CW ─────────
  // Col 0: CW - 22 - 40 = variable | Col 1: 22 | Col 2: 40
  const col1W = 22, col2W = 40, col0W = CW - col1W - col2W
  doc.autoTable({
    startY: y,
    margin: { left: ML, right: ML },
    head: [[
      { content: 'Concepto',                        styles: { halign: 'left'   } },
      { content: '%',                               styles: { halign: 'center' } },
      { content: `Monto (${budget.moneda || 'USD'})`, styles: { halign: 'right'  } },
    ]],
    body: [
      ['Costo Directo',               { content:'—',                        styles:{halign:'center'} }, { content:money(directReal),  styles:{halign:'right'} }],
      ['Indirectos',                  { content:`${params.pctIndirectos}%`, styles:{halign:'center'} }, { content:money(indirectos),  styles:{halign:'right'} }],
      ['Imprevistos',                 { content:`${params.pctImprevistos}%`,styles:{halign:'center'} }, { content:money(imprevistos), styles:{halign:'right'} }],
      ['Subtotal',                    { content:'—',                        styles:{halign:'center'} }, { content:money(subtotal),    styles:{halign:'right'} }],
      ['Utilidad',                    { content:`${params.pctUtilidad}%`,   styles:{halign:'center'} }, { content:money(utilidad),    styles:{halign:'right'} }],
      ['Subtotal antes de impuestos', { content:'—',                        styles:{halign:'center'} }, { content:money(subtotalU),   styles:{halign:'right'} }],
      [`Impuesto (ISV/IVA)`,          { content:`${params.pctImpuesto}%`,   styles:{halign:'center'} }, { content:money(impuesto),    styles:{halign:'right'} }],
      [
        { content:'TOTAL GENERAL', styles:{ fontStyle:'bold', fillColor:C.ink, textColor:255, halign:'left'   } },
        { content:'—',             styles:{ fontStyle:'bold', fillColor:C.ink, textColor:255, halign:'center' } },
        { content:money(total),    styles:{ fontStyle:'bold', fillColor:C.ink, textColor:255, halign:'right'  } },
      ],
    ],
    styles:             { fontSize: 9, cellPadding: 2.5, textColor: C.ink },
    headStyles:         { fillColor: C.dark, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: C.bg },
    columnStyles:       { 0:{ cellWidth: col0W }, 1:{ cellWidth: col1W }, 2:{ cellWidth: col2W } },
    theme: 'plain',
  })
  y = doc.lastAutoTable.finalY + 8

  // ── Tabla resumen capítulos ───────────────────────────────────
  // Col widths: ID=12, Acts=18, %=22, Sub=36, Cap=resto
  const idW=12, actsW=18, pctW=22, subW=36, capW=CW-idW-actsW-pctW-subW
  const capItems = budget.items.filter(it => it.tipo === 'capitulo')
  const capRows = capItems.map(cap => {
    const capSub = round2(calcItem(cap, budget.catalogos, params).subtotal)
    const nActs  = (function count(its){ return its.reduce((s,x)=>s+(x.tipo==='actividad'?1:count(x.children||[])),0) })(cap.children||[])
    const pct    = directReal > 0 ? ((capSub/directReal)*100).toFixed(1)+'%' : '—'
    return [
      { content: cap.id,        styles: { halign: 'center' } },
      cap.descripcion,
      { content: nActs+' act.', styles: { halign: 'center' } },
      { content: pct,           styles: { halign: 'center' } },
      { content: money(capSub), styles: { halign: 'right'  } },
    ]
  })
  if (capRows.length) {
    // fila total costos directos
    capRows.push([
      { content: '',                    styles: { halign: 'center', fontStyle: 'bold', fillColor: C.ink, textColor: 255 } },
      { content: 'TOTAL COSTO DIRECTO', styles: { halign: 'left',   fontStyle: 'bold', fillColor: C.ink, textColor: 255 } },
      { content: '',                    styles: { halign: 'center', fontStyle: 'bold', fillColor: C.ink, textColor: 255 } },
      { content: '100%',                styles: { halign: 'center', fontStyle: 'bold', fillColor: C.ink, textColor: 255 } },
      { content: money(directReal),     styles: { halign: 'right',  fontStyle: 'bold', fillColor: C.ink, textColor: 255 } },
    ])
    doc.autoTable({
      startY: y,
      margin: { left: ML, right: ML },
      head: [[
        { content: 'ID',           styles: { halign: 'center' } },
        { content: 'Capítulo',     styles: { halign: 'left'   } },
        { content: 'Acts.',        styles: { halign: 'center' } },
        { content: '% Dir.',       styles: { halign: 'center' } },
        { content: 'Costo Directo',styles: { halign: 'right'  } },
      ]],
      body: capRows,
      styles:             { fontSize: 9, cellPadding: 2.5, textColor: C.ink },
      headStyles:         { fillColor: C.dark, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: C.bg },
      columnStyles:       { 0:{cellWidth:idW}, 1:{cellWidth:capW}, 2:{cellWidth:actsW}, 3:{cellWidth:pctW}, 4:{cellWidth:subW} },
      theme: 'plain',
    })
  }

  // ── Footer ────────────────────────────────────────────────────
  doc.setDrawColor(...C.rule); doc.setLineWidth(0.3); doc.line(ML, h-10, w-ML, h-10)
  doc.setTextColor(...C.muted); doc.setFontSize(7); doc.setFont(undefined, 'normal')
  doc.text(`Arrow Budget · ${new Date().toLocaleDateString('es-HN')}`, ML, h-5)
  doc.text(`Documento confidencial — ${budget.cotizante||''}`, w/2, h-5, { align:'center' })
  doc.text('Pág. 1', w-ML, h-5, { align:'right' })

  doc.save((budget.nombreProyecto || 'Proyecto').replace(/[^\w]+/g, '_') + '_ResumenEjecutivo.pdf')
}

// ============ PORTAFOLIO PDF ============
export const exportPDFPortafolio = (proyectos, empresa = '') => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()

  // Header
  doc.setFillColor(10, 20, 40); doc.rect(0, 0, w, 28, 'F')
  doc.setTextColor(245, 158, 11); doc.setFontSize(16); doc.setFont(undefined, 'bold')
  doc.text('PORTAFOLIO DE PROYECTOS', w / 2, 12, { align: 'center' })
  doc.setTextColor(200, 215, 235); doc.setFontSize(9); doc.setFont(undefined, 'normal')
  doc.text(`${empresa} · Generado el ${new Date().toLocaleDateString('es-HN')}`, w / 2, 20, { align: 'center' })

  // KPI boxes
  const activos   = proyectos.filter(p => p.estado === 'Activo').length
  const revision  = proyectos.filter(p => p.estado === 'En revisión').length
  const aprobados = proyectos.filter(p => p.estado === 'Aprobado').length
  const cartera   = proyectos.reduce((s, p) => s + (p._total || 0), 0)

  const kpis = [
    { label: 'TOTAL PROYECTOS', value: String(proyectos.length), color: [30, 64, 175] },
    { label: 'ACTIVOS',         value: String(activos),          color: [5, 150, 105] },
    { label: 'EN REVISIÓN',     value: String(revision),         color: [146, 64, 14] },
    { label: 'APROBADOS',       value: String(aprobados),        color: [79, 70, 229] },
    { label: 'CARTERA TOTAL',   value: money(cartera),           color: [180, 83, 9] },
  ]
  const bw = (w - 28 - 16) / 5
  kpis.forEach((b, i) => {
    const bx = 14 + i * (bw + 4)
    doc.setFillColor(...b.color); doc.roundedRect(bx, 32, bw, 18, 2, 2, 'F')
    doc.setTextColor(255); doc.setFontSize(6.5); doc.setFont(undefined, 'bold')
    doc.text(b.label, bx + bw / 2, 38, { align: 'center' })
    doc.setFontSize(11)
    doc.text(b.value, bx + bw / 2, 46, { align: 'center' })
  })

  // Tabla de proyectos
  const estadoColor = { 'Activo': [5,150,105], 'En revisión': [146,64,14], 'Aprobado': [79,70,229], 'Borrador': [100,116,139], 'Rechazado': [185,28,28], 'En ejecución': [124,58,237] }

  const rows = proyectos.map((p, i) => [
    i + 1,
    p.nombreProyecto || '—',
    p.cliente || '—',
    p.lugar || '—',
    { content: p.estado || 'Borrador', styles: { textColor: estadoColor[p.estado] || [100,116,139], fontStyle: 'bold' } },
    `Rev ${p.revision || 1}`,
    p.fecha || '—',
    p.moneda || 'USD',
    { content: money(p._total || 0), styles: { halign: 'right', fontStyle: 'bold' } },
  ])

  // Fila de total
  rows.push([
    { content: '', colSpan: 7, styles: { fillColor: [10, 20, 40] } },
    { content: 'CARTERA TOTAL', styles: { fillColor: [10, 20, 40], textColor: 245, fontStyle: 'bold', halign: 'right' } },
    { content: money(cartera), styles: { fillColor: [10, 20, 40], textColor: 245, fontStyle: 'bold', halign: 'right' } },
  ])

  doc.autoTable({
    startY: 54,
    head: [['#', 'Proyecto', 'Cliente', 'Ubicación', 'Estado', 'Rev.', 'Fecha', 'Moneda', 'Total']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 245, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
      8: { cellWidth: 32, halign: 'right' },
    },
    theme: 'striped',
  })

  // Footer
  doc.setFillColor(10, 20, 40); doc.rect(0, h - 12, w, 12, 'F')
  doc.setTextColor(150, 165, 190); doc.setFontSize(7); doc.setFont(undefined, 'normal')
  doc.text('Arrow Budget — Portafolio de Proyectos', 14, h - 5)
  doc.text(`${proyectos.length} proyectos · ${new Date().toLocaleDateString('es-HN')}`, w - 14, h - 5, { align: 'right' })

  doc.save(`Portafolio_${empresa || 'Proyectos'}_${new Date().toISOString().slice(0,10)}.pdf`)
}

// ============ EXCEL PORTAFOLIO ============
export async function exportExcelPortafolio(proyectos, empresa = '') {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Portafolio')
  ws.columns = [
    { width: 6 }, { width: 40 }, { width: 28 }, { width: 22 },
    { width: 16 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 18 },
  ]

  ws.mergeCells('A1:I1')
  setC(ws, 'A1', `PORTAFOLIO DE PROYECTOS — ${empresa.toUpperCase()}`, { fill: X.titleFill, font: X.titleFont, alignment: X.ac })
  ws.getRow(1).height = 28

  ws.mergeCells('A2:I2')
  setC(ws, 'A2', `Generado el ${new Date().toLocaleDateString('es-HN')} · ${proyectos.length} proyectos`, {
    font: { italic: true, color: { argb: 'FF64748B' } }, alignment: X.ac,
  })

  ;['#', 'Proyecto', 'Cliente', 'Ubicación', 'Estado', 'Rev.', 'Fecha', 'Moneda', 'Total'].forEach((h, i) =>
    setC(ws, String.fromCharCode(65 + i) + '4', h, { fill: X.headerFill, font: X.headerFont, alignment: X.ac })
  )
  ws.getRow(4).height = 22

  proyectos.forEach((p, idx) => {
    const r = 5 + idx
    setC(ws, 'A' + r, idx + 1, { alignment: X.ac })
    setC(ws, 'B' + r, p.nombreProyecto || '—', { alignment: X.al })
    setC(ws, 'C' + r, p.cliente || '—', { alignment: X.al })
    setC(ws, 'D' + r, p.lugar || '—', { alignment: X.al })
    setC(ws, 'E' + r, p.estado || 'Borrador', { alignment: X.ac })
    setC(ws, 'F' + r, p.revision || 1, { alignment: X.ac })
    setC(ws, 'G' + r, p.fecha || '—', { alignment: X.ac })
    setC(ws, 'H' + r, p.moneda || 'USD', { alignment: X.ac })
    setC(ws, 'I' + r, p._total || 0, { alignment: X.ar, numFmt: MFMT, font: { bold: true } })
  })

  const totRow = 5 + proyectos.length + 1
  ws.mergeCells(`A${totRow}:H${totRow}`)
  setC(ws, 'A' + totRow, 'CARTERA TOTAL', { fill: X.totalFill, font: X.totalFont, alignment: X.ar })
  setC(ws, 'I' + totRow, proyectos.reduce((s, p) => s + (p._total || 0), 0), {
    fill: X.totalFill, font: X.totalFont, alignment: X.ar, numFmt: MFMT,
  })
  ws.getRow(totRow).height = 26

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]), `Portafolio_${(empresa || 'Proyectos').replace(/[^\w]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
