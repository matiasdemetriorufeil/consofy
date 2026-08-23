import { AnnouncementSegmentForm } from "@/features/announcements/components/announcement-segment-form";
import { getActiveBuildings } from "@/features/buildings/queries";
import { requireUser } from "@/lib/auth";

// Constructor de segmentos (paso 8.2) -- crear un aviso nuevo como
// borrador, con el segmento de destinatarios armado y contado en vivo
// contra datos reales. Nada se envía en este paso (eso es 8.4/8.5).
export default async function NewAnnouncementPage() {
  const { organization } = await requireUser();
  const buildings = await getActiveBuildings(organization.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-ink font-display text-xl font-semibold">
        Nuevo aviso
      </h1>
      <AnnouncementSegmentForm buildings={buildings} />
    </div>
  );
}
