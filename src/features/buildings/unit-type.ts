import type { unitType } from "@/db/schema/units";

export type UnitType = (typeof unitType.enumValues)[number];

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  apartment: "Departamento",
  parking: "Cochera",
  storage: "Baulera",
  commercial: "Local",
  other: "Otro",
};
