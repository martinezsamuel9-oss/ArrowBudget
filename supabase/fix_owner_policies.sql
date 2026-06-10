-- =====================================================================
-- ARROW BUDGET — FIX de emergencia: el dueño SIEMPRE puede guardar
--
-- El auto-save sigue afectando 0 filas después de fix_autosave_rls.sql,
-- así que algo en las políticas/funciones vivas sigue bloqueando el
-- UPDATE. Estas políticas usan SOLO user_id = auth.uid() (sin llamar a
-- ninguna función), y como las políticas permisivas se combinan con OR,
-- garantizan el guardado del dueño sin importar qué más esté roto.
--
-- Ejecutar COMPLETO en el SQL Editor de Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DIAGNÓSTICO — correr primero y revisar el resultado:
--    debe haber políticas UPDATE sobre presupuestos y todas "PERMISSIVE"
-- ---------------------------------------------------------------------
SELECT policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'presupuestos'
ORDER BY cmd, policyname;

-- ---------------------------------------------------------------------
-- 2. Políticas de dueño (sin funciones — no pueden fallar por roles)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "presupuestos_owner_select" ON public.presupuestos;
CREATE POLICY "presupuestos_owner_select" ON public.presupuestos
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "presupuestos_owner_update" ON public.presupuestos;
CREATE POLICY "presupuestos_owner_update" ON public.presupuestos
  FOR UPDATE
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "presupuestos_owner_delete" ON public.presupuestos;
CREATE POLICY "presupuestos_owner_delete" ON public.presupuestos
  FOR DELETE USING (user_id = auth.uid());

DO $$
BEGIN
  RAISE NOTICE '=== fix_owner_policies aplicado ===';
  RAISE NOTICE 'El dueño (user_id = auth.uid()) ya puede SELECT/UPDATE/DELETE sus presupuestos sin depender de funciones de rol.';
END;
$$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN en la app:
--   1. Recargar la página (para limpiar el aviso de la sesión)
--   2. Cambiar la moneda del proyecto, esperar ~2s
--   3. El indicador debe decir "Guardando…" y luego "Guardado · ahora"
--   4. Recargar de nuevo → el cambio debe conservarse
--
-- Si la alerta vuelve a salir, ahora incluye la causa exacta
-- (código de error o "0 filas") — compártela para seguir el rastro.
-- ---------------------------------------------------------------------
