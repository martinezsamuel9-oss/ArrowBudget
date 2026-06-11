-- =====================================================================
-- ARROW BUDGET — SNAPSHOT REAL DE REVISIONES
--
-- Antes: al subir de revisión solo se guardaba metadata (nombre, notas).
-- Ahora cada revisión guarda copia completa de items + catálogos +
-- parámetros + total, en tabla aparte (no engorda la fila del proyecto
-- ni el auto-save).
--
-- Ejecutar DESPUÉS de fixes_criticos_produccion.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.presupuesto_versiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id  uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  revision        integer NOT NULL,
  nombre          text,
  notas           text,
  nombre_proyecto text,
  estado          text,
  moneda          text,
  pct_indirectos  numeric(8,2),
  pct_imprevistos numeric(8,2),
  pct_utilidad    numeric(8,2),
  pct_impuesto    numeric(8,2),
  m2_construccion numeric,
  m2_estructura   numeric,
  total           numeric,           -- total calculado al momento del snapshot
  items_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  catalogos_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(presupuesto_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_pv_presupuesto ON public.presupuesto_versiones(presupuesto_id);

ALTER TABLE public.presupuesto_versiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_select" ON public.presupuesto_versiones;
CREATE POLICY "pv_select" ON public.presupuesto_versiones
  FOR SELECT USING (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "pv_insert" ON public.presupuesto_versiones;
CREATE POLICY "pv_insert" ON public.presupuesto_versiones
  FOR INSERT WITH CHECK (public.can_write_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "pv_delete" ON public.presupuesto_versiones;
CREATE POLICY "pv_delete" ON public.presupuesto_versiones
  FOR DELETE USING (public.can_write_project(auth.uid(), presupuesto_id));

DO $$
BEGIN
  RAISE NOTICE '=== revisiones_snapshot aplicado ===';
  RAISE NOTICE 'Tabla presupuesto_versiones con RLS por proyecto (snapshot completo por revisión)';
END;
$$;
