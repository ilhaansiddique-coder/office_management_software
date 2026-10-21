import { ReactNode, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentPageTitle } from "@/hooks/useCurrentPageTitle";
import { ArrowLeft, ArrowUp, FileText, Home, Loader2, Package, PackageCheck, Receipt, RefreshCw, Search, ShoppingCart, Users, BarChart3, Bell, Settings, Shield, User } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalAlertBanner } from "@/components/GlobalAlertBanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageSearchProvider, usePageSearchContext } from "@/contexts/PageSearchContext";
import { PwaBranding } from "@/components/PwaBranding";
import { applyUpdate } from "@/pwa";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useUserRole } from "@/hooks/useUserRole";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

const SearchHeader = () => {
  const navigate = useNavigate();
  const { query, setQuery, placeholder, results } = usePageSearchContext();
  const [isFocused, setIsFocused] = useState(false);

  const filteredResults = useMemo(() => {
    return results.slice(0, 8);
  }, [results]);

  const showResults = isFocused && query.trim().length > 0 && filteredResults.length > 0;

  const handleSelect = (result: (typeof results)[number]) => {
    if (result.query) {
      setQuery(result.query);
    }
    if (result.href) {
      navigate(result.href);
    }
    setIsFocused(false);
  };

  const iconForType = (type: string) => {
    switch (type) {
      case "product":
        return <Package className="h-4 w-4 text-success" />;
      case "customer":
        return <Users className="h-4 w-4 text-success" />;
      case "invoice":
        return <FileText className="h-4 w-4 text-success" />;
      case "sale":
      default:
        return <Receipt className="h-4 w-4 text-success" />;
    }
  };

  if (!placeholder.trim()) {
    return null;
  }

  return (
    <div className="relative w-full min-w-0 flex-1 sm:max-w-[280px] md:max-w-[320px] lg:max-w-[380px] xl:max-w-[440px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        className="h-10 rounded-xl pl-10"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 150);
        }}
      />
      {showResults && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-lg">
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Results
          </div>
          <div className="max-h-72 overflow-auto">
            {filteredResults.map((result) => (
              <button
                key={result.id}
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(result)}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/12">
                  {iconForType(result.type)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-semibold text-foreground">
                    {result.title}
                  </span>
                  {result.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.subtitle}
                    </span>
                  )}
                </span>
                {result.meta && (
                  <span className="text-xs font-medium text-success">{result.meta}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const HeaderControls = () => {
  const { headerControls } = usePageSearchContext();

  if (!headerControls) {
    return null;
  }

  return (
    <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2 [&>*]:w-full sm:[&>*]:w-auto [&>button]:w-full sm:[&>button]:w-auto [&>[data-radix-collection-item]]:w-full sm:[&>[data-radix-collection-item]]:w-auto">
      {headerControls}
    </div>
  );
};

const HeaderSecondaryRow = () => {
  const { placeholder, headerControls } = usePageSearchContext();
  const showSearch = placeholder.trim().length > 0;

  if (!showSearch && !headerControls) {
    return null;
  }

  return (
    <>
      {showSearch && (
        <div className="hidden w-full items-center gap-3 md:flex md:w-auto">
          <SearchHeader />
        </div>
      )}
      {headerControls && (
        <div className="w-full md:flex-1 md:min-w-0">
          <HeaderControls />
        </div>
      )}
    </>
  );
};

const HeaderActions = ({ className }: { className?: string }) => {
  const { headerActions } = usePageSearchContext();

  if (!headerActions) {
    return null;
  }

  return (
    <div className={cn("items-center gap-2", className)}>
      {headerActions}
    </div>
  );
};

export const Layout = ({ children }: LayoutProps) => {
  const { user, loading } = useAuth();
  const { businessSettings } = useBusinessSettings();
  const { hasPermission } = useUserRole();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPageTitle = useCurrentPageTitle();
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBottomNav, setShowBottomNav] = useState(true);

  const menuItems = [
    { label: "Dashboard", to: "/", icon: Home, permission: 'access.dashboard' },
    { label: "Products", to: "/products", icon: Package, permission: 'products.view' },
    { label: "Sales", to: "/sales", icon: ShoppingCart, permission: 'sales.view' },
    { label: "Packaging", to: "/packaging", icon: PackageCheck, permission: 'packaging.view' },
    { label: "Customers", to: "/customers", icon: Users, permission: 'customers.view' },
    { label: "Reports", to: "/reports", icon: BarChart3, permission: 'reports.view' },
    { label: "Invoices", to: "/invoices", icon: FileText, permission: 'invoices.view' },
    { label: "Alerts", to: "/alerts", icon: Bell, permission: 'access.alerts' },
  ];

  const canAccessAdmin = hasPermission('admin.manage_roles') ||
    hasPermission('admin.manage_permissions') ||
    hasPermission('admin.full_backup') ||
    hasPermission('admin.data_restore');

  const bottomNavItems = [
    ...menuItems.filter(item => hasPermission(item.permission)),
    { label: "Profile", to: "/profile", icon: User },
    ...(hasPermission('settings.view_business') ? [{ label: "Settings", to: "/settings", icon: Settings }] : []),
    ...(canAccessAdmin ? [{ label: "Admin", to: "/admin", icon: Shield }] : [])
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => setIsStandalone(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastScrollY = window.scrollY;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;
        if (currentY <= 0) {
          setShowBottomNav(true);
        } else if (delta > 10) {
          setShowBottomNav(false);
        } else if (delta < -10) {
          setShowBottomNav(true);
        }
        lastScrollY = currentY;
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const isReportsPage = location.pathname.startsWith("/reports");
  const isAlertsPage = location.pathname.startsWith("/alerts");
  const isInvoicesPage = location.pathname.startsWith("/invoices");
  const isDashboardPage = location.pathname === "/";
  const isProductsPage = location.pathname.startsWith("/products");
  const isSalesPage = location.pathname.startsWith("/sales");
  const isPackagingPage = location.pathname.startsWith("/packaging");
  const isCustomersPage = location.pathname.startsWith("/customers");
  const isSalesLikePage = isSalesPage || isPackagingPage;

  return (
    <SidebarProvider persistKey={`sidebar:state:${user.id}`}>
      <GlobalAlertBanner />
      <PwaBranding />
      <PageSearchProvider>
        <div className="min-h-screen w-full p-0">
          <div className="app-shell flex min-h-screen w-full overflow-hidden">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-w-0 bg-card">
              <header
                className={cn(
              "flex flex-col gap-3 border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/70 md:flex-row md:items-center md:px-6 peer-data-[state=collapsed]:pl-3 peer-data-[state=collapsed]:md:pl-4",
                  (isSalesLikePage || isCustomersPage) && "border-b-0 py-2 md:border-b md:py-4",
                  (isDashboardPage || isProductsPage || isCustomersPage || isSalesLikePage || isReportsPage || isInvoicesPage) && "hidden md:flex"
                )}
              >
                <div
                  className={cn(
                    "flex w-full flex-col md:flex-1 md:flex-row md:items-center",
                    isInvoicesPage ? "gap-0 md:gap-3" : "gap-3"
                  )}
                >
                  <div className="flex items-center gap-3 md:hidden">
                    {isReportsPage ? (
                      <HeaderActions className="flex flex-1 min-w-0" />
                    ) : isAlertsPage ? (
                      <HeaderActions className="flex flex-1 min-w-0 ml-auto" />
                    ) : (
                      <SearchHeader />
                    )}
                  </div>
                  <HeaderSecondaryRow />
                  {!isReportsPage && !isAlertsPage && (
                    <HeaderActions className="flex w-full flex-row flex-wrap items-center gap-2 md:hidden [&>*]:flex-1 [&>*]:min-w-[56px]" />
                  )}
                </div>
                <div className="hidden items-center md:flex">
                  <div className="flex items-center gap-3">
                    <HeaderActions className="hidden md:flex" />
                    {isStandalone && (
                      <div className="flex h-11 items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 shadow-sm">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(-1)}
                          aria-label="Go back"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void applyUpdate()}
                          aria-label="Refresh"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </header>
              <main className="flex-1 p-4 pb-16 md:p-6 min-w-0 bg-transparent peer-data-[state=collapsed]:pl-3 peer-data-[state=collapsed]:md:pl-4 nav-mb-safe">
                {children}
              </main>
            </div>
          </div>
        </div>
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 md:hidden transition-transform duration-200 ${showBottomNav ? "translate-y-0" : "translate-y-full"
            }`}
        >
          <nav className="flex items-center gap-2 overflow-x-auto border-t border-border/70 bg-card/95 px-3 py-1.5 shadow-[0_-6px_20px_-16px_rgba(0,0,0,0.4)] backdrop-blur scrollbar-hide">
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex min-w-[64px] flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors flex-shrink-0 ${
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`
                  }
                  aria-label={item.label}
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate max-w-full">{item.label}</span>
                </NavLink>
              );
            })}
            <button
              type="button"
              className="flex min-w-[64px] flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground flex-shrink-0"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              aria-label="Scroll to top"
            >
              <ArrowUp className="h-5 w-5" />
              <span>Top</span>
            </button>
          </nav>
        </div>
      </PageSearchProvider>
    </SidebarProvider>
  );
};
