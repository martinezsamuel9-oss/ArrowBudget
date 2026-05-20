# Cotizante — App Web de Presupuestos de Obra

Aplicación web SaaS para crear presupuestos de construcción con fichas de costos unitarios detalladas. Permite a empresas constructoras y profesionales cotizar proyectos de forma rápida, exacta y profesional.

## Características principales

- **Estructura jerárquica**: Capítulos → Sub-capítulos → Actividades
- **Fichas de costos unitarios (APU)** con desglose por materiales, mano de obra, herramientas/equipo y subcontratos
- **Cálculo automático** de costos indirectos, utilidad, imprevistos
- **Exportación** a PDF y Excel
- **Autenticación** con Supabase (email/password + Google OAuth)
- **Suscripciones** mensuales y anuales vía Stripe y PayPal
- **Multi-proyecto** por usuario

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + Vite + TailwindCSS |
| Backend | Node.js + Express |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth |
| Pagos | Stripe + PayPal |
| Hosting recomendado | Vercel (frontend) + Railway (backend) |

## Estructura del repositorio

```
cotizante/
├── frontend/             # App React (Vite)
│   ├── src/
│   │   ├── components/   # PresupuestoTable, FichaCostoModal, etc.
│   │   ├── pages/        # Login, Dashboard, Presupuesto, Planes
│   │   ├── context/      # AuthContext
│   │   └── lib/          # supabase client, helpers
│   └── package.json
├── backend/              # API Node/Express
│   └── src/
│       ├── routes/       # stripe, paypal, webhooks
│       └── middleware/   # auth, errores
├── supabase/             # Esquema SQL
│   └── schema.sql
├── prototipo.html        # Demo single-file (abrir en navegador)
└── README.md
```

## Inicio rápido

### 1. Ver el prototipo (sin instalación)

Abrí `prototipo.html` directamente en cualquier navegador moderno. Es un demo completo que muestra la UI de presupuestos y la ficha de costos en una ventana modal, igual que las imágenes de referencia.

### 2. Setup del proyecto completo

#### Frontend
```bash
cd frontend
npm install
cp .env.example .env   # configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

#### Backend
```bash
cd backend
npm install
cp .env.example .env   # configurar Stripe keys, PayPal keys, Supabase service role
npm run dev
```

#### Supabase
1. Crear proyecto en https://supabase.com
2. Ir al SQL Editor y ejecutar `supabase/schema.sql`
3. Habilitar Auth providers (Email + Google)
4. Copiar las claves a los archivos `.env`

## Planes de suscripción

| Plan | Precio | Características |
|------|--------|-----------------|
| Básico | $9.99/mes ($99/año) | 5 proyectos, exportación PDF |
| Profesional | $24.99/mes ($249/año) | Proyectos ilimitados, PDF + Excel, plantillas |
| Empresarial | $49.99/mes ($499/año) | Todo + multi-usuario + soporte prioritario |

## Lógica de cálculo de la ficha de costos

```
Costo Directo = Σ(Materiales) + Σ(Mano de Obra) + Σ(Herramienta y Equipo) + Σ(Subcontratos)
Costos Indirectos = Costo Directo × % Indirectos
Imprevistos = Subtotal × % Imprevistos
Utilidad = Subtotal × % Utilidad
Precio Unitario = Costo Directo + Indirectos + Imprevistos + Utilidad
Subtotal Actividad = Precio Unitario × Cantidad
```

Cada concepto (material, mano de obra, etc.) se calcula como:
```
Costo Concepto = Rendimiento × Costo Unitario × (1 + Desperdicio%)
```

## Roadmap

- [x] Prototipo funcional UI
- [x] Esquema de base de datos
- [x] Estructura React + Vite
- [x] Backend Express con Stripe/PayPal
- [ ] Integración completa Supabase ↔ React
- [ ] Exportación PDF (jsPDF)
- [ ] Exportación Excel (SheetJS)
- [ ] Plantillas de catálogo (insumos base)
- [ ] Multi-usuario por organización
- [ ] App móvil (React Native)

## Licencia

Propiedad de Samuel Martinez — todos los derechos reservados.
