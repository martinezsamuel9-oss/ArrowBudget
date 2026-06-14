// ============ EXTRACCIÓN DE CANTIDADES DESDE BIM (IFC) — Motor B1 ============
// Lee un modelo Revit exportado a .ifc EN EL NAVEGADOR (web-ifc, WASM) y
// extrae cantidades reales por tipo de elemento: m² de losas/paredes,
// ml de vigas/columnas, conteo de puertas/ventanas, etc. Cero tokens.
// La librería se carga con import dinámico para no inflar el bundle.

// Tipos IFC que nos interesan → categoría legible + magnitud preferida
// magnitud: 'area' (m²) | 'length' (ml) | 'volume' (m³) | 'count' (und)
export const CATEGORIAS_IFC = [
  { ifc: 'IFCSLAB',     label: 'Losas / Firmes',        magnitud: 'area',   unidad: 'm²' },
  { ifc: 'IFCWALLSTANDARDCASE', label: 'Paredes',       magnitud: 'area',   unidad: 'm²' },
  { ifc: 'IFCWALL',     label: 'Paredes (otras)',       magnitud: 'area',   unidad: 'm²' },
  { ifc: 'IFCBEAM',     label: 'Vigas',                 magnitud: 'length', unidad: 'ml' },
  { ifc: 'IFCCOLUMN',   label: 'Columnas',              magnitud: 'length', unidad: 'ml' },
  { ifc: 'IFCFOOTING',  label: 'Cimentaciones / Zapatas', magnitud: 'volume', unidad: 'm³' },
  { ifc: 'IFCDOOR',     label: 'Puertas',               magnitud: 'count',  unidad: 'und' },
  { ifc: 'IFCWINDOW',   label: 'Ventanas',              magnitud: 'count',  unidad: 'und' },
  { ifc: 'IFCCOVERING', label: 'Acabados / Recubrimientos', magnitud: 'area', unidad: 'm²' },
  { ifc: 'IFCROOF',     label: 'Cubiertas / Techos',    magnitud: 'area',   unidad: 'm²' },
  { ifc: 'IFCSTAIRFLIGHT', label: 'Escaleras',          magnitud: 'count',  unidad: 'und' },
  { ifc: 'IFCRAMP',     label: 'Rampas',                magnitud: 'area',   unidad: 'm²' },
  { ifc: 'IFCMEMBER',   label: 'Elementos estructurales', magnitud: 'length', unidad: 'ml' },
  { ifc: 'IFCPLATE',    label: 'Placas / Láminas',      magnitud: 'area',   unidad: 'm²' },
  { ifc: 'IFCPILE',     label: 'Pilotes',               magnitud: 'length', unidad: 'ml' },
]

// Nombres de cantidad en los Qto_* de IFC, por magnitud (en orden de preferencia)
const QNAMES = {
  area:   ['NetArea', 'NetSideArea', 'GrossArea', 'NetFloorArea', 'GrossFloorArea', 'Area', 'TotalSurfaceArea'],
  length: ['Length', 'NetLength', 'GrossLength', 'Span'],
  volume: ['NetVolume', 'GrossVolume', 'Volume'],
  count:  [],
}

let _ifcApi = null
const getApi = async () => {
  if (_ifcApi) return _ifcApi
  const WebIFC = await import('web-ifc')
  const api = new WebIFC.IfcAPI()
  api.SetWasmPath('/web-ifc/')   // wasm servido desde public/web-ifc/
  await api.Init()
  _ifcApi = { api, WebIFC }
  return _ifcApi
}

const num = v => (v && typeof v === 'object' && 'value' in v) ? +v.value : +v

// Extrae el valor de cantidad preferido de los property sets de cuantía
const cantidadDeElemento = (psets, magnitud) => {
  if (magnitud === 'count') return 1
  const nombres = QNAMES[magnitud] || []
  for (const ps of psets) {
    const quantities = ps?.Quantities || ps?.HasQuantities || []
    for (const nombre of nombres) {
      for (const q of quantities) {
        const qn = q?.Name?.value || q?.Name
        if (qn !== nombre) continue
        const val = num(q?.AreaValue ?? q?.LengthValue ?? q?.VolumeValue ?? q?.CountValue ?? q?.Value)
        if (isFinite(val) && val > 0) return val
      }
    }
  }
  return null
}

// Procesa el archivo IFC → resumen por categoría
// onProgress(fraccion 0..1) opcional. Devuelve [{ ifc, label, magnitud, unidad,
// cantidad, elementos, conCantidad }]
export const procesarIFC = async (arrayBuffer, onProgress) => {
  const { api, WebIFC } = await getApi()
  const modelID = api.OpenModel(new Uint8Array(arrayBuffer))
  const resultado = []
  try {
    const total = CATEGORIAS_IFC.length
    for (let i = 0; i < CATEGORIAS_IFC.length; i++) {
      const cat = CATEGORIAS_IFC[i]
      const typeCode = WebIFC[cat.ifc]
      if (typeCode == null) { onProgress?.((i + 1) / total); continue }
      let ids
      try { ids = api.GetLineIDsWithType(modelID, typeCode) } catch { ids = null }
      const n = ids ? ids.size() : 0
      if (!n) { onProgress?.((i + 1) / total); continue }
      let suma = 0, conCantidad = 0
      for (let j = 0; j < n; j++) {
        const eid = ids.get(j)
        if (cat.magnitud === 'count') { suma += 1; conCantidad++; continue }
        let psets = []
        try { psets = await api.properties.getPropertySets(modelID, eid, true) } catch { psets = [] }
        const c = cantidadDeElemento(psets, cat.magnitud)
        if (c != null) { suma += c; conCantidad++ }
        // Cede el hilo cada 200 elementos para no congelar el navegador en
        // modelos grandes y reflejar progreso dentro de la categoría
        if (j % 200 === 199) {
          onProgress?.((i + (j / n)) / total)
          await new Promise(r => setTimeout(r))
        }
      }
      resultado.push({ ...cat, cantidad: Math.round(suma * 100) / 100, elementos: n, conCantidad })
      onProgress?.((i + 1) / total)
    }
  } finally {
    api.CloseModel(modelID)
  }
  const cats = resultado.filter(r => r.elementos > 0)
  // Aviso si el modelo no trae Base Quantities (todo lo medible salió en 0)
  const medibles = cats.filter(c => c.magnitud !== 'count')
  const sinCantidades = medibles.length > 0 && medibles.every(c => c.conCantidad === 0)
  cats.sinBaseQuantities = sinCantidades
  return cats
}
