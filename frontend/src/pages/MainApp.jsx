import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  round2, fmt, money, moneyK, uid, normalize,
  findInsumo, conceptoCost, calcFicha, calcItem, calcKPIs,
  findOrCreateInsumo, findPathById, CATEGORIAS, EMPTY_CATALOGOS,
} from '../lib/calc'
import {
  exportPDFPresupuesto, exportPDFFicha, exportPDFGeneral, exportPDFRangoFichas,
  exportExcelPresupuesto, exportExcelCatalogo, exportExcelFicha, exportExcelGeneral,
  exportPlantilla, importExcelPresupuesto, importExcelCatalogo,
} from '../lib/export'

// ============ SUPABASE MAPPING ============
const relTime = ts => {
  if (!ts) return ''
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1)   return 'ahora'
  if (m < 60)  return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)   return `hace ${d} día${d > 1 ? 's' : ''}`
  const w = Math.floor(d / 7)
  return `hace ${w} semana${w > 1 ? 's' : ''}`
}
const DB2UI = { borrador:'Borrador', activo:'Activo', en_revision:'En revisión', enviado:'En revisión', aprobado:'Aprobado', rechazado:'Rechazado', archivado:'Archivado' }
const UI2DB = { 'Borrador':'borrador', 'Activo':'activo', 'En revisión':'en_revision', 'Aprobado':'aprobado', 'Rechazado':'rechazado', 'Archivado':'archivado' }

const mapDb = row => ({
  id:            row.id,
  cotizante:     row.cotizante     || '',
  cliente:       row.cliente       || '',
  ofertante:     row.ofertante     || '',
  realizadoPor:  row.realizado_por || '',
  lugar:         row.lugar         || '',
  nombreProyecto:row.nombre_proyecto || 'Sin nombre',
  fecha:         row.fecha         || new Date().toISOString().slice(0,10),
  revision:      row.revision      || 1,
  moneda:        row.moneda        || 'USD',
  tipo:          row.tipo          || 'Residencial',
  estado:        DB2UI[row.estado] || 'Borrador',
  ultimaEdicion: relTime(row.updated_at),
  pctIndirectos: +(row.pct_indirectos  || 10),
  pctImprevistos:+(row.pct_imprevistos || 1),
  pctUtilidad:   +(row.pct_utilidad    || 8),
  pctImpuesto:   +(row.pct_impuesto    || 15),
  logoOfertante: row.logo_ofertante || null,
  logoCliente:   row.logo_cliente   || null,
  versiones:     row.versiones_json || [],
  catalogos:     row.catalogos_json || { ...EMPTY_CATALOGOS },
  items:         row.items_json     || [],
})

const toDb = b => ({
  cotizante:       b.cotizante,
  cliente:         b.cliente,
  ofertante:       b.ofertante,
  realizado_por:   b.realizadoPor,
  lugar:           b.lugar,
  nombre_proyecto: b.nombreProyecto,
  fecha:           b.fecha,
  revision:        b.revision,
  moneda:          b.moneda,
  tipo:            b.tipo,
  estado:          UI2DB[b.estado] || 'borrador',
  pct_indirectos:  b.pctIndirectos,
  pct_imprevistos: b.pctImprevistos,
  pct_utilidad:    b.pctUtilidad,
  pct_impuesto:    b.pctImpuesto,
  logo_ofertante:  b.logoOfertante,
  logo_cliente:    b.logoCliente,
  versiones_json:  b.versiones,
  catalogos_json:  b.catalogos,
  items_json:      b.items,
  updated_at:      new Date().toISOString(),
})

// ============ HOOKS ============
function useClickOutside(ref, cb) {
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) cb() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [cb])
}

// ============ UI COMPONENTS ============
function Dropdown({ trigger, children, align = 'right', width = 'w-56' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))
  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div className={`absolute z-30 mt-1 ${align === 'right' ? 'right-0' : 'left-0'} ${width} bg-white border border-gray-200 shadow-2xl rounded-lg overflow-hidden`}>
          <div>{children}</div>
        </div>
      )}
    </div>
  )
}

