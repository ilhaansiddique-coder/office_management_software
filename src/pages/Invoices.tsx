import { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Upload, Eye, Printer, Search, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useSales } from "@/hooks/useSales";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { SaleDialog } from "@/components/SaleDialog";
import { SaleDetailsDialog } from "@/components/SaleDetailsDialog";
import { useCurrency } from "@/hooks/useCurrency";
import { addDays } from "date-fns";
import { formatInTimeZone, toZonedDate } from "@/lib/time";
import { toast } from "@/utils/toast";
import { generateCashMemoHTML } from "@/lib/cashMemoTemplate";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { usePageSearch } from "@/hooks/usePageSearch";
import { usePageHeaderActions } from "@/hooks/usePageHeaderActions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { logActivity } from "@/utils/activityLogger";
import { SimpleDateRangeFilter } from "@/components/SimpleDateRangeFilter";
import { usePageHeaderControls } from "@/hooks/usePageHeaderControls";
import { useUserRole } from "@/hooks/useUserRole";
import { PermissionGate } from "@/components/PermissionGate";
import DOMPurify from 'dompurify';
import { MockDataNotice } from "@/components/MockDataNotice";
import { useMockDataContext } from "@/contexts/MockDataContext";

const Invoices = () => {
  const [showSaleDialog, setShowSaleDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const isMobile = useIsMobile();
  const { query: searchTerm, setQuery: setSearchTerm } = usePageSearch({
    placeholder: isMobile ? "" : "Search invoices by number or customer...",
  });
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printHtml, setPrintHtml] = useState<string>("");
  const [printSaleId, setPrintSaleId] = useState<string | null>(null);
  const [printSaleNumber, setPrintSaleNumber] = useState<string>("");
  const [printOptions, setPrintOptions] = useState<{ size: 'A5' | 'A4'; orientation: 'portrait' | 'landscape'; }>(
    { size: 'A5', orientation: 'portrait' }
  );
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { rawSales = [], isLoading, getSaleWithItems } = useSales();
  const { businessSettings } = useBusinessSettings();
  const { systemSettings } = useSystemSettings();
  const { formatAmount } = useCurrency();
  const { hasPermission, isLoading: permissionsLoading } = useUserRole();
  const { scaleSalesData } = useMockDataContext();
  const getInvoiceDisplayStatus = (sale: any) => {
    const terms = String(sale.payment_terms || "").toLowerCase();
    if (terms === "credit") return "paid";
    return sale.payment_status || "pending";
  };
  const scopedSales = useMemo(() => {
    return rawSales
      .filter((sale) => {
        if (dateRange.from || dateRange.to) {
          const saleDate = toZonedDate(new Date(sale.created_at), systemSettings.timezone);
          const rangeFrom = dateRange.from
            ? toZonedDate(dateRange.from, systemSettings.timezone)
            : undefined;
          const rangeTo = dateRange.to
            ? toZonedDate(dateRange.to, systemSettings.timezone)
            : undefined;
          if (rangeFrom && rangeTo) {
            return saleDate >= rangeFrom && saleDate <= rangeTo;
          } else if (rangeFrom) {
            return saleDate >= rangeFrom;
          } else if (rangeTo) {
            return saleDate <= rangeTo;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });
  }, [rawSales, dateRange, systemSettings.timezone]);

  const mockScopedSales = useMemo(
    () => scaleSalesData(scopedSales),
    [scopedSales, scaleSalesData],
  );

  const filteredSales = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return mockScopedSales.filter((sale) =>
      sale.invoice_number.toLowerCase().includes(searchLower) ||
      sale.customer_name.toLowerCase().includes(searchLower) ||
      (((sale as any).saved_customer_name || "").toLowerCase().includes(searchLower)) ||
      (((sale as any).customer_alias_names || []).some((alias: string) => alias.toLowerCase().includes(searchLower))) ||
      (sale.customer_address && sale.customer_address.toLowerCase().includes(searchLower)) ||
      ((sale as any).customer_location && String((sale as any).customer_location).toLowerCase().includes(searchLower))
    );
  }, [mockScopedSales, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / itemsPerPage));
  const startIndex = filteredSales.length === 0 ? 0 : (currentPage - 1) * itemsPerPage;
  const endIndex = filteredSales.length === 0 ? 0 : Math.min(startIndex + itemsPerPage, filteredSales.length);
  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSales.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSales, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateRange]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const totalInvoices = filteredSales.length;
  const paidInvoices = filteredSales.filter(s => getInvoiceDisplayStatus(s) === "paid").length;
  const outstandingAmount = filteredSales
    .filter(s => getInvoiceDisplayStatus(s) !== "paid")
    .reduce((sum, s) => sum + (s.amount_due || 0), 0);
  const thisMonthRevenue = filteredSales
    .filter(s => {
      const now = toZonedDate(new Date(), systemSettings.timezone);
      const saleDate = toZonedDate(new Date(s.created_at), systemSettings.timezone);
      return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, s) => sum + (s.grand_total || 0), 0);
  const headerActions = useMemo(() => {
    return (
      <TooltipProvider>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <PermissionGate permission="invoices.export">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={handleExportInvoices}
                  className="flex-1 rounded-xl md:flex-none md:shrink-0"
                  size="icon"
                  aria-label="Export all invoices"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export All</TooltipContent>
            </Tooltip>
          </PermissionGate>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setShowSaleDialog(true)}
                className="flex-1 rounded-xl md:flex-none md:shrink-0"
                size="icon"
                aria-label="Create invoice"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create Invoice</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }, [handleExportInvoices, setShowSaleDialog]);

  const headerControls = useMemo(() => {
    return (
      <div className="flex w-full items-center gap-2 md:w-auto mt-2 md:mt-0">
        <div className="flex-1 md:flex-none">
          <SimpleDateRangeFilter
            onDateRangeChange={(from, to) => setDateRange({ from, to })}
            triggerClassName="min-w-[120px] sm:min-w-[140px]"
          />
        </div>
      </div>
    );
  }, [setDateRange]);

  usePageHeaderControls(!isMobile ? headerControls : null);
  usePageHeaderActions(!isMobile ? headerActions : null);

  const handleCopyPhone = async (phone?: string | null) => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Number has been copied");
      return;
    } catch (error) {
      console.warn("Clipboard API failed, trying fallback", error);
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = phone;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Number has been copied");
    } catch (error) {
      console.error("Fallback copy failed", error);
      toast.error("Failed to copy number");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <SimpleDateRangeFilter
            onDateRangeChange={(from, to) => setDateRange({ from, to })}
            triggerClassName="h-9 !w-auto !min-w-[132px] rounded-xl px-2 text-xs whitespace-nowrap"
          />
        </div>
      </div>
      <MockDataNotice displayedCount={mockScopedSales.length} rawCount={scopedSales.length} noun="invoices" />
      <TooltipProvider>
        <div className="grid grid-cols-2 gap-2 md:hidden">
          <PermissionGate permission="invoices.export">
            <Button
              variant="outline"
              onClick={handleExportInvoices}
              className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
              aria-label="Export all invoices"
            >
              <Upload className="h-4 w-4" />
              <span className="font-medium">Export</span>
            </Button>
          </PermissionGate>
          <Button
            variant="outline"
            onClick={() => setShowSaleDialog(true)}
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Create invoice"
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium">Add</span>
          </Button>
        </div>
      </TooltipProvider>

      <div>
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide pr-[calc((100%-230px)/2)] md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:pr-0">
        <Card className="w-[230px] shrink-0 snap-start md:min-w-0 md:w-auto md:shrink">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInvoices}</div>
            <p className="text-xs text-muted-foreground">
              Total invoices created
            </p>
          </CardContent>
        </Card>
        <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paidInvoices}</div>
            <p className="text-xs text-muted-foreground">
              {totalInvoices > 0 ? ((paidInvoices / totalInvoices) * 100).toFixed(1) : 0}% payment rate
            </p>
          </CardContent>
        </Card>
        <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Amount</CardTitle>
            <FileText className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatAmount(outstandingAmount)}</div>
            <p className="text-xs text-muted-foreground">
              {filteredSales.filter(s => s.payment_status !== "paid").length} pending invoices
            </p>
          </CardContent>
        </Card>
        <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(thisMonthRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              Month to date revenue
            </p>
          </CardContent>
        </Card>
        </div>
      </div>
      <div className="md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search invoices by number or customer..."
            className="h-11 rounded-xl pl-10"
          />
        </div>
      </div>

      <Card className="border-0 bg-transparent shadow-none md:border md:bg-card md:shadow-sm">
        <CardContent className="p-0 md:p-4">
          <div className="grid gap-3 md:hidden">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="border-dashed">
                  <CardContent className="p-4 space-y-3">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                  </CardContent>
                </Card>
              ))
            ) : paginatedSales.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No invoices found
                </CardContent>
              </Card>
            ) : (
              paginatedSales.map((sale) => {
                const dueDate = addDays(new Date(sale.created_at), 30);
                const displayStatus = getInvoiceDisplayStatus(sale);
                const isOverdue = new Date() > dueDate && displayStatus !== "paid";

                return (
                  <Card key={sale.id} className="border-dashed">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{sale.customer_name}</div>
                        {(sale as any).saved_customer_name && (sale as any).saved_customer_name !== sale.customer_name && (
                          <div className="text-xs text-muted-foreground">Saved customer: {(sale as any).saved_customer_name}</div>
                        )}
                        <Badge
                          variant={
                            displayStatus === "paid" ? "default" :
                              isOverdue ? "destructive" :
                                displayStatus === "partial" ? "secondary" :
                                  "outline"
                          }
                        >
                          {isOverdue ? "Overdue" : displayStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={sale.customer_phone ? `tel:${sale.customer_phone}` : undefined}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {sale.customer_phone}
                        </a>
                        {sale.customer_phone && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleCopyPhone(sale.customer_phone)}
                            aria-label="Copy phone number"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {sale.invoice_number}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatInTimeZone(new Date(sale.created_at), "MMM dd, yyyy", systemSettings.timezone)}</span>
                        <span>{formatAmount(sale.grand_total || 0)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Due: {formatInTimeZone(dueDate, "MMM dd, yyyy", systemSettings.timezone)}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewInvoice(sale.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <PermissionGate permission="invoices.download_print">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintInvoice(sale)}
                            title="Print Invoice (HTML)"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="invoices.download_print">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadInvoiceHTML(sale)}
                            title="Download Invoice (HTML)"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
          <div className="hidden md:block">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Customer Phone Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No invoices found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedSales.map((sale) => {
                      const dueDate = addDays(new Date(sale.created_at), 30);
                      const displayStatus = getInvoiceDisplayStatus(sale);
                      const isOverdue = new Date() > dueDate && displayStatus !== "paid";

                      return (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">{sale.invoice_number}</TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <div className="truncate">{sale.customer_name}</div>
                              {(sale as any).saved_customer_name && (sale as any).saved_customer_name !== sale.customer_name && (
                                <div className="truncate text-xs text-muted-foreground">Saved customer: {(sale as any).saved_customer_name}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {sale.customer_phone ? (
                              <a
                                href={`tel:${sale.customer_phone}`}
                                className="text-primary underline-offset-2 hover:underline"
                              >
                                {sale.customer_phone}
                              </a>
                            ) : null}
                          </TableCell>
                          <TableCell>{formatInTimeZone(new Date(sale.created_at), "MMM dd, yyyy", systemSettings.timezone)}</TableCell>
                          <TableCell>{formatInTimeZone(dueDate, "MMM dd, yyyy", systemSettings.timezone)}</TableCell>
                          <TableCell>{formatAmount(sale.grand_total || 0)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                displayStatus === "paid" ? "default" :
                                  isOverdue ? "destructive" :
                                    displayStatus === "partial" ? "secondary" :
                                      "outline"
                              }
                            >
                              {isOverdue ? "Overdue" : displayStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewInvoice(sale.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <PermissionGate permission="invoices.download_print">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePrintInvoice(sale)}
                                  title="Print Invoice (HTML)"
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate permission="invoices.download_print">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadInvoiceHTML(sale)}
                                  title="Download Invoice (HTML)"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
      {
        totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 px-6 py-4">
            <div className="text-sm text-muted-foreground min-w-0 truncate">
              <span className="hidden sm:inline whitespace-nowrap">
                Showing {startIndex + (filteredSales.length ? 1 : 0)}-{endIndex} of {filteredSales.length} items
              </span>
              <span className="sm:hidden whitespace-nowrap">
                Showing {startIndex + (filteredSales.length ? 1 : 0)}-{endIndex} of {filteredSales.length} items
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 sm:ml-auto">
              <div className="flex items-center gap-2 sm:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
              <Pagination className="hidden sm:flex">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNumber)}
                          isActive={currentPage === pageNumber}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        )
      }

      <SaleDialog open={showSaleDialog} onOpenChange={setShowSaleDialog} />
      <SaleDetailsDialog
        open={showDetailsDialog}
        onOpenChange={handleCloseDetailsDialog}
        saleId={viewingSaleId}
      />

      {/* Print Preview Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl p-0">
          <div className="max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Invoice Preview</DialogTitle>
              <DialogDescription>Review the invoice and adjust print settings.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 p-6 pt-4 flex-1 min-h-0">
              {/* Preview */}
              <div className="flex-1 min-h-0 border rounded overflow-x-auto overflow-y-auto bg-base-100 flex justify-center">
                {/* Use iframe with srcdoc to sandbox styles */}
                <iframe
                  title="Invoice Preview"
                  className="block min-h-[60vh] sm:min-h-0"
                  style={{
                    width: previewWidth ? `${previewWidth}px` : "100%",
                    height: previewHeight ? `${previewHeight}px` : "70vh",
                    overflow: "visible",
                  }}
                  srcDoc={applyPrintOptionsToHtml(printHtml)}
                  onLoad={(event) => {
                    const doc = event.currentTarget.contentDocument;
                    if (!doc) return;
                    const body = doc.body;
                    const html = doc.documentElement;
                    const containerWidth = event.currentTarget.parentElement?.clientWidth || window.innerWidth;
                    const totalHeight = Math.max(
                      body?.scrollHeight || 0,
                      body?.offsetHeight || 0,
                      html?.scrollHeight || 0,
                      html?.offsetHeight || 0
                    );
                    const totalWidth = Math.max(
                      body?.scrollWidth || 0,
                      body?.offsetWidth || 0,
                      html?.scrollWidth || 0,
                      html?.offsetWidth || 0
                    );
                    const scale = isMobile ? Math.min(1, (containerWidth - 16) / (totalWidth || 1)) : 1;
                    doc.documentElement.style.setProperty("--preview-scale", String(scale));
                    if (totalHeight > 0) setPreviewHeight(totalHeight * scale);
                    if (totalWidth > 0) setPreviewWidth(totalWidth * scale);
                  }}
                  scrolling="no"
                />
              </div>
              {/* Settings */}
              <div className="space-y-4 shrink-0">
                <div className="space-y-2">
                  <Label>Paper Size</Label>
                  <Select
                    value={printOptions.size}
                    onValueChange={(v) => setPrintOptions((p) => ({ ...p, size: v as 'A5' | 'A4' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A5">A5</SelectItem>
                      <SelectItem value="A4">A4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Orientation</Label>
                  <Select
                    value={printOptions.orientation}
                    onValueChange={(v) => setPrintOptions((p) => ({ ...p, orientation: v as 'portrait' | 'landscape' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select orientation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-muted-foreground">
                  Tip: Use browser print dialog to choose printer, margins, and scale.
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleConfirmPrint}>{isMobile ? "Share" : "Print"}</Button>
                </div>
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 lg:hidden">
              <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleConfirmPrint}>{isMobile ? "Share" : "Print"}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );

  // Handler functions
  function handleViewInvoice(saleId: string) {
    setViewingSaleId(saleId);
    setShowDetailsDialog(true);
  }

  function handleCloseDetailsDialog() {
    setShowDetailsDialog(false);
    setViewingSaleId(null);
  }

  async function handlePrintInvoice(sale: any) {
    if (permissionsLoading) return;
    if (!hasPermission("invoices.download_print")) {
      toast.error("You don't have permission to print invoices.");
      return;
    }
    try {
      if (!businessSettings || !systemSettings) {
        toast.error("Settings not loaded");
        return;
      }

      // Get sale with items for complete data
      const saleWithItems = await getSaleWithItems(sale.id);

      // Prepare HTML for preview dialog
      const html = generateCashMemoHTML(saleWithItems, businessSettings, systemSettings);
      setPrintHtml(html);
      setPrintSaleId(sale.id);
      setPrintSaleNumber(sale.invoice_number);
      setIsPrintDialogOpen(true);
    } catch (error) {
      toast.error("Failed to open print preview");
      console.error("Print error:", error);
    }
  }

  async function handleDownloadInvoiceHTML(sale: any) {
    if (permissionsLoading) return;
    if (!hasPermission("invoices.download_print")) {
      toast.error("You don't have permission to download invoices.");
      return;
    }
    try {
      if (!businessSettings || !systemSettings) {
        toast.error("Settings not loaded");
        return;
      }

      // Get sale with items for complete data
      const saleWithItems = await getSaleWithItems(sale.id);
      const html = generateCashMemoHTML(saleWithItems, businessSettings, systemSettings);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${saleWithItems.invoice_number}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Invoice HTML downloaded successfully");
      await logActivity({
        action: "download_invoice",
        entityType: "sales",
        entityId: sale.id,
        summary: `Downloaded invoice ${sale.invoice_number}`,
        details: { invoice_number: sale.invoice_number, format: "html" },
      });
    } catch (error) {
      toast.error("Failed to download invoice");
      console.error("Download error:", error);
    }
  }

  function applyPrintOptionsToHtml(html: string) {
    try {
      const baseWidth = printOptions.size === "A4" ? "210mm" : "148mm";
      const baseHeight = printOptions.size === "A4" ? "297mm" : "210mm";
      const isLandscape = printOptions.orientation === "landscape";
      const pageWidth = isLandscape ? baseHeight : baseWidth;
      const pageHeight = isLandscape ? baseWidth : baseHeight;
      // Adjust @page size/orientation by replacing size directive
      const sizeToken = printOptions.size + (printOptions.orientation === 'landscape' ? ' landscape' : '');
      let updated = html.replace(/@page\s*\{[^}]*size:[^;]*;?/m, (match) => {
        // Replace size property inside existing @page block
        if (/size:/.test(match)) {
          return match.replace(/size:[^;]*;/, `size: ${sizeToken};`);
        }
        return match.replace(/\{/, `{ size: ${sizeToken};`);
      });
      updated = updated.replace(
        /<head>/i,
        "<head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />"
      );
      updated = updated.replace(
        /<\/head>/i,
        `<style>
          :root { --preview-scale: 1; }
          html, body { margin: 0; padding: 0; width: 100%; max-width: 100%; overflow: visible; }
          body { display: flex; flex-direction: column; justify-content: flex-start; align-items: center; }
          .memo, .cash-memo { transform: scale(var(--preview-scale)); transform-origin: top center; }
          @media (max-width: 640px) {
            html, body { width: 100%; }
            body { justify-content: flex-start; padding: 4px; }
            .memo, .cash-memo { transform-origin: top left; }
          }
          @media (min-width: 1024px) {
            html, body { width: 100%; }
            body { justify-content: center; }
            .memo, .cash-memo { margin: 0 auto; }
          }
          @media print {
            html, body { width: auto !important; max-width: none !important; }
            body { display: block !important; padding: 0 !important; }
            .memo, .cash-memo { transform: none !important; margin: 0 auto !important; }
          }
          @page { size: ${pageWidth} ${pageHeight}; margin: 0; }
          :root { --page-width: ${pageWidth}; --page-height: ${pageHeight}; }
          @media print {
            html, body { width: var(--page-width) !important; height: var(--page-height) !important; margin: 0 !important; padding: 0 !important; }
            body { display: block !important; }
            .memo, .cash-memo {
              width: var(--page-width) !important;
              max-width: var(--page-width) !important;
              height: var(--page-height) !important;
              max-height: var(--page-height) !important;
              margin: 0 auto !important;
            }
          }
        </style></head>`
      );
      return updated;
    } catch {
      return html;
    }
  }

  async function handleConfirmPrint() {
    try {
      const finalHtml = applyPrintOptionsToHtml(printHtml);
      if (printSaleId) {
        await logActivity({
          action: "print_invoice",
          entityType: "sales",
          entityId: printSaleId,
          summary: `Printed invoice ${printSaleNumber || printSaleId}`,
          details: { invoice_number: printSaleNumber || null },
        });
      }
      if (isMobile && navigator.share) {
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
          import("html2canvas"),
          import("jspdf"),
        ]);

        // Extract styles and body content from the HTML template
        const styleMatch = finalHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const bodyMatch = finalHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

        if (!styleMatch || !bodyMatch) {
          throw new Error("Could not parse invoice HTML template");
        }

        const cssContent = styleMatch[1];
        const bodyContent = bodyMatch[1];

        // Create a unique scope ID to avoid style conflicts
        const scopeId = `invoice-pdf-${Date.now()}`;

        // Create container with proper structure
        const container = document.createElement("div");
        container.id = scopeId;
        container.className = "pdf-mode";
        container.style.position = "fixed";
        container.style.top = "-9999px";
        container.style.left = "-9999px";
        container.style.width = printOptions.size === "A4" ? "210mm" : "148mm";
        container.style.backgroundColor = "white";
        container.style.fontFamily = '"Manrope", ui-sans-serif, system-ui, sans-serif';

        // Inject scoped styles
        const styleElement = document.createElement("style");
        // Scope the CSS to our container and add pdf-mode body styles
        const scopedCss = cssContent
          .replace(/body\s*\{/g, `#${scopeId} {`)
          .replace(/body:not\(\.pdf-mode\)/g, `#${scopeId}:not(.pdf-mode)`)
          .replace(/body\.pdf-mode/g, `#${scopeId}.pdf-mode`)
          .replace(/@media\s+print\s*\{[\s\S]*?\}\s*\}/g, '') // Remove print media queries
          .replace(/@page[^{]*\{[^}]*\}/g, ''); // Remove @page rules
        styleElement.textContent = scopedCss;
        document.head.appendChild(styleElement);

        // Add the body content - sanitize to prevent XSS
        container.innerHTML = DOMPurify.sanitize(bodyContent, {
          ALLOWED_TAGS: ['div', 'span', 'p', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'br', 'hr', 'svg', 'path', 'b', 'i'],
          ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'colspan', 'rowspan', 'width', 'height', 'id', 'viewBox', 'd', 'fill', 'role', 'aria-label', 'aria-hidden'],
          ALLOW_DATA_ATTR: false,
        });
        document.body.appendChild(container);

        try {
          // Wait for content and fonts to load
          await new Promise((r) => setTimeout(r, 500));
          if ((document as any).fonts?.ready) {
            await (document as any).fonts.ready;
          }

          // Find the memo element to capture
          const memoElement = container.querySelector('.memo') as HTMLElement;
          if (!memoElement) {
            throw new Error("Could not find memo element");
          }

          const canvas = await html2canvas(memoElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: "white",
            logging: false,
          });
          const orientation = printOptions.orientation === "landscape" ? "landscape" : "portrait";
          const format = printOptions.size === "A4" ? "a4" : "a5";
          const pdf = new jsPDF({ orientation, unit: "mm", format, compress: false });
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgWidth = pdfWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const imgData = canvas.toDataURL("image/png");
          pdf.addImage(imgData, "PNG", 0, Math.max(0, (pdfHeight - imgHeight) / 2), imgWidth, imgHeight);
          const blob = pdf.output("blob");
          const file = new File([blob], `invoice-${Date.now()}.pdf`, { type: "application/pdf" });
          const navAny = navigator as Navigator & {
            canShare?: (data: { files?: File[] }) => boolean;
          };
          if (navAny.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: "Invoice" });
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          await navigator.share({ title: "Invoice", url: blobUrl });
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          return;
        } finally {
          if (document.body.contains(container)) document.body.removeChild(container);
          if (document.head.contains(styleElement)) document.head.removeChild(styleElement);
        }
      }

      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(finalHtml);
      w.document.close();
      w.onload = () => {
        w.focus();
        w.print();
      };
    } catch (e) {
      console.error(e);
      toast.error('Failed to start printing');
    }
  }

  async function handleExportInvoices() {
    if (permissionsLoading) return;
    if (!hasPermission("invoices.export")) {
      toast.error("You don't have permission to export invoices.");
      return;
    }
    try {
      if (filteredSales.length === 0) {
        toast.error("No invoices to export");
        return;
      }

      if (!businessSettings || !systemSettings) {
        toast.error("Settings not loaded");
        return;
      }

      // Ask user for export format (Cancel should stop export)
      const confirmPdf = window.confirm("Export as PDF?");
      if (!confirmPdf) {
        toast.info("Export cancelled");
        return;
      }

      // Export each invoice as a separate PDF
      for (const sale of filteredSales) {
        try {
          const saleWithItems = await getSaleWithItems(sale.id);
          // Use the same template for batch export via PDF
          const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf')
          ]);
          const html = generateCashMemoHTML(saleWithItems, businessSettings, systemSettings);

          // Extract styles and body content from the HTML template
          const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
          const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

          if (!styleMatch || !bodyMatch) {
            throw new Error("Could not parse invoice HTML template");
          }

          const cssContent = styleMatch[1];
          const bodyContent = bodyMatch[1];

          // Create a unique scope ID
          const scopeId = `invoice-pdf-${Date.now()}-${sale.id}`;

          // Create container with proper structure
          const container = document.createElement("div");
          container.id = scopeId;
          container.className = "pdf-mode";
          container.style.position = "fixed";
          container.style.top = "-9999px";
          container.style.left = "-9999px";
          container.style.width = "148mm";
          container.style.backgroundColor = "white";
          container.style.fontFamily = '"Manrope", ui-sans-serif, system-ui, sans-serif';

          // Inject scoped styles
          const styleElement = document.createElement("style");
          const scopedCss = cssContent
            .replace(/body\s*\{/g, `#${scopeId} {`)
            .replace(/body:not\(\.pdf-mode\)/g, `#${scopeId}:not(.pdf-mode)`)
            .replace(/body\.pdf-mode/g, `#${scopeId}.pdf-mode`)
            .replace(/@media\s+print\s*\{[\s\S]*?\}\s*\}/g, '')
            .replace(/@page[^{]*\{[^}]*\}/g, '');
          styleElement.textContent = scopedCss;
          document.head.appendChild(styleElement);

          // Sanitize HTML to prevent XSS
          container.innerHTML = DOMPurify.sanitize(bodyContent, {
            ALLOWED_TAGS: ['div', 'span', 'p', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'br', 'hr', 'svg', 'path', 'b', 'i'],
            ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'colspan', 'rowspan', 'width', 'height', 'id', 'viewBox', 'd', 'fill', 'role', 'aria-label', 'aria-hidden'],
            ALLOW_DATA_ATTR: false,
          });
          document.body.appendChild(container);

          try {
            await new Promise(r => setTimeout(r, 300));
            if ((document as any).fonts?.ready) {
              await (document as any).fonts.ready;
            }

            const memoElement = container.querySelector('.memo') as HTMLElement;
            if (!memoElement) {
              throw new Error("Could not find memo element");
            }

            const canvas = await html2canvas(memoElement, { scale: 2, useCORS: true, backgroundColor: 'white', logging: false });
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const imgData = canvas.toDataURL('image/png', 1.0);
            pdf.addImage(imgData, 'PNG', 0, Math.max(0, (pdfHeight - imgHeight) / 2), imgWidth, imgHeight);
            pdf.save(`invoice-${saleWithItems.invoice_number}.pdf`);
          } finally {
            if (document.body.contains(container)) document.body.removeChild(container);
            if (document.head.contains(styleElement)) document.head.removeChild(styleElement);
          }
        } catch (error) {
          console.error(`Error exporting invoice ${sale.invoice_number}:`, error);
        }
      }
      toast.success(`${filteredSales.length} invoices exported as PDF successfully`);
      await logActivity({
        action: "export_invoices",
        entityType: "sales",
        summary: "Exported invoices as PDF",
        details: { count: filteredSales.length, format: "pdf" },
      });
    } catch (error) {
      toast.error("Failed to export invoices");
      console.error("Export error:", error);
    }
  }

  // Debug function to test PDF libraries
  async function handleTestPDFLibraries() {
    try {
      const { testPDFLibraries } = await import('@/lib/simpleInvoiceGenerator');
      const result = await testPDFLibraries();

      if (result.html2canvas && result.jsPDF) {
        toast.success("PDF libraries are working correctly!");
      } else {
        toast.error(`PDF libraries test failed: ${result.error}`);
        console.log("PDF Libraries Test Result:", result);
      }
    } catch (error) {
      toast.error("Failed to test PDF libraries");
      console.error("Test error:", error);
    }
  }
};

export default Invoices;
