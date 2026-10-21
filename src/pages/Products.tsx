import { Plus, Edit, Download, Upload, Copy, Archive, TrendingUp, TrendingDown, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useProducts } from "@/hooks/useProducts";
import { useProductVariants } from "@/hooks/useProductVariants";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "@/utils/toast";
import { ProductDialog } from "@/components/ProductDialog";
import { ProductCard } from "@/components/ProductCard";
import { StockAdjustmentDialog } from "@/components/StockAdjustmentDialog";
import { useCurrency } from "@/hooks/useCurrency";
import * as ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { usePageSearch } from "@/hooks/usePageSearch";
import { usePageHeaderControls } from "@/hooks/usePageHeaderControls";
import { usePageHeaderActions } from "@/hooks/usePageHeaderActions";
import { PermissionGate } from "@/components/PermissionGate";
import { useIsMobile } from "@/hooks/use-mobile";
import { logActivity } from "@/utils/activityLogger";
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

const Products = () => {
  const { products, isLoading, deleteProduct, createProduct, updateProduct, duplicateProduct, restoreProduct, hardDeleteProduct } = useProducts();
  const { formatAmount } = useCurrency();
  const { businessSettings } = useBusinessSettings();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { query: searchTerm, setQuery: setSearchTerm } = usePageSearch({
    placeholder: isMobile ? "" : "Search products, SKU, or attributes...",
  });
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "out_of_stock">("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [pendingDeleteProductId, setPendingDeleteProductId] = useState<string | null>(null);
  const [pendingHardDeleteProductId, setPendingHardDeleteProductId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsPerPage = 20;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch all product variants
  const { data: allVariants = [], isLoading: variantsLoading } = useQuery({
    queryKey: ["all_product_variants"],
    queryFn: async () => {
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

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Create parent products list (combining simple products and variant parents)
  const parentProducts = useMemo(() => {
    const parents: any[] = [];
    const activeProducts = products.filter(p => !p.is_deleted);

    // Add products without variants
    activeProducts
      .filter(product => !product.has_variants)
      .forEach(product => {
        parents.push({
          id: product.id,
          type: 'product',
          name: product.name,
          sku: product.sku,
          stock_quantity: product.stock_quantity,
          low_stock_threshold: product.low_stock_threshold,
          image_url: product.image_url,
          rate: product.rate,
          cost: product.cost,
          variants: []
        });
      });

    // Group variants by parent product
    const variantMap = new Map();
    (allVariants as any[]).forEach((variant: any) => {
      const product = variant.products;
      if (!product || product.is_deleted) return;

      if (!variantMap.has(product.id)) {
        variantMap.set(product.id, {
          id: product.id,
          type: 'parent',
          name: product.name,
          sku: product.sku,
          stock_quantity: null,
          low_stock_threshold: null,
          image_url: product.image_url,
          rate: null,
          cost: null,
          variants: []
        });
      }

      variantMap.get(product.id).variants.push({
        id: variant.id,
        name: product.name,
        sku: variant.sku,
        stock_quantity: variant.stock_quantity,
        low_stock_threshold: variant.low_stock_threshold,
        attributes: variant.attributes,
        rate: variant.rate,
        cost: variant.cost
      });
    });

    // Add parent products with variants
    variantMap.forEach(parent => {
      parents.push(parent);
    });

    return parents;
  }, [products, allVariants]);

  // Normalize text for search
  const normalizeText = useCallback((text: string) => {
    return text.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }, []);

  // Create Fuse instance for fuzzy search
  const fuse = useMemo(() => {
    const searchData: any[] = [];

    parentProducts.forEach(parent => {
      if (parent.type === 'product') {
        searchData.push({
          ...parent,
          searchType: 'parent',
          searchText: `${parent.name} ${parent.sku || ''}`.toLowerCase()
        });
      }

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

  // Filter products based on search and stock filters
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(p => !p.is_deleted);

    // Apply search filter
    if (debouncedSearchTerm.trim()) {
      const searchLower = debouncedSearchTerm.toLowerCase().trim();
      filtered = filtered.filter(product => {
        // Check if product matches
        const productMatches =
          product.name.toLowerCase().includes(searchLower) ||
          (product.sku && product.sku.toLowerCase().includes(searchLower));

        // Check if any variant matches (for products with variants)
        if (product.has_variants && product.product_variants) {
          const variantMatches = product.product_variants.some(variant => {
            const variantAttrs = Object.entries(variant.attributes || {})
              .map(([k, v]) => `${k}:${v}`)
              .join(' ')
              .toLowerCase();
            return variantAttrs.includes(searchLower) ||
              (variant.sku && variant.sku.toLowerCase().includes(searchLower));
          });
          return productMatches || variantMatches;
        }

        return productMatches;
      });
    }

    // Apply stock filter
    if (stockFilter !== "all") {
      filtered = filtered.filter(product => {
        if (product.has_variants && product.product_variants) {
          // For products with variants, check if any variant matches the filter
          const hasMatchingVariant = product.product_variants.some(variant => {
            const stockQty = variant.stock_quantity || 0;
            return stockFilter === "in_stock" ? stockQty > 0 : stockQty === 0;
          });
          return hasMatchingVariant;
        } else {
          // For simple products, check product stock
          const stockQty = product.stock_quantity || 0;
          return stockFilter === "in_stock" ? stockQty > 0 : stockQty === 0;
        }
      });
    }

    return filtered;
  }, [products, debouncedSearchTerm, stockFilter]);

  // Pagination calculations
  const totalProducts = filteredProducts.length;
  const totalPages = Math.ceil(totalProducts / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

  // Calculate stats
  const activeProducts = products.filter(p => !p.is_deleted);
  const simpleProducts = activeProducts.filter(p => !p.has_variants);
  const productsWithVariants = activeProducts.filter(p => p.has_variants);

  // Product stock already reflects variant totals (we synced it after import),
  // so summing variants here would double-count.
  const totalProductsStock = activeProducts.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);

  const lowStockThreshold = businessSettings?.low_stock_alert_quantity || 12;
  const lowStockProducts = activeProducts.filter(p => {
    const stockQty = p.stock_quantity || 0;
    return stockQty > 0 && stockQty <= lowStockThreshold;
  }).length;

  const outOfStockProducts = activeProducts.filter(p => (p.stock_quantity || 0) === 0).length;

  const simpleTotalValue = simpleProducts.reduce((sum, p) => sum + (p.stock_quantity * (p.cost || p.rate || 0)), 0);
  const variantTotalValue = (allVariants as any[]).reduce((sum, v) => sum + (v.stock_quantity * (v.cost || v.rate || 0)), 0);
  const totalValue = simpleTotalValue + variantTotalValue;
  const statsCards = [
    {
      title: "Total Products",
      value: totalProductsStock,
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
  ];

  const totalStockValue = useMemo(() => {
    return products.reduce((total, product) => {
      const unitCost = product.cost || product.rate || 0;

      if (product.has_variants && product.product_variants && product.product_variants.length > 0) {
        const variantStockValue = product.product_variants.reduce((variantTotal, variant) => {
          const variantCost = variant.cost || product.cost || product.rate || 0;
          const variantStock = variant.stock_quantity || 0;
          return variantTotal + (variantStock * variantCost);
        }, 0);
        return total + variantStockValue;
      } else {
        const stockQuantity = product.stock_quantity || 0;
        return total + (stockQuantity * unitCost);
      }
    }, 0);
  }, [products]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stockFilter]);

  const handleEdit = (product) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setPendingDeleteProductId(id);
  };

  const confirmDeleteProduct = () => {
    if (!pendingDeleteProductId) return;
    const productToDelete = products.find(p => p.id === pendingDeleteProductId);
    deleteProduct.mutate(pendingDeleteProductId, {
      onSuccess: () => {
        logActivity({
          action: "delete",
          entityType: "products",
          entityId: pendingDeleteProductId,
          summary: `Deleted product "${productToDelete?.name || ""}"`.trim(),
          details: {
            old: {
              name: productToDelete?.name || null,
              sku: productToDelete?.sku || null,
              rate: productToDelete?.rate ?? 0,
              cost: productToDelete?.cost ?? 0,
              stock_quantity: productToDelete?.stock_quantity ?? 0,
              has_variants: productToDelete?.has_variants || false,
            },
          },
        });
      },
    });
    setPendingDeleteProductId(null);
  };

  const handleDuplicate = (id: string) => {
    const productToDuplicate = products.find(p => p.id === id);
    duplicateProduct.mutate(id, {
      onSuccess: () => {
        logActivity({
          action: "duplicate",
          entityType: "products",
          entityId: id,
          summary: `Duplicated product "${productToDuplicate?.name || ""}"`.trim(),
          details: {
            source: {
              name: productToDuplicate?.name || null,
              sku: productToDuplicate?.sku || null,
              rate: productToDuplicate?.rate ?? 0,
              cost: productToDuplicate?.cost ?? 0,
              stock_quantity: productToDuplicate?.stock_quantity ?? 0,
              has_variants: productToDuplicate?.has_variants || false,
            },
          },
        });
      },
    });
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
  };

  const handleImageClick = useCallback((imageUrl: string) => {
    setSelectedImage(imageUrl);
  }, []);

  // Handle escape key for image modal
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

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  // Import/Export functions (keeping the existing implementation)
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
          const data = e.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(data);
          const worksheet = workbook.worksheets[0];

          if (!worksheet) {
            throw new Error('No worksheet found in the file');
          }

          const headers: string[] = [];
          const rows: any[] = [];

          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
              row.eachCell((cell, colNumber) => {
                headers[colNumber - 1] = cell.text || '';
              });
            } else {
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
        let variantCount = 0;
        const variantsToProcess: any[] = [];

        const processBatch = async (items: any[], batchIndex: number) => {
          const batchPromises = items.map(async (row: any, rowIndex: number) => {
            try {
              const hasAnyData = Object.values(row).some(value =>
                value !== null && value !== undefined && String(value).trim() !== ''
              );

              if (!hasAnyData) return;

              const isVariant = row['Product Type'] === 'Variant' || row['product_type'] === 'Variant';
              const parentProduct = row['Parent Product'] || row['parent_product'];
              const variantId = row['Variant ID'] || row['variant_id'];

              const productData = {
                name: String(row.Name || row.name || row.PRODUCT_NAME || row['Product Name'] || '').trim(),
                sku: row.SKU || row.sku || row['Product Code'] || row.code || undefined,
                rate: parseFloat(String(row.Rate || row.rate || row.RATE || row.price || row.Price || '0').replace(/[^0-9.-]/g, '')) || 0,
                cost: row.Cost || row.cost || row.COST ? parseFloat(String(row.Cost || row.cost || row.COST || '0').replace(/[^0-9.-]/g, '')) || undefined : undefined,
                stock_quantity: parseInt(String(row['Stock Quantity'] || row.stock_quantity || row.stock || row.Stock || row.STOCK || '0').replace(/[^0-9]/g, '')) || 0,
                low_stock_threshold: parseInt(String(row['Low Stock Threshold'] || row.low_stock_threshold || row.threshold || row.Threshold || (businessSettings?.low_stock_alert_quantity || 12)).replace(/[^0-9]/g, '')) || (businessSettings?.low_stock_alert_quantity || 12),
                size: row.Size || row.size || row.SIZE ? String(row.Size || row.size || row.SIZE).trim() : undefined,
                color: row.Color || row.color || row.COLOR ? String(row.Color || row.color || row.COLOR).trim() : undefined,
                image_url: row['Image URL'] || row.image_url || row.image || row.Image || row.IMAGE_URL ? String(row['Image URL'] || row.image_url || row.image || row.Image || row.IMAGE_URL).trim() : undefined,
                has_variants: row['Has Variants'] === 'Yes' || row['has_variants'] === 'Yes' || false,
                is_variant: isVariant,
                parent_product: parentProduct,
                variant_id: variantId
              };

              if (productData.sku === '') productData.sku = undefined;
              if (productData.size === '') productData.size = undefined;
              if (productData.color === '') productData.color = undefined;
              if (productData.image_url === '') productData.image_url = undefined;

              if (productData.is_variant && productData.parent_product) {
                const parentProduct = products.find(p =>
                  p.name.toLowerCase().trim() === productData.parent_product.toLowerCase().trim()
                );

                if (!parentProduct) {
                  errorCount++;
                  return;
                }

                variantsToProcess.push({
                  parentProduct,
                  variantData: {
                    rate: productData.rate,
                    cost: productData.cost,
                    stock_quantity: productData.stock_quantity,
                    low_stock_threshold: productData.low_stock_threshold,
                    image_url: productData.image_url
                  },
                  rowIndex: rowIndex + 1
                });

                variantCount++;
                return;
              }

              if (!productData.name || productData.name === '') {
                errorCount++;
                return;
              }

              if (productData.rate <= 0) {
                errorCount++;
                return;
              }

              const existingProduct = products.find(p =>
                p.name.toLowerCase().trim() === productData.name.toLowerCase().trim() ||
                (productData.sku && p.sku && p.sku.toLowerCase().trim() === String(productData.sku).toLowerCase().trim())
              );

              if (existingProduct) {
                const hasChanges =
                  existingProduct.name !== productData.name ||
                  existingProduct.sku !== productData.sku ||
                  existingProduct.rate !== productData.rate ||
                  existingProduct.cost !== productData.cost ||
                  existingProduct.stock_quantity !== productData.stock_quantity ||
                  existingProduct.low_stock_threshold !== productData.low_stock_threshold ||
                  existingProduct.size !== productData.size ||
                  existingProduct.color !== productData.color ||
                  existingProduct.image_url !== productData.image_url ||
                  existingProduct.has_variants !== productData.has_variants;

                if (!hasChanges) {
                  skippedCount++;
                  return;
                }

                const updateData = {
                  name: productData.name,
                  sku: productData.sku,
                  rate: productData.rate,
                  cost: productData.cost,
                  stock_quantity: productData.stock_quantity,
                  low_stock_threshold: productData.low_stock_threshold,
                  size: productData.size,
                  color: productData.color,
                  image_url: productData.image_url,
                  has_variants: productData.has_variants
                };

                return new Promise((resolve, reject) => {
                  updateProduct.mutate({ id: existingProduct.id, data: updateData }, {
                    onSuccess: () => {
                      updatedCount++;
                      resolve(true);
                    },
                    onError: (error) => {
                      errorCount++;
                      reject(error);
                    },
                  });
                });
              }

              const createData = {
                name: productData.name,
                sku: productData.sku,
                rate: productData.rate,
                cost: productData.cost,
                stock_quantity: productData.stock_quantity,
                low_stock_threshold: productData.low_stock_threshold,
                size: productData.size,
                color: productData.color,
                image_url: productData.image_url,
                has_variants: productData.has_variants
              };

              return new Promise((resolve, reject) => {
                createProduct.mutate(createData, {
                  onSuccess: () => {
                    successCount++;
                    resolve(true);
                  },
                  onError: (error) => {
                    errorCount++;
                    reject(error);
                  },
                });
              });

            } catch (error) {
              errorCount++;
            }
          });

          await Promise.allSettled(batchPromises);
        };

        const batchSize = 5;
        const batches = [];
        for (let i = 0; i < jsonData.length; i += batchSize) {
          batches.push(jsonData.slice(i, i + batchSize));
        }

        for (let i = 0; i < batches.length; i++) {
          await processBatch(batches[i], i);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (variantsToProcess.length > 0) {
          const variantsByProduct = new Map();
          variantsToProcess.forEach(variant => {
            const productId = variant.parentProduct.id;
            if (!variantsByProduct.has(productId)) {
              variantsByProduct.set(productId, []);
            }
            variantsByProduct.get(productId).push(variant);
          });

          for (const [productId, variants] of variantsByProduct) {
            try {
              const variantData = variants.map(v => ({
                product_id: productId,
                attributes: {},
                sku: null,
                rate: v.variantData.rate,
                cost: v.variantData.cost,
                stock_quantity: v.variantData.stock_quantity,
                low_stock_threshold: v.variantData.low_stock_threshold,
                image_url: v.variantData.image_url
              }));

              const { data: createdVariants, error: variantError } = await supabase
                .from("product_variants")
                .insert(variantData)
                .select();

              if (variantError) {
                throw variantError;
              }

              await supabase
                .from("products")
                .update({ has_variants: true })
                .eq("id", productId);
            } catch (error) {
              errorCount += variants.length;
            }
          }
        }

        setTimeout(() => {
          let message = '';
          if (successCount > 0) {
            message += `Successfully imported ${successCount} new products. `;
          }
          if (updatedCount > 0) {
            message += `Updated ${updatedCount} existing products. `;
          }
          if (variantCount > 0) {
            message += `Processed ${variantCount} variants. `;
          }
          if (skippedCount > 0) {
            message += `Skipped ${skippedCount} products (no changes). `;
          }
          if (errorCount > 0) {
            message += `${errorCount} products failed due to invalid data.`;
          }

          if (successCount > 0 || updatedCount > 0) {
            toast.success(message || "Import completed successfully");
          } else if (skippedCount > 0 && errorCount === 0) {
            toast.info(message || "All products were already up to date");
          } else {
            toast.error(message || "Import failed. Please check your data format");
          }
        }, 500);

      } catch (error) {
        console.error('File processing error:', error);
        toast.error("Failed to parse file. Please check the format and try again");
      }
    };

    if (fileExtension === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }

    event.target.value = '';
  };

  const handleExport = () => {
    const exportData: any[] = [];

    products.forEach(product => {
      const mainProductRow = {
        Name: product.name,
        SKU: product.sku || '',
        Rate: product.rate,
        Cost: product.cost || '',
        'Stock Quantity': product.stock_quantity,
        'Low Stock Threshold': product.low_stock_threshold,
        Size: product.size || '',
        Color: product.color || '',
        'Image URL': product.image_url || '',
        'Has Variants': product.has_variants ? 'Yes' : 'No',
        'Variants Count': product.product_variants?.length || 0,
        'Stock Value': product.stock_quantity * (product.cost || product.rate),
        Status: product.stock_quantity <= 0 ? 'Stock Out' :
          product.stock_quantity <= product.low_stock_threshold ? 'Low Stock' : 'In Stock',
        'Created At': new Date(product.created_at).toLocaleDateString(),
        'Updated At': new Date(product.updated_at).toLocaleDateString(),
        'Product Type': 'Main Product'
      };
      exportData.push(mainProductRow);

      if (product.has_variants && product.product_variants && product.product_variants.length > 0) {
        product.product_variants.forEach((variant, index) => {
          const variantRow = {
            Name: `${product.name} - Variant ${index + 1}`,
            SKU: `${product.sku || ''}-V${index + 1}`,
            Rate: variant.rate || product.rate,
            Cost: variant.cost || product.cost || '',
            'Stock Quantity': variant.stock_quantity,
            'Low Stock Threshold': product.low_stock_threshold,
            Size: product.size || '',
            Color: product.color || '',
            'Image URL': product.image_url || '',
            'Has Variants': 'No',
            'Variants Count': 0,
            'Stock Value': variant.stock_quantity * (variant.cost || product.cost || product.rate),
            Status: variant.stock_quantity <= 0 ? 'Stock Out' :
              variant.stock_quantity <= product.low_stock_threshold ? 'Low Stock' : 'In Stock',
            'Created At': new Date(product.created_at).toLocaleDateString(),
            'Updated At': new Date(product.updated_at).toLocaleDateString(),
            'Product Type': 'Variant',
            'Parent Product': product.name,
            'Variant ID': variant.id
          };
          exportData.push(variantRow);
        });
      }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");

    const headers = Object.keys(exportData[0] || {});
    worksheet.addRow(headers);

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    exportData.forEach(row => {
      worksheet.addRow(Object.values(row));
    });

    worksheet.columns.forEach(column => {
      column.width = 15;
    });

    const filename = `products_${new Date().toISOString().split('T')[0]}.xlsx`;

    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    });
  };

  const headerControls = useMemo(() => {
    return (
      <TooltipProvider>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="flex-1 md:flex-none">
            <Select
              value={stockFilter}
              onValueChange={(value) => setStockFilter((value as typeof stockFilter) || "all")}
            >
              <SelectTrigger className="h-10 w-full min-w-[120px] rounded-xl sm:min-w-[140px] sm:w-[140px]">
                <SelectValue placeholder="Stock status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasExactMatch && debouncedSearchTerm.trim() && (
            <Badge variant="secondary" className="text-xs">
              Exact match
            </Badge>
          )}
        </div>
      </TooltipProvider>
    );
  }, [stockFilter, hasExactMatch, debouncedSearchTerm]);

  const headerActions = useMemo(() => {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <PermissionGate permission="products.import_export">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleImport}
                  className="rounded-xl"
                  aria-label="Import"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import</TooltipContent>
            </Tooltip>
          </PermissionGate>
          <PermissionGate permission="products.import_export">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleExport}
                  disabled={!products.length}
                  className="rounded-xl"
                  aria-label="Export"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export</TooltipContent>
            </Tooltip>
          </PermissionGate>
          <PermissionGate permission="inventory.adjust_stock">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setShowAdjustmentDialog(true)}
                  className="rounded-xl"
                  aria-label="Adjust stock"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Adjust Stock</TooltipContent>
            </Tooltip>
          </PermissionGate>
          <PermissionGate permission="products.add">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setIsDialogOpen(true)}
                  className="rounded-xl"
                  aria-label="Add product"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add Product</TooltipContent>
            </Tooltip>
          </PermissionGate>
        </div>
      </TooltipProvider>
    );
  }, [handleExport, handleImport, products.length]);

  usePageHeaderControls(!isMobile ? headerControls : null);
  usePageHeaderActions(!isMobile ? headerActions : null);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <Select
            value={stockFilter}
            onValueChange={(value) => setStockFilter((value as typeof stockFilter) || "all")}
          >
            <SelectTrigger className="h-9 !w-auto !min-w-[128px] rounded-xl px-2 text-xs whitespace-nowrap">
              <SelectValue placeholder="Stock status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 md:hidden">
        <PermissionGate permission="products.import_export">
          <Button
            variant="outline"
            onClick={handleImport}
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Import"
          >
            <Download className="h-4 w-4" />
            <span className="font-medium">Import</span>
          </Button>
        </PermissionGate>
        <PermissionGate permission="products.import_export">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!products.length}
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Export"
          >
            <Upload className="h-4 w-4" />
            <span className="font-medium">Export</span>
          </Button>
        </PermissionGate>
        <PermissionGate permission="inventory.adjust_stock">
          <Button
            variant="outline"
            onClick={() => setShowAdjustmentDialog(true)}
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Adjust stock"
          >
            <Archive className="h-4 w-4" />
            <span className="font-medium">Stock</span>
          </Button>
        </PermissionGate>
        <PermissionGate permission="products.add">
          <Button
            variant="outline"
            onClick={() => setIsDialogOpen(true)}
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Add product"
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium">Add</span>
          </Button>
        </PermissionGate>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i} className="md:col-span-1">
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
            <div className="md:hidden col-span-2">
              <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide pr-[calc((100%-220px)/2)]">
                {statsCards.map((card, index) => {
                  const IconComponent = card.icon;
                  return (
                    <Card key={index} className={`w-[220px] shrink-0 ${index === 0 ? "snap-start" : "snap-center"}`}>
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
              </div>
            </div>
            <div className="hidden md:grid md:col-span-3 lg:col-span-5 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {statsCards.map((card, index) => {
                const IconComponent = card.icon;
                return (
                  <Card key={index} className="md:col-span-1">
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
            </div>
          </>
        )}
      </div>
      <div className="md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search products, SKU, or attributes..."
            className="h-11 rounded-xl pl-10"
          />
        </div>
      </div>

      <AlertDialog open={pendingDeleteProductId !== null} onOpenChange={(open) => !open && setPendingDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the product. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteProductId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProduct}
              disabled={deleteProduct.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProduct.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingHardDeleteProductId !== null} onOpenChange={(open) => !open && setPendingHardDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the product. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingHardDeleteProductId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingHardDeleteProductId) return;
                const productToDelete = products.find(p => p.id === pendingHardDeleteProductId);
                hardDeleteProduct.mutate(pendingHardDeleteProductId, {
                  onSuccess: () => {
                    logActivity({
                      action: "hard_delete",
                      entityType: "products",
                      entityId: pendingHardDeleteProductId,
                      summary: `Permanently deleted product "${productToDelete?.name || ""}"`.trim(),
                      details: {
                        old: {
                          name: productToDelete?.name || null,
                          sku: productToDelete?.sku || null,
                          rate: productToDelete?.rate ?? 0,
                          cost: productToDelete?.cost ?? 0,
                          stock_quantity: productToDelete?.stock_quantity ?? 0,
                          has_variants: productToDelete?.has_variants || false,
                        },
                      },
                    });
                  },
                });
                setPendingHardDeleteProductId(null);
              }}
              disabled={hardDeleteProduct.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hardDeleteProduct.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
        {isLoading || variantsLoading ? (
          [...Array(8)].map((_, i) => (
            <Card key={i} className="overflow-hidden h-full flex flex-col">
              <div className="aspect-[4/3] w-full bg-muted animate-pulse" />
              <CardContent className="p-4 sm:p-5 flex-1 flex flex-col">
                <div className="space-y-3 flex-1">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <div className="space-y-2 pt-2 border-t">
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
                <div className="flex gap-2 pt-3 mt-3 border-t">
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 flex-1" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : paginatedProducts.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <CardContent className="text-center py-12">
                <Plus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground text-lg">No products found</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          paginatedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              isDuplicating={duplicateProduct.isPending}
              isDeleting={deleteProduct.isPending}

            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center min-w-0">
            <p className="text-sm text-muted-foreground whitespace-nowrap truncate">
              Showing {totalProducts ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, totalProducts)} of {totalProducts} items
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
                  {currentPage}
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
                            className={currentPage === 1 ? "bg-muted text-primary font-medium" : "cursor-pointer"}
                          >
                            1
                          </PaginationLink>
                        </PaginationItem>
                      );

                      if (startPage > 2) {
                        pages.push(
                          <span key="ellipsis-start" className="flex h-9 w-9 items-center justify-center text-sm">
                            ...
                          </span>
                        );
                      }
                    }

                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(
                        <PaginationItem key={i}>
                          <PaginationLink
                            onClick={() => setCurrentPage(i)}
                            className={currentPage === i ? "bg-muted text-primary font-medium" : "cursor-pointer"}
                          >
                            {i}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }

                    if (endPage < totalPages) {
                      if (endPage < totalPages - 1) {
                        pages.push(
                          <span key="ellipsis-end" className="flex h-9 w-9 items-center justify-center text-sm">
                            ...
                          </span>
                        );
                      }

                      pages.push(
                        <PaginationItem key={totalPages}>
                          <PaginationLink
                            onClick={() => setCurrentPage(totalPages)}
                            className={currentPage === totalPages ? "bg-muted text-primary font-medium" : "cursor-pointer"}
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

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      <ProductDialog
        open={isDialogOpen}
        onOpenChange={handleCloseDialog}
        product={editingProduct}
      />

      <StockAdjustmentDialog
        open={showAdjustmentDialog}
        onOpenChange={setShowAdjustmentDialog}
      />

      {/* Image Modal */}
      {selectedImage && (
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl p-0">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10"
                onClick={() => setSelectedImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <img
                src={selectedImage}
                alt="Product"
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Products;
