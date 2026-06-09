// =========================================================
// ARROW BUDGET — Roles y permisos por rol de proyecto
// =========================================================

/**
 * Definición de los 8 roles específicos de Arrow Budget
 * (más 'dueno' interno para el propietario de la org)
 */
export const ROLES_ARROW = {
  dueno: {
    label: 'Propietario',
    color: '#f59e0b',
    desc: 'Acceso total al proyecto y la organización',
  },
  gerente: {
    label: 'Gerente',
    color: '#7c3aed',
    desc: 'Aprueba presupuestos y envía a fase de ejecución',
  },
  ing_costos_1: {
    label: 'Ing. Costos I',
    color: '#2563eb',
    desc: 'Elabora presupuestos, ofertas, estimaciones y órdenes de cambio',
  },
  ing_costos_2: {
    label: 'Ing. Costos II',
    color: '#2563eb',
    desc: 'Elabora presupuestos, ofertas, estimaciones y órdenes de cambio',
  },
  ing_residente: {
    label: 'Ing. Residente',
    color: '#0891b2',
    desc: 'Elabora presupuestos y supervisa ejecución en campo',
  },
  supervisor: {
    label: 'Supervisor',
    color: '#d97706',
    desc: 'Aprueba estimaciones, fichas de costo y órdenes de cambio',
  },
  compras: {
    label: 'Compras',
    color: '#059669',
    desc: 'Cotizaciones, listas de materiales y gestión de compras en ejecución',
  },
  administrador_empresa: {
    label: 'Administrador',
    color: '#6b7280',
    desc: 'Aprueba órdenes de compra; visibilidad total sin crear ni aprobar presupuestos',
  },
  cliente: {
    label: 'Cliente',
    color: '#dc2626',
    desc: 'Aprueba o rechaza el presupuesto; vista de supervisor',
  },
}

// ─── Acciones y qué roles las pueden realizar ───────────────────────────────
const PERMISOS = {
  /** Crear/editar estructura del presupuesto (capítulos, actividades) */
  editarPresupuesto:    ['dueno', 'gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Editar fichas de costo (conceptos, cantidades, insumos) */
  editarFichas:         ['dueno', 'gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Aprobar el presupuesto (pasar a estado Aprobado) */
  aprobarPresupuesto:   ['dueno', 'gerente', 'cliente'],

  /** Rechazar el presupuesto */
  rechazarPresupuesto:  ['dueno', 'gerente', 'cliente'],

  /** Enviar presupuesto a revisión (pasar a En revisión) */
  enviarARevision:      ['dueno', 'gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Enviar presupuesto a ejecución (pasar a En ejecución) */
  enviarAEjecucion:     ['dueno', 'gerente'],

  /** Editar catálogos de insumos */
  editarCatalogos:      ['dueno', 'gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente', 'compras'],

  /** Cotizaciones: actualizar precios en catálogos */
  cotizaciones:         ['dueno', 'compras', 'administrador_empresa'],

  /** Aprobar órdenes de compra */
  aprobarOC:            ['dueno', 'administrador_empresa'],

  /** Aprobar fichas de costo y estimaciones */
  aprobarFichas:        ['dueno', 'supervisor', 'cliente'],

  /** Gestionar equipo del proyecto (asignar roles) */
  gestionarEquipo:      ['dueno', 'gerente'],

  /** Clonar proyecto */
  clonarProyecto:       ['dueno', 'gerente', 'ing_costos_1', 'ing_costos_2'],

  /** Eliminar proyecto */
  eliminarProyecto:     ['dueno', 'gerente'],

  /** Ver/leer el proyecto (todos los roles pueden ver) */
  verProyecto:          Object.keys(ROLES_ARROW),
}

/**
 * Verifica si un rol puede realizar una acción.
 * @param {string|null} rol  - uno de los valores de ROLES_ARROW
 * @param {string}      accion - clave de PERMISOS
 * @returns {boolean}
 */
export const puedeHacer = (rol, accion) => {
  if (!rol) return false
  return PERMISOS[accion]?.includes(rol) ?? false
}

// ─── Transiciones de estado permitidas por rol ───────────────────────────────
export const TRANSICIONES_PERMITIDAS = {
  dueno:                ['Borrador', 'Activo', 'En revisión', 'Aprobado', 'Rechazado', 'En ejecución'],
  gerente:              ['Borrador', 'Activo', 'En revisión', 'Aprobado', 'Rechazado', 'En ejecución'],
  ing_costos_1:         ['Borrador', 'Activo', 'En revisión'],
  ing_costos_2:         ['Borrador', 'Activo', 'En revisión'],
  ing_residente:        ['Borrador', 'Activo', 'En revisión'],
  supervisor:           [],
  compras:              [],
  administrador_empresa:[],
  cliente:              ['Aprobado', 'Rechazado'],
}

// ─── Mapeo de org_role genérico → presupuesto_role Arrow ────────────────────
export const ORG_TO_PROJECT_ROLE = {
  dueno:         'dueno',
  administrador: 'gerente',
  estimador:     'ing_costos_1',
  visualizador:  'cliente',
}

// ─── Mapeo inverso: presupuesto_role → org_role para RLS ────────────────────
export const PROJECT_TO_ORG_ROLE = {
  dueno:                 'dueno',
  gerente:               'administrador',
  ing_costos_1:          'estimador',
  ing_costos_2:          'estimador',
  ing_residente:         'estimador',
  supervisor:            'estimador',
  compras:               'estimador',
  administrador_empresa: 'visualizador',
  cliente:               'visualizador',
}
