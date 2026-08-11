# CLAUDE.md

## Qué es este proyecto

Plataforma web de gestión de consorcios para administradores de edificios. Dos
superficies: un formulario público donde vecinos cargan reclamos (sin login),
y un panel privado donde el administrador gestiona edificios, reclamos,
comunicados, recordatorios y documentos.

Flujo central: el vecino completa el formulario -> el reclamo se registra en
la base -> la app le devuelve un botón que abre WhatsApp con un mensaje
formateado ya escrito -> el vecino lo envía al administrador desde su propia
cuenta.

## Stack

Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind CSS v4,
shadcn/ui, Drizzle ORM, Supabase (Postgres + Auth + Storage), Zod,
React Hook Form.

## Estructura de carpetas

- `src/app/` — solo rutas (páginas, layouts, route handlers). Sin lógica de
  negocio: orquesta y delega a `src/features/`.
- `src/components/` — UI genérica y reutilizable, sin lógica de negocio ni
  conocimiento del dominio (botones, inputs, layout, primitivas de shadcn/ui).
  Si un componente le importa qué es un "reclamo" o un "edificio", no va acá.
- `src/features/<dominio>/` — toda la lógica de negocio, agrupada por dominio
  (`tickets/`, `buildings/`, `announcements/`, etc.). Server Actions,
  componentes específicos del dominio, hooks, validaciones Zod, queries.
- `src/lib/` — utilidades y clientes transversales sin lógica de dominio
  (cliente de Supabase, helpers de fecha/timezone, `MessagingProvider`, etc.).
- `src/db/` — esquema de Drizzle, cliente de conexión, migraciones.

Regla clave: la lógica de dominio vive en `src/features/<dominio>/`;
`src/components/` es pura UI compartida.

## Convenciones

- Texto visible al usuario: español rioplatense (es-AR). Código: inglés
  (variables, funciones, tipos, tablas, archivos).
- Prohibido `any`. Si algo no se puede tipar, usar `unknown` y validar con Zod.
- Server Components por defecto. `"use client"` solo si hay estado, efectos o
  handlers del navegador.
- Base de datos: `snake_case`, tablas en plural, `id uuid`, `created_at` y
  `updated_at` en todas las tablas, `timestamptz` siempre en UTC.
- Borrado lógico con `deleted_at`. Nunca `DELETE` físico en entidades de
  negocio.
- Zona horaria de presentación: `America/Argentina/Cordoba`.

## Acceso a datos

- Todo el acceso a datos desde el servidor pasa por Drizzle (`src/db/index.ts`).
  Nada de queries directas a Postgres por fuera de Drizzle.
- La autorización vive en la capa de aplicación: cada query y cada Server
  Action filtra explícitamente por organización y valida la sesión ANTES de
  tocar datos. Esta es la defensa principal.
- RLS se activa igualmente en todas las tablas, como defensa en profundidad:
  protege a los roles `anon` y `authenticated`, que son alcanzables
  directamente desde el navegador vía PostgREST y el cliente de Supabase, sin
  pasar por el servidor de Next.
- El cliente de Supabase en el navegador se usa SOLO para Auth y Storage,
  nunca para leer ni escribir tablas de negocio.
- Dos conexiones a Postgres, porque Supabase las trata distinto (ver
  `.env.example`): `DATABASE_URL` (pooler de transacciones, puerto 6543) para
  la app en runtime, sin prepared statements; `MIGRATION_DATABASE_URL`
  (pooler de sesión, puerto 5432) para `drizzle-kit`.

## Reglas de seguridad (no negociables)

- RLS activo en todas las tablas. Ninguna tabla sin políticas.
- Toda Server Action valida sesión y pertenencia a la organización antes de
  tocar datos.
- Toda entrada del usuario se valida con Zod EN EL SERVIDOR, aunque ya se haya
  validado en el cliente.
- Credenciales solo en variables de entorno. Nunca en el código ni en commits.
- Los archivos de Storage se sirven con URLs firmadas de corta duración, nunca
  con links públicos directos.

