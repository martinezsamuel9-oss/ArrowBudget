-- =====================================================================
-- ARROW BUDGET — MÓDULO DE USUARIOS v2 (creación directa estilo Arrow)
--
-- El gerente crea el usuario desde la app (Edge Function crear-usuario):
-- la cuenta nace confirmada, con clave temporal y pre-asignada a la org
-- del gerente. Este script actualiza el trigger de registro para que:
--   - usuarios PRE-ASIGNADOS (metadata invited_to_org) se unan a esa org
--     con el rol indicado, SIN crearles una organización propia
--   - registros normales sigan creando su propia org como hasta ahora
--
-- Ejecutar DESPUÉS de fixes_criticos_produccion.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id     uuid;
  v_nombre     text;
  v_invite_org uuid;
  v_invite_rol text;
BEGIN
  v_nombre := COALESCE(
    NULLIF(new.raw_user_meta_data->>'full_name', ''),
    NULLIF(new.raw_user_meta_data->>'name', ''),
    SPLIT_PART(new.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, nombre, full_name)
  VALUES (new.id, new.email, v_nombre, v_nombre)
  ON CONFLICT (id) DO UPDATE SET
    nombre    = COALESCE(NULLIF(EXCLUDED.nombre, ''), profiles.nombre),
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    email     = EXCLUDED.email;

  -- ── Usuario creado por un gerente (Edge Function crear-usuario) ──
  v_invite_org := NULLIF(new.raw_user_meta_data->>'invited_to_org', '')::uuid;
  IF v_invite_org IS NOT NULL THEN
    v_invite_rol := COALESCE(NULLIF(new.raw_user_meta_data->>'invited_role', ''), 'cliente');
    INSERT INTO public.org_members (org_id, user_id, role, invited_by, status)
    VALUES (
      v_invite_org,
      new.id,
      public.map_legacy_role(v_invite_rol),
      NULLIF(new.raw_user_meta_data->>'invited_by', '')::uuid,
      'activo'
    )
    ON CONFLICT (org_id, user_id) DO NOTHING;
    RETURN new;   -- NO se le crea organización propia
  END IF;

  -- ── Registro normal: crear su propia organización ──
  INSERT INTO public.organizations (nombre, created_by, plan_id, max_usuarios, max_proyectos, subscription_status)
  VALUES (
    COALESCE(NULLIF(new.raw_user_meta_data->>'company_name', ''), v_nombre || ' Org'),
    new.id, 'intermedio', 5, 5, 'trialing'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.org_members (org_id, user_id, role, status)
  VALUES (v_org_id, new.id, 'gerente', 'activo');

  RETURN new;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '=== modulo_usuarios_v2 aplicado ===';
  RAISE NOTICE 'handle_new_user: usuarios pre-asignados se unen a la org del gerente (sin org propia)';
END;
$$;
