"use client";

import { LogOut, User } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/features/auth/actions";
import { usePanelUser } from "@/features/auth/panel-user-context";

export function UserMenu() {
  const { appUser } = usePanelUser();
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2"
          aria-label={`Menú de ${appUser.displayName}`}
          disabled={isPending}
        >
          <User className="size-4" aria-hidden="true" />
          <span className="max-w-32 truncate">{appUser.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{appUser.displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            // logoutAction() se puede llamar directo, sin <form>: es el
            // patrón de "Event Handlers" que documenta Next.js para
            // Server Functions invocadas desde un Client Component. El
            // redirect("/login") de adentro sigue funcionando igual.
            startTransition(async () => {
              await logoutAction();
            });
          }}
        >
          <LogOut aria-hidden="true" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
