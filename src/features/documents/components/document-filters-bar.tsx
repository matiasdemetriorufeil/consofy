"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  type DocumentCategory,
} from "../document-schema";

// Sentinel para "todas las categorías" -- Radix Select no admite value=""
// en un SelectItem, así que el filtro "vacío" en la URL se representa acá
// con este string, nunca con "". Mismo criterio que ALL_VALUE en
// TicketFiltersBar.
const ALL_VALUE = "__todas__";

// Filtros propios del explorador: búsqueda por título + categoría. El
// filtro de edificio es el selector del header (no vive acá) -- ver
// document-list-schema.ts. Escribe a la URL (fuente de verdad), mismo
// mecanismo que TicketFiltersBar pero mucho más chico (dos controles, sin
// Sheet: dos campos apilan bien en mobile sin esconderlos detrás de un
// botón).
export function DocumentFiltersBar({
  current,
}: {
  current: { category: DocumentCategory | null; q: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(current.q ?? "");

  // Sincroniza el input si la URL cambia por otra vía ("Limpiar filtros",
  // atrás/adelante del navegador). Ajustado DURANTE el render, no en un
  // efecto -- mismo patrón que TicketFiltersBar (evita el render en cascada
  // de un setState dentro de un useEffect).
  const [prevQ, setPrevQ] = useState(current.q ?? "");
  if ((current.q ?? "") !== prevQ) {
    setPrevQ(current.q ?? "");
    setSearchInput(current.q ?? "");
  }

  function updateParams(
    updates: Record<string, string | null>,
    options?: { push?: boolean },
  ) {
    const params = new URLSearchParams(searchParams.toString());
    // Cualquier cambio de filtro o búsqueda vuelve a la página 1 -- estar
    // en la página 3 de un resultado que ya no es el mismo no tiene
    // sentido. Mismo criterio que TicketFiltersBar.updateParams.
    params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === ALL_VALUE || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    if (options?.push === false) {
      router.replace(url, { scroll: false });
    } else {
      router.push(url, { scroll: false });
    }
  }

  // Debounce de 400ms: empuja a la URL recién cuando el admin deja de
  // tipear. Mismo patrón (setTimeout + useEffect) que TicketFiltersBar.
  useEffect(() => {
    const trimmed = searchInput.trim();
    const currentQ = current.q ?? "";
    if (trimmed === currentQ) {
      return;
    }
    const timeout = setTimeout(() => {
      updateParams(
        { q: trimmed.length >= 2 ? trimmed : null },
        { push: false },
      );
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateParams depende de searchParams/pathname/router, estables entre renders para este efecto puntual; incluirlos re-dispararía el debounce sin necesidad.
  }, [searchInput]);

  const hasFilters = Boolean(current.category) || Boolean(current.q);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="relative sm:w-72">
        <Search
          aria-hidden="true"
          className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          placeholder="Buscar por título…"
          className="pl-9"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Buscar documentos por título"
        />
      </div>

      <Field className="sm:w-52">
        <FieldLabel htmlFor="filter-doc-category">Categoría</FieldLabel>
        <Select
          value={current.category ?? ALL_VALUE}
          onValueChange={(value) =>
            updateParams({ category: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger id="filter-doc-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas las categorías</SelectItem>
            {DOCUMENT_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {DOCUMENT_CATEGORY_LABEL[category]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {hasFilters && (
        <Button
          variant="outline"
          className="sm:self-end"
          onClick={() => router.push(pathname, { scroll: false })}
        >
          <X aria-hidden="true" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
