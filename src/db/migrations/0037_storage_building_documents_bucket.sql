-- Custom SQL migration file, put your code below! --
-- Bucket de Supabase Storage para la biblioteca de documentos del panel
-- (paso 10.1). Creado por migración, no a mano desde el dashboard -- mismo
-- criterio que la migración 0019 (bucket `ticket-attachments`): un bucket
-- creado a mano no existe en los demás proyectos de Supabase (dev,
-- producción, cualquier checkout nuevo), y `db:migrate`/`db:migrate:prod`
-- lo dejan listo sin un paso manual más que recordar.
--
-- ON CONFLICT DO NOTHING: idempotente si la sentencia corriera dos veces
-- contra el mismo proyecto (drizzle-kit no debería reaplicar una migración
-- ya registrada, pero no cuesta nada que la sentencia también lo sea).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'building-documents',
  'building-documents',
  false, -- privado: se sirve con URLs firmadas de corta duración generadas del lado del servidor (paso 10.4). La privacidad del bucket se define acá, en la subida, no después. Ver CLAUDE.md > Reglas de seguridad ("Los archivos de Storage se sirven con URLs firmadas de corta duración, nunca con links públicos directos").
  10485760, -- 10 MB por archivo: backstop a nivel de bucket, no la única defensa (la Server Action ya valida tamaño en el servidor -- ver src/features/documents/document-schema.ts). Distinto del bucket de reclamos (5 MB) a propósito: los adjuntos de reclamos son fotos comprimidas en el cliente a cientos de KB; estos son documentos administrativos (PDF/Word/Excel) de baja frecuencia que no se pueden comprimir. Presupuesto total de Storage: 1 GB (free tier).
  ARRAY[
    'application/pdf',
    'application/msword',                                                         -- .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',     -- .docx
    'application/vnd.ms-excel',                                                    -- .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',           -- .xlsx
    'image/jpeg',                                                                  -- .jpg / .jpeg
    'image/png'
  ]
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- SIN NINGUNA policy sobre storage.objects -- a diferencia del bucket
-- `ticket-attachments` (migración 0019), que sí necesita policies de `anon`
-- (INSERT/DELETE acotadas a `pending/%`) porque el formulario público sube
-- directo desde el navegador SIN sesión.
--
-- Acá la subida corre en el SERVIDOR, detrás de una Server Action envuelta
-- en `authorizedAction()` (ver src/features/documents/actions.ts): la
-- autorización real la hace la aplicación (sesión válida + filtro por
-- `organization_id`/`building_id`), no una policy que un rol público pueda
-- evaluar -- mismo criterio que CLAUDE.md > Políticas RLS ya aplica a las
-- tablas de negocio ("el rol de la app evade RLS, la defensa real es la
-- aplicación") y que la 0019 dejó documentado para las lecturas de
-- `ticket-attachments`. La escritura y las futuras URLs firmadas (paso
-- 10.4) pasan por `createAdminClient()` (service-role key, src/lib/supabase/
-- admin.ts), que evade estas ausencias de policy igual que el rol
-- `postgres` evade RLS. `anon`/`authenticated` no tienen NINGÚN acceso a
-- este bucket -- ni lectura, ni escritura.
