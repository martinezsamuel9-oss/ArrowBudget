-- =====================================================================
-- ARROW BUDGET — FASE III · Script 05: CONTRATOS DE OBRA
--
-- ⚠️ SOLO ADITIVO — seguro de correr en producción.
--
-- Contrato de Obra = acuerdo con un destajista sobre un conjunto de
-- actividades del presupuesto, con su cantidad de obra, P.U. y descuento
-- por línea (el descuento aplica sobre el P.U. de cada actividad).
--   subtotal de línea = cantidad × P.U. × (1 − descuento%)
--   monto del contrato = Σ subtotales
--
-- A partir de un contrato se GENERAN las planillas periódicas (estimación
-- acumulada de 4 partes). Cada planilla referencia su contrato_id y la
-- numeración es por contrato (la maneja el frontend).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.contratos_obra (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id   uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  contratista      text,
  -- lineas_json: [{ id, tipo:'destajo', actividadId?, manoObraId?, capId?,
  --                 descripcion, unidad, cantidad, pu, descuento }]
  lineas_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  pct_retencion    numeric(6,2) NOT NULL DEFAULT 0,
  pct_amortizacion numeric(6,2) NOT NULL DEFAULT 0,
  -- snapshot del monto del contrato (fuente de verdad = lineas_json)
  monto_contrato   numeric,
  estado           text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador', 'activo', 'cerrado')),
  notas            text,
  creado_por       uuid REFERENCES public.profiles(id),
  aprobado_por     uuid REFERENCES public.profiles(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_obra_presupuesto ON public.contratos_obra(presupuesto_id);

ALTER TABLE public.contratos_obra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cob_select" ON public.contratos_obra;
CREATE POLICY "cob_select" ON public.contratos_obra
  FOR SELECT USING (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "cob_insert" ON public.contratos_obra;
CREATE POLICY "cob_insert" ON public.contratos_obra
  FOR INSERT WITH CHECK (public.can_write_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "cob_update" ON public.contratos_obra;
CREATE POLICY "cob_update" ON public.contratos_obra
  FOR UPDATE
  USING      (public.can_read_project(auth.uid(), presupuesto_id))
  WITH CHECK (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "cob_delete" ON public.contratos_obra;
CREATE POLICY "cob_delete" ON public.contratos_obra
  FOR DELETE USING (public.can_write_project(auth.uid(), presupuesto_id));

-- Vincular las planillas a su contrato (aditivo).
ALTER TABLE public.planillas
  ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos_obra(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_planillas_contrato ON public.planillas(contrato_id);

DO $$
BEGIN
  RAISE NOTICE '=== fase3_05_contratos_obra aplicado ===';
END;
$$;
