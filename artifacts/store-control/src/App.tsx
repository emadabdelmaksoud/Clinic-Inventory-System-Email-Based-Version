import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/Login";
import DashboardPage from "@/pages/Dashboard";
import ProductsPage from "@/pages/Products";
import ProductDetailPage from "@/pages/ProductDetail";
import InventoryPage from "@/pages/Inventory";
import WarehousesPage from "@/pages/Warehouses";
import WarehouseDetailPage from "@/pages/WarehouseDetail";
import ReportsPage from "@/pages/Reports";
import UsersPage from "@/pages/Users";
import AuditLogsPage from "@/pages/AuditLogs";
import BackupsPage from "@/pages/Backups";
import ImportExportPage from "@/pages/ImportExport";
import BarcodesPage from "@/pages/Barcodes";
import SettingsPage from "@/pages/Settings";
import BalancePage from "@/pages/Balance";
import PrintOrderPage from "@/pages/PrintOrder";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
});

function AppRouter() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route><Redirect to="/login" /></Route>
      </Switch>
    );
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/balance" component={BalancePage} />
        <Route path="/print-order" component={PrintOrderPage} />
        <Route path="/products/:id" component={ProductDetailPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/warehouses/:id" component={WarehouseDetailPage} />
        <Route path="/warehouses" component={WarehousesPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/users" component={UsersPage} />
        <Route path="/barcodes" component={BarcodesPage} />
        <Route path="/import-export" component={ImportExportPage} />
        <Route path="/audit-logs" component={AuditLogsPage} />
        <Route path="/backups" component={BackupsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route><Redirect to="/" /></Route>
      </Switch>
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter
          hook={import.meta.env.VITE_IS_ELECTRON ? useHashLocation : undefined}
          base={import.meta.env.VITE_IS_ELECTRON ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "")}
        >
          <AppRouter />
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
