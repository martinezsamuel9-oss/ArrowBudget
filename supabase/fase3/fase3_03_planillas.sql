-- =====================================================================
-- ARROW BUDGET — FASE III · Script 03: PLANILLAS A CONTRATISTAS
--
-- ⚠️ SOLO ADITIVO — seguro de correr en producción.
--
-- Planilla = pago periódico a un subcontratista. Dos tipos de línea:
--   · destajo  → cantidad de obra ejecutada × P.U. (puede referenciar una
--                actividad del presupuesto para control de gastos)
--   · dia      → personal al día / obras varias (días, horas, global)
-- Más deducciones varias, retención y amortización de anticipo.
-- Numeración por contratista dentro del proyecto (la maneja el frontend).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.planillas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id   uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  numero           integer NOT NULL DEFAULT 1,
  contratista      text,
  periodo_inicio   date,
  periodo_fin      date,
  estado           text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador', 'enviada', 'aprobada', 'rechazada', 'pagada')),
  -- lineas_json: [{ id, tipo:'destajo'|'dia', actividadId?, capId?, descripcion, unidad, cantidad, pu }]
  lineas_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- deducciones_json: [{ id, descripcion, monto }]
  deducciones_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  pct_retencion    numeric(6,2) NOT NULL DEFAULT 0,
  pct_amortizacion numeric(6,2) NOT NULL DEFAULT 0,
  -- snapshot de totales (fuente de verdad = lineas_json/deducciones_json)
  subtotal         numeric,
  retencion        numeric,
  amortizacion     numeric,
  deducciones      numeric,
  neto             numeric,
  notas            text,
  creado_por       uuid REFERENCES public.profiles(id),
  aprobado_por     uuid REFERENCES public.profiles(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planillas_presupuesto ON public.planillas(presupuesto_id);

ALTER TABLE public.planillas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pla_select" ON public.planillas;
CREATE POLICY "pla_select" ON public.planillas
  FOR SELECT USING (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "pla_insert" ON public.planillas;
CREATE POLICY "pla_insert" ON public.planillas
  FOR INSERT WITH CHECK (public.can_write_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "pla_update" ON public.planillas;
CREATE POLICY "pla_update" ON public.planillas
  FOR UPDATE
  USING      (public.can_read_project(auth.uid(), presupuesto_id))
  WITH CHECK (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "pla_delete" ON public.planillas;
CREATE POLICY "pla_delete" ON public.planillas
  FOR DELETE USING (public.can_write_project(auth.uid(), presupuesto_id));

DO $$
BEGIN
  RAISE NOTICE '=== fase3_03_planillas aplicado ===';
END;
$$;
