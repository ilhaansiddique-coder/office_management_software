import { Plus, Users, Phone, Edit, Trash2, MessageCircle, Download, Upload, RefreshCw, Eye, Search, Wallet, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useCustomers } from "@/hooks/useCustomers";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { CustomerDialog } from "@/components/CustomerDialog";
import { useCurrency } from "@/hooks/useCurrency";
import { SimpleDateRangeFilter } from "@/components/SimpleDateRangeFilter";
import { Input } from "@/components/ui/input";
import { isWithinInterval, parseISO } from "date-fns";
import * as ExcelJS from "exceljs";
import { toast } from "@/utils/toast";
import { useUserRole } from "@/hooks/useUserRole";
import { usePageSearch } from "@/hooks/usePageSearch";
import { usePageHeaderControls } from "@/hooks/usePageHeaderControls";
import { usePageHeaderActions } from "@/hooks/usePageHeaderActions";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { CustomerPaymentManagementDialog } from "@/components/CustomerPaymentManagementDialog";
import { logActivity } from "@/utils/activityLogger";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const Customers = () => {
  type CustomerSortField = "order_count" | "delivered_count" | "cancelled_count" | "total_spent";
  type SortDirection = "asc" | "desc";

  const { customers, isLoading, deleteCustomer, updateCustomer, createCustomer, updateCustomerStats, isUpdatingStats } = useCustomers();
  const { formatAmount } = useCurrency();
  const { hasPermission, isAdmin } = useUserRole();
  const isMobile = useIsMobile();
  const { query: searchTerm, setQuery: setSearchTerm } = usePageSearch({ placeholder: "" });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<any>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ field: CustomerSortField | null; direction: SortDirection }>({
    field: null,
    direction: "desc",
  });
  const [pendingDeleteCustomerId, setPendingDeleteCustomerId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const tableScrollBarRef = useRef<HTMLDivElement | null>(null);
  const tableScrollSpacerRef = useRef<HTMLDivElement | null>(null);
  const itemsPerPage = 30;

  const filteredCustomers = useMemo(() => {
    return customers
      .filter(customer => {
        // Search filter (includes name, phone, whatsapp, additional info, and total spent)
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = customer.name.toLowerCase().includes(searchLower) ||
          ((customer.alias_names || []).some((alias) => alias.toLowerCase().includes(searchLower))) ||
          (customer.phone && customer.phone.includes(searchTerm)) ||
          (customer.whatsapp && customer.whatsapp.includes(searchTerm)) ||
          (customer.additional_info && customer.additional_info.toLowerCase().includes(searchLower)) ||
          (customer.address && customer.address.toLowerCase().includes(searchLower)) ||
          customer.total_spent.toString().includes(searchTerm);

        // Date filter
        const matchesDate = !startDate || !endDate || isWithinInterval(parseISO(customer.created_at), {
          start: startDate,
          end: endDate,
        });

        return matchesSearch && matchesDate;
      })
      .sort((a, b) => {
        if (sortConfig.field) {
          const aValue = Number(a[sortConfig.field] ?? 0);
          const bValue = Number(b[sortConfig.field] ?? 0);
          if (aValue !== bValue) {
            return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
          }
        }

        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });
  }, [customers, searchTerm, startDate, endDate, sortConfig]);

  const handleSortToggle = useCallback((field: CustomerSortField) => {
    setSortConfig((current) => {
      if (current.field === field) {
        return {
          field,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        field,
        direction: "desc",
      };
    });
  }, []);

  const renderSortableHeader = useCallback((label: string, field: CustomerSortField) => {
    const isActive = sortConfig.field === field;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === "asc" ? ChevronUp : ChevronDown;

    return (
      <button
        type="button"
        onClick={() => handleSortToggle(field)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:text-foreground",
          isActive && "text-foreground"
        )}
        aria-label={`Sort by ${label} ${isActive && sortConfig.direction === "asc" ? "descending" : "ascending"}`}
      >
        <span>{label}</span>
        <Icon className={cn("h-3.5 w-3.5", !isActive && "text-muted-foreground")} />
      </button>
    );
  }, [handleSortToggle, sortConfig.direction, sortConfig.field]);

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setIsDialogOpen(true);
  };

  const handleViewHistory = (customer) => {
    setHistoryCustomer(customer);
    setHistoryOpen(true);
  };

  const handleDelete = (id: string) => {
    setPendingDeleteCustomerId(id);
  };

  const handleOpenPaymentDialog = (customer: any) => {
    if ((customer?.credit_due || 0) <= 0) return;
    setPaymentCustomer(customer);
    setPaymentDialogOpen(true);
  };

  const confirmDeleteCustomer = () => {
    if (!pendingDeleteCustomerId) return;
    const customerToDelete = customers.find(c => c.id === pendingDeleteCustomerId);
    deleteCustomer.mutate(pendingDeleteCustomerId, {
      onSuccess: () => {
        logActivity({
          action: "delete",
          entityType: "customers",
          entityId: pendingDeleteCustomerId,
          summary: `Deleted customer "${customerToDelete?.name || ""}"`.trim(),
          details: {
            old: {
              name: customerToDelete?.name || null,
              phone: customerToDelete?.phone || null,
              address: customerToDelete?.address || null,
              status: customerToDelete?.status || null,
              additional_info: customerToDelete?.additional_info || null,
            },
          },
        });
      },
    });
    setPendingDeleteCustomerId(null);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCustomer(null);
  };

  const handleCloseHistory = () => {
    setHistoryOpen(false);
    setHistoryCustomer(null);
  };

  const handleClosePaymentDialog = () => {
    setPaymentDialogOpen(false);
    setPaymentCustomer(null);
  };

  // Import / Export handlers (used by header actions)
  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleExport = async () => {
    try {
      const exportData = filteredCustomers.map(customer => ({
        Name: customer.name,
        'Additional Info': customer.additional_info || '',
        Phone: customer.phone || '',
        WhatsApp: customer.whatsapp || '',
        Address: customer.address || '',
        'Order Count': customer.order_count,
        'Total Spent': customer.total_spent,
        Tags: customer.tags?.join(', ') || '',
        Status: customer.status,
        'Created At': new Date(customer.created_at).toLocaleDateString(),
      }));

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Customers');
      const headers = Object.keys(exportData[0] || {});
      worksheet.addRow(headers);
      worksheet.getRow(1).font = { bold: true };
      exportData.forEach(row => worksheet.addRow(Object.values(row)));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `customers_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Customer data exported successfully');
    } catch (e) {
      toast.error('Failed to export customers');
    }
  };

  const handleDateRangeChange = useCallback((start?: Date, end?: Date) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const headerControls = useMemo(() => (
    <div className="flex w-full items-center justify-end gap-2">
      <div className="relative hidden md:block w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search customers, phone, WhatsApp, or notes..."
          className="h-11 rounded-xl pl-10"
        />
      </div>
      <div className="hidden md:block">
        <SimpleDateRangeFilter
          onDateRangeChange={handleDateRangeChange}
          defaultPreset="all"
          triggerClassName="h-11 min-w-[150px] rounded-xl"
        />
      </div>
    </div>
  ), [handleDateRangeChange, searchTerm, setSearchTerm]);

  const headerActions = useMemo(() => (
    <>
      {hasPermission('customers.import_export') && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleExport}
                disabled={filteredCustomers.length === 0}
                className="rounded-xl"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export Customers</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {hasPermission('customers.import_export') && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleImport}
                className="rounded-xl"
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import Customers</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => updateCustomerStats(true)}
              disabled={isUpdatingStats}
              className="rounded-xl"
            >
              <RefreshCw className={`h-4 w-4 ${isUpdatingStats ? 'animate-spin' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isUpdatingStats ? 'Refreshing...' : 'Refresh Stats'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {hasPermission('customers.add') && (
        <Button
          size="icon"
          variant="outline"
          className="rounded-xl"
          aria-label="Add Customer"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </>
  ), [hasPermission, handleImport, handleExport, filteredCustomers.length, updateCustomerStats, isUpdatingStats]);

  usePageHeaderControls(!isMobile ? headerControls : null);
  usePageHeaderActions(!isMobile ? headerActions : null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, sortConfig]);

  useEffect(() => {
    const table = tableRef.current;
    const scrollContainer = table?.parentElement || null;
    const bar = tableScrollBarRef.current;
    const spacer = tableScrollSpacerRef.current;
    if (!table || !scrollContainer || !bar || !spacer) return;

    let syncing = false;
    const syncFromTable = () => {
      if (syncing) return;
      syncing = true;
      bar.scrollLeft = scrollContainer.scrollLeft;
      syncing = false;
    };
    const syncFromBar = () => {
      if (syncing) return;
      syncing = true;
      scrollContainer.scrollLeft = bar.scrollLeft;
      syncing = false;
    };
    const updateWidth = () => {
      spacer.style.width = `${table.scrollWidth}px`;
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(table);
    scrollContainer.addEventListener("scroll", syncFromTable);
    bar.addEventListener("scroll", syncFromBar);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener("scroll", syncFromTable);
      bar.removeEventListener("scroll", syncFromBar);
      window.removeEventListener("resize", updateWidth);
    };
  }, [filteredCustomers.length]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const startIndex = filteredCustomers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage;
  const endIndex = filteredCustomers.length === 0 ? 0 : Math.min(startIndex + itemsPerPage, filteredCustomers.length);
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCustomers.slice(startIndex, endIndex);
  }, [filteredCustomers, currentPage, itemsPerPage]);


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (!['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
      toast.error("Please upload a valid XLSX or CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let jsonData: any[] = [];

        if (fileExtension === 'csv') {
          // Handle CSV files
          const text = e.target?.result as string;
          const lines = text.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
              const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
              const row: any = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              jsonData.push(row);
            }
          }
        } else {
          // Handle XLSX/XLS files using ExcelJS
          const data = e.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(data);
          const worksheet = workbook.worksheets[0];

          if (!worksheet) {
            throw new Error('No worksheet found in the file');
          }

          // Convert worksheet to JSON
          const headers: string[] = [];
          const rows: any[] = [];

          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
              // First row contains headers
              row.eachCell((cell, colNumber) => {
                headers[colNumber - 1] = cell.text || '';
              });
            } else {
              // Data rows
              const rowData: any = {};
              row.eachCell((cell, colNumber) => {
                const header = headers[colNumber - 1];
                if (header) {
                  rowData[header] = cell.text || '';
                }
              });
              if (Object.keys(rowData).length > 0) {
                rows.push(rowData);
              }
            }
          });

          jsonData = rows;
        }

        if (jsonData.length === 0) {
          toast.error("No data found in the file");
          return;
        }

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        let updatedCount = 0;

        const processBatch = async (items: any[], batchIndex: number) => {
          const batchPromises = items.map(async (row: any, rowIndex: number) => {
            try {
              // Skip completely empty rows
              const hasAnyData = Object.values(row).some(value =>
                value !== null && value !== undefined && String(value).trim() !== ''
              );

              if (!hasAnyData) {
                console.log(`Skipping empty row ${rowIndex + 1}`);
                return;
              }

              // Map the data to customer structure with flexible field matching
              const customerData = {
                name: String(row.Name || row.name || row.CUSTOMER_NAME || row['Customer Name'] || '').trim(),
                phone: row.Phone || row.phone || row.PHONE || row['Phone Number'] || undefined,
                whatsapp: row.WhatsApp || row.whatsapp || row.WHATSAPP || row['WhatsApp Number'] || undefined,
                address: row.Address || row.address || row.ADDRESS || undefined,
                tags: row.Tags || row.tags || row.TAGS ? String(row.Tags || row.tags || row.TAGS).split(',').map(tag => tag.trim()) : [],
                status: row.Status || row.status || row.STATUS || 'inactive',
              };

              // Clean up empty string values
              if (customerData.phone === '') customerData.phone = undefined;
              if (customerData.whatsapp === '') customerData.whatsapp = undefined;
              if (customerData.address === '') customerData.address = undefined;

              // Ensure status is valid
              if (!['active', 'inactive', 'neutral'].includes(customerData.status.toLowerCase())) {
                customerData.status = 'inactive';
              }

              console.log(`Processing row ${rowIndex + 1}:`, customerData);

              // Validate required fields
              if (!customerData.name || customerData.name === '') {
                console.log(`Row ${rowIndex + 1} failed: Missing customer name`);
                errorCount++;
                return;
              }

              // Check for existing customers (by name or phone)
              const existingCustomer = customers.find(c =>
                c.name.toLowerCase().trim() === customerData.name.toLowerCase().trim() ||
                (customerData.phone && c.phone && c.phone.replace(/[^\d]/g, '') === customerData.phone.replace(/[^\d]/g, ''))
              );

              if (existingCustomer) {
                // Check if any data has changed
                const hasChanges =
                  existingCustomer.name !== customerData.name ||
                  existingCustomer.phone !== customerData.phone ||
                  existingCustomer.whatsapp !== customerData.whatsapp ||
                  existingCustomer.address !== customerData.address ||
                  existingCustomer.status !== customerData.status ||
                  JSON.stringify(existingCustomer.tags?.sort()) !== JSON.stringify(customerData.tags?.sort());

                if (!hasChanges) {
                  console.log(`Row ${rowIndex + 1} skipped: No changes detected (${customerData.name})`);
                  skippedCount++;
                  return;
                }

                // Update the existing customer
                return new Promise((resolve, reject) => {
                  updateCustomer.mutate({ id: existingCustomer.id, data: customerData }, {
                    onSuccess: () => {
                      console.log(`Row ${rowIndex + 1} success: Updated customer ${customerData.name}`);
                      updatedCount++;
                      resolve(true);
                    },
                    onError: (error) => {
                      console.error(`Row ${rowIndex + 1} failed: Customer update error:`, error);
                      errorCount++;
                      reject(error);
                    },
                  });
                });
              }

              // Create the customer
              return new Promise((resolve, reject) => {
                createCustomer.mutate(customerData, {
                  onSuccess: () => {
                    console.log(`Row ${rowIndex + 1} success: Created customer ${customerData.name}`);
                    successCount++;
                    resolve(true);
                  },
                  onError: (error) => {
                    console.error(`Row ${rowIndex + 1} failed: Customer creation error:`, error);
                    errorCount++;
                    reject(error);
                  },
                });
              });

            } catch (error) {
              console.error(`Row ${rowIndex + 1} failed: Processing error:`, error);
              errorCount++;
            }
          });

          await Promise.allSettled(batchPromises);
        };

        // Process in batches of 10
        const batchSize = 10;
        for (let i = 0; i < jsonData.length; i += batchSize) {
          const batch = jsonData.slice(i, i + batchSize);
          await processBatch(batch, Math.floor(i / batchSize));

          // Small delay between batches to prevent overwhelming the system
          if (i + batchSize < jsonData.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // Show final result
        const totalProcessed = successCount + updatedCount + skippedCount + errorCount;
        let message = `Import completed: ${successCount} created`;
        if (updatedCount > 0) message += `, ${updatedCount} updated`;
        if (skippedCount > 0) message += `, ${skippedCount} skipped`;
        if (errorCount > 0) message += `, ${errorCount} failed`;

        if (errorCount > 0) {
          toast.error(message);
        } else {
          toast.success(message);
        }

      } catch (error) {
        console.error("Import error:", error);
        toast.error("Failed to import customer data: " + (error as Error).message);
      }
    };

    if (fileExtension === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }

    // Reset file input
    (event.target as HTMLInputElement).value = '';
  };

  return (
    <div className="space-y-4 md:space-y-0">
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <SimpleDateRangeFilter
            onDateRangeChange={handleDateRangeChange}
            defaultPreset="all"
            triggerClassName="h-9 !w-auto !min-w-[128px] rounded-xl px-2 text-xs whitespace-nowrap"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 md:hidden">
        {hasPermission('customers.import_export') && (
          <Button
            variant="outline"
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={handleExport}
            disabled={filteredCustomers.length === 0}
          >
            <Upload className="h-4 w-4" />
            <span className="font-medium">Export</span>
          </Button>
        )}
        {hasPermission('customers.import_export') && (
          <Button
            variant="outline"
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={handleImport}
          >
            <Download className="h-4 w-4" />
            <span className="font-medium">Import</span>
          </Button>
        )}
        <Button
          variant="outline"
          className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
          onClick={() => updateCustomerStats(true)}
          disabled={isUpdatingStats}
        >
          <RefreshCw className={`h-4 w-4 ${isUpdatingStats ? 'animate-spin' : ''}`} />
          <span className="font-medium">Refresh</span>
        </Button>
        {hasPermission('customers.add') ? (
          <Button
            variant="outline"
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium">Add</span>
          </Button>
        ) : (
          <div />
        )}
      </div>
      <div className="md:!mt-0">
        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide pr-[calc((100%-230px)/2)] md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:pr-0">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className={`w-[230px] shrink-0 ${i === 0 ? "snap-start" : "snap-center"} md:min-w-0 md:w-auto md:shrink`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide pr-[calc((100%-230px)/2)] md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:pr-0">
            <Card className="w-[230px] shrink-0 snap-start md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Filtered Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredCustomers.length}</div>
                <p className="text-xs text-muted-foreground">
                  Selected period customers
                </p>
              </CardContent>
            </Card>
            <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customers.length}</div>
                <p className="text-xs text-muted-foreground">
                  All time customers
                </p>
              </CardContent>
            </Card>
            <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {filteredCustomers.filter(c => c.status === 'active').length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Active status customers
                </p>
              </CardContent>
            </Card>
            <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatAmount(filteredCustomers.length > 0 ?
                    (filteredCustomers.filter(c => c.order_count > 0).reduce((sum, c) => sum + c.total_spent, 0) /
                      filteredCustomers.filter(c => c.order_count > 0).length || 1) :
                    0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Average spent per customer
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:hidden">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search customers, phone, WhatsApp, or notes..."
            className="h-11 rounded-xl pl-10"
          />
        </div>
        <div className="hidden sm:block">
          <SimpleDateRangeFilter
            onDateRangeChange={handleDateRangeChange}
            defaultPreset="all"
            triggerClassName="h-11 min-w-[150px] rounded-xl"
          />
        </div>
      </div>
      <section className="space-y-4 md:!mt-6">
        <div>
          <TooltipProvider>
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
              ) : paginatedCustomers.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No customers found
                  </CardContent>
                </Card>
              ) : (
                paginatedCustomers.map((customer) => (
                  <Card key={customer.id} className="border-dashed">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{customer.name}</div>
                        {customer.additional_info ? (
                          <Badge variant="secondary" className="capitalize">
                            {customer.additional_info}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No Notes</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {customer.phone ? (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{customer.phone}</span>
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                        {customer.whatsapp ? (
                          <a
                            href={`https://wa.me/${customer.whatsapp.replace(/[^\d]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-success hover:bg-success/85 transition-colors"
                          >
                            <MessageCircle className="h-4 w-4 text-white" />
                          </a>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-md bg-muted/40 p-2 text-center">
                          <div className="text-[10px] uppercase text-muted-foreground truncate leading-tight">Orders</div>
                          <div className="font-semibold">{customer.order_count}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2 text-center">
                          <div className="text-[10px] uppercase text-muted-foreground truncate leading-tight">Delivered</div>
                          <div className="font-semibold">{customer.delivered_count ?? 0}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2 text-center">
                          <div className="text-[10px] uppercase text-muted-foreground truncate leading-tight">Cancelled</div>
                          <div className="font-semibold">{customer.cancelled_count ?? 0}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2 text-center">
                          <div className="text-[10px] uppercase text-muted-foreground truncate leading-tight">Spent</div>
                          <div className="font-semibold">{formatAmount(customer.total_spent)}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenPaymentDialog(customer)}
                              disabled={(customer.credit_due || 0) <= 0}
                              aria-label="View due payments"
                              className={cn(
                                (customer.credit_due || 0) <= 0 &&
                                "text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40"
                              )}
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          {(customer.credit_due || 0) > 0 && (
                            <TooltipContent>View Due Payments</TooltipContent>
                          )}
                        </Tooltip>
                        {hasPermission('customers.view_history') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewHistory(customer)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {hasPermission('customers.edit') && (
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(customer)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(customer.id)}
                            disabled={deleteCustomer.isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
            <div className="hidden md:block">
              <div className="table-scroll-wrapper space-y-0">
                <div className="table-scroll-body">
                  <Table
                    ref={tableRef}
                    containerClassName="table-vertical-scroll table-inner-scrollbar h-[39rem] max-h-[39rem] rounded-t-2xl rounded-b-none border-x border-base-300 overflow-y-auto [clip-path:inset(0_round_1rem_1rem_0_0)]"
                    className="border-separate border-spacing-y-0"
                  >
                    <TableHeader className="sticky top-0 z-[6] overflow-hidden rounded-t-2xl bg-base-200">
                      <TableRow className="sticky top-0 z-[6] bg-base-200 shadow-[0_1px_0_hsl(var(--border))] [&>th]:font-semibold [&>th]:text-foreground [&>th:first-child]:rounded-tl-2xl [&>th:last-child]:rounded-tr-2xl">
                        <TableHead className="whitespace-nowrap">Name</TableHead>
                        <TableHead className="whitespace-nowrap">Additional Info</TableHead>
                        <TableHead className="whitespace-nowrap">Phone</TableHead>
                        <TableHead className="whitespace-nowrap">WhatsApp</TableHead>
                        <TableHead className="whitespace-nowrap">{renderSortableHeader("Orders", "order_count")}</TableHead>
                        <TableHead className="whitespace-nowrap">{renderSortableHeader("Delivered", "delivered_count")}</TableHead>
                        <TableHead className="whitespace-nowrap">{renderSortableHeader("Cancelled", "cancelled_count")}</TableHead>
                        <TableHead className="whitespace-nowrap">{renderSortableHeader("Total Spent", "total_spent")}</TableHead>
                        <TableHead className="whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        [...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                          </TableRow>
                        ))
                      ) : (
                        paginatedCustomers.map((customer) => {
                          return (
                            <TableRow key={customer.id}>
                              <TableCell className="font-medium whitespace-nowrap min-w-[120px] max-w-[150px] sm:max-w-[200px] truncate" title={customer.name}>{customer.name}</TableCell>
                              <TableCell className="whitespace-nowrap min-w-[100px]">
                                {customer.additional_info ? (
                                  <Badge variant="secondary" className="capitalize">
                                    {customer.additional_info}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap min-w-[120px]">
                                {customer.phone ? (
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    {customer.phone}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap min-w-[60px]">
                                {customer.whatsapp ? (
                                  <a
                                    href={`https://wa.me/${customer.whatsapp.replace(/[^\d]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-success hover:bg-success/85 transition-colors"
                                  >
                                    <MessageCircle className="h-4 w-4 text-white" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap min-w-[90px]">{customer.order_count}</TableCell>
                              <TableCell className="whitespace-nowrap min-w-[90px]">{customer.delivered_count ?? 0}</TableCell>
                              <TableCell className="whitespace-nowrap min-w-[90px]">{customer.cancelled_count ?? 0}</TableCell>
                              <TableCell className="whitespace-nowrap min-w-[100px]">{formatAmount(customer.total_spent)}</TableCell>
                              <TableCell className="whitespace-nowrap min-w-[100px]">
                                <div className="flex items-center gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleOpenPaymentDialog(customer)}
                                        disabled={(customer.credit_due || 0) <= 0}
                                        aria-label="View due payments"
                                        className={cn(
                                          (customer.credit_due || 0) <= 0 &&
                                          "text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40"
                                        )}
                                      >
                                        <Wallet className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    {(customer.credit_due || 0) > 0 && (
                                      <TooltipContent>View Due Payments</TooltipContent>
                                    )}
                                  </Tooltip>
                                  {hasPermission('customers.view_history') && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleViewHistory(customer)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {hasPermission('customers.edit') && (
                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(customer)}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {isAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(customer.id)}
                                      disabled={deleteCustomer.isPending}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div ref={tableScrollBarRef} className="table-scroll-bar">
                  <div ref={tableScrollSpacerRef} className="h-3" />
                </div>
              </div>
            </div>
          </TooltipProvider>
        </div>
        <div className="flex items-center justify-between gap-2 border-t py-4">
          <div className="text-sm text-muted-foreground min-w-0 truncate whitespace-nowrap">
            Showing {startIndex + (filteredCustomers.length ? 1 : 0)}-{endIndex} of {filteredCustomers.length}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 sm:ml-auto">
              <div className="flex items-center gap-2 sm:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
              <Pagination className="hidden sm:flex">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </section>

      <CustomerDialog
        open={isDialogOpen}
        onOpenChange={handleCloseDialog}
        customer={editingCustomer}
      />

      <AlertDialog open={pendingDeleteCustomerId !== null} onOpenChange={(open) => !open && setPendingDeleteCustomerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the customer. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteCustomerId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCustomer}
              disabled={deleteCustomer.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCustomer.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerHistoryDialog
        open={historyOpen}
        onOpenChange={(v) => { if (!v) handleCloseHistory(); else setHistoryOpen(true); }}
        customerId={historyCustomer?.id || null}
        customerName={historyCustomer?.name}
        customerPhone={historyCustomer?.phone}
        customerWhatsapp={historyCustomer?.whatsapp}
        customerAddress={historyCustomer?.address}
      />

      <CustomerPaymentManagementDialog
        open={paymentDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClosePaymentDialog();
          else setPaymentDialogOpen(true);
        }}
        customer={paymentCustomer}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />
    </div>
  );
};

export default Customers;
