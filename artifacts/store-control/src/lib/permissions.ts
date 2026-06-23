export type AppRole = "administrator" | "admin" | "staff";

export type Resource =
  | "products"
  | "inventory"
  | "dispensing"
  | "transfers"
  | "disposal"
  | "reports"
  | "import_export"
  | "barcodes"
  | "users"
  | "settings"
  | "audit_logs"
  | "backups";

export type Action = "view" | "create" | "edit" | "delete" | "manage";

type Matrix = Record<AppRole, Partial<Record<Resource, Action[]>>>;

const ALL: Action[] = ["view", "create", "edit", "delete", "manage"];

const MATRIX: Matrix = {
  administrator: {
    products: ALL,
    inventory: ALL,
    dispensing: ALL,
    transfers: ALL,
    disposal: ALL,
    reports: ALL,
    import_export: ALL,
    barcodes: ALL,
    users: ALL,
    settings: ALL,
    audit_logs: ["view", "manage"],
    backups: ["view", "create", "manage"],
  },
  admin: {
    products: ALL,
    inventory: ALL,
    dispensing: ALL,
    transfers: ALL,
    disposal: ALL,
    reports: ALL,
    import_export: ALL,
    barcodes: ALL,
    users: ["view", "create", "edit", "delete", "manage"],
    settings: ALL,
    audit_logs: ["view", "manage"],
    backups: ["view", "create", "manage"],
  },
  staff: {
    products: ["view"],
    inventory: ["view", "create"],
    dispensing: ["view", "create"],
    transfers: ["view", "create"],
    disposal: ["view", "create"],
    reports: ["view"],
    import_export: [],
    barcodes: ["view"],
    users: [],
    settings: [],
    audit_logs: [],
    backups: [],
  },
};

export function can(role: AppRole | null | undefined, resource: Resource, action: Action): boolean {
  if (!role) return false;
  const allowed = MATRIX[role]?.[resource] ?? [];
  return allowed.includes(action) || allowed.includes("manage");
}

export function isAdmin(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "administrator";
}

export function isSuperAdmin(role: AppRole | null | undefined): boolean {
  return role === "administrator";
}

export function canManageUser(
  actorRole: AppRole | null | undefined,
  targetRole: AppRole | null | undefined,
): boolean {
  if (!actorRole) return false;
  if (actorRole === "administrator") return true;
  if (actorRole === "admin" && targetRole !== "administrator") return true;
  return false;
}

export function visibleSections(role: AppRole | null | undefined) {
  return {
    products: can(role, "products", "view"),
    inventory: can(role, "inventory", "view"),
    reports: can(role, "reports", "view"),
    importExport: can(role, "import_export", "view"),
    barcodes: can(role, "barcodes", "view"),
    users: can(role, "users", "view"),
    auditLogs: can(role, "audit_logs", "view"),
    settings: can(role, "settings", "view"),
    backups: can(role, "backups", "view"),
  };
}
