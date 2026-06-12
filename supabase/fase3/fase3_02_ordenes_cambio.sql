-- =====================================================================
-- ARROW BUDGET — FASE III · Script 02: ÓRDENES DE CAMBIO
--
-- ⚠️ SOLO ADITIVO — seguro de correr en producción.
--
-- Orden de cambio = modificación al contrato (aditiva suma, deductiva
-- resta): concepto, líneas libres (descripción/unidad/cantidad/PU) y
-- flujo de aprobación. Las OC aprobadas ajustan el monto del contrato
-- que usan las estimaciones.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ordenes_cambio (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id  uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  numero          integer NOT NULL,
  fecha           date DEFAULT current_date,
  concepto        text,
  tipo            text NOT NULL DEFAULT 'aditiva' CHECK (tipo IN ('aditiva', 'deductiva')),
  estado          text NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador', 'enviada', 'aprobada', 'rechazada')),
  -- lineas_json: [{ descripcion, unidad, cantidad, pu }]
  lineas_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  monto           numeric,          -- snapshot Σ líneas (fuente de verdad = lineas_json)
  notas           text,
  creado_por      uuid REFERENCES public.profiles(id),
  aprobado_por    uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(presupuesto_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_oc_presupuesto ON public.ordenes_cambio(presupuesto_id);

ALTER TABLE public.ordenes_cambio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_select" ON public.ordenes_cambio;
CREATE POLICY "oc_select" ON public.ordenes_cambio
  FOR SELECT USING (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "oc_insert" ON public.ordenes_cambio;
CREATE POLICY "oc_insert" ON public.ordenes_cambio
  FOR INSERT WITH CHECK (public.can_write_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "oc_update" ON public.ordenes_cambio;
CREATE POLICY "oc_update" ON public.ordenes_cambio
  FOR UPDATE
  USING      (public.can_read_project(auth.uid(), presupuesto_id))
  WITH CHECK (public.can_read_project(auth.uid(), presupuesto_id));
-- can_read en UPDATE a propósito: cliente/supervisor aprueban sin poder
-- editar presupuesto. El frontend restringe campos por rol (PERMISOS).

DROP POLICY IF EXISTS "oc_delete" ON public.ordenes_cambio;
CREATE POLICY "oc_delete" ON public.ordenes_cambio
  FOR DELETE USING (public.can_write_project(auth.uid(), presupuesto_id));

DO $$
BEGIN
  RAISE NOTICE '=== fase3_02_ordenes_cambio aplicado ===';
END;
$$;
