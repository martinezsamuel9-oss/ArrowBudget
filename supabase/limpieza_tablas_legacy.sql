-- =====================================================================
-- ARROW BUDGET — LIMPIEZA DE TABLAS LEGACY
--
-- El frontend guarda todo en presupuestos.items_json / catalogos_json.
-- Estas tablas eran del diseño relacional original y NINGUNA query del
-- frontend las usa (verificado por grep en todo el código):
--   items, fichas_costo, conceptos  → se eliminan
--   insumos, plantillas_actividad,
--   subscriptions, planes           → solo se reportan (por si se usan
--                                     en el futuro con billing/plantillas)
--
-- PASO 1: revisar los conteos. Si items/fichas_costo/conceptos tienen
-- filas con datos que te importen (no debería — la app nunca escribió
-- ahí), NO sigas y avísame.
-- =====================================================================

SELECT 'items' AS tabla,                COUNT(*) AS filas FROM public.items
UNION ALL SELECT 'fichas_costo',        COUNT(*) FROM public.fichas_costo
UNION ALL SELECT 'conceptos',           COUNT(*) FROM public.conceptos
UNION ALL SELECT 'insumos',             COUNT(*) FROM public.insumos
UNION ALL SELECT 'plantillas_actividad',COUNT(*) FROM public.plantillas_actividad
UNION ALL SELECT 'subscriptions',       COUNT(*) FROM public.subscriptions
ORDER BY 1;

-- ---------------------------------------------------------------------
-- PASO 2: eliminar las 3 tablas muertas confirmadas
-- (conceptos depende de fichas_costo, que depende de items — este orden)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.conceptos    CASCADE;
DROP TABLE IF EXISTS public.fichas_costo CASCADE;
DROP TABLE IF EXISTS public.items        CASCADE;
DROP TYPE  IF EXISTS item_tipo;

-- ---------------------------------------------------------------------
-- OPCIONALES — descomenta solo si confirmas que no las usarás:
-- (insumos: el catálogo vive en catalogos_json; plantillas_actividad:
--  las plantillas son archivos Excel; subscriptions/planes: pueden
--  servir cuando se integre la pasarela de pago — mejor conservarlas)
-- ---------------------------------------------------------------------
-- DROP TABLE IF EXISTS public.insumos              CASCADE;
-- DROP TABLE IF EXISTS public.plantillas_actividad CASCADE;

DO $$
BEGIN
  RAISE NOTICE '=== limpieza_tablas_legacy aplicada ===';
  RAISE NOTICE 'items, fichas_costo y conceptos eliminadas (el frontend nunca las usó)';
END;
$$;
