-- Custom SQL migration file, put your code below! --
-- Bucket de Supabase Storage para las fotos/PDFs de reclamos (paso 5.4).
-- Creado acá, no a mano desde el dashboard -- resuelve el Pendiente
-- anotado en CLAUDE.md desde la separación dev/producción: un bucket
-- creado a mano en un proyecto de Supabase no existe en los demás (dev,
-- producción, cualquier proyecto nuevo), el mismo problema que esa
-- separación ya expuso para los usuarios de Auth. Con esto en una
-- migración, db:migrate/db:migrate:prod lo dejan listo en cualquier
-- proyecto sin un paso manual más que recordar.
--
-- ON CONFLICT DO NOTHING: idempotente si esta migración corriera dos veces
-- contra el mismo proyecto (no debería pasar en el flujo normal de
-- drizzle-kit, que registra qué migraciones ya aplicó, pero no cuesta nada
-- que la sentencia en sí también lo sea).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  false, -- privado: se sirve con URLs firmadas de corta duración (ver CLAUDE.md > Reglas de seguridad, "Los archivos de Storage se sirven con URLs firmadas de corta duración, nunca con links públicos directos") -- esta regla ya estaba escrita antes de que existiera ningún bucket, en anticipación a este paso.
  5242880, -- 5 MB por archivo: backstop a nivel de bucket, no el límite real (ese es la compresión del lado del cliente, ver el reporte de este paso) -- misma lógica de "defensa en profundidad" que Zod validando en el servidor aunque el cliente ya validó.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] -- "solo imágenes y PDF", pedido explícito del paso 5.4. Las imágenes que suba el formulario público van a llegar como image/jpeg (la compresión del cliente reencodea todo a JPEG antes de subir -- ver compress-image.ts), pero el bucket acepta png/webp igual por si algún día otro flujo (ej. el panel) sube sin pasar por esa compresión.
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- Policies sobre storage.objects: es una tabla real de Postgres, pero la
-- administra el motor de Storage de Supabase, no nosotros -- por eso esta
-- migración NO le aplica el mismo REVOKE ALL + ALTER DEFAULT PRIVILEGES
-- que la migración 0013 aplicó a nuestras propias tablas. Ese REVOKE es
-- sobre objetos que creamos y controlamos por completo; storage.objects/
-- storage.buckets necesitan sus propios grants internos para que la API de
-- Storage funcione -- tocarlos ahí podría romper la API entera, no solo
-- restringir anon/authenticated. RLS ya viene HABILITADO por Supabase en
-- storage.objects por default (no hace falta -- ni corresponde --
-- ENABLE ROW LEVEL SECURITY acá): alcanza con agregar las policies, que es
-- el mecanismo soportado y documentado por Supabase para este esquema.

-- Único camino de escritura de todo este bucket: el formulario público
-- (/r/[token], sin sesión) sube directo desde el navegador con el cliente
-- de Supabase, mismo carve-out que ya existe para Auth (ver CLAUDE.md >
-- Convenciones: "el cliente de Supabase en el navegador se usa SOLO para
-- Auth y Storage, nunca para leer ni escribir tablas de negocio" -- esto
-- ES ese caso, no una excepción a la regla). Alcance limitado al prefijo
-- pending/: el reclamo (y su ticket_id real) todavía no existe en este
-- paso -- ver el reporte de este paso para el razonamiento completo de por
-- qué pending/<sessionId>/... y no un ticket_id que todavía no hay.
CREATE POLICY "anon_insert_pending_ticket_attachments"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND name LIKE 'pending/%'
);
--> statement-breakpoint

-- Permite que el propio vecino saque una foto que acaba de subir (en el
-- paso 3, antes de confirmar el reclamo) sin dejar un huérfano en Storage
-- que después haya que limpiar aparte -- una foto sacada de la lista se
-- borra de verdad, no queda ocupando cuota. Mismo alcance que el INSERT de
-- arriba: solo bajo pending/.
CREATE POLICY "anon_delete_pending_ticket_attachments"
ON storage.objects FOR DELETE
TO anon
USING (
  bucket_id = 'ticket-attachments'
  AND name LIKE 'pending/%'
);
--> statement-breakpoint

-- A propósito, SIN policy de SELECT para anon ni para authenticated. Mismo
-- criterio que CLAUDE.md > Políticas RLS ya aplica a nuestras tablas: "el
-- rol de la app evade RLS... la defensa real es la aplicación, filtrando
-- en el servidor, no una policy que un rol público pueda evaluar". Cuando
-- exista una pantalla de administrador que muestre estas fotos (etapa
-- posterior, no este paso), va a pedir una URL firmada generada del lado
-- del servidor con la service-role key -- que evade estas policies igual
-- que el rol "postgres" ya evade RLS en las tablas -- con el
-- organization_id/building_id chequeado en código de aplicación ANTES de
-- generarla. Evalué la alternativa (una policy de SELECT para
-- "authenticated" con un EXISTS contra ticket_attachments/tickets/
-- app_users para reconstruir ese chequeo acá) y la descarté a propósito:
-- sería más código, corre en cada lectura de Storage, y termina
-- reimplementando en SQL una autorización que la aplicación ya resuelve
-- mejor -- no es la excepción, es la MISMA arquitectura que el resto del
-- proyecto ya eligió para las tablas, aplicada acá sin inventar un segundo
-- criterio.
