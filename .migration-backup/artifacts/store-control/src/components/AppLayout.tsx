import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { visibleSections } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { listExpiredBatches, listNearExpiryBatches } from "@/lib/fifo";
import { db } from "@/lib/db";
import {
  LayoutDashboard, Box, Warehouse, BarChart3, FileUp,
  Users, QrCode, ClipboardList, HardDrive, Settings, LogOut, Menu, X, ChevronRight,
  Scale, ClipboardEdit, BellRing, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PWAInstallButton from "@/components/PWAInstallButton";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  key?: string;
}

const ALL_NAV: NavItem[] = [
  { label: "Dashboard",          path: "/dashboard",        icon: LayoutDashboard },
  { label: "Balance",            path: "/balance",           icon: Scale,         key: "reports" },
  { label: "Products",           path: "/products",          icon: Box,           key: "products" },
  { label: "Inventory",          path: "/inventory",         icon: Warehouse,     key: "inventory" },
  { label: "Warehouses",         path: "/warehouses",        icon: Warehouse,     key: "inventory" },
  { label: "Reports",            path: "/reports",           icon: BarChart3,     key: "reports" },
  { label: "Import / Export",    path: "/import-export",     icon: FileUp,        key: "importExport" },
  { label: "Barcodes",           path: "/barcodes",          icon: QrCode,        key: "barcodes" },
  { label: "Users",              path: "/users",             icon: Users,         key: "users" },
  { label: "Audit Logs",         path: "/audit-logs",        icon: ClipboardList, key: "auditLogs" },
  { label: "Backups",            path: "/backups",           icon: HardDrive,     key: "backups" },
  { label: "Staff Report",       path: "/staff-report",      icon: Users,         key: "reports" },
  { label: "Expiry Alerts",      path: "/expiry",            icon: BellRing,      key: "reports" },
  { label: "Print Order",        path: "/print-order",       icon: ClipboardEdit, key: "inventory" },
  { label: "Purchase Request",   path: "/purchase-request",  icon: ShoppingCart,  key: "inventory" },
  { label: "Settings",           path: "/settings",          icon: Settings,      key: "settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sections = visibleSections(user?.role);
  const navItems = ALL_NAV.filter(item => !item.key || sections[item.key as keyof typeof sections]);

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

  const isActive = (path: string) => {
    if (path === "/dashboard" && (location === "/" || location === "/dashboard")) return true;
    return location.startsWith(path) && path !== "/dashboard";
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden">
          <img src="/icon.png" alt="Clinic Inventory" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-sm truncate text-sidebar-foreground">Clinic Inventory</h1>
          <p className="text-xs text-sidebar-foreground/50">AUC Clinic System</p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setSidebarOpen(false)}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                active
                  ? "bg-primary text-white"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.path === "/expiry" && expiryAlertCount > 0 && !active && (
                <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {expiryAlertCount > 99 ? "99+" : expiryAlertCount}
                </span>
              )}
              {active && <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />}
            </Link>
          );
        })}
      </nav>

      <PWAInstallButton />

      <div className="px-2 py-3 border-t border-sidebar-border">
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
      <div className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-sidebar-border">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex flex-col w-56 bg-sidebar z-10">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 text-sidebar-foreground/70"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b bg-card">
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
