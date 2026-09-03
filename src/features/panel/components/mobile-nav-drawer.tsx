"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { PanelNav } from "./panel-nav";

// Sheet de shadcn (Radix Dialog por debajo): foco atrapado y cierre con
// Escape vienen gratis del primitive, no hay que reimplementarlos -- ver
// la verificación real del paso 3.4.
export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Se cierra al navegar (punto 4 del paso): "ajustar estado cuando cambia
  // un valor" durante el render, no en un useEffect -- es el patrón que
  // recomienda la propia documentación de React para este caso exacto
  // (evita el render en cascada de un setState dentro de un efecto). Un
  // click en un link de PanelNav cambia el pathname, y eso alcanza para
  // cerrar el drawer sin que PanelNav necesite saber que está adentro de
  // un Sheet.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Abrir menú de navegación"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>Consorfy</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <PanelNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