function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null
  const sz = { sm:'max-w-md', md:'max-w-2xl', lg:'max-w-4xl' }[size]
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${sz} max-h-[92vh] overflow-hidden flex flex-col`}>
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded-full w-8 h-8 leading-none">✕</button>
        </div>
        <div className="overflow-y-auto scrollbar p-5 flex-1">{children}</div>
        {footer && <div className="bg-gray-50 px-5 py-3 flex justify-end gap-2 border-t">{footer}</div>}
      </div>
    </div>
  )
}

function InsumoSelect({ catalogos, categoria, value, onChange, onCreateNew }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))
  const sel = (catalogos[categoria] || []).find(i => i.id === value)
  const qn = normalize(q)
  const list = (catalogos[categoria] || []).filter(i => !qn || normalize(i.descripcion).includes(qn) || normalize(i.codigo).includes(qn))
  const exact = (catalogos[categoria] || []).find(i => normalize(i.codigo) === qn)
  return (
    <div ref={ref} className="relative w-full">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-2 py-1 hover:bg-amber-50 truncate">
        {sel ? (
          <span className="flex items-center gap-1.5">
            {sel.codigo && <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1 rounded">{sel.codigo}</span>}
            <span className="truncate">{sel.descripcion}</span>
          </span>
        ) : <span className="text-gray-400 italic text-xs">— seleccionar —</span>}
      </button>
      {open && (
        <div className="absolute z-40 left-0 mt-1 w-80 bg-white border shadow-2xl rounded-lg overflow-hidden">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && exact) { onChange(exact.id); setOpen(false); setQ('') } }}
            placeholder="Buscar descripción o código…" className="w-full px-3 py-2 border-b text-sm outline-none" />
          {exact && <div className="px-3 py-2 bg-amber-100 text-amber-900 text-xs border-b">↵ Asignar por código <strong>{exact.codigo}</strong></div>}
          <div className="max-h-56 overflow-y-auto">
            {!list.length && <div className="text-xs text-gray-500 p-2">Sin coincidencias.</div>}
            {list.map(i => (
              <div key={i.id} onClick={() => { onChange(i.id); setOpen(false); setQ('') }}
                className="px-3 py-2 hover:bg-amber-50 cursor-pointer text-sm border-b">
                <div className="flex items-center gap-1.5">
                  {i.codigo && <span className="text-[10px] font-mono bg-gray-100 text-gray-700 px-1 rounded">{i.codigo}</span>}
                  <span className="font-medium">{i.descripcion}</span>
                </div>
                <div className="text-xs text-gray-500">{i.unidad} · {money(i.costoBase)}</div>
              </div>
            ))}
          </div>
          {q.trim() && !exact && (
            <button onClick={() => { onCreateNew(q.trim()); setOpen(false); setQ('') }}
              className="w-full px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs border-t font-medium">
              + Crear "{q.trim()}" en catálogo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FichaSection({ title, k, total, icon, ficha, catalogos, onAdd, onDel, onUpd, onCreateIns }) {
  return (
    <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-slate-800 text-white px-3 py-2 flex justify-between">
        <h4 className="font-semibold text-sm">{icon} {title}</h4>
        <button onClick={() => onAdd(k)} className="text-xs bg-white text-slate-800 px-2 py-0.5 rounded hover:bg-amber-50">+ Agregar</button>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 w-8">#</th>
            <th className="px-2 py-1 text-left">Insumo</th>
            <th className="px-2 py-1 w-16">Unidad</th>
            <th className="px-2 py-1 w-20">Rend.</th>
            <th className="px-2 py-1 w-16">Desp.%</th>
            <th className="px-2 py-1 w-24">Costo Base</th>
            <th className="px-2 py-1 w-24 text-right">Subtotal</th>
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {(ficha[k] || []).map((c, i) => {
            const ins = findInsumo(catalogos, k, c.insumoId)
            return (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-amber-50/50">
                <td className="px-2 py-1 text-center text-gray-400">{i + 1}</td>
                <td className="p-0"><InsumoSelect catalogos={catalogos} categoria={k} value={c.insumoId} onChange={v => onUpd(k, i, 'insumoId', v)} onCreateNew={d => onCreateIns(k, i, d)} /></td>
                <td className="px-2 py-1 text-center text-gray-600">{ins ? ins.unidad : '—'}</td>
                <td><input type="number" step="any" className="w-full px-1 py-0.5 text-right focus:bg-amber-50 outline-none" value={c.rendimiento} onChange={e => onUpd(k, i, 'rendimiento', parseFloat(e.target.value) || 0)} /></td>
                <td><input type="number" step="any" className="w-full px-1 py-0.5 text-right focus:bg-amber-50 outline-none" value={c.desperdicio} onChange={e => onUpd(k, i, 'desperdicio', parseFloat(e.target.value) || 0)} /></td>
                <td className="px-2 py-1 text-right text-gray-600">{ins ? money(ins.costoBase) : '—'}</td>
                <td className="px-2 py-1 text-right font-medium">{money(conceptoCost(c, catalogos, k))}</td>
                <td className="text-center"><button onClick={() => onDel(k, i)} className="text-red-400 hover:text-red-600">×</button></td>
              </tr>
            )
          })}
          <tr className="bg-gray-50 border-t font-semibold">
            <td colSpan="6" className="px-2 py-1.5 text-right text-gray-700">SUBTOTAL {title}</td>
            <td className="px-2 py-1.5 text-right">{money(total)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function FichaCostoModal({ open, onClose, actividad, budget, catalogos, params, onUpdate, onUpdateCatalogos }) {
  if (!open || !actividad) return null
  const f = actividad.ficha || { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const calc = calcFicha(f, catalogos, params)
  const upd = (k, i, fld, v) => { const nf = { ...f, [k]: [...f[k]] }; nf[k][i] = { ...nf[k][i], [fld]: v }; onUpdate({ ...actividad, ficha: nf }) }
  const add = k => onUpdate({ ...actividad, ficha: { ...f, [k]: [...(f[k] || []), { id: uid(), insumoId: null, rendimiento: 1, desperdicio: 0 }] } })
  const del = (k, i) => onUpdate({ ...actividad, ficha: { ...f, [k]: f[k].filter((_, ix) => ix !== i) } })
  const createIns = (k, i, desc) => { const r = findOrCreateInsumo(catalogos, k, desc); if (!r) return; onUpdateCatalogos(r.catalogos); upd(k, i, 'insumoId', r.insumo.id) }
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-4 flex justify-between items-center">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Ficha de Costo Unitario</div>
            <h3 className="font-bold text-lg mt-0.5">{actividad.id} — {actividad.descripcion}</h3>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded-full w-8 h-8 leading-none">✕</button>
        </div>
        <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-amber-50 text-sm border-b">
          <div><div className="text-xs text-gray-500">Actividad</div><div className="font-medium">{actividad.id}</div></div>
          <div><div className="text-xs text-gray-500">Cantidad</div><div className="font-medium">{fmt(actividad.cantidad)} {actividad.unidad}</div></div>
          <div><div className="text-xs text-gray-500">Unidad</div><div className="font-medium">{actividad.unidad}</div></div>
          <div><div className="text-xs text-gray-500">Fecha</div><div className="font-medium">{new Date().toLocaleDateString()}</div></div>
        </div>
        <div className="overflow-y-auto scrollbar p-5 flex-1">
          {CATEGORIAS.map(cat => (
            <FichaSection key={cat.key} title={cat.label.toUpperCase()} k={cat.key}
              total={cat.key==='materiales'?calc.totMat:cat.key==='manoObra'?calc.totMo:cat.key==='herramientaEquipo'?calc.totHe:calc.totSub}
              icon={cat.icon} ficha={f} catalogos={catalogos} onAdd={add} onDel={del} onUpd={upd} onCreateIns={createIns} />
          ))}
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h4 className="font-bold text-sm mb-2 text-slate-700 uppercase">Resumen</h4>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-gray-600">Materiales</span><span className="text-right">{money(calc.totMat)}</span>
              <span className="text-gray-600">Mano de Obra</span><span className="text-right">{money(calc.totMo)}</span>
              <span className="text-gray-600">Herramientas y Equipo</span><span className="text-right">{money(calc.totHe)}</span>
              <span className="text-gray-600">Subcontratos</span><span className="text-right">{money(calc.totSub)}</span>
              <span className="font-semibold border-t pt-1">COSTO DIRECTO</span><span className="text-right font-semibold border-t pt-1">{money(calc.costoDirecto)}</span>
              <span className="text-gray-600">Indirectos ({params.pctIndirectos}%)</span><span className="text-right">{money(calc.indirectos)}</span>
              <span className="text-gray-600">Imprevistos ({params.pctImprevistos}%)</span><span className="text-right">{money(calc.imprevistos)}</span>
              <span className="text-gray-600">Utilidad ({params.pctUtilidad}%)</span><span className="text-right">{money(calc.utilidad)}</span>
              <span className="font-semibold border-t pt-1">Subtotal sin impuesto</span><span className="text-right font-semibold border-t pt-1">{money(calc.subtotalSinImpuesto)}</span>
              <span className="text-gray-600">Impuesto ({params.pctImpuesto}%)</span><span className="text-right">{money(calc.impuesto)}</span>
            </div>
            <div className="mt-2 bg-slate-900 text-white px-4 py-2 flex justify-between items-center rounded-lg">
              <span className="font-bold uppercase text-sm">Precio Unitario Total</span>
              <span className="font-bold text-2xl text-amber-400">{money(calc.precioUnitario)}</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 px-5 py-3 flex justify-between items-center border-t">
          <div className="flex gap-2">
            <button onClick={() => budget && exportPDFFicha(budget, actividad, params)} className="px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-semibold">🖨️ PDF</button>
            <button onClick={() => budget && exportExcelFicha(budget, actividad, params)} className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold">📊 Excel</button>
          </div>
          <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function Sidebar({ page, setPage, projectActivo, setTabProject, tabProject, user, onLogout, projectsCount }) {
  const Nav = ({ icon, label, active, badge, onClick }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${active ? 'bg-[#1e72d8]/20 text-[#60b0ff] border border-[#1e72d8]/30' : 'text-slate-300 hover:bg-white/5'}`}>
      <span className="text-base">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge !== undefined && <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-[#1e72d8]/30 text-[#93c5fd]' : 'bg-white/10 text-slate-400'}`}>{badge}</span>}
    </button>
  )
  return (
    <aside className="w-64 bg-[#0d1b2e] text-white flex-shrink-0 flex flex-col h-screen sticky top-0 border-r border-[#1e72d8]/10">
      <div className="px-4 py-4 flex items-center gap-3 border-b border-[#1e72d8]/15">
        <img src="/favicon.png" alt="Arrow Budget" className="w-10 h-10 rounded-lg object-contain" />
        <div>
          <div className="font-extrabold tracking-tight">ARROW BUDGET</div>
          <div className="text-xs text-slate-400">Presupuestos de Obra</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-dark px-3 py-4 space-y-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 mb-2">Trabajo</div>
          <div className="space-y-0.5">
            <Nav icon="🏠" label="Inicio" active={page==='inicio'} onClick={() => setPage('inicio')} />
            <Nav icon="📁" label="Proyectos" badge={projectsCount} active={page==='proyectos'} onClick={() => setPage('proyectos')} />
          </div>
        </div>
        {projectActivo && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 mb-2">Proyecto activo</div>
            <div className="px-3 mb-2">
              <div className="text-sm font-medium text-slate-200 truncate">{projectActivo.nombreProyecto}</div>
              <div className="text-xs text-slate-500">Rev {projectActivo.revision} · {projectActivo.moneda}</div>
            </div>
            <div className="space-y-0.5">
              <Nav icon="📄" label="Presupuesto"        active={page==='proyecto'&&tabProject==='presupuesto'} onClick={() => { setPage('proyecto'); setTabProject('presupuesto') }} />
              <Nav icon="🧱" label="Materiales"         active={page==='proyecto'&&tabProject==='cat-mat'}     onClick={() => { setPage('proyecto'); setTabProject('cat-mat') }} />
              <Nav icon="👷" label="Mano de Obra"       active={page==='proyecto'&&tabProject==='cat-mo'}      onClick={() => { setPage('proyecto'); setTabProject('cat-mo') }} />
              <Nav icon="🔧" label="Herramientas/Equipo" active={page==='proyecto'&&tabProject==='cat-he'}     onClick={() => { setPage('proyecto'); setTabProject('cat-he') }} />
              <Nav icon="🏢" label="Subcontratos"       active={page==='proyecto'&&tabProject==='cat-sub'}     onClick={() => { setPage('proyecto'); setTabProject('cat-sub') }} />
            </div>
          </div>
        )}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 mb-2">Herramientas</div>
          <div className="space-y-0.5">
            <Nav icon="📥" label="Plantillas"          active={page==='plantillas'} onClick={() => setPage('plantillas')} />
            <Nav icon="💳" label="Planes y Facturación" active={page==='planes'}     onClick={() => setPage('planes')} />
          </div>
        </div>
      </div>
      <div className="px-3 py-3 border-t border-white/5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white font-bold">
          {(user?.name || 'U').slice(0,2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{user?.name}</div>
          <div className="text-xs text-slate-400 truncate">{user?.empresa}</div>
        </div>
        <button onClick={onLogout} className="p-2 hover:bg-white/5 rounded-lg text-slate-400" title="Salir">↪</button>
      </div>
    </aside>
  )
}

