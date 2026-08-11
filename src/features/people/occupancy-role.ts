import type { occupancyRole } from "@/db/schema/unit-occupancies";

export type OccupancyRole = (typeof occupancyRole.enumValues)[number];

export const OCCUPANCY_ROLE_LABEL: Record<OccupancyRole, string> = {
  owner: "Propietario",
  tenant: "Inquilino",
};
