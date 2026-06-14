// =========================================================
// ARROW BUDGET — Roles y permisos por rol de proyecto
// =========================================================

/**
 * Los 8 roles de Arrow Budget
 */
export const ROLES_ARROW = {
  gerente: {
    label: 'Gerente',
    color: '#7c3aed',
    desc: 'Aprueba presupuestos y envía a fase de impresión/ejecución',
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
    desc: 'Aprueba órdenes de compra; visibilidad total',
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
  editarPresupuesto:    ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Editar fichas de costo (conceptos, cantidades, insumos) */
  editarFichas:         ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Aprobar el presupuesto (pasar a estado Aprobado) */
  aprobarPresupuesto:   ['gerente', 'cliente'],

  /** Rechazar el presupuesto */
  rechazarPresupuesto:  ['gerente', 'cliente'],

  /** Enviar presupuesto a revisión (pasar a En revisión) */
  enviarARevision:      ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Enviar presupuesto a ejecución / impresión */
  enviarAEjecucion:     ['gerente'],

  /** Editar catálogos de insumos */
  editarCatalogos:      ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente', 'compras'],

  /** Cotizaciones: actualizar precios en catálogos */
  cotizaciones:         ['compras', 'administrador_empresa'],

  /** Aprobar órdenes de compra */
  aprobarOC:            ['administrador_empresa'],

  /** Aprobar fichas de costo y estimaciones */
  aprobarFichas:        ['supervisor', 'cliente'],

  /** Elaborar estimaciones de cobro (Fase III) */
  elaborarEstimacion:   ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Aprobar/rechazar estimaciones (Fase III) */
  aprobarEstimacion:    ['gerente', 'supervisor', 'cliente'],

  /** Elaborar órdenes de cambio (Fase III) */
  elaborarOrdenCambio:  ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente'],

  /** Aprobar/rechazar órdenes de cambio (Fase III) */
  aprobarOrdenCambio:   ['gerente', 'supervisor', 'cliente'],

  /** Elaborar planillas a contratistas (Fase III) */
  elaborarPlanilla:     ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente', 'compras'],

  /** Aprobar/rechazar planillas a contratistas (Fase III).
   *  El supervisor NO interviene en gastos de ejecución. */
  aprobarPlanilla:      ['gerente', 'administrador_empresa'],

  /** Ver módulos de gasto de ejecución (planillas/contratos de obra,
   *  órdenes de compra, informe ejecutivo con costos). El supervisor queda
   *  fuera: solo ve estimaciones, órdenes de cambio y cronograma. */
  verGastosEjecucion:   ['gerente', 'ing_costos_1', 'ing_costos_2', 'ing_residente', 'compras', 'administrador_empresa', 'cliente'],

  /** Gestionar equipo del proyecto (asignar roles) */
  gestionarEquipo:      ['gerente'],

  /** Clonar proyecto */
  clonarProyecto:       ['gerente', 'ing_costos_1', 'ing_costos_2'],

  /** Eliminar proyecto */
  eliminarProyecto:     ['gerente'],

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

// ─── Mapeos de compatibilidad (org_role ↔ presupuesto_role) ─────────────────
// Ahora org_members.role usa presupuesto_role directamente — mapeo identidad
export const ORG_TO_PROJECT_ROLE = {
  gerente:               'gerente',
  ing_costos_1:          'ing_costos_1',
  ing_costos_2:          'ing_costos_2',
  ing_residente:         'ing_residente',
  supervisor:            'supervisor',
  compras:               'compras',
  administrador_empresa: 'administrador_empresa',
  cliente:               'cliente',
}
export const PROJECT_TO_ORG_ROLE = { ...ORG_TO_PROJECT_ROLE }

// ─── Transiciones de estado permitidas por rol ───────────────────────────────
export const TRANSICIONES_PERMITIDAS = {
  gerente:              ['Borrador', 'Activo', 'En revisión', 'Aprobado', 'Rechazado', 'En ejecución', 'Archivado'],
  ing_costos_1:         ['Borrador', 'Activo', 'En revisión'],
  ing_costos_2:         ['Borrador', 'Activo', 'En revisión'],
  ing_residente:        ['Borrador', 'Activo', 'En revisión'],
  supervisor:           [],
  compras:              [],
  administrador_empresa:[],
  cliente:              ['Aprobado', 'Rechazado'],
}
