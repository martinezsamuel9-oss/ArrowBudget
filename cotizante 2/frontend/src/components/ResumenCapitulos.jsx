import { calcItem, money } from '../lib/calc'

export default function ResumenCapitulos({ budget }) {
  const ctx = {
    pctIndirectos: budget.pctIndirectos,
    pctImprevistos: budget.pctImprevistos,
    pctUtilidad: budget.pctUtilidad,
  }
  const total = budget.items.reduce((s, it) => s + calcItem(it, ctx).subtotal, 0)
  return (
    <div className="bg-white rounded shadow mt-4 p-4">
      <h3 className="font-bold text-slate-800 mb-2">CUADRO RESUMEN DE CAPÍTULOS</h3>
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1 w-16 text-left">ID</th>
            <th className="border px-2 py-1 text-left">Nombre Capítulo</th>
            <th className="border px-2 py-1 w-32 text-right">Monto Total</th>
            <th className="border px-2 py-1 w-24 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {budget.items.map(it => {
            const sub = calcItem(it, ctx).subtotal
            const pct = total ? (sub / total) * 100 : 0
            return (
              <tr key={it.id} className="hover:bg-blue-50">
                <td className="border px-2 py-1">{it.id}</td>
                <td className="border px-2 py-1">{it.descripcion}</td>
                <td className="border px-2 py-1 text-right">{money(sub)}</td>
                <td className="border px-2 py-1 text-right">{pct.toFixed(2)}%</td>
              </tr>
            )
          })}
          <tr className="bg-blue-900 text-white font-bold">
            <td colSpan="2" className="border px-2 py-1.5">TOTAL</td>
            <td className="border px-2 py-1.5 text-right">{money(total)}</td>
            <td className="border px-2 py-1.5 text-right">100.00%</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
