import { calcFicha, conceptoCost, money, fmt } from '../lib/calc'

export default function FichaCostoModal({ open, onClose, actividad, ctx, onUpdate }) {
  if (!open || !actividad) return null

  const f = actividad.ficha || { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const calc = calcFicha(f, ctx.pctIndirectos, ctx.pctImprevistos, ctx.pctUtilidad)

  const updateConcepto = (cat, idx, field, value) => {
    const nf = { ...f }
    nf[cat] = [...nf[cat]]
    nf[cat][idx] = { ...nf[cat][idx], [field]: value }
    onUpdate({ ...actividad, ficha: nf })
  }
  const addConcepto = (cat) => {
    const nf = { ...f }
    nf[cat] = [...(nf[cat] || []), {
      id: Date.now(), descripcion: 'Nuevo concepto', unidad: 'und',
      rendimiento: 1, desperdicio: 0, costoUnitario: 0
    }]
    onUpdate({ ...actividad, ficha: nf })
  }
  const deleteConcepto = (cat, idx) => {
    const nf = { ...f }
    nf[cat] = nf[cat].filter((_, i) => i !== idx)
    onUpdate({ ...actividad, ficha: nf })
  }

  const Section = ({ title, catKey: k, total }) => (
    <div className="mb-4">
      <div className="bg-slate-700 text-white px-3 py-2 flex justify-between items-center">
        <h4 className="font-semibold text-sm uppercase">{title}</h4>
        <button onClick={() => addConcepto(k)}
          className="text-xs bg-white text-slate-700 px-2 py-1 rounded hover:bg-blue-50">
          + Agregar
        </button>
      </div>
      <table className="w-full text-xs border border-gray-300">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1 text-left w-8">#</th>
            <th className="border px-2 py-1 text-left">Descripción</th>
            <th className="border px-2 py-1 w-20">Unidad</th>
            <th className="border px-2 py-1 w-24">Rendimiento</th>
            <th className="border px-2 py-1 w-20">Desp. %</th>
            <th className="border px-2 py-1 w-28">Costo Unit.</th>
            <th className="border px-2 py-1 w-28">Subtotal</th>
            <th className="border w-8"></th>
          </tr>
        </thead>
        <tbody>
          {(f[k] || []).map((c, i) => (
            <tr key={c.id} className="hover:bg-blue-50">
              <td className="border px-2 py-1 text-gray-500">{i + 1}</td>
              <td className="border px-1">
                <input className="w-full px-1 py-0.5 focus:outline-none focus:bg-yellow-50"
                  value={c.descripcion} onChange={e => updateConcepto(k, i, 'descripcion', e.target.value)} />
              </td>
              <td className="border px-1">
                <input className="w-full px-1 py-0.5 text-center focus:outline-none focus:bg-yellow-50"
                  value={c.unidad} onChange={e => updateConcepto(k, i, 'unidad', e.target.value)} />
              </td>
              <td className="border px-1">
                <input type="number" step="any"
                  className="w-full px-1 py-0.5 text-right focus:outline-none focus:bg-yellow-50"
                  value={c.rendimiento} onChange={e => updateConcepto(k, i, 'rendimiento', parseFloat(e.target.value) || 0)} />
              </td>
              <td className="border px-1">
                <input type="number" step="any"
                  className="w-full px-1 py-0.5 text-right focus:outline-none focus:bg-yellow-50"
                  value={c.desperdicio} onChange={e => updateConcepto(k, i, 'desperdicio', parseFloat(e.target.value) || 0)} />
              </td>
              <td className="border px-1">
                <input type="number" step="any"
                  className="w-full px-1 py-0.5 text-right focus:outline-none focus:bg-yellow-50"
                  value={c.costoUnitario} onChange={e => updateConcepto(k, i, 'costoUnitario', parseFloat(e.target.value) || 0)} />
              </td>
              <td className="border px-2 py-1 text-right font-medium">{money(conceptoCost(c))}</td>
              <td className="border text-center">
                <button onClick={() => deleteConcepto(k, i)} className="text-red-500 hover:text-red-700">×</button>
              </td>
            </tr>
          ))}
          <tr className="bg-gray-100 font-semibold">
            <td colSpan="6" className="border px-2 py-1 text-right">SUBTOTAL {title}</td>
            <td className="border px-2 py-1 text-right">{money(total)}</td>
            <td className="border"></td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">FICHA DE COSTO UNITARIO — {actividad.id}</h3>
            <p className="text-sm opacity-90">{actividad.descripcion}</p>
          </div>
          <button onClick={onClose} className="text-white text-2xl leading-none hover:bg-blue-800 px-2 rounded">×</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-3 bg-blue-50 text-sm border-b">
          <div><span className="font-semibold">Actividad:</span> {actividad.id}</div>
          <div><span className="font-semibold">Cantidad:</span> {fmt(actividad.cantidad)} {actividad.unidad}</div>
          <div><span className="font-semibold">Unidad:</span> {actividad.unidad}</div>
          <div><span className="font-semibold">Fecha:</span> {new Date().toLocaleDateString()}</div>
        </div>

        <div className="overflow-y-auto scrollbar p-4 flex-1">
          <Section title="MATERIALES" catKey="materiales" total={calc.totMat} />
          <Section title="MANO DE OBRA" catKey="manoObra" total={calc.totMo} />
          <Section title="HERRAMIENTA + EQUIPO" catKey="herramientaEquipo" total={calc.totHe} />
          <Section title="SUBCONTRATO" catKey="subcontratos" total={calc.totSub} />

          <div className="mt-6 bg-slate-50 border border-slate-300 rounded p-3">
            <h4 className="font-bold text-sm mb-2 text-slate-700">RESUMEN POR CONCEPTOS</h4>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span>Precio Unitario de Materiales</span><span className="text-right font-medium">{money(calc.totMat)}</span>
              <span>Precio Unitario de Mano de Obra</span><span className="text-right font-medium">{money(calc.totMo)}</span>
              <span>Precio Unitario de Herramientas y Equipo</span><span className="text-right font-medium">{money(calc.totHe)}</span>
              <span>Precio Unitario de Subcontratos</span><span className="text-right font-medium">{money(calc.totSub)}</span>
              <span className="font-semibold border-t pt-1">COSTO DIRECTO</span>
              <span className="text-right font-semibold border-t pt-1">{money(calc.costoDirecto)}</span>
              <span>Indirectos ({ctx.pctIndirectos}%)</span><span className="text-right">{money(calc.indirectos)}</span>
              <span>Imprevistos ({ctx.pctImprevistos}%)</span><span className="text-right">{money(calc.imprevistos)}</span>
              <span>Utilidad ({ctx.pctUtilidad}%)</span><span className="text-right">{money(calc.utilidad)}</span>
            </div>
            <div className="mt-2 bg-blue-900 text-white px-3 py-2 flex justify-between items-center rounded">
              <span className="font-bold">PRECIO UNITARIO TOTAL</span>
              <span className="font-bold text-lg">{money(calc.precioUnitario)}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 px-4 py-3 flex justify-end gap-2 border-t">
          <button className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">Imprimir Ficha (PDF)</button>
          <button onClick={onClose} className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  )
}
