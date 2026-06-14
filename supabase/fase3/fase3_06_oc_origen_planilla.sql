-- =====================================================================
-- ARROW BUDGET — FASE III · Script 06: OC DE EXCEDENTES DESDE PLANILLA
--
-- ⚠️ SOLO ADITIVO — seguro de correr en producción.
--
-- Cuando una planilla a contratista excede la cantidad contratada de una
-- actividad (>100%), el sistema genera/actualiza automáticamente una orden
-- de cambio (propietario ↔ ejecutor) con el aumento de obra ligado a la
-- actividad. Esa OC se vincula a la planilla origen para poder actualizarla
-- (en vez de duplicarla) en cada guardado.
-- =====================================================================

ALTER TABLE public.ordenes_cambio
  ADD COLUMN IF NOT EXISTS origen_planilla_id uuid REFERENCES public.planillas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oc_origen_planilla ON public.ordenes_cambio(origen_planilla_id);

DO $$
BEGIN
  RAISE NOTICE '=== fase3_06_oc_origen_planilla aplicado ===';
END;
$$;
