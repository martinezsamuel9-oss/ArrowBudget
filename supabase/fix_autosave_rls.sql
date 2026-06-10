-- =====================================================================
-- ARROW BUDGET — FIX: auto-save de presupuestos no persiste
-- (síntoma visible: la moneda del proyecto revierte al recargar,
--  el dashboard vuelve a mostrar la cartera en una sola moneda)
--
-- CAUSA RAÍZ:
--   La política "presupuestos_update_member" usa can_write_project(),
--   que a su vez usa user_project_role(), y ambas siguen comparando
--   contra los roles LEGACY ('dueno','administrador','estimador').
--   Tras migrar a los 8 roles Arrow ('gerente', 'ing_costos_1', ...)
--   esas funciones devuelven false/NULL para todos los usuarios.
--   Un UPDATE bloqueado por USING de RLS NO da error: simplemente
--   afecta 0 filas → el frontend cree que guardó, pero al recargar
--   todo revierte a lo que hay en la base.
--
--   Además, la política de UPDATE no tiene fallback de dueño
--   (user_id = auth.uid()), a diferencia de las políticas de items.
--
-- Ejecutar COMPLETO en el SQL Editor de Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. get_project_role: tolerante a roles legacy Y roles Arrow.
--    Castea a text para no romper si org_members.role ya es
--    presupuesto_role (o sigue siendo org_role).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_project_role(uid uuid, pid uuid)
RETURNS text AS $$
DECLARE
  v_esp text;
  v_org text;
BEGIN
  -- 1. Rol específico en el proyecto
  SELECT rol_especifico::text INTO v_esp
  FROM public.project_members
  WHERE user_id = uid AND presupuesto_id = pid
  LIMIT 1;

  IF v_esp IS NOT NULL THEN
    RETURN v_esp;
  END IF;

  -- 2. Dueño del proyecto → gerente
  IF EXISTS (SELECT 1 FROM public.presupuestos WHERE id = pid AND user_id = uid) THEN
    RETURN 'gerente';
  END IF;

  -- 3. Rol en la org → mapear legacy a rol Arrow; si ya es Arrow, devolverlo
  SELECT om.role::text INTO v_org
  FROM public.org_members om
  JOIN public.presupuestos p ON p.org_id = om.org_id
  WHERE om.user_id = uid AND p.id = pid
  LIMIT 1;

  RETURN CASE v_org
    WHEN 'dueno'         THEN 'gerente'       -- legacy
    WHEN 'administrador' THEN 'gerente'       -- legacy
    WHEN 'estimador'     THEN 'ing_costos_1'  -- legacy
    WHEN 'visualizador'  THEN 'cliente'       -- legacy
    ELSE v_org                                -- ya es rol Arrow o NULL
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 2. can_read / can_write / can_delete sobre get_project_role
--    + fallback explícito de dueño del proyecto.
--    (can_write_project también la usan las políticas de items,
--    fichas_costo y conceptos, así que esto las arregla todas.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_project(uid uuid, pid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.presupuestos WHERE id = pid AND user_id = uid)
      OR public.get_project_role(uid, pid) IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_write_project(uid uuid, pid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.presupuestos WHERE id = pid AND user_id = uid)
      OR public.get_project_role(uid, pid) IN
         ('gerente','ing_costos_1','ing_costos_2','ing_residente','supervisor','compras');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_delete_project(uid uuid, pid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.presupuestos WHERE id = pid AND user_id = uid)
      OR public.get_project_role(uid, pid) = 'gerente';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 3. Políticas de presupuestos: agregar fallback de dueño
--    y WITH CHECK en UPDATE.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "presupuestos_update_member" ON public.presupuestos;
CREATE POLICY "presupuestos_update_member" ON public.presupuestos
  FOR UPDATE
  USING      (user_id = auth.uid() OR public.can_write_project(auth.uid(), id))
  WITH CHECK (user_id = auth.uid() OR public.can_write_project(auth.uid(), id));

DROP POLICY IF EXISTS "presupuestos_delete_owner" ON public.presupuestos;
CREATE POLICY "presupuestos_delete_owner" ON public.presupuestos
  FOR DELETE
  USING (user_id = auth.uid() OR public.can_delete_project(auth.uid(), id));

-- ---------------------------------------------------------------------
-- VERIFICACIÓN (correr logueado desde la app, o revisar manualmente):
--   - En la app: cambiar la moneda de un proyecto, esperar ~2s,
--     recargar → debe conservarse.
--   - La consola del navegador ya no debe mostrar
--     "[auto-save] 0 filas actualizadas".
-- ---------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '=== fix_autosave_rls aplicado ===';
  RAISE NOTICE 'get_project_role / can_*_project actualizados a roles Arrow + fallback dueño';
  RAISE NOTICE 'Políticas UPDATE/DELETE de presupuestos con fallback user_id = auth.uid()';
END;
$$;
