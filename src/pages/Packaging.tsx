import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SimpleDateRangeFilter } from "@/components/SimpleDateRangeFilter";
import { SALES_QUERY_KEY, useSales } from "@/hooks/useSales";
import { useCurrency } from "@/hooks/useCurrency";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { usePageSearch } from "@/hooks/usePageSearch";
import { usePageHeaderControls } from "@/hooks/usePageHeaderControls";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatInTimeZone, toZonedDate } from "@/lib/time";
import { endOfDay, startOfDay } from "date-fns";
import { CheckCircle2, History, PackageCheck, PackageX, Search, Undo2, UserCircle2 } from "lucide-react";
import { toast } from "@/utils/toast";
import { logActivity } from "@/utils/activityLogger";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { buildActivityDiffRows } from "@/utils/activityLogFormat";
import { MockDataNotice } from "@/components/MockDataNotice";
import { useMockDataContext } from "@/contexts/MockDataContext";

// Consider an order "packagable" unless it's explicitly cancelled/returned/lost.
// This is broader than "delivered" so the page won't hide active-but-ready orders.
const isPackagableOrder = (sale: any) => {
  const status = String(sale?.courier_status || sale?.order_status || "")
    .toLowerCase()
    .trim();
  if (!status) return true;
  return !(
    status.includes("cancelled") ||
    status.includes("returned") ||
    status.includes("lost")
  );
};

