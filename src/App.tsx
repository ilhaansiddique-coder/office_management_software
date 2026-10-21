import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SystemSettingsProvider } from "@/contexts/SystemSettingsContext";
import { MockDataProvider } from "@/contexts/MockDataContext";
import { ThemeProvider } from "next-themes";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useFavicon } from "@/hooks/useFavicon";
import { usePwaUpdateChannel } from "@/hooks/usePwaUpdateChannel";
import { useSystemSettingsSync } from "@/hooks/useSystemSettingsSync";
import { migrateInsecureBackups } from "@/utils/secureStorage";
import { PwaUpdateModal } from "@/components/PwaUpdateModal";
import Index from "./pages/Index";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Packaging from "./pages/Packaging";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import SalesCaseStudy2026 from "./pages/SalesCaseStudy2026";
import Invoices from "./pages/Invoices";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import UserProfile from "./pages/UserProfile";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Trash from "./pages/Trash";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// Component to handle favicon updates
const FaviconUpdater = () => {
  useFavicon();
  return null;
};

// Security: Clean up old insecure localStorage data on startup
const SecurityInitializer = () => {
  React.useEffect(() => {
    migrateInsecureBackups();
  }, []);
  return null;
};

const PwaUpdateListener = () => {
  usePwaUpdateChannel();
  return null;
};

const SystemSettingsSyncListener = () => {
  useSystemSettingsSync();
  return null;
};

const LayoutWrapper = () => (
  <Layout>
    <Outlet />
  </Layout>
);

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      
      <Route element={<LayoutWrapper />}>
        <Route path="/" element={
          <ProtectedRoute requiredPermission="access.dashboard">
            <Index />
          </ProtectedRoute>
        } />
        <Route path="/products" element={
          <ProtectedRoute requiredPermission="products.view">
            <Products />
          </ProtectedRoute>
        } />
        <Route path="/sales" element={
          <ProtectedRoute requiredPermission="sales.view">
            <Sales />
          </ProtectedRoute>
        } />
        <Route path="/packaging" element={
          <ProtectedRoute requiredPermission="packaging.view">
            <Packaging />
          </ProtectedRoute>
        } />
        <Route path="/customers" element={
          <ProtectedRoute requiredPermission="customers.view">
            <Customers />
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute requiredPermission="reports.view">
            <Reports />
          </ProtectedRoute>
        } />
        <Route path="/reports/case-study-sales-2026" element={
          <ProtectedRoute requiredPermission="reports.view">
            <SalesCaseStudy2026 />
          </ProtectedRoute>
        } />
        <Route path="/invoices" element={
          <ProtectedRoute requiredPermission="invoices.view">
            <Invoices />
          </ProtectedRoute>
        } />
        <Route path="/alerts" element={
          <ProtectedRoute requiredPermission="access.alerts">
            <Alerts />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute requiredPermission="settings.view_business">
            <Settings />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <UserProfile />
          </ProtectedRoute>
        } />
        <Route path="/users/:userId" element={
          <ProtectedRoute>
            <UserProfile />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/trash" element={
          <ProtectedRoute>
            <Trash />
          </ProtectedRoute>
        } />
      </Route>

      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <ThemeInitializer />
        <FaviconUpdater />
        <PwaUpdateListener />
        <SystemSettingsSyncListener />
        <PwaUpdateModal />
        <SecurityInitializer />
        <SystemSettingsProvider>
          <MockDataProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter
                future={{
                  v7_relativeSplatPath: true,
                }}
              >
                <AppRoutes />
              </BrowserRouter>
            </TooltipProvider>
          </MockDataProvider>
        </SystemSettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
