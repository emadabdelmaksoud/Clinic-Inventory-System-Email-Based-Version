export type AppRole = "admin" | "staff";

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

const MATRIX: Matrix = {
  admin: {
    products: ["view", "create", "edit", "delete", "manage"],
    inventory: ["view", "create", "edit", "delete", "manage"],
    dispensing: ["view", "create", "edit", "delete", "manage"],
    transfers: ["view", "create", "edit", "delete", "manage"],
    disposal: ["view", "create", "edit", "delete", "manage"],
    reports: ["view", "create", "edit", "delete", "manage"],
    import_export: ["view", "create", "edit", "delete", "manage"],
    barcodes: ["view", "create", "edit", "delete", "manage"],
    users: ["view", "create", "edit", "delete", "manage"],
    settings: ["view", "create", "edit", "delete", "manage"],
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
  return role === "admin";
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
