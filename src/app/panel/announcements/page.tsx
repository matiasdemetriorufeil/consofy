import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function AnnouncementsPage() {
  return (
    <EmptyState
      icon={Megaphone}
      title="Todavía no hay avisos"
      description="Acá vas a poder escribir un aviso y mandarlo a los vecinos de uno o varios edificios."
    />
  );
}
