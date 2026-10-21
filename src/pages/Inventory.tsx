import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, Archive, TrendingUp, TrendingDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProducts } from "@/hooks/useProducts";
import { useCurrency } from "@/hooks/useCurrency";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { StockAdjustmentDialog } from "@/components/StockAdjustmentDialog";
import { InventoryProductCard } from "@/components/inventory/InventoryProductCard";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Fuse from "fuse.js";

const Inventory = () => {
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "out_of_stock">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const itemsPerPage = 12;

  const { products, isLoading } = useProducts();
  const { formatAmount } = useCurrency();
  const { businessSettings } = useBusinessSettings();
  const { user } = useAuth();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch all product variants with better error handling and debugging
  const { data: allVariants = [], isLoading: variantsLoading } = useQuery({
    queryKey: ["all_product_variants"],
    queryFn: async () => {
      console.log("Fetching product variants...");
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          *,
          products!inner (
            id,
            name,
            sku,
            image_url,
            is_deleted
          )
        `)
        .eq("products.is_deleted", false)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching variants:", error);
        throw error;
      }

      console.log("Fetched variants:", data);
      return data || [];
    },
    enabled: !!user,
  });

  // Create parent products list with better debugging
  const parentProducts = useMemo(() => {
    console.log("Creating parent products list...");
    console.log("Products:", products);
    console.log("All variants:", allVariants);

    const parents: any[] = [];

    if (!products || !Array.isArray(products)) {
      console.log("No products or products is not an array");
      return [];
    }

    // Add products without variants
    const productsWithoutVariants = products.filter(product => !product.has_variants && !product.is_deleted);
    console.log("Products without variants:", productsWithoutVariants);

    productsWithoutVariants.forEach(product => {
      parents.push({
        id: product.id,
        type: 'product',
        name: product.name,
        sku: product.sku,
        stock_quantity: product.stock_quantity,
        low_stock_threshold: product.low_stock_threshold,
        image_url: product.image_url,
        rate: (product as any).rate || null,
        cost: (product as any).cost || null,
        variants: []
      });
    });

    // Group variants by product and add products with variants
    const productsWithVariants = products.filter(product => product.has_variants && !product.is_deleted);
    console.log("Products with variants:", productsWithVariants);

    const variantsByProduct = new Map();
    if (allVariants && Array.isArray(allVariants)) {
      allVariants.forEach(variant => {
        const productId = variant.product_id;
        if (!variantsByProduct.has(productId)) {
          variantsByProduct.set(productId, []);
        }
        variantsByProduct.get(productId).push(variant);
      });
    }

    console.log("Variants grouped by product:", variantsByProduct);

    productsWithVariants.forEach(product => {
      const productVariants = variantsByProduct.get(product.id) || [];
      console.log(`Product ${product.name} (${product.id}) has ${productVariants.length} variants`);
      console.log(`Product variants for ${product.name}:`, productVariants);

      // Only add products that actually have variants in the database
      if (productVariants.length > 0) {
        parents.push({
          id: product.id,
          type: 'parent',
          name: product.name,
          sku: product.sku,
          stock_quantity: null,
          low_stock_threshold: null,
          image_url: product.image_url,
          rate: (product as any).rate || null,
          cost: (product as any).cost || null,
          variants: productVariants.map(variant => ({
            id: variant.id,
            name: Object.entries(variant.attributes || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(', '),
            sku: variant.sku || product.sku,
            stock_quantity: variant.stock_quantity,
            low_stock_threshold: variant.low_stock_threshold,
            attributes: variant.attributes || {},
            rate: (variant as any).rate || null,
            cost: (variant as any).cost || null
          }))
        });
      } else {
        // If marked as has_variants but no variants found, treat as regular product
        parents.push({
          id: product.id,
          type: 'product',
          name: product.name,
          sku: product.sku,
          stock_quantity: product.stock_quantity,
          low_stock_threshold: product.low_stock_threshold,
          image_url: product.image_url,
          rate: (product as any).rate || null,
          cost: (product as any).cost || null,
          variants: []
        });
      }
    });

    console.log("Final parent products:", parents);
    return parents;
  }, [products, allVariants]);

  // Normalize text for exact matching
  const normalizeText = useCallback((text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[,.()/-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  // Fuzzy search using Fuse.js
  const fuse = useMemo(() => {
    const searchData: any[] = [];

    parentProducts.forEach(parent => {
      // Add the main product to search data
      searchData.push({
        ...parent,
        parentId: parent.id,
        parentName: parent.name,
        parentImageUrl: parent.image_url,
        searchType: 'parent',
        searchText: `${parent.name} ${parent.sku || ''}`.toLowerCase()
      });

      // Add each variant to search data if the product has variants
      if (parent.type === 'parent' && parent.variants && parent.variants.length > 0) {
        parent.variants.forEach((variant: any) => {
          const variantName = Object.entries(variant.attributes || {})
            .map(([key, value]) => `${key}: ${value}`)
            .join(' ');

          searchData.push({
            ...variant,
            parentId: parent.id,
            parentName: parent.name,
            parentImageUrl: parent.image_url,
            searchType: 'variant',
            searchText: `${parent.name} ${variantName} ${variant.sku || ''}`.toLowerCase()
          });
        });
      }
    });

    return new Fuse(searchData, {
      keys: ['searchText', 'name', 'sku'],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 1
    });
  }, [parentProducts, normalizeText]);

  // Filter and search logic
  const { filteredParentProducts, hasExactMatch } = useMemo(() => {
    let filtered = parentProducts;
    let isExactMatch = false;

    // Apply search logic
    if (debouncedSearchTerm.trim()) {
      const normalizedQuery = normalizeText(debouncedSearchTerm.trim());

      // First, check for exact title matches
      const exactMatches = parentProducts.filter(parent => {
        const normalizedTitle = normalizeText(parent.name);
        return normalizedTitle === normalizedQuery;
      });

      if (exactMatches.length > 0) {
        filtered = exactMatches;
        isExactMatch = true;
      } else {
        // No exact match - fall back to fuzzy search
        const searchResults = fuse.search(debouncedSearchTerm.trim());
        const matchedParentIds = new Set();

        searchResults.forEach(result => {
          if (result.item.searchType === 'parent') {
            matchedParentIds.add(result.item.id);
          } else if (result.item.searchType === 'variant') {
            matchedParentIds.add(result.item.parentId);
          }
        });

        filtered = parentProducts.filter(parent => matchedParentIds.has(parent.id));
      }
    }

    // Apply stock filter
    if (stockFilter !== "all") {
      filtered = filtered.filter(parent => {
        if (parent.type === 'product') {
          const stockQty = parent.stock_quantity || 0;
          return stockFilter === "in_stock" ? stockQty > 0 : stockQty === 0;
        } else if (parent.type === 'parent') {
          return parent.variants.some((variant: any) => {
            const stockQty = variant.stock_quantity || 0;
            return stockFilter === "in_stock" ? stockQty > 0 : stockQty === 0;
          });
        }
        return false;
      });
    }

    return { filteredParentProducts: filtered, hasExactMatch: isExactMatch };
  }, [parentProducts, debouncedSearchTerm, stockFilter, fuse, normalizeText]);

  // Pagination calculations
  const totalParentProducts = filteredParentProducts.length;
  const totalPages = Math.ceil(totalParentProducts / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedParentProducts = filteredParentProducts.slice(startIndex, startIndex + itemsPerPage);

  const handleImageClick = useCallback((imageUrl: string) => {
    setSelectedImage(imageUrl);
  }, []);

  // Handle escape key for modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [selectedImage]);

  // Calculate stats (excluding deleted products)
  const activeProducts = products.filter(p => !p.is_deleted);
  const simpleProducts = activeProducts.filter(p => !p.has_variants);
  const productsWithVariants = activeProducts.filter(p => p.has_variants);

  // Total products = combined stock quantity of all items
  const simpleProductsStock = simpleProducts.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);
  const variantsStock = allVariants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
  const totalProducts = simpleProductsStock + variantsStock;

  // Get the low stock alert quantity from business settings (default to 10)
  const lowStockThreshold = businessSettings?.low_stock_alert_quantity || 12;

  // Low stock calculation: simple products + variants (excluding 0 stock items)
  const simpleLowStock = simpleProducts.filter(p => p.stock_quantity > 0 && p.stock_quantity <= lowStockThreshold);
  const variantLowStock = allVariants.filter(v => v.stock_quantity > 0 && v.stock_quantity <= lowStockThreshold);
  const lowStockProducts = simpleLowStock.length + variantLowStock.length;

  // Out of stock calculation: simple products + variants
  const simpleOutOfStock = simpleProducts.filter(p => p.stock_quantity === 0);
  const variantOutOfStock = allVariants.filter(v => v.stock_quantity === 0);
  const outOfStockProducts = simpleOutOfStock.length + variantOutOfStock.length;

  // Total value calculation: simple products + variants
  const simpleTotalValue = simpleProducts.reduce((sum, p) => sum + (p.stock_quantity * (p.cost || p.rate)), 0);
  const variantTotalValue = allVariants.reduce((sum, v) => sum + (v.stock_quantity * (v.cost || v.rate)), 0);
  const totalValue = simpleTotalValue + variantTotalValue;



  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-muted-foreground">
            Track stock movements and manage inventory levels
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => setShowAdjustmentDialog(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Adjust Stock
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <Card
              key={i}
              className="md:col-span-1"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            {[
              {
                title: "Total Products",
                value: totalProducts,
                description: "Combined stock quantity",
                icon: Archive,
                color: "text-muted-foreground"
              },
              {
                title: "Total Items",
                value: activeProducts.length,
                description: "Parent products only",
                icon: Archive,
                color: "text-muted-foreground"
              },
              {
                title: "Low Stock Items",
                value: lowStockProducts,
                description: "Needs restocking",
                icon: TrendingDown,
                color: "text-destructive"
              },
              {
                title: "Out of Stock",
                value: outOfStockProducts,
                description: "Urgent restocking",
                icon: TrendingDown,
                color: "text-destructive"
              },
              {
                title: "Total Value",
                value: formatAmount(totalValue),
                description: "Current inventory value",
                icon: TrendingUp,
                color: "text-muted-foreground"
              }
            ].map((card, index) => {
              const IconComponent = card.icon;
              const isTotalValueCard = card.title === "Total Value";

              return (
                <Card
                  key={index}
                  className={isTotalValueCard ? "col-span-2 md:col-span-5" : "md:col-span-1"}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                    <IconComponent className={`h-4 w-4 ${card.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${card.color === 'text-destructive' ? 'text-destructive' : ''}`}>
                      {card.value}
                    </div>
                    <p className="text-xs text-muted-foreground">{card.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>

      {/* Filters */}
      <InventoryFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        stockFilter={stockFilter}
        onStockFilterChange={setStockFilter}
        hasExactMatch={hasExactMatch}
        debouncedSearchTerm={debouncedSearchTerm}
      />

      {/* Product Cards */}
      <div className="space-y-6">
        {isLoading || variantsLoading ? (
          <div className="grid gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <Skeleton className="w-16 h-16 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : paginatedParentProducts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">No inventory items found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {paginatedParentProducts.map((product) => (
              <InventoryProductCard
                key={product.id}
                product={product}
                onImageClick={handleImageClick}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center min-w-0">
              <p className="text-sm text-muted-foreground whitespace-nowrap truncate">
                Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, totalParentProducts)} of {totalParentProducts} items
              </p>
            </div>
            <div className="flex justify-end sm:ml-auto">
              <Pagination className="mx-0">
                <PaginationContent className="flex-wrap gap-1">
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      className={`${currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} hidden sm:flex`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="sm:hidden"
                    >
                      Prev
                    </Button>
                  </PaginationItem>

                  <div className="sm:hidden flex items-center px-3 py-2 text-sm">
                    Page {currentPage} of {totalPages}
                  </div>

                  <div className="hidden sm:flex items-center gap-1">
                    {(() => {
                      const maxVisiblePages = 5;
                      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                      const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

                      if (endPage - startPage + 1 < maxVisiblePages) {
                        startPage = Math.max(1, endPage - maxVisiblePages + 1);
                      }

                      const pages = [];

                      if (startPage > 1) {
                        pages.push(
                          <PaginationItem key={1}>
                            <PaginationLink
                              onClick={() => setCurrentPage(1)}
                              className="cursor-pointer"
                            >
                              1
                            </PaginationLink>
                          </PaginationItem>
                        );
                        if (startPage > 2) {
                          pages.push(
                            <PaginationItem key="start-ellipsis">
                              <span className="px-3 py-2 text-muted-foreground">...</span>
                            </PaginationItem>
                          );
                        }
                      }

                      for (let page = startPage; page <= endPage; page++) {
                        pages.push(
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }

                      if (endPage < totalPages) {
                        if (endPage < totalPages - 1) {
                          pages.push(
                            <PaginationItem key="end-ellipsis">
                              <span className="px-3 py-2 text-muted-foreground">...</span>
                            </PaginationItem>
                          );
                        }
                        pages.push(
                          <PaginationItem key={totalPages}>
                            <PaginationLink
                              onClick={() => setCurrentPage(totalPages)}
                              className="cursor-pointer"
                            >
                              {totalPages}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }

                      return pages;
                    })()}
                  </div>

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      className={`${currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} hidden sm:flex`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="sm:hidden"
                    >
                      Next
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        )}
      </div>


      <StockAdjustmentDialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog} />

      {/* Image Preview Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center justify-between">
              Product Image Preview
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedImage(null)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-6 pt-0">
            {selectedImage && (
              <img
                src={selectedImage}
                alt="Product preview"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
