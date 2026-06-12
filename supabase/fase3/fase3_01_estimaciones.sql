-- =====================================================================
-- ARROW BUDGET — FASE III · Script 01: ESTIMACIONES DE COBRO
--
-- ⚠️ REGLA DE ORO (igual que Fase II): scripts SOLO ADITIVOS — seguro de
-- correr en la base de producción; Fase I y II no se ven afectadas.
--
-- Estimación = cobro por avance al cliente en un periodo:
--   líneas por actividad (cantidad ejecutada del periodo × PU contractual),
--   retención %, amortización de anticipo %, correlativo por proyecto y
--   flujo de aprobación (borrador → enviada → aprobada/rechazada → pagada).
-- Los montos se calculan en el frontend desde lineas_json; aquí solo se
-- guarda snapshot de totales para listados rápidos.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.estimaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id   uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  numero           integer NOT NULL,
  periodo_inicio   date,
  periodo_fin      date,
  estado           text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador', 'enviada', 'aprobada', 'rechazada', 'pagada')),
  -- lineas_json: [{ actividadId, cantidad, pu, descripcion, unidad, capId }]
  lineas_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  pct_retencion    numeric(6,2) NOT NULL DEFAULT 0,
  pct_amortizacion numeric(6,2) NOT NULL DEFAULT 0,
  -- snapshot de totales (fuente de verdad = lineas_json)
  subtotal         numeric,
  retencion        numeric,
  amortizacion     numeric,
  neto             numeric,
  notas            text,
  creado_por       uuid REFERENCES public.profiles(id),
  aprobado_por     uuid REFERENCES public.profiles(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(presupuesto_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_estimaciones_presupuesto ON public.estimaciones(presupuesto_id);

ALTER TABLE public.estimaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_select" ON public.estimaciones;
CREATE POLICY "est_select" ON public.estimaciones
  FOR SELECT USING (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "est_insert" ON public.estimaciones;
CREATE POLICY "est_insert" ON public.estimaciones
  FOR INSERT WITH CHECK (public.can_write_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "est_update" ON public.estimaciones;
CREATE POLICY "est_update" ON public.estimaciones
  FOR UPDATE
  USING      (public.can_read_project(auth.uid(), presupuesto_id))
  WITH CHECK (public.can_read_project(auth.uid(), presupuesto_id));
-- Nota: UPDATE usa can_read (no can_write) a propósito: el cliente y el
-- supervisor aprueban/rechazan estimaciones aunque no editen presupuesto.
-- El frontend restringe qué campos puede tocar cada rol según PERMISOS.

DROP POLICY IF EXISTS "est_delete" ON public.estimaciones;
CREATE POLICY "est_delete" ON public.estimaciones
  FOR DELETE USING (public.can_write_project(auth.uid(), presupuesto_id));

DO $$
BEGIN
  RAISE NOTICE '=== fase3_01_estimaciones aplicado ===';
  RAISE NOTICE 'Tabla estimaciones (aditiva, RLS por proyecto) lista';
END;
$$;
