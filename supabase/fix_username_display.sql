-- =====================================================================
-- FIX: Mostrar nombre completo en lugar del correo electrónico
-- Ejecutar en el SQL Editor de Supabase
-- =====================================================================

-- 1. Corregir trigger para que nuevos usuarios guarden full_name en profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Backfill: poblar full_name en usuarios existentes que ya tienen
--    el nombre en auth.users pero no en profiles
UPDATE public.profiles p
SET full_name = u.raw_user_meta_data->>'full_name'
FROM auth.users u
WHERE p.id = u.id
  AND (p.full_name IS NULL OR p.full_name = '')
  AND u.raw_user_meta_data->>'full_name' IS NOT NULL
  AND u.raw_user_meta_data->>'full_name' != '';
