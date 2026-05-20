import { calcItem, money } from '../lib/calc'

export default function PresupuestoTable({ budget, setBudget, onOpenFicha }) {
  const ctx = {
    pctIndirectos: budget.pctIndirectos,
    pctImprevistos: budget.pctImprevistos,
    pctUtilidad: budget.pctUtilidad,
  }

  const updateField = (path, field, value) => {
    const items = JSON.parse(JSON.stringify(budget.items))
    let cur = items
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children
    cur[path[path.length - 1]][field] = value
    setBudget({ ...budget, items })
  }

  const addChild = (path, tipo) => {
    const items = JSON.parse(JSON.stringify(budget.items))
    if (path.length === 0) {
      items.push({ id: String(items.length + 1), tipo: 'capitulo', descripcion: 'Nuevo Capítulo', children: [] })
    } else {
      let cur = items
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children
      const parent = cur[path[path.length - 1]]
      const childIdx = (parent.children || []).length + 1
      const newId = tipo === 'actividad'
        ? `${parent.id}.${String(childIdx).padStart(2, '0')}`
        : `${parent.id}.${childIdx}`
      const newItem = tipo === 'actividad'
        ? { id: newId, tipo: 'actividad', descripcion: 'Nueva actividad', unidad: 'und', cantidad: 1,
            ficha: { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] } }
        : { id: newId, tipo: 'subcapitulo', descripcion: 'Nuevo Sub-capítulo', children: [] }
      parent.children = [...(parent.children || []), newItem]
    }
    setBudget({ ...budget, items })
  }

  const deleteItem = (path) => {
    if (!confirm('¿Eliminar este elemento?')) return
    const items = JSON.parse(JSON.stringify(budget.items))
    if (path.length === 1) items.splice(path[0], 1)
    else {
      let cur = items
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children
      cur.splice(path[path.length - 1], 1)
    }
    setBudget({ ...budget, items })
  }

  const renderRows = (items, path = [], depth = 0) => {
    const rows = []
    items.forEach((it, idx) => {
      const curPath = [...path, idx]
      const c = calcItem(it, ctx)
      const indent = depth * 16

      if (it.tipo === 'capitulo') {
        rows.push(
          <tr key={it.id} className="bg-blue-900 text-white">
            <td className="px-2 py-2 font-bold">{it.id}</td>
            <td className="px-2 py-2" style={{ paddingLeft: 8 + indent }}>
              <input value={it.descripcion} onChange={e => updateField(curPath, 'descripcion', e.target.value)}
                className="bg-transparent w-full font-bold focus:outline-none focus:bg-blue-800 px-1" />
            </td>
            <td colSpan="3"></td>
            <td className="px-2 py-2 text-right font-bold">{money(c.subtotal)}</td>
            <td className="px-1 py-1 text-center whitespace-nowrap">
              <button onClick={() => addChild(curPath, 'subcapitulo')} className="text-xs bg-white/20 hover:bg-white/30 rounded px-1.5 py-0.5 mr-1">+Sub</button>
              <button onClick={() => deleteItem(curPath)} className="text-xs bg-red-500/80 hover:bg-red-500 rounded px-1.5 py-0.5">×</button>
            </td>
          </tr>
        )
        if (it.children?.length) rows.push(...renderRows(it.children, curPath, depth + 1))
        rows.push(
          <tr key={it.id + '-tot'} className="bg-slate-200 font-semibold">
            <td></td>
            <td className="px-2 py-1 text-sm italic" style={{ paddingLeft: 8 + indent }}>SUBTOTAL Capítulo {it.id}</td>
            <td colSpan="3"></td>
            <td className="px-2 py-1 text-right">{money(c.subtotal)}</td>
            <td></td>
          </tr>
        )
      } else if (it.tipo === 'subcapitulo') {
        rows.push(
          <tr key={it.id} className="bg-blue-700 text-white">
            <td className="px-2 py-1.5 font-semibold">{it.id}</td>
            <td className="px-2 py-1.5" style={{ paddingLeft: 8 + indent }}>
              <input value={it.descripcion} onChange={e => updateField(curPath, 'descripcion', e.target.value)}
                className="bg-transparent w-full font-semibold focus:outline-none focus:bg-blue-600 px-1" />
            </td>
            <td colSpan="3"></td>
            <td className="px-2 py-1.5 text-right font-semibold">{money(c.subtotal)}</td>
            <td className="px-1 py-1 text-center whitespace-nowrap">
              <button onClick={() => addChild(curPath, 'actividad')} className="text-xs bg-white/20 hover:bg-white/30 rounded px-1.5 py-0.5 mr-1">+Act</button>
              <button onClick={() => deleteItem(curPath)} className="text-xs bg-red-500/80 hover:bg-red-500 rounded px-1.5 py-0.5">×</button>
            </td>
          </tr>
        )
        if (it.children?.length) rows.push(...renderRows(it.children, curPath, depth + 1))
      } else if (it.tipo === 'actividad') {
        rows.push(
          <tr key={it.id} className="bg-white hover:bg-blue-50 border-b border-gray-200">
            <td className="px-2 py-1 text-xs text-gray-600 font-mono">{it.id}</td>
            <td className="px-2 py-1" style={{ paddingLeft: 8 + indent }}>
              <input value={it.descripcion} onChange={e => updateField(curPath, 'descripcion', e.target.value)}
                className="w-full text-sm focus:outline-none focus:bg-yellow-50 px-1" />
            </td>
            <td className="px-1 py-1">
              <input value={it.unidad} onChange={e => updateField(curPath, 'unidad', e.target.value)}
                className="w-16 text-center text-sm focus:outline-none focus:bg-yellow-50 px-1" />
            </td>
            <td className="px-1 py-1">
              <input type="number" step="any" value={it.cantidad}
                onChange={e => updateField(curPath, 'cantidad', parseFloat(e.target.value) || 0)}
                className="w-20 text-right text-sm focus:outline-none focus:bg-yellow-50 px-1" />
            </td>
            <td className="px-2 py-1 text-right text-sm">{money(c.precioUnitario)}</td>
            <td className="px-2 py-1 text-right text-sm font-medium">{money(c.subtotal)}</td>
            <td className="px-1 py-1 text-center whitespace-nowrap">
              <button onClick={() => onOpenFicha(curPath)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded px-2 py-0.5 mr-1">
                Ficha
              </button>
              <button onClick={() => deleteItem(curPath)} className="text-xs text-red-600 hover:text-red-800">×</button>
            </td>
          </tr>
        )
      }
    })
    return rows
  }

  const total = budget.items.reduce((s, it) => s + calcItem(it, ctx).subtotal, 0)

  return (
    <div className="bg-white rounded shadow">
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-sm" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="px-2 py-2 text-left w-20">ID</th>
              <th className="px-2 py-2 text-left">DESCRIPCIÓN</th>
              <th className="px-2 py-2 w-20">UNIDAD</th>
              <th className="px-2 py-2 w-24">CANTIDAD</th>
              <th className="px-2 py-2 w-28">P. UNITARIO</th>
              <th className="px-2 py-2 w-32">SUBTOTAL</th>
              <th className="px-2 py-2 w-32">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {renderRows(budget.items)}
            <tr className="bg-blue-900 text-white">
              <td colSpan="5" className="px-3 py-3 text-right font-bold text-lg">TOTAL GENERAL</td>
              <td className="px-3 py-3 text-right font-bold text-xl">{money(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t bg-gray-50">
        <button onClick={() => addChild([], 'capitulo')}
          className="px-3 py-1.5 bg-blue-700 text-white rounded text-sm hover:bg-blue-800">
          + Agregar Capítulo
        </button>
      </div>
    </div>
  )
}
