-- =====================================================================
-- ARROW BUDGET — MÓDULO DE USUARIOS
-- Estado activo/suspendido + invitaciones por link + fixes críticos
-- Ejecutar DESPUÉS de reset_definitivo_rls_roles.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado del miembro (activo / suspendido)
-- ---------------------------------------------------------------------
ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'activo';

DO $$ BEGIN
  ALTER TABLE public.org_members
    ADD CONSTRAINT org_members_status_check CHECK (status IN ('activo','suspendido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. invitations.role → presupuesto_role (por si el reset no llegó a convertirla)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='invitations' AND column_name='role')
     <> 'presupuesto_role' THEN
    ALTER TABLE public.invitations ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.invitations ALTER COLUMN role TYPE presupuesto_role
      USING public.map_legacy_role(role::text);
    ALTER TABLE public.invitations ALTER COLUMN role SET DEFAULT 'cliente';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. CRÍTICO: el trigger de registro aún insertaba el rol legacy 'dueno'
--    → cualquier registro nuevo fallaría tras la migración de roles
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id  uuid;
  v_nombre  text;
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

  INSERT INTO public.organizations (nombre, created_by, plan_id, max_usuarios, max_proyectos, subscription_status)
  VALUES (
    COALESCE(NULLIF(new.raw_user_meta_data->>'company_name', ''), v_nombre || ' Org'),
    new.id, 'intermedio', 5, 5, 'trialing'
  )
  RETURNING id INTO v_org_id;

  -- El creador de la org entra como gerente (antes: 'dueno', rol que ya no existe)
  INSERT INTO public.org_members (org_id, user_id, role, status)
  VALUES (v_org_id, new.id, 'gerente', 'activo');

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Suspensión con efecto real + fix de seguridad:
--    get_project_role devolvía 'cliente' incluso a usuarios SIN relación
--    con la org (map_legacy_role(NULL) caía en el ELSE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.i_am_gerente()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND role::text = 'gerente' AND status = 'activo'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_project_role(uid uuid, pid uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_esp text;
  v_org text;
BEGIN
  -- Suspendido en la org del proyecto → sin acceso por rol
  IF EXISTS (
    SELECT 1 FROM org_members om
    JOIN presupuestos p ON p.org_id = om.org_id
    WHERE om.user_id = uid AND p.id = pid AND om.status = 'suspendido'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT rol_especifico::text INTO v_esp
  FROM project_members WHERE user_id = uid AND presupuesto_id = pid LIMIT 1;
  IF v_esp IS NOT NULL THEN RETURN v_esp; END IF;

  IF EXISTS (SELECT 1 FROM presupuestos WHERE id = pid AND user_id = uid) THEN
    RETURN 'gerente';
  END IF;

  SELECT om.role::text INTO v_org
  FROM org_members om
  JOIN presupuestos p ON p.org_id = om.org_id
  WHERE om.user_id = uid AND p.id = pid
  LIMIT 1;

  IF v_org IS NULL THEN RETURN NULL; END IF;   -- sin relación con la org → sin rol
  RETURN public.map_legacy_role(v_org)::text;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. accept_invitation: marca estado activo y deja al usuario en la org
--    que lo invitó (elimina la membresía de la org auto-creada al registrarse)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv
  FROM invitations
  WHERE token = p_token AND accepted_at IS NULL AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación inválida o expirada');
  END IF;

  IF NOT org_can_add_user(v_inv.org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La organización alcanzó el límite de usuarios');
  END IF;

  INSERT INTO org_members (org_id, user_id, role, invited_by, status)
  VALUES (v_inv.org_id, p_user_id, v_inv.role, v_inv.invited_by, 'activo')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'activo';

  -- Sacarlo de la org que se le creó automáticamente al registrarse,
  -- para que su org efectiva sea la del invitador
  DELETE FROM org_members om
  WHERE om.user_id = p_user_id
    AND om.org_id <> v_inv.org_id
    AND om.org_id IN (SELECT id FROM organizations o WHERE o.created_by = p_user_id);

  UPDATE invitations SET accepted_at = now() WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'org_id', v_inv.org_id, 'role', v_inv.role);
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Políticas limpias de invitations (solo gerentes gestionan)
-- ---------------------------------------------------------------------
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.invitations', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "inv_select" ON public.invitations
  FOR SELECT USING (org_id = public.get_my_org_id());

CREATE POLICY "inv_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    public.i_am_gerente() AND org_id = public.get_my_org_id() AND invited_by = auth.uid()
  );

CREATE POLICY "inv_update" ON public.invitations
  FOR UPDATE
  USING      (public.i_am_gerente() AND org_id = public.get_my_org_id())
  WITH CHECK (org_id = public.get_my_org_id());

CREATE POLICY "inv_delete" ON public.invitations
  FOR DELETE USING (public.i_am_gerente() AND org_id = public.get_my_org_id());

-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
SELECT user_id, role::text, status, joined_at FROM public.org_members ORDER BY joined_at;

DO $$
BEGIN
  RAISE NOTICE '=== modulo_usuarios aplicado ===';
  RAISE NOTICE 'org_members.status + suspensión efectiva + invitaciones con link + registro de usuarios nuevos corregido';
END;
$$;
