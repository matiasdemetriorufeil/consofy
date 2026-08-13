import { CalendarClock } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function RemindersPage() {
  return (
    <EmptyState
      icon={CalendarClock}
      title="Todavía no hay recordatorios"
      description="Esta sección va a mostrar los vencimientos y tareas que armes, con su fecha límite, para que no se te pasen."
    />
  );
}
