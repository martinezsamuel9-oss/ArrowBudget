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

export const exportPDFFicha = (budget, act, params) => {
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'letter'})
  let y = drawPDFHeader(doc, budget, 'FICHA DE COSTO UNITARIO')
  doc.setFontSize(11); doc.setFont(undefined,'bold')
  doc.text(`${act.id} — ${act.descripcion}`, 10, y); y+=5
  doc.setFontSize(9); doc.setFont(undefined,'normal')
  doc.text(`Cantidad: ${fmt(act.cantidad)} ${act.unidad}`, 10, y); y+=4
  const calc = calcFicha(act.ficha, budget.catalogos, params)
  const sect = (title, k, total) => {
    const rs = (act.ficha[k]||[]).map((c,i)=>{
      const ins = findInsumo(budget.catalogos,k,c.insumoId)
      return ins ? [i+1,ins.codigo,ins.descripcion,ins.unidad,fmt(c.rendimiento),fmt(c.desperdicio)+'%',money(ins.costoBase),money(conceptoCost(c,budget.catalogos,k))] : null
    }).filter(Boolean)
    if (!rs.length) rs.push([{content:'(sin conceptos)',colSpan:8,styles:{halign:'center',fontStyle:'italic',textColor:150}}])
    rs.push([{content:'SUBTOTAL '+title,colSpan:7,styles:{halign:'right',fontStyle:'bold',fillColor:[226,232,240]}},{content:money(total),styles:{halign:'right',fontStyle:'bold',fillColor:[226,232,240]}}])
    doc.autoTable({startY:y,head:[[{content:title,colSpan:8,styles:{fillColor:[30,41,59],textColor:255,halign:'left',fontStyle:'bold'}}],['#','Cód.','Insumo','Und','Rend.','Desp.','C.Base','Subtotal']],body:rs,styles:{fontSize:8,cellPadding:1.2},headStyles:{fillColor:[71,85,105],textColor:255}})
    y = doc.lastAutoTable.finalY + 3
  }
  sect('MATERIALES','materiales',calc.totMat)
  sect('MANO DE OBRA','manoObra',calc.totMo)
  sect('HERRAMIENTA + EQUIPO','herramientaEquipo',calc.totHe)
  sect('SUBCONTRATO','subcontratos',calc.totSub)
  doc.autoTable({startY:y,body:[
    ['Costo Directo',money(calc.costoDirecto)],
    [`Indirectos (${params.pctIndirectos}%)`,money(calc.indirectos)],
    [`Imprevistos (${params.pctImprevistos}%)`,money(calc.imprevistos)],
    [`Utilidad (${params.pctUtilidad}%)`,money(calc.utilidad)],
    ['Subtotal antes de impuestos',money(calc.subtotalSinImpuesto)],
    [`Impuesto (${params.pctImpuesto}%)`,money(calc.impuesto)],
    [{content:'PRECIO UNITARIO TOTAL',styles:{fontStyle:'bold',fillColor:[15,17,21],textColor:245}},{content:money(calc.precioUnitario),styles:{fontStyle:'bold',fillColor:[15,17,21],textColor:245,halign:'right'}}]
  ],styles:{fontSize:9,cellPadding:2},columnStyles:{0:{halign:'right',fontStyle:'bold'},1:{halign:'right',cellWidth:50}},theme:'grid'})
  doc.save(`Ficha_${act.id}.pdf`)
}

export const exportPDFGeneral = (budget, params) => {
  exportPDFPresupuesto(budget, params)
  const acts=[]; const collect=its=>{for(const it of its){if(it.tipo==='actividad')acts.push(it);else if(it.children)collect(it.children)}}
  collect(budget.items)
  acts.forEach((act,i)=>setTimeout(()=>exportPDFFicha(budget,act,params),(i+1)*700))
}

