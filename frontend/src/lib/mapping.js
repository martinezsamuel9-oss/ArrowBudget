// ============ SUPABASE MAPPING ============
// Mapeo DB ↔ UI del presupuesto + constantes de estado.
// Extraído de MainApp.jsx (paso 1 de la modularización) — sin cambios de lógica.
import { uid } from './calc'

export const relTime = ts => {
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

export const DEFAULT_INDIRECTOS = [
  { descripcion: 'Gerente de Proyecto',         unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Residente de Obra',           unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Ingeniero Jr',                unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Arquitecto I',                unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Arquitecto II',               unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Especialista en Costos',      unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Maestro de Obra',             unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Bodeguero',                   unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Alquiler de casas / oficina', unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Fianza de calidad',           unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Fianza de anticipo',          unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Buena ejecución de obra',     unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Alimentación',                unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Combustible',                 unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Viajes de gerencia',          unidad: 'viaje',  cantidad: 1, costoBase: 0 },
  { descripcion: 'Seguros de obra',             unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Comunicaciones / Internet',   unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Papelería y útiles',          unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Vigilancia / Guardianía',     unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Instalación provisional',     unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Transporte de personal',      unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Equipos de cómputo y TI',     unidad: 'global', cantidad: 1, costoBase: 0 },
].map(x => ({ ...x, id: uid() }))

// 'enviado' es un estado legacy de la BD: se muestra como 'En revisión' y al
// guardar se normaliza a 'en_revision' (UI2DB no lo emite a propósito)
export const DB2UI = { borrador:'Borrador', activo:'Activo', en_revision:'En revisión', enviado:'En revisión', aprobado:'Aprobado', rechazado:'Rechazado', en_ejecucion:'En ejecución', archivado:'Archivado' }
export const UI2DB = { 'Borrador':'borrador', 'Activo':'activo', 'En revisión':'en_revision', 'Aprobado':'aprobado', 'Rechazado':'rechazado', 'En ejecución':'en_ejecucion', 'Archivado':'archivado' }

export const mapDb = row => ({
  id:            row.id,
  userId:        row.user_id,
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
  pctIndirectos: row.pct_indirectos  != null ? +row.pct_indirectos  : 10,
  pctImprevistos:row.pct_imprevistos != null ? +row.pct_imprevistos : 1,
  pctUtilidad:   row.pct_utilidad    != null ? +row.pct_utilidad    : 8,
  pctImpuesto:   row.pct_impuesto    != null ? +row.pct_impuesto    : 15,
  logoOfertante: row.logo_ofertante || null,
  logoCliente:   row.logo_cliente   || null,
  versiones:     row.versiones_json || [],
  catalogos:     (() => { const c = row.catalogos_json || {}; return { materiales: c.materiales||[], manoObra: c.manoObra||[], herramientaEquipo: c.herramientaEquipo||[], subcontratos: c.subcontratos||[] } })(),
  apuHeaderBg:     (row.catalogos_json?._apu?.headerBg)       || '#0f1115',
  apuHeaderText:   (row.catalogos_json?._apu?.headerText)     || '#f59e0b',
  m2Construccion:  +(row.m2_construccion ?? row.catalogos_json?._m2c ?? row.catalogos_json?._params?.m2Construccion ?? 0),
  m2Estructura:    +(row.m2_estructura   ?? row.catalogos_json?._m2e ?? row.catalogos_json?._params?.m2Estructura   ?? 0),
  indirectos:      (row.catalogos_json?._indirectos) || DEFAULT_INDIRECTOS.map(x => ({ ...x, id: uid() })),
  items:         row.items_json     || [],
})

export const toDb = b => ({
  cotizante:        b.cotizante,
  cliente:          b.cliente,
  ofertante:        b.ofertante,
  realizado_por:    b.realizadoPor,
  lugar:            b.lugar,
  nombre_proyecto:  b.nombreProyecto,
  fecha:            b.fecha,
  revision:         b.revision,
  moneda:           b.moneda,
  tipo:             b.tipo,
  estado:           UI2DB[b.estado] || 'borrador',
  pct_indirectos:   b.pctIndirectos,
  pct_imprevistos:  b.pctImprevistos,
  pct_utilidad:     b.pctUtilidad,
  pct_impuesto:     b.pctImpuesto,
  logo_ofertante:   b.logoOfertante,
  logo_cliente:     b.logoCliente,
  versiones_json:   b.versiones,
  m2_construccion:  b.m2Construccion ?? 0,
  m2_estructura:    b.m2Estructura   ?? 0,
  catalogos_json:   { ...b.catalogos, _apu: { headerBg: b.apuHeaderBg||'#0f1115', headerText: b.apuHeaderText||'#f59e0b' }, _indirectos: b.indirectos||[], _m2c: b.m2Construccion ?? 0, _m2e: b.m2Estructura ?? 0 },
  items_json:       b.items,
  updated_at:       new Date().toISOString(),
})
