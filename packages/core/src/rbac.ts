import type { CompanyRole } from "./enums";

// Server-side permission matrix (US-204). Every API endpoint checks these —
// the UI hides controls as a courtesy, never as the control itself.
export const PERMISSIONS = [
  "company:manage", // edit company settings, request credits
  "profile:manage", // edit + publish public company profile
  "members:manage", // invite, deactivate, change roles
  "catalogue:read",
  "catalogue:write",
  "rfq:read",
  "rfq:write",
  "quotation:read",
  "quotation:write",
  "order:read",
  "order:update-status", // shipment stage updates (seller side)
  "document:read",
  "document:write",
  "bom:read",
  "bom:write",
  "message:read",
  "message:write",
  "usage:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

// US-204 acceptance criteria:
// - Operations: catalogue, RFQs, quotations, shipments — no billing/user management.
// - Finance: financial/document records on orders — no catalogue writes, no user management.
// - Company Admin: everything within the company.
const ROLE_PERMISSIONS: Record<CompanyRole, readonly Permission[]> = {
  COMPANY_ADMIN: ALL,
  OPERATIONS: [
    "profile:manage",
    "catalogue:read",
    "catalogue:write",
    "rfq:read",
    "rfq:write",
    "quotation:read",
    "quotation:write",
    "order:read",
    "order:update-status",
    "document:read",
    "document:write",
    "bom:read",
    "bom:write",
    "message:read",
    "message:write",
    "usage:read",
  ],
  FINANCE: [
    "catalogue:read",
    "rfq:read",
    "quotation:read",
    "order:read",
    "document:read",
    "document:write",
    "message:read",
    "message:write",
    "usage:read",
  ],
};

export function can(role: CompanyRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: CompanyRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