export const exportPDFRangoFichas = (budget, params, ids) => {
  const acts=[]; const collect=its=>{for(const it of its){if(it.tipo==='actividad'&&ids.includes(it.id))acts.push(it);else if(it.children)collect(it.children)}}
  collect(budget.items)
  if(!acts.length) return alert('No hay actividades seleccionadas.')
  acts.forEach((act,i)=>setTimeout(()=>exportPDFFicha(budget,act,params),i*600))
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
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet(cat.label)
  ws.columns=[{width:14},{width:40},{width:12},{width:16},{width:24},{width:30}]
  ws.mergeCells('A1:F1')
  setC(ws,'A1',`LISTA DE ${cat.label.toUpperCase()} — ${budget.nombreProyecto}`,{fill:X.titleFill,font:X.titleFont,alignment:X.ac})
  ws.getRow(1).height=26
  ;['Código','Descripción','Unidad','Precio Base','Proveedor','Notas'].forEach((h,i)=>setC(ws,String.fromCharCode(65+i)+'3',h,{fill:X.headerFill,font:X.headerFont,alignment:X.ac}))
  ws.getRow(3).height=22
  ;(budget.catalogos[catKey]||[]).forEach((ins,idx)=>{
    const r=4+idx
    setC(ws,'A'+r,ins.codigo||'',{alignment:X.ac,font:{name:'Consolas',size:10}})
    setC(ws,'B'+r,ins.descripcion,{alignment:X.al}); setC(ws,'C'+r,ins.unidad,{alignment:X.ac})
    setC(ws,'D'+r,round2(ins.costoBase),{alignment:X.ar,numFmt:MFMT,font:{bold:true}})
    setC(ws,'E'+r,ins.proveedor||'',{alignment:X.al}); setC(ws,'F'+r,ins.notas||'',{alignment:X.al})
  })
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

export async function exportExcelGeneral(budget, params) {
  await exportExcelPresupuesto(budget, params)
  for(const cat of CATEGORIAS){
    if((budget.catalogos[cat.key]||[]).length){ await new Promise(r=>setTimeout(r,300)); await exportExcelCatalogo(budget,cat.key) }
  }
  const acts=[]; const collect=its=>{for(const it of its){if(it.tipo==='actividad')acts.push(it);else if(it.children)collect(it.children)}}
  collect(budget.items)
  for(const act of acts){ await new Promise(r=>setTimeout(r,300)); await exportExcelFicha(budget,act,params) }
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
    else { const cap=newItems.find(x=>x.id===parts[0]); const sub=cap?.children?.find(x=>x.id===parts.slice(0,2).join('.')); const it={id,tipo:'actividad',descripcion:desc,unidad:String(r[2]||'und').trim(),cantidad:parseFloat(r[3])||0,ficha:{materiales:[],manoObra:[],herramientaEquipo:[],subcontratos:[]}}; ((sub||cap)?(sub||cap).children:newItems).push(it) }
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
export const exportPDFResumenEjecutivo = (budget, params) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()

  // Calcular totales con calcItem (igual que en la app)
  const directReal  = round2(budget.items.reduce((s, it) => s + calcItem(it, budget.catalogos, params).subtotal, 0))
  const indirectos  = round2(directReal * (params.pctIndirectos / 100))
  const imprevistos = round2((directReal + indirectos) * (params.pctImprevistos / 100))
  const subtotal    = round2(directReal + indirectos + imprevistos)
  const utilidad    = round2(subtotal * (params.pctUtilidad / 100))
  const subtotalU   = round2(subtotal + utilidad)
  const impuesto    = round2(subtotalU * (params.pctImpuesto / 100))
  const total       = round2(subtotalU + impuesto)

  // ── Header oscuro ──────────────────────────────────────────────
  doc.setFillColor(10, 20, 40); doc.rect(0, 0, w, 68, 'F')
  try { if (budget.logoOfertante) doc.addImage(budget.logoOfertante, 'PNG', 14, 10, 26, 26) } catch {}
  try { if (budget.logoCliente)   doc.addImage(budget.logoCliente,   'PNG', w - 40, 10, 26, 26) } catch {}

  doc.setTextColor(245, 158, 11); doc.setFontSize(8); doc.setFont(undefined, 'bold')
  doc.text('RESUMEN EJECUTIVO DE PRESUPUESTO', w / 2, 14, { align: 'center' })
  doc.setTextColor(255); doc.setFontSize(18); doc.setFont(undefined, 'bold')
  doc.text(budget.nombreProyecto || 'Sin nombre', w / 2, 26, { align: 'center' })
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(180, 200, 230)
  doc.text(budget.lugar || '', w / 2, 33, { align: 'center' })

  // Pills
  const pills = [`Rev. ${budget.revision || 1}`, budget.estado || 'Borrador', budget.moneda || 'USD', budget.tipo || ''].filter(Boolean)
  let px = w / 2 - (pills.length * 23) / 2
  pills.forEach(pill => {
    doc.setFillColor(37, 99, 235); doc.roundedRect(px, 38, 21, 6, 2, 2, 'F')
    doc.setTextColor(255); doc.setFontSize(6.5); doc.setFont(undefined, 'bold')
    doc.text(pill, px + 10.5, 42.5, { align: 'center' })
    px += 24
  })

  // Línea dorada + info partes
  doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.6); doc.line(14, 51, w - 14, 51)
  doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(170, 190, 215)
  const left  = [`Cotizante:  ${budget.cotizante   || '—'}`, `Ofertante:  ${budget.ofertante   || '—'}`, `Realizado:  ${budget.realizadoPor || '—'}`]
  const right = [`Cliente:    ${budget.cliente      || '—'}`, `Fecha:      ${budget.fecha        || '—'}`]
  left.forEach((t, i)  => doc.text(t, 14,    55 + i * 4))
  right.forEach((t, i) => doc.text(t, w / 2, 55 + i * 4))

  // ── KPI boxes ─────────────────────────────────────────────────
  let y = 74
  const boxes = [
    { label: 'COSTO DIRECTO',     value: money(directReal),           color: [30, 64, 175] },
    { label: 'INDIRECTOS + IMPR.', value: money(indirectos + imprevistos), color: [79, 70, 229] },
    { label: 'UTILIDAD',          value: money(utilidad),             color: [5, 150, 105] },
    { label: 'TOTAL C/IMPUESTO',  value: money(total),                color: [180, 83, 9]  },
  ]
  const bw = (w - 28 - 9) / 4
  boxes.forEach((b, i) => {
    const bx = 14 + i * (bw + 3)
    doc.setFillColor(...b.color); doc.roundedRect(bx, y, bw, 20, 2, 2, 'F')
    doc.setTextColor(255); doc.setFontSize(6.5); doc.setFont(undefined, 'bold')
    doc.text(b.label, bx + bw / 2, y + 6, { align: 'center' })
    doc.setFontSize(9.5)
    doc.text(b.value, bx + bw / 2, y + 14, { align: 'center' })
  })
  y += 26

  // ── Tabla financiera ──────────────────────────────────────────
  doc.autoTable({
    startY: y,
    head: [['Concepto', '%', `Monto (${budget.moneda || 'USD'})`]],
    body: [
      ['Costo Directo',              '—',                       money(directReal)],
      [`Indirectos`,                 `${params.pctIndirectos}%`,  money(indirectos)],
      [`Imprevistos`,                `${params.pctImprevistos}%`, money(imprevistos)],
      ['Subtotal',                   '—',                       money(subtotal)],
      [`Utilidad`,                   `${params.pctUtilidad}%`,   money(utilidad)],
      ['Subtotal antes de impuestos','—',                        money(subtotalU)],
      [`Impuesto (ISV/IVA)`,         `${params.pctImpuesto}%`,   money(impuesto)],
      [
        { content: 'TOTAL GENERAL', styles: { fontStyle: 'bold', fillColor: [10,20,40], textColor: 245 } },
        { content: '—',             styles: { fontStyle: 'bold', fillColor: [10,20,40], textColor: 245, halign:'center' } },
        { content: money(total),    styles: { fontStyle: 'bold', fillColor: [10,20,40], textColor: 245, halign:'right' } },
      ],
    ],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 245, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'center', cellWidth: 20 }, 2: { halign: 'right' } },
    theme: 'striped',
  })
  y = doc.lastAutoTable.finalY + 8

  // ── Tabla resumen capítulos ───────────────────────────────────
  const capRows = budget.items.filter(it => it.tipo === 'capitulo').map(cap => {
    const capSub = round2(calcItem(cap, budget.catalogos, params).subtotal)
    const nActs = (function count(its) { return its.reduce((s, x) => s + (x.tipo === 'actividad' ? 1 : count(x.children || [])), 0) })(cap.children || [])
    return [cap.id, cap.descripcion, nActs + ' actividad(es)', money(capSub)]
  })
  if (capRows.length) {
    doc.autoTable({
      startY: y,
      head: [['ID', 'Capítulo', 'Actividades', 'Subtotal']],
      body: capRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 245 },
      columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' } },
      theme: 'striped',
    })
  }

  // ── Footer ────────────────────────────────────────────────────
  doc.setFillColor(10, 20, 40); doc.rect(0, h - 14, w, 14, 'F')
  doc.setTextColor(140, 160, 190); doc.setFontSize(7); doc.setFont(undefined, 'normal')
  doc.text(`Generado por Arrow Budget · ${new Date().toLocaleDateString('es-HN')}`, 14, h - 5)
  doc.text(`Documento confidencial — ${budget.cotizante || ''}`, w / 2, h - 5, { align: 'center' })
  doc.text('Página 1', w - 14, h - 5, { align: 'right' })

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
  const estadoColor = { 'Activo': [5,150,105], 'En revisión': [146,64,14], 'Aprobado': [79,70,229], 'Borrador': [100,116,139], 'Rechazado': [185,28,28] }

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
