import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Mismo criterio que /panel/tickets/[ticketId]/not-found.tsx: cross-org,
// uuid inválido, borrador inexistente o un aviso que ya dejó de ser
// borrador (ver getAnnouncementDraftForEdit) caen todos en el mismo mensaje
// ambiguo -- sin distinguir por qué no se pudo abrir.
export default function AnnouncementDraftNotFound() {
  return (
    <EmptyState
      icon={Megaphone}
      title="No encontramos ese borrador"
      description="Puede que el link esté roto, que el aviso ya se haya enviado, o que pertenezca a otra organización."
      action={{
        label: "Crear un aviso nuevo",
        href: "/panel/announcements/new",
      }}
    />
  );
}