function Topbar({ crumbs, search, setSearch, onHome, searchResults, onResultPick, notifNode, settingsNode, saving }) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 sticky top-0 z-20">
      <button onClick={onHome} className="text-gray-500 hover:text-slate-900" title="Inicio">🏠</button>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <span className="text-gray-400">›</span>
            <span className={i === crumbs.length - 1 ? 'text-slate-900 font-medium' : ''}>{c}</span>
          </Fragment>
        ))}
      </div>
      <div className="flex-1 max-w-2xl mx-auto relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proyectos, actividades, materiales…"
          className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:bg-white focus:border-amber-400" />
        {searchResults && (searchResults.proys.length + searchResults.acts.length + searchResults.insumos.length) > 0 && (
          <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border shadow-2xl rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            {searchResults.proys.length > 0 && <>
              <div className="text-xs font-bold uppercase text-gray-500 px-3 py-1.5 bg-gray-50 border-b">Proyectos</div>
              {searchResults.proys.slice(0,5).map(p => (
                <button key={p.id} onClick={() => onResultPick('proy',p)} className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b text-sm">
                  <div className="font-medium">{p.nombreProyecto}</div>
                  <div className="text-xs text-gray-500">{p.cliente}</div>
                </button>
              ))}
            </>}
            {searchResults.acts.length > 0 && <>
              <div className="text-xs font-bold uppercase text-gray-500 px-3 py-1.5 bg-gray-50 border-b">Actividades</div>
              {searchResults.acts.slice(0,5).map(a => (
                <button key={a.id} onClick={() => onResultPick('act',a)} className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b text-sm flex items-center gap-2">
                  <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{a.id}</span>
                  <span className="truncate">{a.descripcion}</span>
                </button>
              ))}
            </>}
            {searchResults.insumos.length > 0 && <>
              <div className="text-xs font-bold uppercase text-gray-500 px-3 py-1.5 bg-gray-50 border-b">Insumos</div>
              {searchResults.insumos.slice(0,5).map(i => (
                <button key={i.id} onClick={() => onResultPick('ins',i)} className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b text-sm flex items-center gap-2">
                  <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{i.codigo||'—'}</span>
                  <span className="truncate flex-1">{i.descripcion}</span>
                  <span className="text-xs text-gray-500">{i.catLabel}</span>
                </button>
              ))}
            </>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {saving && <span className="animate-pulse">● guardando…</span>}
      </div>
      <div className="flex items-center gap-1">{notifNode}{settingsNode}</div>
    </div>
  )
}

function SettingsPopover({ user, onLogout, onConfig, onPlanes }) {
  return (
    <Dropdown align="right" width="w-56" trigger={<button className="p-2 hover:bg-gray-100 rounded-lg text-gray-600">⚙️</button>}>
      <div className="px-3 py-3 border-b">
        <div className="font-semibold text-sm truncate">{user?.name}</div>
        <div className="text-xs text-gray-500 truncate">{user?.email}</div>
      </div>
      <button onClick={onConfig} className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm">⚙️ Configuración del proyecto</button>
      <button onClick={onPlanes} className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm">💳 Planes</button>
      <button onClick={onLogout} className="w-full text-left px-3 py-2 hover:bg-rose-50 text-rose-600 text-sm border-t">↪ Cerrar sesión</button>
    </Dropdown>
  )
}

function EstadoMenu({ budget, setBudget }) {
  const estados = [
    { v:'Borrador',    cls:'bg-gray-100 text-gray-700',   dot:'bg-gray-500' },
    { v:'Activo',      cls:'bg-emerald-50 text-emerald-700', dot:'bg-emerald-500' },
    { v:'En revisión', cls:'bg-amber-50 text-amber-700',  dot:'bg-amber-500' },
    { v:'Aprobado',    cls:'bg-blue-50 text-blue-700',    dot:'bg-blue-500' },
    { v:'Rechazado',   cls:'bg-rose-50 text-rose-700',    dot:'bg-rose-500' },
    { v:'Archivado',   cls:'bg-slate-100 text-slate-700', dot:'bg-slate-500' },
  ]
  const cur = estados.find(e => e.v === (budget.estado || 'Borrador')) || estados[0]
  return (
    <Dropdown align="left" width="w-48" trigger={
      <button className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 hover:opacity-80 ${cur.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cur.dot}`}></span>{cur.v} ▾
      </button>
    }>
      <div className="text-xs font-bold text-gray-500 uppercase px-3 py-2 border-b">Cambiar estado</div>
      {estados.map(e => (
        <button key={e.v} onClick={() => setBudget({ ...budget, estado: e.v })}
          className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`}></span>{e.v}
          {e.v === cur.v && <span className="ml-auto text-emerald-600">✓</span>}
        </button>
      ))}
    </Dropdown>
  )
}

function DescargasMenu({ budget, params, onRangoFichas }) {
  const acts = useMemo(() => {
    const r=[]; const walk=its=>its.forEach(it=>{if(it.tipo==='actividad')r.push(it);else if(it.children)walk(it.children)}); walk(budget.items); return r
  }, [budget.items])
  const Row = ({ label, desc, pdf, excel }) => (
    <div className="flex items-center justify-between gap-2 px-3 py-3 hover:bg-slate-50 text-sm border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-800 truncate">{label}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={e => { e.stopPropagation(); try { pdf() } catch(err) { console.error('PDF export error:', err); alert('Error al exportar PDF: ' + err.message) } }}
          className="px-2.5 py-1.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors"
          title="Descargar PDF"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8 13h8v1H8v-1zm0 3h8v1H8v-1zm0-6h3v1H8v-1z"/></svg>
          PDF
        </button>
        <button
          onClick={e => { e.stopPropagation(); try { excel() } catch(err) { console.error('Excel export error:', err); alert('Error al exportar Excel: ' + err.message) } }}
          className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors"
          title="Descargar Excel"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8 12l2.5 3.5L13 12l-2.5-3.5L8 12zm2.5 1.75L9.25 12 10.5 10.25 11.75 12l-1.25 1.75zm2.5-1.75l1.25 1.75-1.25 1.75L11.5 12l1.5-1.75z"/></svg>
          Excel
        </button>
      </div>
    </div>
  )
  return (
    <Dropdown align="right" width="w-72" trigger={
      <button className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-900 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z"/></svg>
        Descargas
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5H7z"/></svg>
      </button>
    }>
      <div className="text-xs font-bold text-gray-500 uppercase px-3 py-2 bg-gray-50 border-b">Presupuesto</div>
      <Row label="Presupuesto" desc="Tabla completa" pdf={() => exportPDFPresupuesto(budget, params)} excel={() => exportExcelPresupuesto(budget, params)} />
      <div className="text-xs font-bold text-gray-500 uppercase px-3 py-2 bg-gray-50 border-b border-t">Fichas de costo</div>
      <Row label="Rango de fichas" desc="Seleccionar varias" pdf={onRangoFichas} excel={onRangoFichas} />
      <div className="text-xs font-bold text-gray-500 uppercase px-3 py-2 bg-gray-50 border-b border-t">General</div>
      <Row label="General (todo)" desc="Presupuesto + fichas" pdf={() => exportPDFGeneral(budget, params)} excel={() => exportExcelGeneral(budget, params)} />
    </Dropdown>
  )
}

