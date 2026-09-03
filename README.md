# Consorfy

Plataforma web de gestión de consorcios para administradores de edificios. Tiene dos
superficies: un formulario público donde los vecinos cargan reclamos sin necesidad de
cuenta, y un panel privado donde el administrador gestiona edificios, reclamos,
comunicados, recordatorios y documentos.

> **La documentación de fondo vive en [`CLAUDE.md`](./CLAUDE.md).** Este README solo
> alcanza para entender qué es el proyecto y levantar el entorno local. Todo lo demás
> — arquitectura, convenciones, decisiones de diseño e historial paso a paso — está en
> `CLAUDE.md`, que es la fuente de verdad. Este archivo no duplica ese contenido.

## Stack

| Área           | Herramienta                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------- |
| Framework      | Next.js 16.3 (App Router, Turbopack)                                                         |
| UI             | React 19.2, TypeScript 5, Tailwind CSS 4, shadcn/ui (sobre `radix-ui` 1.6)                   |
| Base de datos  | PostgreSQL en Supabase, vía Drizzle ORM 0.45 (`drizzle-kit` 0.31) y el driver `postgres` 3.4 |
| Auth y Storage | Supabase (`@supabase/ssr` 0.12, `@supabase/supabase-js` 2.112)                               |
| Validación     | Zod 4                                                                                        |
| Formularios    | React Hook Form 7                                                                            |
| Email          | Resend 6                                                                                     |
| Tests          | Vitest 4 (unitarios), Playwright 1.62 (e2e)                                                  |
| Lint / formato | ESLint 9, Prettier 3                                                                         |

## Requisitos previos

- **Node.js 22.x** (el proyecto fija `22.14.0` en `.nvmrc`; con `nvm`, `nvm use`).
- **npm** — es el gestor de paquetes del proyecto (hay `package-lock.json`; no uses
  yarn/pnpm/bun).
- **Una cuenta de Supabase** con un proyecto propio para desarrollo. Del proyecto se
  necesitan la URL de la API, la clave `anon`, la clave `service_role` y las cadenas de
  conexión de Postgres (todo en _Project Settings > API_ y _Project Settings > Database_).
- **Una cuenta de Resend** con una API key (`resend.com`). La app no arranca sin esta
  variable, aunque para desarrollo local el envío real de emails no es imprescindible.

## Setup local

### 1. Clonar e instalar

```bash
git clone https://github.com/matiasdemetriorufeil/consorfy.git
cd consorfy
npm install
```

### 2. Variables de entorno

Copiá el ejemplo y completá los valores:

```bash
cp .env.example .env.local
```

`.env.example` tiene un comentario por variable explicando de dónde sale cada valor.
Los **nombres** que hay que completar en `.env.local` (proyecto de **desarrollo**):

| Variable                        | Para qué                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL de la API del proyecto de Supabase                                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública `anon` de Supabase (segura en el cliente)                                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Clave `service_role` de Supabase — **solo servidor**, evade RLS                                     |
| `DATABASE_URL`                  | Conexión de Postgres que usa la app en runtime (en local: session pooler, puerto 5432)              |
| `MIGRATION_DATABASE_URL`        | Conexión de Postgres que usa `drizzle-kit` para migraciones (session pooler, puerto 5432)           |
| `NEXT_PUBLIC_APP_URL`           | URL base pública de la app (en local: `http://localhost:3000`)                                      |
| `RESEND_API_KEY`                | API key de Resend (requerida para que la app arranque)                                              |
| `CRON_SECRET`                   | Secreto que protege `/api/cron/daily` (requerido para que la app arranque; generá un valor al azar) |
| `MESSAGING_PROVIDER`            | Opcional. Proveedor del flujo de comunicados. Vacío = `console` (no manda nada real)                |

Todos los valores son placeholders del estilo `tu-valor-aca` hasta que los completes con
los reales de tu proyecto de Supabase / Resend. **Nunca commitees `.env.local`** (ya está
en `.gitignore`).

> `DATABASE_URL` y `NEXT_PUBLIC_SUPABASE_URL` tienen que apuntar **al mismo** proyecto de
> Supabase. La app se niega a arrancar si detecta que apuntan a proyectos distintos —
> ver `src/lib/env.ts` y `CLAUDE.md > Separación dev/producción`.

### 3. Migraciones

Aplicá el esquema contra tu base de **desarrollo**:

```bash
npm run db:migrate
```

Si cambiás algo en `src/db/schema/`, generá la migración nueva antes de aplicarla:

```bash
npm run db:generate
npm run db:migrate
```

Nunca uses `npm run db:push` en este proyecto (se pierde el historial de migraciones).

### 4. Seed de datos de desarrollo

`npm run db:seed` **borra y recrea** todo el contenido de las tablas de negocio con
datos de ejemplo (una organización, 3 edificios, ~40 unidades, ~50 personas, ~30
reclamos, etc.). Tiene salvaguardas que impiden que corra contra producción, y exige una
frase de confirmación explícita:

