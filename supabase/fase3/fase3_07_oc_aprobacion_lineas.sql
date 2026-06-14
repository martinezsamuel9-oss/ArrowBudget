-- =====================================================================
-- ARROW BUDGET — FASE III · Script 07: APROBACIÓN POR PARTIDA EN OC
--
-- ⚠️ SOLO ADITIVO — seguro de correr en producción.
--
-- El cliente / supervisión revisa cada partida de la orden de cambio y la
-- aprueba o rechaza con un comentario. Se guarda en una columna aparte
-- (NO en lineas_json) para que el trigger de blindaje permita al rol de
-- solo-lectura (cliente/admin) guardar su revisión sin tocar las líneas.
--
-- aprobacion_json: { [lineaId]: { estado: 'aprobada'|'rechazada', comentario } }
-- Solo las partidas aprobadas modifican el contrato (cantidades y monto).
-- =====================================================================

ALTER TABLE public.ordenes_cambio
  ADD COLUMN IF NOT EXISTS aprobacion_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  RAISE NOTICE '=== fase3_07_oc_aprobacion_lineas aplicado ===';
END;
$$;
