import { Settings } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function SettingsPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Todavía no hay nada para configurar"
      description="Esta sección va a reunir los datos de tu organización y las preferencias del panel."
    />
  );
}