```bash
SEED_CONFIRM=si-quiero-borrar-y-recrear-los-datos-de-desarrollo npm run db:seed
```

(Agregá `-- --yes` al final para saltear la confirmación interactiva; útil en CI.)

El seed **no** crea el usuario administrador del panel (vive en Supabase Auth, que se
administra aparte). Para tener acceso al panel:

1. En el dashboard de Supabase: _Authentication > Users > Add user > Create new user_,
   con _Auto Confirm User_ activado.
2. Copiá el _User UID_ que Supabase le asigna.
3. Volvé a correr el seed pasándole ese id y el mismo email:

   ```bash
   SEED_CONFIRM=si-quiero-borrar-y-recrear-los-datos-de-desarrollo \
   SEED_ADMIN_USER_ID=<uuid-del-usuario-de-auth> \
   SEED_ADMIN_EMAIL=<el-mismo-email-que-cargaste-en-el-paso-1> \
   npm run db:seed
   ```

### 5. Levantar el dev server

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). El panel está en `/panel` (pide
login); el formulario público de un edificio en `/r/<token>`.

## Scripts

| Script                    | Qué hace                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`             | Servidor de desarrollo (Turbopack) en `:3000`.                                                   |
| `npm run build`           | Build de producción.                                                                             |
| `npm run start`           | Sirve el build de producción localmente.                                                         |
| `npm run lint`            | ESLint sobre todo el proyecto.                                                                   |
| `npm run format`          | Formatea todo con Prettier (escribe cambios).                                                    |
| `npm run format:check`    | Verifica formato sin escribir nada.                                                              |
| `npm run test`            | Tests unitarios con Vitest (una sola corrida).                                                   |
| `npm run test:watch`      | Vitest en modo watch.                                                                            |
| `npm run test:e2e`        | Tests end-to-end con Playwright.                                                                 |
| `npm run db:generate`     | Genera un archivo de migración SQL a partir de los cambios en `src/db/schema/`.                  |
| `npm run db:migrate`      | Aplica las migraciones pendientes contra la base de **desarrollo** (`.env.local`).               |
| `npm run db:migrate:prod` | Igual, pero contra **producción** (`.env.production-secrets.local`). Comando aparte a propósito. |
| `npm run db:studio`       | Abre Drizzle Studio contra la base de desarrollo (`npm run db:studio:prod` para producción).     |
| `npm run db:seed`         | Borra y recrea los datos de desarrollo. Ver la sección de setup.                                 |

## Tests

### Unitarios (Vitest)

```bash
npm run test
```

Cubren lógica de dominio pura (formateo de mensajes, detección de similitud, resolución
de segmentos, recurrencia de recordatorios, validaciones, etc.). **No** tocan la base de
datos ni la red ni necesitan variables de entorno — corren en cualquier checkout recién
instalado.

### End-to-end (Playwright)

```bash
npm run test:e2e
```

Cubren los dos flujos críticos: alta de un reclamo desde el formulario público, y
gestión de un reclamo desde el panel (login, bandeja, filtro, detalle, cambio de estado).

Necesitan de entorno:

- Un `.env.local` completo (leen `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`).
- Un dev server: si ya tenés `npm run dev` corriendo en `:3000`, Playwright lo reusa; si
  no, lo levanta solo.

Corren **contra la base de datos de desarrollo**, nunca contra producción — el
`globalSetup` crea una cuenta de administrador descartable (Auth + fila en `app_users`) y
el `globalTeardown` la borra por completo al terminar, incluso si un test falla. Los
datos de prueba que crean van con prefijo identificable y se limpian solos.

## Documentación

**[`CLAUDE.md`](./CLAUDE.md)** es la fuente de verdad del proyecto: arquitectura, modelo
de datos, políticas de seguridad (RLS, `authorizedAction()`), convenciones de código y de
voz, reglas de entorno, separación dev/producción, y el historial detallado de cada paso
de cada etapa con el razonamiento detrás de cada decisión. Si algo de este README y de
`CLAUDE.md` no coincide, gana `CLAUDE.md`.

`AGENTS.md` solo apunta a `CLAUDE.md` (más un bloque que `next dev` regenera solo).

## Estado del proyecto

La construcción del producto (Etapas 0 a 11: intake de reclamos, panel, bandeja,
incidentes, comunicados, recordatorios y notificaciones, biblioteca de documentos, y
superficie pública) está terminada. La **Etapa 12 (consolidación)** — tests unitarios y
e2e, auditoría de seguridad, optimización de rendimiento, manejo de errores y estados
vacíos, accesibilidad, y este README — está **completa**.

Según lo que anota `CLAUDE.md`, el trabajo futuro conocido es:

- **Etapa 13** — migrar el flujo de comunicados masivos a la Cloud API de WhatsApp
  Business (hoy funciona con links manuales).
- **Etapa 15** — deploy: Content-Security-Policy y HSTS afinados al dominio real, y
  verificación del logging de producción.

Sin fechas comprometidas.
