import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useSales } from "@/hooks/useSales";
import { useCustomers } from "@/hooks/useCustomers";
import { useProducts } from "@/hooks/useProducts";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, RotateCcw } from "lucide-react";

type TrashEntity = "sales" | "invoices" | "customers" | "products";

const Trash = () => {
  const { hasPermission, isLoading: permissionsLoading } = useUserRole();
  const { restoreSale, hardDeleteSale } = useSales();
  const { restoreCustomer, hardDeleteCustomer } = useCustomers();
  const { restoreProduct, hardDeleteProduct } = useProducts();
  const { formatAmount } = useCurrency();
  const [pendingDelete, setPendingDelete] = useState<{ type: TrashEntity; id: string } | null>(null);

  const canDeleteSales = hasPermission("sales.delete");
  const canDeleteCustomers = hasPermission("customers.delete");
  const canDeleteProducts = hasPermission("products.delete");
  const canAccessTrash = canDeleteSales || canDeleteCustomers || canDeleteProducts;

  const { data: trashedSales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["trash", "sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_number, customer_name, grand_total, amount_paid, amount_due, payment_status, created_at, deleted_at")
        .eq("is_deleted", true)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: canDeleteSales,
  });

  const { data: trashedCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["trash", "customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, whatsapp, address, created_at, deleted_at")
        .eq("is_deleted", true)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: canDeleteCustomers,
  });

  const { data: trashedProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ["trash", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, rate, stock_quantity, image_url, deleted_at")
        .eq("is_deleted", true)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: canDeleteProducts,
  });

  const tabs = useMemo(() => {
    const items: Array<{ key: TrashEntity; label: string; enabled: boolean }> = [
      { key: "sales", label: "Sales", enabled: canDeleteSales },
      { key: "invoices", label: "Invoices", enabled: canDeleteSales },
      { key: "customers", label: "Customers", enabled: canDeleteCustomers },
      { key: "products", label: "Products", enabled: canDeleteProducts },
    ];
    return items.filter((item) => item.enabled);
  }, [canDeleteSales, canDeleteCustomers, canDeleteProducts]);

  const handleRestore = (type: TrashEntity, id: string) => {
    if (type === "sales" || type === "invoices") {
      restoreSale.mutate(id);
      return;
    }
    if (type === "customers") {
      restoreCustomer.mutate(id);
      return;
    }
    if (type === "products") {
      restoreProduct.mutate(id);
    }
  };

  const handlePermanentDelete = () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    if (type === "sales" || type === "invoices") {
      hardDeleteSale.mutate(id);
    } else if (type === "customers") {
      hardDeleteCustomer.mutate(id);
    } else if (type === "products") {
      hardDeleteProduct.mutate(id);
    }
    setPendingDelete(null);
  };

  if (permissionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!canAccessTrash) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trash</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You don&apos;t have permission to access the trash.
        </CardContent>
      </Card>
    );
  }

  const defaultTab = tabs[0]?.key ?? "sales";

  return (
    <div className="space-y-6">
      {/* Trash header reduced to match other admin sections, or kept as is? 
                  UserManagement has Card with CardTitle. 
                  Trash has Header then Tabs then Card.
                  I'll leave it as is for now to minimize risk.
              */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Trash Management</h3>
          <p className="text-sm text-muted-foreground">Restore items or permanently delete them.</p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap gap-2 rounded-full border border-border/60 bg-muted/40 p-1 text-foreground/70">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="rounded-full border border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-primary/40 data-[state=active]:hover:bg-primary/90"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle>Sales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {salesLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : trashedSales.length === 0 ? (
                <div className="text-sm text-muted-foreground">No trashed sales.</div>
              ) : (
                <div className="space-y-2">
                  {trashedSales.map((sale) => (
                    <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="font-medium">{sale.invoice_number}</div>
                        <div className="text-sm text-muted-foreground truncate">{sale.customer_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Deleted {sale.deleted_at ? new Date(sale.deleted_at).toLocaleDateString() : "-"}
                        </div>
                      </div>
                      <div className="text-sm font-medium">{formatAmount(sale.grand_total || 0)}</div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleRestore("sales", sale.id)}>
                          <RotateCcw className="h-4 w-4" />
                          Restore
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete({ type: "sales", id: sale.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {salesLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : trashedSales.length === 0 ? (
                <div className="text-sm text-muted-foreground">No trashed invoices.</div>
              ) : (
                <div className="space-y-2">
                  {trashedSales.map((sale) => (
                    <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="font-medium">{sale.invoice_number}</div>
                        <div className="text-sm text-muted-foreground truncate">{sale.customer_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Deleted {sale.deleted_at ? new Date(sale.deleted_at).toLocaleDateString() : "-"}
                        </div>
                      </div>
                      <div className="text-sm font-medium">{formatAmount(sale.grand_total || 0)}</div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleRestore("invoices", sale.id)}>
                          <RotateCcw className="h-4 w-4" />
                          Restore
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete({ type: "invoices", id: sale.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customersLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : trashedCustomers.length === 0 ? (
                <div className="text-sm text-muted-foreground">No trashed customers.</div>
              ) : (
                <div className="space-y-2">
                  {trashedCustomers.map((customer) => (
                    <div key={customer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-sm text-muted-foreground truncate">{customer.phone || customer.whatsapp || "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          Deleted {customer.deleted_at ? new Date(customer.deleted_at).toLocaleDateString() : "-"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleRestore("customers", customer.id)}>
                          <RotateCcw className="h-4 w-4" />
                          Restore
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete({ type: "customers", id: customer.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {productsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : trashedProducts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No trashed products.</div>
              ) : (
                <div className="space-y-2">
                  {trashedProducts.map((product) => (
                    <div key={product.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-14 w-14 overflow-hidden rounded-md border bg-muted">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder.svg";
                              }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              No Image
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{product.name}</div>
                          <div className="text-sm text-muted-foreground truncate">SKU: {product.sku || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            Deleted {product.deleted_at ? new Date(product.deleted_at).toLocaleDateString() : "-"}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end sm:gap-4">
                        <div className="text-sm font-medium">Rate: {formatAmount(product.rate || 0)}</div>
                        <div className="text-sm text-muted-foreground">Qty: {product.stock_quantity ?? 0}</div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleRestore("products", product.id)}>
                            <RotateCcw className="h-4 w-4" />
                            Restore
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setPendingDelete({ type: "products", id: product.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the item from trash. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handlePermanentDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Trash;
