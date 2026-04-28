# Abocados OS

App unificada de operativa interna de **Frutas Abocados** (Ferlu Project S.L.).

Sustituye en una sola aplicación las 5 webapps separadas que vivían en Netlify:
Manager, Cash, Tareas, Tesorería, Turnos.

## Stack

- Vite + React 19 + TypeScript
- Tailwind v4 + shadcn/ui (manual) + PWA
- React Router 7
- TanStack Query 5
- Supabase (Postgres + Auth + RLS)
- Vercel (deploy)

## Estructura

```
src/
├── modules/         ← un módulo = un panel
│   ├── manager/     (analítica — solo admin_full)
│   ├── cash/        (caja — admins)
│   ├── tareas/      (tareas internas — admins)
│   ├── turnos/      (planning — todos)
│   └── tesoreria/   (banco — admin_full edita, admin_op lee)
├── shared/
│   ├── auth/        (Auth context + ProtectedRoute)
│   ├── components/  (UI compartida + AppShell)
│   ├── lib/         (supabase client, env, utils)
│   └── types/       (tipos compartidos + matriz de permisos)
├── pages/           (Login, Home, NotFound)
├── App.tsx          (router)
└── main.tsx
supabase/
└── migrations/      (SQL versionado)
```

## Setup local

```bash
npm install
cp .env.example .env.local
# Rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

## Roles

- **admin_full** (Luis) — todo
- **admin_op** (Álvaro) — todo menos Manager; en Tesorería solo lectura
- **empleado** (5 trabajadores) — solo Turnos (lectura)

La matriz exacta de permisos vive en `src/shared/types/index.ts` (`MODULE_ACCESS`).

## Estado del proyecto

🚧 **En scaffolding inicial** — login + layout + navegación + estructura modular.
Los 5 módulos están como placeholders. Próximos pasos en `project_ferlu_app.md` (memoria local).