export default function Packaging() {
  const { rawSales = [], isLoading, supportsPackaged } = useSales("packaging");
  const { hasPermission } = useUserRole();
  const { formatAmount } = useCurrency();
  const { systemSettings } = useSystemSettings();
  const { scaleSalesData } = useMockDataContext();
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{
    ids: string[];
    mode: "pack" | "unpack";
  }>({
    ids: [],
    mode: "pack",
  });
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [logsSale, setLogsSale] = useState<any | null>(null);

  const { query: searchTerm, setQuery: setSearchTerm } = usePageSearch({
    placeholder: "Search invoice, customer, courier, CN...",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const scopedSales = useMemo(() => {
    const packagable = rawSales.filter((sale) => isPackagableOrder(sale));

    return packagable.filter((sale) => {
      const saleDate = toZonedDate(new Date(sale.created_at), systemSettings.timezone);
      if (dateRange.from && saleDate < startOfDay(dateRange.from)) return false;
      if (dateRange.to && saleDate > endOfDay(dateRange.to)) return false;
      return true;
    });
  }, [rawSales, dateRange.from, dateRange.to, systemSettings.timezone]);

  const mockScopedSales = useMemo(
    () => scaleSalesData(scopedSales),
    [scopedSales, scaleSalesData],
  );

  const filteredSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return mockScopedSales.filter((sale) => {
      if (!term) return true;

      const haystack = [
        sale.invoice_number,
        sale.customer_name,
        sale.customer_phone,
        sale.courier_name,
        sale.payment_method,
        sale.cn_number,
        sale.tracking_number,
        sale.consignment_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [mockScopedSales, searchTerm]);

  const checkedRows = useMemo(
    () => new Set(mockScopedSales.filter((sale) => sale.packaged).map((sale) => sale.id)),
    [mockScopedSales],
  );

  const isChecked = (saleId: string) =>
    checkedRows.has(saleId) || pendingIds.has(saleId);
  const canConfirmPackaging = hasPermission("packaging.confirm");
  const canUnpackPackaging = hasPermission("packaging.unpack");
  const canViewLogs = hasPermission("logs.view") || hasPermission("sales.view");

  useEffect(() => {
    const packagingFilter = supportsPackaged ? { filter: "packaged=eq.true" } : {};

    const salesChannel = supabase
      .channel("packaging-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sales",
          ...packagingFilter,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
          void queryClient.invalidateQueries({ queryKey: ["packaging-activity-preview"] });
        },
      )
      .subscribe();

    const activityChannel = supabase
      .channel("packaging-activity-log-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_logs",
          filter: "entity_type=eq.sales",
        },
        (payload) => {
          const next = payload.new as { action?: string; details?: { context?: string } } | null;
          const previous = payload.old as { action?: string; details?: { context?: string } } | null;
          const action = next?.action || previous?.action;
          const context = next?.details?.context || previous?.details?.context;

          if (
            action === "packaging_packed" ||
            action === "packaging_unpacked" ||
            context === "packaging"
          ) {
            void queryClient.invalidateQueries({ queryKey: ["packaging-activity-preview"] });
            void queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(activityChannel);
    };
  }, [queryClient, supportsPackaged]);

  // Fetch users to map seller names
  const { data: users = [] } = useQuery({
    queryKey: ["users-list-packaging"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_users_with_roles');
      if (error) {
        console.error('Failed to fetch users via RPC:', error);
        return [];
      }
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const userNameById = useMemo(() => {
    return new Map<string, string>(
      users
        .filter((user: any) => user?.id)
        .map((user: any) => [user.id, user.full_name || "Unknown User"])
    );
  }, [users]);

  const getSaleUserName = (sale: any) => {
    if (!sale?.created_by) return "System";
    return userNameById.get(sale.created_by) || "Unknown User";
  };

  const { data: activityLogs = [], isLoading: activityLogsLoading, error: activityLogsError } = useActivityLogs({
    entityType: "sales",
    entityId: logsSale?.id,
    limit: 50,
    enabled: !!logsSale?.id,
  });

  const packagingLogs = useMemo(() => {
    return activityLogs.filter((log) =>
      log.action === "packaging_packed" ||
      log.action === "packaging_unpacked" ||
      log.details?.context === "packaging",
    );
  }, [activityLogs]);

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage) || 1;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSales.slice(start, start + itemsPerPage);
  }, [filteredSales, currentPage, itemsPerPage]);

  const packagedRowClass = "bg-[rgb(200_255_205_/_55%)] hover:bg-[rgb(200_255_205_/_55%)]";
  const paginatedSaleIds = useMemo(() => paginatedSales.map((sale) => sale.id), [paginatedSales]);
  const selectedCount = selectedSaleIds.length;
  const allPageSelected = paginatedSaleIds.length > 0 && paginatedSaleIds.every((id) => selectedSaleIds.includes(id));
  const somePageSelected = !allPageSelected && paginatedSaleIds.some((id) => selectedSaleIds.includes(id));
  const selectedPackedCount = useMemo(
    () => selectedSaleIds.filter((saleId) => isChecked(saleId)).length,
    [selectedSaleIds, checkedRows, pendingIds],
  );
  const selectedUnpackedCount = selectedCount - selectedPackedCount;
  const bulkActionMode: "pack" | "unpack" = selectedPackedCount > 0 && selectedUnpackedCount === 0 ? "unpack" : "pack";

  const { data: packagingActivityPreview = [] } = useQuery({
    queryKey: ["packaging-activity-preview", paginatedSaleIds],
    enabled: paginatedSaleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs_view")
        .select("entity_id, action, created_at, full_name, email, user_id")
        .eq("entity_type", "sales")
        .in("entity_id", paginatedSaleIds)
        .in("action", ["packaging_packed", "packaging_unpacked"])
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        console.warn("Failed to load packaging activity preview:", error);
        return [];
      }

      return data || [];
    },
    staleTime: 30 * 1000,
  });

  const packagingActivityBySaleId = useMemo(() => {
    const latestBySaleId = new Map<
      string,
      {
        latest?: any;
        latestPacked?: any;
        latestUnpacked?: any;
      }
    >();

    packagingActivityPreview.forEach((log: any) => {
      const saleId = String(log.entity_id || "");
      if (!saleId) return;

      const entry = latestBySaleId.get(saleId) || {};
      if (!entry.latest) entry.latest = log;
      if (log.action === "packaging_packed" && !entry.latestPacked) entry.latestPacked = log;
      if (log.action === "packaging_unpacked" && !entry.latestUnpacked) entry.latestUnpacked = log;
      latestBySaleId.set(saleId, entry);
    });

    return latestBySaleId;
  }, [packagingActivityPreview]);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  const toggleSaleSelection = (saleId: string, checked: boolean) => {
    setSelectedSaleIds((prev) =>
      checked ? Array.from(new Set([...prev, saleId])) : prev.filter((id) => id !== saleId),
    );
  };

  const togglePageSelection = (checked: boolean) => {
    setSelectedSaleIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...paginatedSaleIds]));
      }

      const pageIdSet = new Set(paginatedSaleIds);
      return prev.filter((id) => !pageIdSet.has(id));
    });
  };

  const handleRequestPack = (saleIds: string[]) => {
    if (!canConfirmPackaging) {
      toast.error("You do not have permission to confirm packaging.");
      return;
    }
    const eligibleIds = saleIds.filter((saleId) => !isChecked(saleId));
    if (eligibleIds.length === 0) {
      toast.error("Selected orders are already packed.");
      return;
    }
    setConfirmAction({ ids: eligibleIds, mode: "pack" });
  };

  const handleRequestUnpack = (saleId: string) => {
    if (!canUnpackPackaging) {
      toast.error("You do not have permission to unpack orders.");
      return;
    }
    if (!isChecked(saleId)) {
      toast.error("This order is not packed.");
      return;
    }
    setConfirmAction({ ids: [saleId], mode: "unpack" });
  };

  const handleRequestBulkUnpack = (saleIds: string[]) => {
    if (!canUnpackPackaging) {
      toast.error("You do not have permission to unpack orders.");
      return;
    }
    const packedIds = saleIds.filter((saleId) => isChecked(saleId));
    if (packedIds.length === 0) {
      toast.error("Selected orders are not packed.");
      return;
    }
    setConfirmAction({ ids: packedIds, mode: "unpack" });
  };

  const handleConfirm = async () => {
    if (confirmAction.ids.length === 0) return;
    const saleIds = [...confirmAction.ids];
    const isPacking = confirmAction.mode === "pack";
    setConfirmAction({ ids: [], mode: "pack" });

    setPendingIds((prev) => {
      const next = new Set(prev);
      saleIds.forEach((saleId) => next.add(saleId));
      return next;
    });

    try {
      const { error } = await supabase
        .from("sales")
        .update({
          packaged: isPacking,
          updated_at: new Date().toISOString(),
        })
        .in("id", saleIds);

      if (error) {
        const message = String(error.message || "");
        const code = String((error as { code?: string })?.code || "");

        if (message.toLowerCase().includes("packaged") || code === "PGRST204") {
          toast.error("Database column `sales.packaged` is missing. Apply migrations 202603060001 and 202603060002.");
          return;
        }

        if (code === "42501" || message.toLowerCase().includes("permission")) {
          toast.error("You do not have permission to update packaging status (RLS/policy).");
          return;
        }

        toast.error(`Failed to ${isPacking ? "mark order as packed" : "unpack order"}: ${message || "Unknown database error."}`);
        return;
      }

      toast.success(
        isPacking
          ? saleIds.length === 1
            ? "Order marked as packed."
            : `${saleIds.length} orders marked as packed.`
          : "Order unpacked.",
      );

      const logResults = await Promise.all(
        saleIds.map(async (saleId) => {
          const sale = rawSales.find((entry) => entry.id === saleId);
          return await logActivity({
            action: isPacking ? "packaging_packed" : "packaging_unpacked",
            entityType: "sales",
            entityId: saleId,
            summary: isPacking
              ? `Marked ${sale?.invoice_number || "sale"} as packed`
              : `Unpacked ${sale?.invoice_number || "sale"}`,
            details: {
              context: "packaging",
              invoice_number: sale?.invoice_number || null,
              customer_name: sale?.customer_name || null,
              old: {
                packaged: !isPacking,
              },
              new: {
                packaged: isPacking,
              },
            },
          });
        }),
      );

      if (logResults.some((result) => !result)) {
        toast.error("Packaging status changed, but one or more activity logs failed to save.");
      }

      setSelectedSaleIds((prev) => prev.filter((id) => !saleIds.includes(id)));
      await queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
    } catch (err) {
      console.error("Failed to mark order as packed", err);
      toast.error(`Failed to ${isPacking ? "mark order as packed" : "unpack order"} due to an unexpected error.`);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        saleIds.forEach((saleId) => next.delete(saleId));
        return next;
      });
    }
  };

  const getSavedCustomerName = (sale: any) => {
    const canonical = String(sale?.saved_customer_name || "").trim();
    if (!canonical) return null;
    return canonical.toLowerCase() === String(sale?.customer_name || "").trim().toLowerCase()
      ? null
      : canonical;
  };

  const renderSaleCustomerLabel = (sale: any) => {
    const savedCustomerName = getSavedCustomerName(sale);

    return (
      <div className="min-w-0">
        <div className="truncate font-semibold">{sale.customer_name || "-"}</div>
        {savedCustomerName && (
          <div className="truncate text-xs text-muted-foreground">
            Saved customer: {savedCustomerName}
          </div>
        )}
      </div>
    );
  };

  const renderCustomerHoverDetails = (sale: any) => {
    const saleDate = new Date(sale.created_at);
    const savedCustomerName = getSavedCustomerName(sale);
    const aliasNames = ((sale.customer_alias_names || []) as string[])
      .map((alias) => String(alias || "").trim())
      .filter(Boolean);
    const activity = packagingActivityBySaleId.get(sale.id);
    const latestAction = activity?.latest;
    const latestPacked = activity?.latestPacked;
    const latestUnpacked = activity?.latestUnpacked;
    const latestActor = latestAction?.full_name || latestAction?.email || latestAction?.user_id || "Unknown";

    return (
      <div className="space-y-3 text-sm">
        <div className="border-b border-border/70 pb-2">
          <div className="font-medium text-foreground">{sale.customer_name || "-"}</div>
          {savedCustomerName && (
            <div className="mt-1 text-xs text-muted-foreground">Saved customer: {savedCustomerName}</div>
          )}
          {aliasNames.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              Aliases: {aliasNames.join(", ")}
            </div>
          )}
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">Phone:</span>
          <span className="text-foreground">{sale.customer_phone || "-"}</span>
          <span className="font-medium text-foreground/80">Created At:</span>
          <span className="text-foreground">
            {formatInTimeZone(saleDate, "MMM dd, yyyy hh:mm a", systemSettings.timezone)}
          </span>
          <span className="font-medium text-foreground/80">Status:</span>
          <span className="text-foreground">{sale.packaged ? "Packed" : "Not packed"}</span>
          <span className="font-medium text-foreground/80">Packed At:</span>
          <span className="text-foreground">
            {latestPacked
              ? formatInTimeZone(new Date(latestPacked.created_at), "MMM dd, yyyy hh:mm a", systemSettings.timezone)
              : "-"}
          </span>
          <span className="font-medium text-foreground/80">Unpacked At:</span>
          <span className="text-foreground">
            {latestUnpacked
              ? formatInTimeZone(new Date(latestUnpacked.created_at), "MMM dd, yyyy hh:mm a", systemSettings.timezone)
              : "-"}
          </span>
          <span className="font-medium text-foreground/80">Last Action:</span>
          <span className="text-foreground">
            {latestAction
              ? `${latestAction.action === "packaging_packed" ? "Packed" : "Unpacked"} by ${latestActor}`
              : "No packaging logs yet"}
          </span>
        </div>
      </div>
    );
  };

  const renderSkeletonRows = () =>
    Array.from({ length: 6 }).map((_, idx) => (
      <TableRow key={`skeleton-${idx}`} className="bg-base-100 hover:bg-base-100">
        <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-4" />
        </TableCell>
        <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-20" />
        </TableCell>
        <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-32" />
        </TableCell>
        <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-28" />
        </TableCell>
        <TableCell className="text-right whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-16 ml-auto" />
        </TableCell>
        <TableCell className="text-right whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-16 ml-auto" />
        </TableCell>
        <TableCell className="text-right whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-16 ml-auto" />
        </TableCell>
        <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-16" />
        </TableCell>
        <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-20" />
        </TableCell>
        <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
          <Skeleton className="h-4 w-24" />
        </TableCell>
        <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        </TableCell>
      </TableRow>
    ));

  const renderMobileSkeletons = () =>
    Array.from({ length: 6 }).map((_, idx) => (
      <div key={`mobile-skel-${idx}`} className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
        <div className="mt-2 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    ));

  const headerControls = useMemo(() => (
    <div className="flex w-full items-center justify-end gap-2">
      <SimpleDateRangeFilter
        onDateRangeChange={(from, to) => setDateRange({ from, to })}
        triggerClassName="min-w-[140px]"
      />
    </div>
  ), []);

  usePageHeaderControls(headerControls);

  return (
    <div className="space-y-4 md:space-y-0">
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Packaging</h1>
          <SimpleDateRangeFilter
            onDateRangeChange={(from, to) => setDateRange({ from, to })}
            triggerClassName="h-9 !w-auto !min-w-[132px] rounded-xl px-2 text-xs whitespace-nowrap"
          />
        </div>
      </div>
      <MockDataNotice displayedCount={mockScopedSales.length} rawCount={scopedSales.length} noun="orders" />

      {/* Mobile search */}
      <div className="grid gap-2 md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search invoice, customer, phone, courier name, status..."
            className="h-11 rounded-xl pl-10"
          />
        </div>
      </div>

      <Card className="overflow-hidden border-0 shadow-none md:border md:shadow-sm">
        {/* <CardHeader className="bg-muted/40">
          <CardTitle className="text-lg font-semibold">
            Completed Orders
          </CardTitle>
        </CardHeader> */}
        <CardContent className="p-0">
          {/* Desktop / Tablet table */}
          <div className="hidden md:block">
            <div className="table-scroll-wrapper space-y-0">
              <div className="table-scroll-body">
                <Table
                  containerClassName="table-vertical-scroll table-inner-scrollbar h-[39rem] max-h-[39rem] rounded-t-2xl rounded-b-none border-0 border-r border-base-300 overflow-y-auto [clip-path:inset(0_round_1rem_1rem_0_0)]"
                  className="border-separate border-spacing-y-0"
                >
                  <TableHeader className="sticky top-0 z-[6] overflow-hidden rounded-t-2xl bg-base-200">
                    <TableRow className="sticky top-0 z-[6] bg-base-200 shadow-[0_1px_0_hsl(var(--border))] [&>th]:font-semibold [&>th]:text-foreground [&>th:first-child]:rounded-tl-2xl [&>th:last-child]:rounded-tr-2xl">
                      <TableHead className="w-10 whitespace-nowrap bg-base-200">
                        <Checkbox
                          className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                          checked={allPageSelected}
                          onCheckedChange={(checked) => togglePageSelection(checked === true)}
                          aria-label="Select all packaging orders on this page"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200">Customer</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200">Invoice</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200">Seller Name</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200 text-right">Total</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200 text-right">Paid</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200 text-right">Due / Credit</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200">P. Method</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200">Courier</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200">CN Number</TableHead>
                      <TableHead className="whitespace-nowrap bg-base-200">
                        <div className="flex items-center gap-2">
                          Actions
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              bulkActionMode === "unpack"
                                ? handleRequestBulkUnpack(selectedSaleIds)
                                : handleRequestPack(selectedSaleIds)
                            }
                            disabled={
                              selectedCount === 0 ||
                              (bulkActionMode === "unpack" ? !canUnpackPackaging : !canConfirmPackaging)
                            }
                            className={cn(
                              "h-10 min-h-10 w-10 rounded-xl border-base-content/35 bg-base-100 p-0",
                              bulkActionMode === "unpack" && "text-destructive hover:text-destructive",
                            )}
                            title={
                              selectedCount === 0
                                ? "Select sales first"
                                : bulkActionMode === "unpack"
                                  ? "Unpack selected sales"
                                  : "Mark selected sales as packed"
                            }
                          >
                            {bulkActionMode === "unpack" ? <PackageX className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading
                      ? renderSkeletonRows()
                      : filteredSales.length === 0
                        ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center text-muted-foreground">
                              No completed orders found.
                            </TableCell>
                          </TableRow>
                        )
                        : paginatedSales.map((sale) => {
                            const saleChecked = isChecked(sale.id);
                            return (
                              <TableRow
                                key={sale.id}
                                className={cn(
                                  saleChecked ? packagedRowClass : "bg-base-100",
                                  saleChecked && "[&>td:first-child]:!rounded-none [&>td:last-child]:!rounded-none",
                                )}
                              >
                                <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
                                  <Checkbox
                                    aria-label={`Select packaging sale ${sale.invoice_number || sale.id}`}
                                    checked={selectedSaleIds.includes(sale.id)}
                                    onCheckedChange={(checked) => toggleSaleSelection(sale.id, checked === true)}
                                    className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                                  />
                                </TableCell>
                                <TableCell className="max-w-[220px] first:rounded-l-[10px] last:rounded-r-[10px]">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className="block cursor-help transition-colors duration-150 hover:text-foreground"
                                          title={sale.customer_name || "-"}
                                        >
                                          {renderSaleCustomerLabel(sale)}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        align="start"
                                        className="z-[70] max-w-[360px] rounded-xl border border-base-content/25 bg-base-100 p-3 shadow-xl backdrop-blur-none"
                                      >
                                        {renderCustomerHoverDetails(sale)}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableCell>
                                <TableCell className="font-medium whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                  {sale.invoice_number || "-"}
                                </TableCell>
                                <TableCell className="max-w-[200px] first:rounded-l-[10px] last:rounded-r-[10px]" title={getSaleUserName(sale)}>
                                  <div className="truncate">{getSaleUserName(sale)}</div>
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                  {formatAmount(sale.grand_total || 0)}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                  {formatAmount(sale.amount_paid || 0)}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                  {formatAmount(sale.amount_due ?? 0)}
                                </TableCell>
                                <TableCell className="max-w-[140px] truncate capitalize first:rounded-l-[10px] last:rounded-r-[10px]" title={sale.payment_method || "-"}>
                                  {sale.payment_method || "-"}
                                </TableCell>
                                <TableCell className="max-w-[180px] truncate first:rounded-l-[10px] last:rounded-r-[10px]" title={sale.courier_name || "-"}>
                                  {sale.courier_name || "-"}
                                </TableCell>
                                <TableCell
                                  className="max-w-[180px] truncate first:rounded-l-[10px] last:rounded-r-[10px]"
                                  title={sale.cn_number || sale.tracking_number || sale.consignment_id || "-"}
                                >
                                  {sale.cn_number || sale.tracking_number || sale.consignment_id || "-"}
                                </TableCell>
                                <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => (saleChecked ? handleRequestUnpack(sale.id) : handleRequestPack([sale.id]))}
                                      disabled={
                                        pendingIds.has(sale.id) ||
                                        (saleChecked ? !canUnpackPackaging : !canConfirmPackaging)
                                      }
                                      className={cn(
                                        "h-9 w-9 rounded-xl border-base-content/35 bg-base-100 p-0",
                                        saleChecked && "text-destructive hover:text-destructive",
                                      )}
                                      title={saleChecked ? "Unpack order" : "Mark order as packed"}
                                    >
                                      {saleChecked ? <PackageX className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setLogsSale(sale)}
                                      disabled={!canViewLogs}
                                      className="h-9 w-9 rounded-xl"
                                      title={canViewLogs ? "View packaging logs" : "You do not have permission to view logs"}
                                    >
                                      <History className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                  </TableBody>
                </Table>
              </div>
              <div className="table-scroll-bar" />
            </div>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-base-300 bg-base-100 p-2 scrollbar-hide">
              <Checkbox
                className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                checked={allPageSelected ? true : (somePageSelected ? "indeterminate" : false)}
                onCheckedChange={(checked) => togglePageSelection(checked === true)}
                aria-label="Select all packaging sales on this page"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {selectedCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  bulkActionMode === "unpack"
                    ? handleRequestBulkUnpack(selectedSaleIds)
                    : handleRequestPack(selectedSaleIds)
                }
                disabled={
                  selectedCount === 0 ||
                  (bulkActionMode === "unpack" ? !canUnpackPackaging : !canConfirmPackaging)
                }
                className={cn(
                  "h-9 w-9 flex-none rounded-xl border-base-content/35 bg-base-100 p-0",
                  bulkActionMode === "unpack" && "text-destructive hover:text-destructive",
                )}
                title={
                  selectedCount === 0
                    ? "Select sales first"
                    : bulkActionMode === "unpack"
                      ? "Unpack selected sales"
                      : "Mark selected sales as packed"
                }
              >
                {bulkActionMode === "unpack" ? <PackageX className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
              </Button>
            </div>
            {isLoading
              ? renderMobileSkeletons()
              : filteredSales.length === 0
                ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-6 text-center text-sm text-muted-foreground">
                    No completed orders found.
                  </div>
                )
                    : paginatedSales.map((sale) => {
                    const saleChecked = isChecked(sale.id);
                    return (
                      <Card
                        key={sale.id}
                        className={cn(
                          "border-dashed",
                          saleChecked && "bg-[rgb(200_255_205_/_55%)]"
                        )}
                      >
                        <CardContent className="space-y-3 p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <Checkbox
                                aria-label={`Select packaging sale ${sale.invoice_number || sale.id}`}
                                checked={selectedSaleIds.includes(sale.id)}
                                onCheckedChange={(checked) => toggleSaleSelection(sale.id, checked === true)}
                                className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                              />
                              {renderSaleCustomerLabel(sale)}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setLogsSale(sale)}
                                disabled={!canViewLogs}
                                className="h-9 w-9 flex-none rounded-xl p-0"
                                title={canViewLogs ? "View packaging logs" : "You do not have permission to view logs"}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => (saleChecked ? handleRequestUnpack(sale.id) : handleRequestPack([sale.id]))}
                                disabled={
                                  pendingIds.has(sale.id) ||
                                  (saleChecked ? !canUnpackPackaging : !canConfirmPackaging)
                                }
                                className={cn(
                                  "h-9 w-9 flex-none rounded-xl border-base-content/35 bg-base-100 p-0",
                                  saleChecked && "text-destructive hover:text-destructive",
                                )}
                                title={saleChecked ? "Unpack order" : "Mark order as packed"}
                              >
                                {saleChecked ? <PackageX className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {sale.invoice_number || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatInTimeZone(new Date(sale.created_at), "MMM dd, yyyy", systemSettings.timezone)}
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <p>Seller: {getSaleUserName(sale)}</p>
                            <p>CN: {sale.cn_number || sale.tracking_number || sale.consignment_id || "-"}</p>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div />
                            <div className="max-w-full shrink-0 truncate rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs capitalize text-base-content">
                              {sale.courier_name || "-"}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
          </div>
          <div className="border-t border-border/70 p-4 text-sm text-muted-foreground whitespace-nowrap">
            Showing {filteredSales.length} completed{" "}
            {filteredSales.length === 1 ? "order" : "orders"}
          </div>
          {!supportsPackaged && (
            <div className="border-t border-border/70 px-4 py-3 text-xs text-amber-600 dark:text-amber-300">
              Packaging state is running in read-only mode because `sales.packaged` is not in the database schema yet.
            </div>
          )}
        </CardContent>
      </Card>

      

      <AlertDialog open={confirmAction.ids.length > 0} onOpenChange={(open) => !open && setConfirmAction({ ids: [], mode: "pack" })}>
        <AlertDialogContent className="left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-md sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg sm:text-xl">
              {confirmAction.mode === "pack" ? "Confirm packaging?" : "Confirm unpack?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base">
              {confirmAction.mode === "pack"
                ? confirmAction.ids.length === 1
                  ? "This will mark the order as packaged. The row will remain highlighted even after reload."
                  : `This will mark ${confirmAction.ids.length} orders as packaged. The rows will remain highlighted even after reload.`
                : "This will remove the packaged state from the order."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <AlertDialogAction className="w-full sm:w-auto order-2 sm:order-1" onClick={handleConfirm}>Yes, confirm</AlertDialogAction>
            <AlertDialogCancel className="w-full sm:w-auto order-1 sm:order-2" onClick={() => setConfirmAction({ ids: [], mode: "pack" })}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!logsSale} onOpenChange={(open) => !open && setLogsSale(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[85vh] overflow-hidden p-0 gap-0">
          {logsSale && (
            <>
              <DialogDescription className="sr-only">
                Packaging activity log details for {logsSale.customer_name || "the selected sale"} {logsSale.invoice_number ? `invoice ${logsSale.invoice_number}` : ""}.
              </DialogDescription>
              <div className="flex items-center gap-3 border-b border-border/50 bg-base-100 px-5 py-4 pr-12 sticky top-0 z-10 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <DialogTitle className="text-base font-semibold leading-none">Packaging Activity</DialogTitle>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium truncate max-w-[140px] text-foreground">{logsSale.customer_name || "-"}</span>
                    <span>•</span>
                    <span>{logsSale.invoice_number || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto px-5 py-6 bg-base-50/50 max-h-[calc(85vh-73px)]">
                {activityLogsError ? (
                  <div className="rounded-[14px] border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                    Failed to load packaging activity logs.
                  </div>
                ) : activityLogsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="flex gap-4">
                        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                        <div className="space-y-2 flex-1 pt-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : packagingLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border/70 bg-base-100 py-12 text-center">
                    <History className="h-10 w-10 text-muted-foreground/30" />
                    <p className="mt-3 text-sm font-medium text-foreground">No Activity Yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Packaging history will appear here.</p>
                  </div>
                ) : (
                  <div className="relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border/60 space-y-7">
                    {packagingLogs.map((log) => {
                      const isPackedEvent = log.action === "packaging_packed";
                      const userLabel = log.full_name || log.email || log.user_id || "Unknown";
                      const diffRows = buildActivityDiffRows(log.details || null, systemSettings.timezone);

                      return (
                        <div key={log.id} className="relative flex items-start gap-4 group">
                          <div className={cn(
                            "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] bg-base-100 shadow-sm transition-transform group-hover:scale-105",
                            isPackedEvent ? "border-success/20 text-success" : "border-warning/20 text-warning"
                          )}>
                            {isPackedEvent ? <CheckCircle2 className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                          </div>
                          
                          <div className="flex-1 space-y-1 mt-0.5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <span className={cn(
                                "text-sm font-semibold",
                                isPackedEvent ? "text-success" : "text-warning"
                              )}>
                                {isPackedEvent ? "Marked as Packed" : "Marked as Unpacked"}
                              </span>
                              <span className="text-[11px] font-medium text-muted-foreground/80 whitespace-nowrap">
                                {formatInTimeZone(new Date(log.created_at), "MMM dd, yyyy • hh:mm a", systemSettings.timezone)}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">{userLabel}</span>
                            </div>

                            {diffRows.length > 0 && (
                              <div className="mt-2.5 flex flex-col gap-2">
                                {diffRows.map(row => (
                                  <div key={`${log.id}-${row.label}`} className="inline-flex items-center gap-2 rounded-[10px] border border-border/50 bg-base-100 px-3 py-2 text-xs shadow-sm w-fit transition-colors hover:bg-base-200/50">
                                    <span className="text-muted-foreground font-medium flex-shrink-0">{row.label}:</span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="line-through text-muted-foreground/60 decoration-muted-foreground/40">{row.before || "None"}</span>
                                      <span className="text-muted-foreground/40">→</span>
                                      <span className="font-medium text-foreground">{row.after || "None"}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
