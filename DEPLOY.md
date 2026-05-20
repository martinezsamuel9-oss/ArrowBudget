# Guía de Deploy — Cotizante en app.innova504.com

## Paso 1 — Crear la base de datos en Supabase

1. Ve a [supabase.com](https://supabase.com) e inicia sesión
2. Clic en **New project** → ponle nombre (ej. `cotizante`) → elige región más cercana → crea contraseña segura
3. Espera ~2 minutos mientras aprovisiona el proyecto
4. Ve a **SQL Editor** (ícono de base de datos en la barra izquierda)
5. Clic en **New query** → pega todo el contenido de `supabase/schema.sql` → clic **Run**
6. Deberías ver "Success. No rows returned" — la BD está lista

### Obtener las claves de Supabase
Ve a **Settings → API** y copia:
- **Project URL** → es tu `VITE_SUPABASE_URL`
- **anon / public key** → es tu `VITE_SUPABASE_ANON_KEY`

### Habilitar autenticación por email
Ve a **Authentication → Providers → Email** y asegúrate de que esté habilitado.  
Opcionalmente activa **Google OAuth** en el mismo menú (necesitas credenciales de Google Cloud Console).

---

## Paso 2 — Configurar variables de entorno del frontend

En el repo, crea el archivo `frontend/.env` con tus claves reales:

```
VITE_SUPABASE_URL=https://XXXXXXXXXXXXXXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...tu-anon-key...
VITE_API_URL=http://localhost:4000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_PAYPAL_CLIENT_ID=...
```

> **Importante:** El archivo `.env` NO debe subirse a GitHub. Verifica que `.gitignore` lo incluya.  
> Las variables de entorno para producción se configuran directamente en Cloudflare Pages (ver Paso 3).

---

## Paso 3 — Deploy en Cloudflare Pages

### 3.1 Crear el proyecto en Cloudflare Pages

1. Ve a [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages** → **Create a project**
2. Elige **Connect to Git** → selecciona el repositorio de Cotizante en GitHub
3. Configura el build:
   | Campo | Valor |
   |-------|-------|
   | Framework preset | Vite |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `frontend` |

4. Clic en **Save and Deploy** — Cloudflare hará el primer build

### 3.2 Agregar variables de entorno en Cloudflare

Antes de que el build funcione en producción, agrega las variables:

1. Ve a tu proyecto en Pages → **Settings → Environment variables**
2. Agrega estas variables (en **Production**):

   | Variable | Valor |
   |----------|-------|
   | `VITE_SUPABASE_URL` | `https://XXXXXXXX.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` |
   | `VITE_API_URL` | *(dejar vacío por ahora)* |

3. Clic **Save** y luego **Retry deployment** para que aplique las variables

### 3.3 Asignar el subdominio app.innova504.com

1. En tu proyecto de Pages → **Custom domains** → **Set up a custom domain**
2. Escribe `app.innova504.com` → clic **Continue**
3. Cloudflare detectará automáticamente que el dominio está en tu cuenta y agregará el registro DNS
4. Clic **Activate domain**
5. En ~1 minuto el sitio estará en `https://app.innova504.com`

### 3.4 Actualizar la URL de redirect en Supabase

Para que el login redirija correctamente después de autenticarse:

1. Ve a Supabase → **Authentication → URL Configuration**
2. En **Site URL** pon: `https://app.innova504.com`
3. En **Redirect URLs** agrega: `https://app.innova504.com/**`
4. Guarda

---

## Verificación final

Visita `https://app.innova504.com` y comprueba:
- [ ] La página de login carga correctamente
- [ ] Puedes registrar un usuario nuevo
- [ ] El usuario queda guardado en Supabase → Authentication → Users
- [ ] Al hacer login llegas al Dashboard
- [ ] Puedes crear un presupuesto nuevo y se guarda automáticamente

---

## Próximos pasos (Fase 2 — Pagos)

Cuando quieras activar las suscripciones:
1. Despliega el backend en [Railway](https://railway.app) (conecta el repo, carpeta `backend`)
2. Configura las variables del backend: Stripe keys, PayPal keys, Supabase service role key
3. Actualiza `VITE_API_URL` en Cloudflare Pages con la URL del backend
4. Crea los productos y precios en el dashboard de Stripe
5. Registra los webhooks apuntando a tu backend
