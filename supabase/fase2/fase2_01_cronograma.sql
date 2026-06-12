-- =====================================================================
-- ARROW BUDGET — FASE II · Script 01: CRONOGRAMA DE EJECUCIÓN
--
-- ⚠️ REGLA DE ORO DE FASE II: todos los scripts fase2_* son SOLO ADITIVOS
-- (crear tablas/columnas nuevas). PROHIBIDO alterar o borrar lo que la
-- Fase I en producción usa. Así la misma base sirve a producción (main)
-- y al preview de fase-2 sin riesgo.
--
-- Este script ES SEGURO de correr en la base de producción: crea una
-- tabla que el código de Fase I no conoce ni consulta.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cronogramas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id  uuid NOT NULL UNIQUE REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  fecha_inicio    date,
  -- datos_json.actividades[actividadId] = {
  --   duracion: días, predecesoras: ['1.01', ...],
  --   avances: [{ fecha: 'YYYY-MM-DD', pct: 0-100 }]
  -- }
  datos_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cronogramas_presupuesto ON public.cronogramas(presupuesto_id);

ALTER TABLE public.cronogramas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crono_select" ON public.cronogramas;
CREATE POLICY "crono_select" ON public.cronogramas
  FOR SELECT USING (public.can_read_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "crono_insert" ON public.cronogramas;
CREATE POLICY "crono_insert" ON public.cronogramas
  FOR INSERT WITH CHECK (public.can_write_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "crono_update" ON public.cronogramas;
CREATE POLICY "crono_update" ON public.cronogramas
  FOR UPDATE
  USING      (public.can_write_project(auth.uid(), presupuesto_id))
  WITH CHECK (public.can_write_project(auth.uid(), presupuesto_id));

DROP POLICY IF EXISTS "crono_delete" ON public.cronogramas;
CREATE POLICY "crono_delete" ON public.cronogramas
  FOR DELETE USING (public.can_write_project(auth.uid(), presupuesto_id));

DO $$
BEGIN
  RAISE NOTICE '=== fase2_01_cronograma aplicado ===';
  RAISE NOTICE 'Tabla cronogramas (aditiva, RLS por proyecto) — Fase I no se ve afectada';
END;
$$;
