import { notFound } from "next/navigation";

import { AnnouncementSegmentForm } from "@/features/announcements/components/announcement-segment-form";
import {
  getAnnouncementDraftForEdit,
  getPeopleForSegmentDisplay,
} from "@/features/announcements/queries";
import { getActiveBuildings } from "@/features/buildings/queries";
import { requireUser } from "@/lib/auth";

// Editor de un borrador YA EXISTENTE (paso 8.3) -- misma pantalla que
// /panel/announcements/new, pero relee todo de la base en cada carga en vez
// de arrancar en blanco. Es la fuente de verdad detrás de "guardar un
// borrador, recargar la pantalla y que el estado persista": esta página, no
// ningún estado de React, es la que decide qué se ve -- recargar el
// navegador vuelve a pasar por acá, vuelve a pedir los mismos datos.
export default async function EditAnnouncementDraftPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { announcementId } = await params;
  const { organization } = await requireUser();

  const [draft, buildings] = await Promise.all([
    getAnnouncementDraftForEdit(organization.id, announcementId),
    getActiveBuildings(organization.id),
  ]);

  if (!draft) {
    notFound();
  }

  const people = await getPeopleForSegmentDisplay(
    organization.id,
    draft.segment.personIds,
  );
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const addedPeople = draft.segment.personIds
    .map((id) => {
      const person = peopleById.get(id);
      if (!person) {
        return null;
      }
      const name = [person.firstName, person.lastName]
        .filter(Boolean)
        .join(" ");
      return {
        id,
        label: person.phoneE164 ? `${name} (${person.phoneE164})` : name,
      };
    })
    .filter((p): p is { id: string; label: string } => p !== null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-ink font-display text-xl font-semibold">
        Editar aviso
      </h1>
      <AnnouncementSegmentForm
        buildings={buildings}
        initialAnnouncement={{
          id: draft.id,
          title: draft.title,
          body: draft.body,
          buildingId: draft.buildingId,
          segment: draft.segment,
          templateId: draft.templateId,
          templateVariables: draft.templateVariables,
          addedPeople,
        }}
      />
    </div>
  );
}
