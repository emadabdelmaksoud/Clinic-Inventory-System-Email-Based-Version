import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { visibleSections } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { listExpiredBatches, listNearExpiryBatches } from "@/lib/fifo";
import { db } from "@/lib/db";
import {
  LayoutDashboard, Box, Warehouse, BarChart3, FileUp,
  Users, QrCode, ClipboardList, HardDrive, Settings, LogOut, Menu, X,
  Scale, ClipboardEdit, BellRing, ShoppingCart, ChevronDown,
  PackageSearch, FolderOpen, BarChart2, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PWAInstallButton from "@/components/PWAInstallButton";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  permKey?: string;
  badge?: number;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

function useSidebarNav() {
  const { user } = useAuth();
  const sections = visibleSections(user?.role);

  const { data: nearExpiryDays = 90 } = useQuery({
    queryKey: ["settings", "nearExpiryDays"],
    queryFn: async () => {
      const row = await db.settings.get("nearExpiryDays");
      return Number(row?.value ?? "90");
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: expiryAlertCount = 0 } = useQuery({
    queryKey: ["nav_expiry_badge", nearExpiryDays],
    queryFn: async () => {
      const [expired, near] = await Promise.all([
        listExpiredBatches(),
        listNearExpiryBatches(nearExpiryDays),
      ]);
      return expired.length + near.length;
    },
    staleTime: 1000 * 60,
  });

  const { data: purchaseRequestCount = 0 } = useQuery({
    queryKey: ["nav_purchase_request_badge"],
    queryFn: async () => {
      try {
        const all = await db.purchaseRequests?.toArray?.();
        if (!all) return 0;
        return all.filter((r: any) => r.status === "pending").length;
      } catch {
        return 0;
      }
    },
    staleTime: 1000 * 60,
  });

  const GROUPS: NavGroup[] = [
    {
      id: "inventory",
      label: "Inventory",
      icon: PackageSearch,
      items: [
        sections.products   && { label: "Products",   path: "/products",   icon: Box,        permKey: "products" },
        sections.inventory  && { label: "Inventory",  path: "/inventory",  icon: Warehouse,  permKey: "inventory" },
        sections.inventory  && { label: "Warehouses", path: "/warehouses", icon: Warehouse,  permKey: "inventory" },
        sections.barcodes   && { label: "Barcodes",   path: "/barcodes",   icon: QrCode,     permKey: "barcodes" },
      ].filter(Boolean) as NavItem[],
    },
    {
      id: "operations",
      label: "Operations",
      icon: FolderOpen,
      items: [
        sections.reports    && { label: "Balance",          path: "/balance",           icon: Scale,        permKey: "reports" },
        sections.inventory  && { label: "Purchase Request", path: "/purchase-request",  icon: ShoppingCart, permKey: "inventory", badge: purchaseRequestCount },
        sections.inventory  && { label: "Print Order",      path: "/print-order",       icon: ClipboardEdit, permKey: "inventory" },
      ].filter(Boolean) as NavItem[],
    },
    {
      id: "reports",
      label: "Reports",
      icon: BarChart2,
      items: [
        sections.reports  && { label: "Reports",      path: "/reports",      icon: BarChart3,     permKey: "reports" },
        sections.reports  && { label: "Staff Report", path: "/staff-report", icon: Users,         permKey: "reports" },
        sections.auditLogs && { label: "Audit Logs",  path: "/audit-logs",   icon: ClipboardList, permKey: "auditLogs" },
      ].filter(Boolean) as NavItem[],
    },
    {
      id: "administration",
      label: "Administration",
      icon: ShieldCheck,
      items: [
        sections.users        && { label: "Users",          path: "/users",         icon: Users,     permKey: "users" },
        sections.importExport && { label: "Import / Export",path: "/import-export", icon: FileUp,    permKey: "importExport" },
        sections.backups      && { label: "Backups",        path: "/backups",       icon: HardDrive, permKey: "backups" },
        sections.reports      && { label: "Expiry Alerts",  path: "/expiry",        icon: BellRing,  permKey: "reports",  badge: expiryAlertCount },
      ].filter(Boolean) as NavItem[],
    },
  ].filter(g => g.items.length > 0);

  return { sections, GROUPS };
}

function formatBadge(n: number) {
  if (n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { GROUPS } = useSidebarNav();

  const isActive = (path: string) => {
    if (path === "/dashboard" && (location === "/" || location === "/dashboard")) return true;
    return location.startsWith(path) && path !== "/dashboard";
  };

  const activeGroupId = GROUPS.find(g => g.items.some(i => isActive(i.path)))?.id ?? null;

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    return new Set(activeGroupId ? [activeGroupId] : []);
  });

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups(prev => {
        if (prev.has(activeGroupId)) return prev;
        const next = new Set(prev);
        next.add(activeGroupId);
        return next;
      });
    }
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isDashboardActive = location === "/" || location === "/dashboard";
  const isSettingsActive = location.startsWith("/settings");

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border flex-shrink-0">
        <div className="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden">
          <img src="/icon.png" alt="Clinic Inventory" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-sm truncate text-sidebar-foreground">Clinic Inventory</h1>
          <p className="text-xs text-sidebar-foreground/50">AUC Clinic System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--sidebar-border)/0.4)_transparent]">
        {/* Dashboard — standalone */}
        <Link
          href="/dashboard"
          onClick={() => setSidebarOpen(false)}
          data-testid="nav-dashboard"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer mb-1",
            isDashboardActive
              ? "bg-primary text-white"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
        >
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
          <span>Dashboard</span>
        </Link>

        {/* Collapsible groups */}
        <div className="space-y-0.5">
          {GROUPS.map(group => {
            const isOpen = openGroups.has(group.id);
            const GroupIcon = group.icon;
            const groupHasActive = group.items.some(i => isActive(i.path));

            return (
              <div key={group.id}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    groupHasActive
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <GroupIcon className={cn("w-4 h-4 flex-shrink-0", groupHasActive && "text-primary")} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200",
                      isOpen ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </button>

                {/* Group items */}
                {isOpen && (
                  <div className="ml-3 pl-3 border-l border-sidebar-border/50 mt-0.5 mb-0.5 space-y-0.5">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const active = isActive(item.path);
                      const badge = formatBadge(item.badge ?? 0);
                      return (
                        <Link
                          key={item.path}
                          href={item.path}
                          onClick={() => setSidebarOpen(false)}
                          data-testid={`nav-${item.label.toLowerCase().replace(/[\s/]+/g, "-")}`}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer",
                            active
                              ? "bg-primary text-white font-medium"
                              : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          )}
                        >
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="flex-1 truncate">{item.label}</span>
                          {badge && !active && (
                            <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                              {badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Settings — standalone at bottom of nav */}
        <div className="mt-2 pt-2 border-t border-sidebar-border/40">
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            data-testid="nav-settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              isSettingsActive
                ? "bg-primary text-white"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      <PWAInstallButton />

      {/* User footer */}
      <div className="px-2 py-3 border-t border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary uppercase">
              {user?.fullName?.[0] ?? user?.username?.[0] ?? "U"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.fullName || user?.username}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{user?.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs"
          onClick={signOut}
          data-testid="button-signout"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-sidebar-border">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex flex-col w-64 bg-sidebar z-10 shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 text-sidebar-foreground/70 z-10"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b bg-card flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0">
              <img src="/icon.png" alt="Clinic Inventory" className="w-full h-full object-cover" />
            </div>
            <span className="font-semibold text-sm">Clinic Inventory</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>

        <div className="flex-shrink-0 border-t border-border bg-card px-4 py-1.5 text-center">
          <p className="text-xs text-muted-foreground">
            Created by <span className="font-medium text-foreground">Emad Ali</span>
          </p>
        </div>
      </div>
    </div>
  );
}