function RangoFichasDialog({ open, onClose, budget, params }) {
  const [sel, setSel] = useState(() => new Set())
  const acts = useMemo(() => {
    const r=[]; const walk=its=>its.forEach(it=>{if(it.tipo==='actividad')r.push(it);else if(it.children)walk(it.children)}); walk(budget.items); return r
  }, [budget.items])
  if (!open) return null
  const toggle = id => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
  return (
    <Modal open={open} onClose={onClose} title={`Seleccionar fichas (${sel.size}/${acts.length})`} size="md"
      footer={<>
        <button onClick={onClose} className="px-3 py-2 bg-white border rounded-lg text-sm">Cancelar</button>
        <button onClick={async () => { for(const id of sel){const a=acts.find(x=>x.id===id);if(a){await exportExcelFicha(budget,a,params);await new Promise(r=>setTimeout(r,250))}} onClose() }} disabled={!sel.size} className="px-3 py-2 bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">📊 Excel ({sel.size})</button>
        <button onClick={() => { exportPDFRangoFichas(budget, params, [...sel]); onClose() }} disabled={!sel.size} className="px-3 py-2 bg-rose-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">📄 PDF ({sel.size})</button>
      </>}>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setSel(new Set(acts.map(a=>a.id)))} className="text-xs px-3 py-1 bg-slate-900 text-white rounded-lg">Todas</button>
        <button onClick={() => setSel(new Set())} className="text-xs px-3 py-1 bg-gray-200 rounded-lg">Limpiar</button>
      </div>
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {acts.map(a => (
          <label key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-amber-50 rounded-lg cursor-pointer border">
            <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} className="w-4 h-4 accent-amber-500" />
            <span className="text-xs font-mono text-gray-500 w-16">{a.id}</span>
            <span className="text-sm flex-1 truncate">{a.descripcion}</span>
            <span className="text-xs text-gray-500">{a.unidad} · {fmt(a.cantidad)}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}

function GuardarVersionDialog({ open, onClose, budget, setBudget }) {
  const [n, setN] = useState('')
  const [notas, setNotas] = useState('')
  useEffect(() => { if (open) { setN(`Rev ${(budget.revision||1)+1}`); setNotas('') } }, [open])
  if (!open) return null
  const guardar = () => {
    const v = { id: uid(), nombre: n, notas, fecha: new Date().toISOString(), revision: (budget.revision||1)+1 }
    setBudget({ ...budget, revision: v.revision, versiones: [...(budget.versiones||[]), v], ultimaEdicion: 'ahora' })
    onClose(); alert(`Versión "${n}" guardada como Rev ${v.revision}.`)
  }
  return (
    <Modal open={open} onClose={onClose} title="Guardar versión" size="sm"
      footer={<>
        <button onClick={onClose} className="px-3 py-2 bg-white border rounded-lg text-sm">Cancelar</button>
        <button onClick={guardar} disabled={!n.trim()} className="px-3 py-2 bg-amber-500 disabled:opacity-40 text-slate-900 rounded-lg text-sm font-bold">💾 Guardar</button>
      </>}>
      <div className="space-y-3">
        <div><label className="block text-xs font-semibold mb-1">Nombre *</label><input value={n} onChange={e=>setN(e.target.value)} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-400" /></div>
        <div><label className="block text-xs font-semibold mb-1">Notas (opcional)</label><textarea value={notas} onChange={e=>setNotas(e.target.value)} rows="3" className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-400" /></div>
        {(budget.versiones||[]).length > 0 && (
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Historial</div>
            <div className="max-h-32 overflow-y-auto border rounded-lg divide-y">
              {[...(budget.versiones||[])].reverse().map(v=>(
                <div key={v.id} className="px-3 py-2 text-sm flex justify-between">
                  <div><div className="font-medium">{v.nombre}</div><div className="text-xs text-gray-500">{new Date(v.fecha).toLocaleString()}</div></div>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">Rev {v.revision}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function ConfigProyectoModal({ open, onClose, budget, setBudget }) {
  const [form, setForm] = useState(budget)
  useEffect(() => { if (open) setForm(budget) }, [open])
  if (!open) return null
  const F = ({ label, k, type='text' }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input type={type} value={form[k]||''} onChange={e=>setForm({...form,[k]:type==='number'?parseFloat(e.target.value)||0:e.target.value})}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-400" />
    </div>
  )
  const handleLogo = (e, k) => { const f=e.target.files&&e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>setForm({...form,[k]:ev.target.result}); r.readAsDataURL(f) }
  return (
    <Modal open={open} onClose={onClose} title="Configuración del Proyecto" size="lg"
      footer={<>
        <button onClick={onClose} className="px-4 py-2 bg-white border rounded-lg text-sm">Cancelar</button>
        <button onClick={() => { setBudget(form); onClose() }} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg text-sm font-bold">Guardar</button>
      </>}>
      <div className="space-y-5">
        <div><h4 className="font-bold text-sm text-slate-900 mb-3">Datos generales</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <F label="Nombre del proyecto" k="nombreProyecto" />
            <F label="Tipo (Residencial, Comercial…)" k="tipo" />
            <F label="Realizado por" k="realizadoPor" />
            <F label="Fecha" k="fecha" type="date" />
          </div>
        </div>
        <div><h4 className="font-bold text-sm text-slate-900 mb-3">Partes involucradas</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <F label="Cotizante" k="cotizante" />
            <F label="Ofertante" k="ofertante" />
            <F label="Cliente" k="cliente" />
            <F label="Ubicación" k="lugar" />
          </div>
        </div>
        <div><h4 className="font-bold text-sm text-slate-900 mb-3">Económico</h4>
          <div className="grid md:grid-cols-3 gap-3">
            <F label="Moneda" k="moneda" />
            <F label="Revisión" k="revision" type="number" />
          </div>
        </div>
        <div><h4 className="font-bold text-sm text-slate-900 mb-3">Logos</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {[['logoOfertante','Logo Ofertante'],['logoCliente','Logo Cliente']].map(([k,lbl])=>(
              <div key={k}>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{lbl}</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 flex items-center gap-3">
                  {form[k] ? <img src={form[k]} alt={lbl} className="w-20 h-20 object-contain" /> : <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">Sin logo</div>}
                  <div className="flex-1">
                    <input type="file" accept="image/*" onChange={e=>handleLogo(e,k)} className="block text-xs w-full" />
                    {form[k] && <button onClick={()=>setForm({...form,[k]:null})} className="text-xs text-red-600 mt-2">Quitar</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ParametrosGlobales({ budget, setBudget }) {
  const [d, setD] = useState({ pctIndirectos:budget.pctIndirectos, pctImprevistos:budget.pctImprevistos, pctUtilidad:budget.pctUtilidad, pctImpuesto:budget.pctImpuesto })
  useEffect(() => { setD({ pctIndirectos:budget.pctIndirectos, pctImprevistos:budget.pctImprevistos, pctUtilidad:budget.pctUtilidad, pctImpuesto:budget.pctImpuesto }) }, [budget.id])
  const dirty = d.pctIndirectos!==budget.pctIndirectos || d.pctImprevistos!==budget.pctImprevistos || d.pctUtilidad!==budget.pctUtilidad || d.pctImpuesto!==budget.pctImpuesto
  const Pct = ({ label, k }) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center bg-gray-50 border rounded-lg overflow-hidden">
        <input type="number" step="any" value={d[k]} onChange={e=>setD({...d,[k]:parseFloat(e.target.value)||0})} className="w-14 px-2 py-1 bg-transparent text-right outline-none" />
        <span className="text-xs text-gray-500 px-2 border-l">%</span>
      </div>
    </label>
  )
  return (
    <div className={`rounded-2xl p-4 mb-6 flex flex-wrap gap-5 items-center border ${dirty ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}>
      <span className="font-semibold text-slate-900 text-sm">Parámetros globales</span>
      <Pct label="Indirectos"  k="pctIndirectos" />
      <Pct label="Imprevistos" k="pctImprevistos" />
      <Pct label="Utilidad"    k="pctUtilidad" />
      <Pct label="Impuesto"    k="pctImpuesto" />
      <div className="ml-auto flex gap-2">
        <button onClick={()=>setD({pctIndirectos:budget.pctIndirectos,pctImprevistos:budget.pctImprevistos,pctUtilidad:budget.pctUtilidad,pctImpuesto:budget.pctImpuesto})} disabled={!dirty} className="px-3 py-1.5 bg-white border rounded-lg text-sm disabled:opacity-40">Cancelar</button>
        <button onClick={()=>setBudget({...budget,...d})} disabled={!dirty} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${dirty?'bg-amber-500 hover:bg-amber-600 text-slate-900':'bg-emerald-100 text-emerald-700'}`}>{dirty?'💾 Guardar':'✓ Guardado'}</button>
      </div>
    </div>
  )
}

function PresupuestoTableComp({ budget, setBudget, onOpenFicha, params }) {
  const upd = (path, fld, v) => {
    const its = JSON.parse(JSON.stringify(budget.items))
    let cur = its; for(let i=0;i<path.length-1;i++) cur=cur[path[i]].children
    cur[path[path.length-1]][fld]=v; setBudget({...budget,items:its})
  }
  const add = (path, tipo) => {
    const its = JSON.parse(JSON.stringify(budget.items))
    if(!path.length){ its.push({id:String(its.length+1),tipo:'capitulo',descripcion:'Nuevo Capítulo',children:[]}); setBudget({...budget,items:its}); return }
    let cur=its; for(let i=0;i<path.length-1;i++) cur=cur[path[i]].children
    const par=cur[path[path.length-1]]; const ci=(par.children||[]).length+1
    const nid=tipo==='actividad'?par.id+'.'+String(ci).padStart(2,'0'):par.id+'.'+ci
    const ni=tipo==='actividad'?{id:nid,tipo:'actividad',descripcion:'Nueva actividad',unidad:'und',cantidad:1,ficha:{materiales:[],manoObra:[],herramientaEquipo:[],subcontratos:[]}}:{id:nid,tipo:'subcapitulo',descripcion:'Nuevo Sub-capítulo',children:[]}
    par.children=[...(par.children||[]),ni]; setBudget({...budget,items:its})
  }
  const del = path => {
    if(!confirm('¿Eliminar este elemento?')) return
    const its=JSON.parse(JSON.stringify(budget.items))
    if(path.length===1) its.splice(path[0],1)
    else { let cur=its; for(let i=0;i<path.length-1;i++) cur=cur[path[i]].children; cur.splice(path[path.length-1],1) }
    setBudget({...budget,items:its})
  }
  const rows=[]
  const render=(its,path=[],d=0)=>{
    its.forEach((it,idx)=>{
      const cp=[...path,idx]; const c=calcItem(it,budget.catalogos,params); const ind=d*16
      if(it.tipo==='capitulo'){
        rows.push(<tr key={it.id} className="bg-slate-900 text-white">
          <td className="px-3 py-2.5 font-bold text-amber-400">{it.id}</td>
          <td className="px-2 py-2.5" style={{paddingLeft:8+ind}}><input value={it.descripcion} onChange={e=>upd(cp,'descripcion',e.target.value)} className="bg-transparent w-full font-bold focus:bg-white/10 px-1 rounded outline-none" /></td>
          <td colSpan="3"></td>
          <td className="px-2 py-2.5 text-right font-bold">{money(c.subtotal)}</td>
          <td className="px-1 py-1 text-center whitespace-nowrap">
            <button onClick={()=>add(cp,'subcapitulo')} className="text-xs bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 mr-1">+Sub</button>
            <button onClick={()=>add(cp,'actividad')} className="text-xs bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 mr-1">+Act</button>
            <button onClick={()=>del(cp)} className="text-xs bg-red-500/30 hover:bg-red-500/50 rounded px-1.5 py-0.5">×</button>
          </td>
        </tr>)
        if(it.children?.length) render(it.children,cp,d+1)
        rows.push(<tr key={it.id+'-tot'} className="bg-gray-50 font-semibold border-b">
          <td></td><td className="px-2 py-1.5 text-sm italic text-gray-600" style={{paddingLeft:8+ind}}>SUBTOTAL Cap. {it.id}</td>
          <td colSpan="3"></td><td className="px-2 py-1.5 text-right">{money(c.subtotal)}</td><td></td>
        </tr>)
      } else if(it.tipo==='subcapitulo'){
        rows.push(<tr key={it.id} className="bg-slate-700 text-white">
          <td className="px-3 py-2 font-semibold text-amber-300">{it.id}</td>
          <td className="px-2 py-2" style={{paddingLeft:8+ind}}><input value={it.descripcion} onChange={e=>upd(cp,'descripcion',e.target.value)} className="bg-transparent w-full font-semibold focus:bg-white/10 px-1 rounded outline-none" /></td>
          <td colSpan="3"></td>
          <td className="px-2 py-2 text-right font-semibold">{money(c.subtotal)}</td>
          <td className="px-1 py-1 text-center whitespace-nowrap">
            <button onClick={()=>add(cp,'actividad')} className="text-xs bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 mr-1">+Act</button>
            <button onClick={()=>del(cp)} className="text-xs bg-red-500/30 hover:bg-red-500/50 rounded px-1.5 py-0.5">×</button>
          </td>
        </tr>)
        if(it.children?.length) render(it.children,cp,d+1)
      } else {
        rows.push(<tr key={it.id} className="bg-white hover:bg-amber-50/40 border-b border-gray-100">
          <td className="px-3 py-2 text-xs text-gray-500 font-mono">{it.id}</td>
          <td className="px-2 py-2" style={{paddingLeft:8+ind}}><input value={it.descripcion} onChange={e=>upd(cp,'descripcion',e.target.value)} className="w-full text-sm focus:bg-amber-50 px-1 rounded outline-none" /></td>
          <td><input value={it.unidad} onChange={e=>upd(cp,'unidad',e.target.value)} className="w-16 text-center text-sm focus:bg-amber-50 px-1 rounded outline-none" /></td>
          <td><input type="number" step="any" value={it.cantidad} onChange={e=>upd(cp,'cantidad',parseFloat(e.target.value)||0)} className="w-20 text-right text-sm focus:bg-amber-50 px-1 rounded outline-none" /></td>
          <td className="px-2 py-2 text-right text-sm cursor-pointer" onDoubleClick={()=>onOpenFicha(cp)} title="Doble clic para abrir ficha">
            <span className="font-medium">{money(c.precioUnitario)}</span><span className="ml-1 text-amber-500 text-xs">✦</span>
          </td>
          <td className="px-2 py-2 text-right text-sm font-semibold">{money(c.subtotal)}</td>
          <td className="px-1 py-1 text-center"><button onClick={()=>del(cp)} className="text-xs text-red-500 hover:text-red-700">🗑️</button></td>
        </tr>)
      }
    })
  }
  render(budget.items,[],0)
  const total=round2(budget.items.reduce((s,it)=>s+calcItem(it,budget.catalogos,params).subtotal,0))
  return (
    <Fragment>
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-sm" style={{minWidth:900}}>
          <thead><tr className="bg-gray-50 border-b-2">
            <th className="px-3 py-2.5 text-left w-20 text-xs uppercase text-gray-600">ID</th>
            <th className="px-2 py-2.5 text-left text-xs uppercase text-gray-600">Descripción</th>
            <th className="px-2 py-2.5 w-20 text-xs uppercase text-gray-600">Unidad</th>
            <th className="px-2 py-2.5 w-24 text-xs uppercase text-gray-600">Cantidad</th>
            <th className="px-2 py-2.5 w-28 text-xs uppercase text-gray-600">P. Unitario</th>
            <th className="px-2 py-2.5 w-32 text-xs uppercase text-gray-600">Subtotal</th>
            <th className="px-2 py-2.5 w-32 text-xs uppercase text-gray-600">Acciones</th>
          </tr></thead>
          <tbody>
            {rows}
            <tr className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
              <td colSpan="5" className="px-3 py-4 text-right font-bold text-sm uppercase">Total General</td>
              <td className="px-3 py-4 text-right font-bold text-2xl text-amber-400">{money(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t bg-gray-50 flex justify-between items-center">
        <button onClick={()=>add([],'capitulo')} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800">+ Agregar Capítulo</button>
        <span className="text-xs text-gray-500">✦ Doble clic en P. UNITARIO para abrir la ficha</span>
      </div>
    </Fragment>
  )
}

function CatalogoView({ budget, setBudget, categoria }) {
  const list = budget.catalogos[categoria.key] || []
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ codigo:'', descripcion:'', unidad:'und', costoBase:0, proveedor:'', notas:'' })
  const [editId, setEditId] = useState(null)
  const filtered = list.filter(i => !q || normalize(i.descripcion).includes(normalize(q)) || normalize(i.codigo).includes(normalize(q)))
  const usagesOf = id => { let c=0; const walk=its=>{for(const it of its){if(it.tipo==='actividad'){for(const x of it.ficha[categoria.key]||[])if(x.insumoId===id)c++}else if(it.children)walk(it.children)}}; walk(budget.items); return c }
  const submit = e => {
    e.preventDefault(); const desc=form.descripcion.trim(); if(!desc) return alert('Descripción obligatoria.')
    const n=normalize(desc); const dup=list.find(i=>normalize(i.descripcion)===n&&i.id!==editId)
    if(dup) return alert(`Ya existe: "${dup.descripcion}".`)
    const nc={...budget.catalogos}
    if(editId) nc[categoria.key]=list.map(i=>i.id===editId?{...i,...form,descripcion:desc,costoBase:+form.costoBase||0}:i)
    else nc[categoria.key]=[...list,{id:uid(),...form,descripcion:desc,costoBase:+form.costoBase||0}]
    setBudget({...budget,catalogos:nc}); setShowForm(false); setEditId(null); setForm({codigo:'',descripcion:'',unidad:'und',costoBase:0,proveedor:'',notas:''})
  }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b flex justify-between items-center flex-wrap gap-3">
        <h2 className="font-bold text-slate-900">{categoria.icon} Lista de {categoria.label}</h2>
        <div className="flex gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…" className="px-3 py-1.5 bg-gray-50 border rounded-lg text-sm outline-none" />
          <button onClick={()=>{setShowForm(true);setEditId(null);setForm({codigo:'',descripcion:'',unidad:'und',costoBase:0,proveedor:'',notas:''})}} className="bg-amber-500 hover:bg-amber-600 text-slate-900 px-3 py-1.5 rounded-lg text-sm font-bold">+ Nuevo</button>
        </div>
      </div>
      {showForm && (
        <form onSubmit={submit} className="bg-amber-50 border-b border-amber-200 p-4 grid md:grid-cols-6 gap-3 text-sm">
          <div><label className="text-xs font-semibold">Código</label><input value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value})} className="w-full border rounded-lg px-3 py-1.5 mt-0.5 outline-none focus:ring-2 focus:ring-amber-400" /></div>
          <div className="md:col-span-2"><label className="text-xs font-semibold">Descripción *</label><input required value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} className="w-full border rounded-lg px-3 py-1.5 mt-0.5 outline-none focus:ring-2 focus:ring-amber-400" /></div>
          <div><label className="text-xs font-semibold">Unidad</label><input value={form.unidad} onChange={e=>setForm({...form,unidad:e.target.value})} className="w-full border rounded-lg px-3 py-1.5 mt-0.5 outline-none focus:ring-2 focus:ring-amber-400" /></div>
          <div><label className="text-xs font-semibold">Precio Base</label><input type="number" step="any" value={form.costoBase} onChange={e=>setForm({...form,costoBase:e.target.value})} className="w-full border rounded-lg px-3 py-1.5 mt-0.5 text-right outline-none focus:ring-2 focus:ring-amber-400" /></div>
          <div><label className="text-xs font-semibold">Proveedor</label><input value={form.proveedor} onChange={e=>setForm({...form,proveedor:e.target.value})} className="w-full border rounded-lg px-3 py-1.5 mt-0.5 outline-none focus:ring-2 focus:ring-amber-400" /></div>
          <div className="md:col-span-6 flex justify-end gap-2">
            <button type="button" onClick={()=>{setShowForm(false);setEditId(null)}} className="px-3 py-1.5 bg-white border rounded-lg text-sm">Cancelar</button>
            <button type="submit" className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium">{editId?'Actualizar':'Agregar'}</button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b-2"><tr>
            <th className="px-3 py-2.5 text-left w-24 text-xs uppercase text-gray-600">Código</th>
            <th className="px-3 py-2.5 text-left text-xs uppercase text-gray-600">Descripción</th>
            <th className="px-3 py-2.5 w-20 text-xs uppercase text-gray-600">Unidad</th>
            <th className="px-3 py-2.5 w-28 text-right text-xs uppercase text-gray-600">Precio Base</th>
            <th className="px-3 py-2.5 w-32 text-xs uppercase text-gray-600">Proveedor</th>
            <th className="px-3 py-2.5 w-16 text-right text-xs uppercase text-gray-600">Uso</th>
            <th className="px-3 py-2.5 w-28 text-xs uppercase text-gray-600">Acciones</th>
          </tr></thead>
          <tbody>
            {!filtered.length && <tr><td colSpan="7" className="text-center py-8 text-gray-400">{!list.length ? `Sin ${categoria.label.toLowerCase()} aún.` : 'Sin coincidencias.'}</td></tr>}
            {filtered.map(i => {
              const u=usagesOf(i.id)
              return (
                <tr key={i.id} className="hover:bg-amber-50/30 border-b">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{i.codigo}</td>
                  <td className="px-3 py-2 font-medium">{i.descripcion}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{i.unidad}</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(i.costoBase)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{i.proveedor||'—'}</td>
                  <td className="px-3 py-2 text-right"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u>0?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-500'}`}>{u}</span></td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <button onClick={()=>{setForm({codigo:i.codigo||'',descripcion:i.descripcion,unidad:i.unidad,costoBase:i.costoBase,proveedor:i.proveedor||'',notas:i.notas||''});setEditId(i.id);setShowForm(true)}} className="text-xs text-slate-700 mr-2">✎ Editar</button>
                    <button onClick={()=>{if(u>0)return alert(`No se puede eliminar: usado en ${u} ficha(s).`);if(!confirm(`¿Eliminar "${i.descripcion}"?`))return;setBudget({...budget,catalogos:{...budget.catalogos,[categoria.key]:list.filter(x=>x.id!==i.id)}})}} className="text-xs text-red-500">🗑️</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`rounded-2xl p-5 border ${accent ? 'bg-slate-900 text-white border-slate-800' : 'bg-white border-gray-200'}`}>
      <div className={`text-xs uppercase tracking-widest font-semibold mb-3 ${accent ? 'text-slate-300' : 'text-gray-500'}`}>{label}</div>
      <div className={`text-3xl font-bold ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</div>
      <div className={`mt-3 text-xs ${accent ? 'text-slate-400' : 'text-gray-500'}`}>{sub}</div>
    </div>
  )
}

function InicioPage({ proyectos, openProject, addProject, userName }) {
  const h = new Date().getHours()
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  const total   = proyectos.reduce((s, p) => s + calcKPIs(p).total, 0)
  const activos = proyectos.filter(p => p.estado === 'Activo').length
  const enRev   = proyectos.filter(p => p.estado === 'En revisión').length
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-2 text-gray-500">{saludo},</div>
      <h1 className="text-5xl font-bold tracking-tight mb-2">{userName} 👋</h1>
      <div className="text-gray-600 mb-8">
        Tenés <span className="font-semibold text-slate-900">{activos} proyecto{activos!==1?'s':''} activo{activos!==1?'s':''}</span>
        {enRev > 0 && <Fragment> y <span className="font-semibold text-amber-600">{enRev} en revisión</span></Fragment>}.
      </div>
      <div className="grid md:grid-cols-4 gap-4 mb-10">
        <StatCard label="Valor total cartera" value={moneyK(total)} sub={`Suma de ${proyectos.length} proyecto${proyectos.length!==1?'s':''}`} accent />
        <StatCard label="Proyectos activos"   value={activos}       sub="esta semana" />
        <StatCard label="En revisión"          value={enRev}         sub="Pendientes de aprobación" />
        <StatCard label="Total proyectos"      value={proyectos.length} sub="en tu cuenta" />
      </div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg">Continuar trabajando</h2>
        <button onClick={addProject} className="px-4 py-2 bg-[#1e72d8] hover:bg-[#1558b0] text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>Nuevo Proyecto</button>
      </div>
      <div className="space-y-3">
        {proyectos.slice(0,5).map(p => {
          const k=calcKPIs(p)
          return (
            <div key={p.id} onClick={()=>openProject(p)} className="bg-white border border-gray-200 hover:border-[#1e72d8] hover:shadow-md cursor-pointer rounded-2xl p-4 flex items-center gap-4 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">📄</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.estado==='Activo'?'bg-emerald-50 text-emerald-700':p.estado==='En revisión'?'bg-amber-50 text-amber-700':'bg-gray-100 text-gray-600'}`}>{p.estado}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">Rev {p.revision}</span>
                  <span className="text-xs text-gray-400">{p.ultimaEdicion}</span>
                </div>
                <div className="font-semibold truncate">{p.nombreProyecto}</div>
                <div className="text-xs text-gray-500 truncate">{p.cliente} · {p.lugar}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase">Total</div>
                <div className="font-bold">{money(k.total)}</div>
              </div>
            </div>
          )
        })}
        {!proyectos.length && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-4">📋</div>
            <div className="font-medium mb-2">No tenés proyectos aún</div>
            <button onClick={addProject} className="mt-2 px-5 py-2 bg-[#1e72d8] hover:bg-[#1558b0] text-white rounded-xl font-bold text-sm transition-colors">Crear primer proyecto</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ProyectosPage({ proyectos, openProject, addProject, deleteProject }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState('Todos')
  const list = proyectos.filter(p => (f==='Todos'||p.estado===f) && (!q||normalize(p.nombreProyecto).includes(normalize(q))||normalize(p.cliente).includes(normalize(q))))
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#0d1b2e]">Proyectos</h1>
          <div className="text-gray-400 mt-1">{proyectos.length} en total</div>
        </div>
        <button onClick={addProject} className="px-4 py-2.5 bg-[#1e72d8] hover:bg-[#1558b0] text-white rounded-xl font-bold flex items-center gap-2 shadow-sm transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Nuevo Proyecto
        </button>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 flex flex-wrap gap-3 shadow-sm">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar proyectos…" className="flex-1 min-w-[240px] px-4 py-2 bg-gray-50 border rounded-lg text-sm outline-none focus:bg-white focus:border-[#1e72d8] focus:ring-1 focus:ring-[#1e72d8]/30 transition-all" />
        <div className="flex gap-1.5">
          {['Todos','Activo','En revisión','Borrador'].map(e=>(
            <button key={e} onClick={()=>setF(e)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${f===e?'bg-[#0d1b2e] text-white shadow-sm':'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}>{e}</button>
          ))}
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(p => {
          const k=calcKPIs(p)
          return (
            <div key={p.id} className="bg-white border border-gray-200 hover:border-[#1e72d8] hover:shadow-lg rounded-2xl p-5 transition-all group relative">
              {/* Delete button */}
              <button
                onClick={e => { e.stopPropagation(); deleteProject(p.id, p.nombreProyecto) }}
                className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-gray-100 hover:bg-rose-100 text-gray-400 hover:text-rose-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                title="Eliminar proyecto"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
              <div onClick={()=>openProject(p)} className="cursor-pointer">
                <div className="flex items-center gap-2 mb-3 flex-wrap pr-6">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">{p.tipo}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.estado==='Activo'?'bg-emerald-50 text-emerald-700 border border-emerald-100':p.estado==='En revisión'?'bg-amber-50 text-amber-700 border border-amber-100':'bg-slate-100 text-slate-600 border border-slate-200'}`}>{p.estado}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">Rev {p.revision}</span>
                </div>
                <h3 className="font-bold text-[#0d1b2e] mb-1.5 truncate text-base">{p.nombreProyecto}</h3>
                <div className="text-sm text-gray-500 mb-1 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>
                  {p.cliente||'—'}
                </div>
                <div className="text-xs text-gray-400 mb-4 flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-gray-300"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  {p.lugar||'—'}
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between items-end">
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-0.5">Total</div>
                    <div className="font-bold text-xl text-[#0d1b2e]">{money(k.total)}</div>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <div className="font-medium">{k.nCapitulos} cap.</div>
                    <div>{k.nActividades} act.</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {!list.length && (
          <div className="md:col-span-3 text-center py-16">
            <div className="text-gray-300 text-5xl mb-4">📁</div>
            <div className="text-gray-400 font-medium">Sin proyectos que coincidan</div>
            <div className="text-gray-300 text-sm mt-1">Intenta con otro filtro o búsqueda</div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlantillasPage() {
  const tipos=[
    {k:'presupuesto',label:'Presupuesto',icon:'📄',desc:'Estructura jerárquica completa.'},
    {k:'materiales',label:'Lista Materiales',icon:'🧱',desc:'Catálogo con código, descripción, precio.'},
    {k:'manoObra',label:'Lista Mano de Obra',icon:'👷',desc:'Catálogo de operarios y especialidades.'},
    {k:'herramientaEquipo',label:'Lista Herramientas/Equipo',icon:'🔧',desc:'Herramienta menor, equipo, maquinaria.'},
    {k:'subcontratos',label:'Lista Subcontratos',icon:'🏢',desc:'Servicios contratados a terceros.'},
  ]
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold flex items-center gap-3">📚 Plantillas</h1>
      <p className="text-gray-600 mt-2">Descargá las plantillas en Excel para importar tus datos rápido.</p>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {tipos.map(t=>(
          <div key={t.k} className="bg-white border rounded-2xl p-5 hover:shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-3 text-2xl">{t.icon}</div>
            <h3 className="font-bold">{t.label}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">{t.desc}</p>
            <button onClick={()=>exportPlantilla(t.k)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold">📥 Descargar plantilla</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanesPage() {
  const planes=[
    {name:'Básico',m:9.99,y:99,f:['5 proyectos','Fichas ilimitadas','Exportación PDF','Soporte email']},
    {name:'Profesional',m:24.99,y:249,pop:true,f:['Proyectos ilimitados','PDF + Excel','Plantillas','Logo personalizado','Soporte prioritario']},
    {name:'Empresarial',m:49.99,y:499,f:['Todo Profesional','Multi-usuario (5)','API','Onboarding','SLA 99.9%']},
  ]
  const [b,setB]=useState('m')
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Planes y Facturación</h1>
        <div className="inline-flex bg-white border rounded-full p-1 mt-4">
          <button onClick={()=>setB('m')} className={`px-4 py-1.5 rounded-full text-sm ${b==='m'?'bg-slate-900 text-white':'text-gray-600'}`}>Mensual</button>
          <button onClick={()=>setB('y')} className={`px-4 py-1.5 rounded-full text-sm ${b==='y'?'bg-slate-900 text-white':'text-gray-600'}`}>Anual (-20%)</button>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {planes.map(p=>(
          <div key={p.name} className={`bg-white rounded-2xl border-2 p-6 ${p.pop?'border-amber-400 ring-2 ring-amber-200':'border-gray-200'}`}>
            {p.pop&&<div className="text-xs font-bold text-amber-600 mb-2">⭐ MÁS POPULAR</div>}
            <h3 className="font-bold text-lg">{p.name}</h3>
            <div className="my-3"><span className="text-4xl font-bold">${b==='m'?p.m:p.y}</span><span className="text-gray-500 text-sm">/{b==='m'?'mes':'año'}</span></div>
            <ul className="space-y-2 text-sm mb-6">{p.f.map(x=><li key={x}>✓ {x}</li>)}</ul>
            <button className="w-full bg-slate-900 text-white py-2 rounded-lg font-bold">Contratar</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ MAIN APP ============
export default function MainApp() {
  const { user, profile, signOut } = useAuth()
  const nav = useNavigate()
  const [proyectos, setProyectos] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [page, setPage] = useState('inicio')
  const [tabProject, setTabProject] = useState('presupuesto')
  const [fichaPath, setFichaPath] = useState(null)
  const [search, setSearch] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [showVersion, setShowVersion] = useState(false)
  const [showRango, setShowRango] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const importCtx = useRef(null)
  const savingRef = useRef(false)

  const userName   = profile?.full_name   || user?.email?.split('@')[0] || 'Usuario'
  const userEmpresa = profile?.company_name || ''

  // Cargar presupuestos
  useEffect(() => {
    if (!user) return
    supabase.from('presupuestos').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      .then(({ data }) => {
        const ps = (data || []).map(mapDb)
        setProyectos(ps)
        setLoadingData(false)
      })
  }, [user])

  const budget = useMemo(() => proyectos.find(p => p.id === activeId) || null, [proyectos, activeId])
  const setBudget = b => setProyectos(ps => ps.map(p => p.id === b.id ? b : p))

  // Auto-guardado con debounce
  useEffect(() => {
    if (!budget || loadingData) return
    const t = setTimeout(async () => {
      if (savingRef.current) return
      savingRef.current = true
      setSaving(true)
      await supabase.from('presupuestos').update(toDb(budget)).eq('id', budget.id)
      setSaving(false)
      savingRef.current = false
    }, 1400)
    return () => clearTimeout(t)
  }, [budget])

  const params = useMemo(() => budget
    ? { pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad, pctImpuesto: budget.pctImpuesto }
    : { pctIndirectos: 10, pctImprevistos: 1, pctUtilidad: 8, pctImpuesto: 15 }
  , [budget])

  const fichaActividad = useMemo(() => {
    if (!fichaPath || !budget) return null
    let cur = budget.items, it = null
    for (let i = 0; i < fichaPath.length; i++) { it = cur[fichaPath[i]]; if (i < fichaPath.length - 1) cur = it.children }
    return it
  }, [fichaPath, budget])

  const updFicha = na => {
    if (!fichaPath) return
    const its = JSON.parse(JSON.stringify(budget.items))
    let cur = its
    for (let i = 0; i < fichaPath.length - 1; i++) cur = cur[fichaPath[i]].children
    cur[fichaPath[fichaPath.length - 1]] = na
    setBudget({ ...budget, items: its })
  }

  const triggerImport = kind => { importCtx.current = kind; fileRef.current.click() }
  const handleImport = e => {
    const f = e.target.files?.[0]
    if (!f || !budget) return
    const k = importCtx.current
    if (k === 'presupuesto') importExcelPresupuesto(f, budget, setBudget)
    else if (k?.startsWith('cat-')) importExcelCatalogo(f, budget, setBudget, k.slice(4))
    e.target.value = ''
  }

  const openProject = p => { setActiveId(p.id); setPage('proyecto'); setTabProject('presupuesto') }

  const deleteProject = async (id, nombre) => {
    if (!confirm(`¿Eliminar el proyecto "${nombre}"?\n\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('presupuestos').delete().eq('id', id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    setProyectos(ps => ps.filter(p => p.id !== id))
    if (activeId === id) { setActiveId(null); setPage('proyectos') }
  }

  const addProject = async () => {
    const { data } = await supabase.from('presupuestos').insert({
      user_id:        user.id,
      nombre_proyecto:'Nuevo Proyecto',
      cotizante:      userEmpresa,
      cliente:        '',
      lugar:          '',
      pct_indirectos:  10,
      pct_imprevistos:  1,
      pct_utilidad:    8,
      pct_impuesto:   15,
      catalogos_json: { ...EMPTY_CATALOGOS },
      items_json:     [],
      estado:         'borrador',
    }).select().single()
    if (data) {
      const nb = mapDb(data)
      setProyectos(ps => [nb, ...ps])
      setActiveId(nb.id); setPage('proyecto'); setTabProject('presupuesto')
    }
  }

  const searchResults = useMemo(() => {
    if (!search.trim() || search.length < 2) return null
    const q = normalize(search)
    const proys = proyectos.filter(p => normalize(p.nombreProyecto).includes(q) || normalize(p.cliente).includes(q))
    const acts = [], insumos = []
    if (budget) {
      const walk = its => its.forEach(it => { if (it.tipo==='actividad'&&(normalize(it.descripcion).includes(q)||it.id.includes(q))) acts.push(it); else if (it.children) walk(it.children) })
      walk(budget.items)
      CATEGORIAS.forEach(cat => (budget.catalogos[cat.key]||[]).forEach(i => { if (normalize(i.descripcion).includes(q)||normalize(i.codigo).includes(q)) insumos.push({...i,catLabel:cat.label,catKey:cat.key}) }))
    }
    return { proys, acts, insumos }
  }, [search, proyectos, budget])

  const doLogout = () => { signOut(); nav('/login') }

  // ---- LOADING ----
  if (loadingData) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0d1b2e',color:'#60b0ff'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:48,height:48,border:'4px solid #1a3a6e',borderTopColor:'#1e72d8',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 16px'}}></div>
        <div style={{fontSize:20,fontWeight:800,letterSpacing:2}}>ARROW BUDGET</div>
        <div style={{fontSize:12,color:'#94a3b8',marginTop:8}}>Cargando…</div>
      </div>
    </div>
  )

  // ---- BREADCRUMBS ----
  let crumbs = ['Inicio']
  if (page==='proyectos') crumbs=['Proyectos']
  else if (page==='proyecto'&&budget) crumbs=['Proyectos', budget.nombreProyecto]
  else if (page==='plantillas') crumbs=['Plantillas']
  else if (page==='planes') crumbs=['Planes']

  const tabToCat = { 'cat-mat':'materiales', 'cat-mo':'manoObra', 'cat-he':'herramientaEquipo', 'cat-sub':'subcontratos' }
  const tabsP = budget ? [
    { k:'presupuesto', label:'Presupuesto',         icon:'📄', badge:calcKPIs(budget).nActividades },
    { k:'cat-mat',     label:'Lista Materiales',    icon:'🧱', badge:(budget.catalogos.materiales||[]).length },
    { k:'cat-mo',      label:'Lista Mano de Obra',  icon:'👷', badge:(budget.catalogos.manoObra||[]).length },
    { k:'cat-he',      label:'Herramientas/Equipo', icon:'🔧', badge:(budget.catalogos.herramientaEquipo||[]).length },
    { k:'cat-sub',     label:'Subcontratos',        icon:'🏢', badge:(budget.catalogos.subcontratos||[]).length },
  ] : []

  return (
    <div className="flex min-h-screen">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Sidebar
        page={page} setPage={setPage}
        projectActivo={page==='proyecto' ? budget : null}
        setTabProject={setTabProject} tabProject={tabProject}
        user={{ name: userName, empresa: userEmpresa }}
        onLogout={doLogout}
        projectsCount={proyectos.length}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          crumbs={crumbs} search={search} setSearch={setSearch}
          onHome={() => setPage('inicio')}
          searchResults={searchResults}
          onResultPick={(kind, item) => {
            setSearch('')
            if (kind==='proy') openProject(item)
            else if (kind==='act') { const path=findPathById(budget.items,item.id); if(path){setPage('proyecto');setTabProject('presupuesto');setFichaPath(path)} }
            else if (kind==='ins') { setPage('proyecto'); const tab=Object.keys(tabToCat).find(k=>tabToCat[k]===item.catKey); if(tab) setTabProject(tab) }
          }}
          notifNode={null}
          settingsNode={<SettingsPopover user={{name:userName,email:user?.email}} onLogout={doLogout} onConfig={()=>budget&&setShowConfig(true)} onPlanes={()=>setPage('planes')} />}
          saving={saving}
        />

        {page==='inicio'     && <InicioPage    proyectos={proyectos} openProject={openProject} addProject={addProject} userName={userName} />}
        {page==='proyectos'  && <ProyectosPage proyectos={proyectos} openProject={openProject} addProject={addProject} deleteProject={deleteProject} />}
        {page==='plantillas' && <PlantillasPage />}
        {page==='planes'     && <PlanesPage />}

        {page==='proyecto' && budget && (
          <div className="p-8 max-w-7xl mx-auto w-full">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700">{budget.tipo}</span>
                <EstadoMenu budget={budget} setBudget={setBudget} />
                <span className="text-xs bg-gray-100 px-2.5 py-1 rounded-full">Rev {budget.revision}</span>
                <span className="text-xs bg-gray-100 px-2.5 py-1 rounded-full">$ {budget.moneda}</span>
                <button onClick={() => setShowConfig(true)} className="text-xs bg-slate-900 text-white px-2.5 py-1 rounded-full hover:bg-slate-800">⚙️ Configuración</button>
              </div>
              <h1 className="text-4xl font-bold tracking-tight">{budget.nombreProyecto}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 flex-wrap">
                <span>🏢 {budget.cliente||'—'}</span>
                <span>📍 {budget.lugar||'—'}</span>
                <span>📅 {budget.fecha||'—'}</span>
              </div>
              <div className="mt-2 text-xs text-emerald-600">
                {saving ? '● Guardando…' : `● Guardado · ${budget.ultimaEdicion}`}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-5">
              {tabProject==='presupuesto' && <button onClick={() => triggerImport('presupuesto')} className="px-3 py-1.5 bg-white border hover:bg-gray-50 rounded-lg text-sm">📤 Importar Presupuesto (Excel)</button>}
              {tabProject!=='presupuesto' && tabToCat[tabProject] && <button onClick={() => triggerImport('cat-'+tabToCat[tabProject])} className="px-3 py-1.5 bg-white border hover:bg-gray-50 rounded-lg text-sm">📤 Importar {tabsP.find(t=>t.k===tabProject)?.label||''}</button>}
              <input ref={fileRef} type="file" className="hidden" onChange={handleImport} />
              <div className="flex-1"></div>
              <button onClick={() => setShowVersion(true)} className="px-3 py-1.5 bg-white border hover:bg-gray-50 rounded-lg text-sm">💾 Guardar versión</button>
              {tabProject==='presupuesto' && <DescargasMenu budget={budget} params={params} onRangoFichas={() => setShowRango(true)} />}
              {tabProject!=='presupuesto' && tabToCat[tabProject] && <button onClick={() => exportExcelCatalogo(budget,tabToCat[tabProject])} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold">📊 Descargar Excel</button>}
            </div>

            <div className="border-b mb-5 flex overflow-x-auto">
              {tabsP.map(t => (
                <button key={t.k} onClick={() => setTabProject(t.k)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${tabProject===t.k?'border-[#1e72d8] text-[#0d1b2e]':'border-transparent text-gray-400 hover:text-[#0d1b2e]'}`}>
                  <span>{t.icon}</span>{t.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${tabProject===t.k?'bg-amber-100 text-amber-800':'bg-gray-100 text-gray-600'}`}>{t.badge}</span>
                </button>
              ))}
            </div>

            {tabProject==='presupuesto' && <>
              <ParametrosGlobales budget={budget} setBudget={setBudget} />
              <div className="bg-white border rounded-2xl overflow-hidden">
                <PresupuestoTableComp budget={budget} setBudget={setBudget} onOpenFicha={p => setFichaPath(p)} params={params} />
              </div>
            </>}
            {tabProject==='cat-mat' && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[0]} />}
            {tabProject==='cat-mo'  && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[1]} />}
            {tabProject==='cat-he'  && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[2]} />}
            {tabProject==='cat-sub' && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[3]} />}
          </div>
        )}
      </div>

      <FichaCostoModal
        open={!!fichaPath} onClose={() => setFichaPath(null)}
        actividad={fichaActividad} budget={budget}
        catalogos={budget?.catalogos || EMPTY_CATALOGOS}
        params={params} onUpdate={updFicha}
        onUpdateCatalogos={nc => setBudget({ ...budget, catalogos: nc })}
      />
      {budget && <ConfigProyectoModal  open={showConfig}  onClose={() => setShowConfig(false)}  budget={budget} setBudget={setBudget} />}
      {budget && <GuardarVersionDialog open={showVersion} onClose={() => setShowVersion(false)} budget={budget} setBudget={setBudget} />}
      {budget && <RangoFichasDialog    open={showRango}   onClose={() => setShowRango(false)}   budget={budget} params={params} />}
    </div>
  )
}
