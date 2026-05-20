import { useEffect, useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PresupuestoTable from '../components/PresupuestoTable'
import FichaCostoModal from '../components/FichaCostoModal'
import ResumenCapitulos from '../components/ResumenCapitulos'

// NOTA: por simplicidad esta página guarda el árbol de items en una sola columna JSON.
// En producción se recomienda usar la estructura normalizada del esquema SQL.
// Esta página usa una columna `items_json` opcional o un fallback en localStorage.

export default function PresupuestoPage() {
  const { id } = useParams()
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const [budget, setBudget] = useState(null)
  const [fichaPath, setFichaPath] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id || !user) return
    supabase.from('presupuestos').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          setBudget({
            ...data,
            items: data.items_json || [],
            pctIndirectos: data.pct_indirectos,
            pctImprevistos: data.pct_imprevistos,
            pctUtilidad: data.pct_utilidad,
          })
        }
      })
  }, [id, user])

  // Auto-guardado al cambiar el presupuesto (debounce)
  useEffect(() => {
    if (!budget) return
    const t = setTimeout(async () => {
      setSaving(true)
      await supabase.from('presupuestos').update({
        nombre_proyecto: budget.nombre_proyecto,
        cotizante: budget.cotizante,
        cliente: budget.cliente,
        lugar: budget.lugar,
        fecha: budget.fecha,
        revision: budget.revision,
        moneda: budget.moneda,
        pct_indirectos: budget.pctIndirectos,
        pct_imprevistos: budget.pctImprevistos,
        pct_utilidad: budget.pctUtilidad,
        items_json: budget.items,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      setSaving(false)
    }, 1200)
    return () => clearTimeout(t)
  }, [budget, id])

  const fichaActividad = useMemo(() => {
    if (!budget || !fichaPath) return null
    let cur = budget.items
    let item = null
    for (let i = 0; i < fichaPath.length; i++) {
      item = cur[fichaPath[i]]
      if (i < fichaPath.length - 1) cur = item.children
    }
    return item
  }, [fichaPath, budget])

  const updateFichaActividad = (newAct) => {
    if (!fichaPath) return
    const items = JSON.parse(JSON.stringify(budget.items))
    let cur = items
    for (let i = 0; i < fichaPath.length - 1; i++) {
      cur = cur[fichaPath[i]].children
    }
    cur[fichaPath[fichaPath.length - 1]] = newAct
    setBudget({ ...budget, items })
  }

  if (!budget) return <div className="p-8 text-center">Cargando…</div>

  return (
    <div className="min-h-screen">
      <header className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-2xl">🏗️</Link>
          <span className="font-bold">ARROW BUDGET</span>
          {saving && <span className="text-xs ml-3 opacity-70">guardando…</span>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button className="bg-white text-blue-900 px-3 py-1.5 rounded font-semibold">🖨️ PDF</button>
          <button className="bg-green-600 px-3 py-1.5 rounded font-semibold">📊 Excel</button>
          <span className="opacity-80 ml-2">{user?.email}</span>
          <button onClick={() => { signOut(); nav('/login') }} className="underline opacity-80">salir</button>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto">
        {/* Datos del proyecto */}
        <div className="bg-white rounded shadow p-4 mb-4 grid md:grid-cols-2 gap-3 text-sm">
          <div>
            <h2 className="font-bold text-slate-800 mb-2">📋 COTIZANTE</h2>
            <Field label="Empresa que cotiza" value={budget.cotizante || ''} onChange={v => setBudget({ ...budget, cotizante: v })} />
            <Field label="Cliente" value={budget.cliente || ''} onChange={v => setBudget({ ...budget, cliente: v })} />
            <Field label="Lugar del proyecto" value={budget.lugar || ''} onChange={v => setBudget({ ...budget, lugar: v })} />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 mb-2">🏢 PROYECTO</h2>
            <Field label="Nombre del proyecto" value={budget.nombre_proyecto || ''} onChange={v => setBudget({ ...budget, nombre_proyecto: v })} />
            <div className="grid grid-cols-3 gap-2">
              <Field label="Fecha" type="date" value={budget.fecha || ''} onChange={v => setBudget({ ...budget, fecha: v })} />
              <Field label="Revisión" type="number" value={budget.revision || 1} onChange={v => setBudget({ ...budget, revision: parseInt(v) || 0 })} />
              <Field label="Moneda" value={budget.moneda || 'USD'} onChange={v => setBudget({ ...budget, moneda: v })} />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 flex flex-wrap gap-4 items-center text-sm">
          <span className="font-semibold text-blue-900">Parámetros:</span>
          <PctField label="Indirectos %" value={budget.pctIndirectos} onChange={v => setBudget({ ...budget, pctIndirectos: v })} />
          <PctField label="Imprevistos %" value={budget.pctImprevistos} onChange={v => setBudget({ ...budget, pctImprevistos: v })} />
          <PctField label="Utilidad %" value={budget.pctUtilidad} onChange={v => setBudget({ ...budget, pctUtilidad: v })} />
        </div>

        <PresupuestoTable
          budget={budget} setBudget={setBudget}
          onOpenFicha={(path) => setFichaPath(path)}
        />

        <ResumenCapitulos budget={budget} />
      </main>

      <FichaCostoModal
        open={!!fichaPath} onClose={() => setFichaPath(null)}
        actividad={fichaActividad}
        ctx={{ pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad }}
        onUpdate={updateFichaActividad}
      />
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div className="mb-2">
      <label className="block text-xs font-semibold text-gray-600">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border rounded px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
    </div>
  )
}
function PctField({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs">{label}</span>
      <input type="number" step="any" value={value || 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-16 border rounded px-2 py-0.5 text-right" />
    </label>
  )
}