## Reglas de WhatsApp

- Todo lo relacionado con mensajería pasa por la interfaz `MessagingProvider`.
  Ningún componente de UI ni de dominio importa nada de WhatsApp directamente.
- Los links `wa.me` solo transportan TEXTO. Los adjuntos nunca viajan en el
  mensaje: se referencian con un link a la plataforma.
- El reclamo se guarda en la base ANTES de abrir WhatsApp, nunca después. No
  podemos confirmar que el vecino haya apretado enviar.

## Formato del mensaje al administrador

```
🏢 Edificio: {edificio}
👤 Vecino: {nombre}
🚪 Departamento: {unidad}
🔧 Categoría: {categoria}
⚠️ Prioridad: {prioridad}
📝 Problema: {descripcion}
📷 Adjuntos: {link}
🔖 Código: {codigo}
```

## Voz y escritura

- Las palabras de la interfaz son material de diseño, no decoración. Están
  para que algo sea más fácil de entender y de usar.
- Nombrar las cosas como las reconoce el usuario, nunca como está construido
  el sistema. Un administrador gestiona "avisos a los vecinos", no
  "broadcasts". Un vecino carga un "reclamo", no un "ticket" (aunque en el
  código la tabla se llame tickets).
- Voz activa y sentence case. Los botones dicen exactamente qué pasa al
  usarlos: "Enviar por WhatsApp", no "Confirmar".
- Una acción conserva el mismo nombre en todo el flujo: si el botón dice
  "Publicar aviso", el toast dice "Aviso publicado".
- Los errores explican qué pasó y cómo seguir. No se disculpan, no son vagos
  y no culpan al usuario.
- Las pantallas vacías son una invitación a actuar, no un cartel de tristeza.
  Dicen qué va a aparecer ahí y ofrecen la acción para empezar.
- Cada elemento hace un solo trabajo: una etiqueta etiqueta, un ejemplo
  ejemplifica. Nada hace doble función.
- Español rioplatense: voseo ("ingresá", "cargá", "revisá"), sin "usted".
- Sin signos de admiración salvo que haya algo genuino que celebrar.

## Glosario

Vocabulario del dominio en las dos direcciones, para que la UI y el código no
se contaminen entre sí:

| Concepto     | En la UI          | En el código |
| ------------ | ----------------- | ------------ |
| reclamo      | reclamo           | ticket       |
| edificio     | edificio          | building     |
| unidad       | departamento      | unit         |
| vecino       | vecino            | person       |
| aviso masivo | aviso             | announcement |
| recordatorio | recordatorio      | reminder     |
| agrupación   | problema en común | incident     |

## Comandos

- `npm run dev` — levanta el servidor de desarrollo.
- `npm run build` — build de producción.
- `npm run start` — sirve el build de producción.
- `npm run lint` — corre ESLint.
- `npm run format` — formatea todo el proyecto con Prettier.
- `npm run format:check` — verifica formato sin escribir cambios.
- `npm run db:generate` — genera un archivo de migración SQL a partir de los
  cambios en `src/db/schema/`. Usar siempre que cambia el esquema.
- `npm run db:migrate` — aplica las migraciones pendientes contra la base.
  Usar siempre después de `db:generate`, tanto en local como en deploy.
- `npm run db:push` — sincroniza el esquema directo contra la base, sin
  generar migración. **Nunca en este proyecto**: se pierde el historial de
  cambios que da `generate` + `migrate`. Existe solo por si hace falta
  prototipar algo descartable en una base personal, nunca contra Supabase.
- `npm run db:studio` — abre Drizzle Studio para inspeccionar la base.

## Qué NO hacer

- No instalar dependencias nuevas sin avisar y justificar.
- No hacer refactors ni "mejoras" fuera del alcance del paso pedido.
- No inventar APIs ni props de librerías: si no estás seguro, verificá la
  documentación o preguntá.
- No borrar ni editar migraciones ya aplicadas. Crear una nueva.
- No crear archivos de documentación extra (READMEs por carpeta, etc.).
