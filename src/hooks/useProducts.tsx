import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/utils/toast";
import { useUserRole } from "./useUserRole";
import { formatDatabaseError } from "@/utils/errorFormatter";
import { parseVariantAttributes } from "@/utils/variantAttributes";
import { useEffect } from "react";

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  rate: number;
  cost: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  size: string | null;
  color: string | null;
  image_url: string | null;
  has_variants: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  product_variants?: Array<{
    id: string;
    stock_quantity: number;
    cost: number | null;
    rate: number | null;
    attributes?: Record<string, string>;
    sku?: string | null;
  }>;
}

export interface CreateProductData {
  name: string;
  sku?: string;
  rate: number;
  cost?: number;
  stock_quantity?: number;
  low_stock_threshold?: number;
  size?: string;
  color?: string;
  image_url?: string;
  has_variants?: boolean;
}

export const useProducts = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { hasPermission, isAdmin } = useUserRole();

  const {
    data: products = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          *,
          product_variants (
            id,
            stock_quantity,
            cost,
            rate,
            attributes,
            sku
          )
        `)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const parsed = (data as Product[]).map((product) => ({
        ...product,
        product_variants: (product.product_variants || []).map((variant) => ({
          ...variant,
          attributes: parseVariantAttributes(variant.attributes),
        })),
      }));
      return parsed;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["products"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_variants" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["products"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user]);

  const createProduct = useMutation({
    mutationFn: async (productData: CreateProductData) => {
      if (!hasPermission("products.add") && !isAdmin) {
        throw new Error("You do not have permission to add products.");
      }
      // Handle empty SKU by setting it to null
      const processedData = {
        ...productData,
        sku: productData.sku && productData.sku.trim() !== '' ? productData.sku : null,
        created_by: user?.id
      };

      const { data, error } = await supabase
        .from("products")
        .insert([processedData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["products"],
        refetchType: 'active'
      });
      toast.success("Product created successfully");
    },
    onError: (error) => {
      toast.error(formatDatabaseError(error, "create product"));
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateProductData> }) => {
      if (!hasPermission("products.edit") && !isAdmin) {
        throw new Error("You do not have permission to edit products.");
      }
      // Handle empty SKU by setting it to null
      const processedData = {
        ...data,
        sku: data.sku !== undefined ? (data.sku && data.sku.trim() !== '' ? data.sku : null) : undefined
      };

      const { data: updated, error } = await supabase
        .from("products")
        .update(processedData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["products"],
        refetchType: 'active'
      });
      toast.success("Product updated successfully");
    },
    onError: (error) => {
      toast.error(formatDatabaseError(error, "update product"));
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      if (!hasPermission("products.delete") && !isAdmin) {
        throw new Error("You do not have permission to delete products.");
      }
      // Soft delete the product by marking it as deleted
      const { error } = await supabase
        .from("products")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["reusable-attributes"] }); // Refresh attribute usage
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent('productDeleted'));
      toast.success("Product deleted successfully");
    },
    onError: (error) => {
      toast.error(formatDatabaseError(error, "delete product"));
    },
  });

  const restoreProduct = useMutation({
    mutationFn: async (id: string) => {
      if (!hasPermission("products.delete") && !isAdmin) {
        throw new Error("You do not have permission to restore products.");
      }
      // Restore the product by marking it as not deleted
      const { error } = await supabase
        .from("products")
        .update({
          is_deleted: false,
          deleted_at: null
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["trashed-products"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.setQueryData(["trash", "products"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["all_products"] });
      queryClient.invalidateQueries({ queryKey: ["reusable-attributes"] }); // Refresh attribute usage
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent('productRestored'));
      toast.success("Product restored successfully");
    },
    onError: (error) => {
      toast.error(formatDatabaseError(error, "restore product"));
    },
  });

  const hardDeleteProduct = useMutation({
    mutationFn: async (id: string) => {
      if (!hasPermission("products.delete") && !isAdmin) {
        throw new Error("You do not have permission to delete products.");
      }

      const { error } = await supabase.rpc("hard_delete_product", {
        _product_id: id,
      });
      if (error) {
        console.error("Error hard deleting product:", error);
        throw error;
      }
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["trashed-products"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.setQueryData(["trash", "products"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["trashed-products"] });
      queryClient.invalidateQueries({ queryKey: ["trash", "products"] });
      queryClient.invalidateQueries({ queryKey: ["reusable-attributes"] });
      window.dispatchEvent(new CustomEvent('productDeleted'));
      toast.success("Product permanently deleted");
    },
    onError: (error) => {
      toast.error(formatDatabaseError(error, "delete product"));
    },
  });

  const duplicateProduct = useMutation({
    mutationFn: async (productId: string) => {
      if (!hasPermission("products.duplicate") && !isAdmin) {
        throw new Error("You do not have permission to duplicate products.");
      }
      // First, get the original product
      const { data: originalProduct, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (productError) throw productError;

      // Generate new name and SKU for the duplicated product
      const generateUniqueName = async (originalName: string): Promise<string> => {
        const baseName = originalName.replace(/\s*\(\d+\)$/, '');
        let counter = 1;
        let newName = `${baseName} (${counter})`;

        while (true) {
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("name", newName)
            .eq("is_deleted", false)
            .single();

          if (!existing) break;
          counter++;
          newName = `${baseName} (${counter})`;
        }
        return newName;
      };

      const generateUniqueSku = async (originalSku: string | null): Promise<string | null> => {
        if (!originalSku) return null;
        const baseSku = originalSku.replace(/\s*\(\d+\)$/, '');
        let counter = 1;
        let newSku = `${baseSku} (${counter})`;

        while (true) {
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("sku", newSku)
            .eq("is_deleted", false)
            .single();

          if (!existing) break;
          counter++;
          newSku = `${baseSku} (${counter})`;
        }
        return newSku;
      };

      const newName = await generateUniqueName(originalProduct.name);
      const newSku = await generateUniqueSku(originalProduct.sku);

      const { data: newProduct, error: createError } = await supabase
        .from("products")
        .insert([{
          name: newName,
          sku: newSku,
          rate: originalProduct.rate,
          cost: originalProduct.cost,
          stock_quantity: originalProduct.stock_quantity,
          low_stock_threshold: originalProduct.low_stock_threshold,
          size: originalProduct.size,
          color: originalProduct.color,
          image_url: originalProduct.image_url,
          has_variants: originalProduct.has_variants,
          created_by: user?.id
        }])
        .select()
        .single();

      if (createError) throw createError;

      if (originalProduct.has_variants) {
        const { data: originalVariants, error: variantsError } = await supabase
          .from("product_variants")
          .select("*")
          .eq("product_id", productId);

        if (variantsError) throw variantsError;

        if (originalVariants && originalVariants.length > 0) {
          const newVariants = originalVariants.map(variant => ({
            product_id: newProduct.id,
            attributes: variant.attributes,
            rate: variant.rate,
            cost: variant.cost,
            stock_quantity: variant.stock_quantity,
            low_stock_threshold: variant.low_stock_threshold,
            sku: variant.sku ? `${variant.sku}-copy` : null,
            image_url: variant.image_url
          }));

          const { error: createVariantsError } = await supabase
            .from("product_variants")
            .insert(newVariants);

          if (createVariantsError) throw createVariantsError;
        }
      }

      return newProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["all_product_variants"] });
      toast.success("Product duplicated successfully with all variants");
    },
    onError: (error) => {
      toast.error(formatDatabaseError(error, "duplicate product"));
    },
  });

  return {
    products,
    isLoading,
    error,
    refetch,
    createProduct,
    updateProduct,
    deleteProduct,
    restoreProduct,
    hardDeleteProduct,
    duplicateProduct,
  };
};

// Hook to get all products including deleted ones (for sales/invoices)
export const useAllProducts = () => {
  const { user } = useAuth();

  const {
    data: allProducts = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["all_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user,
  });

  return {
    allProducts,
    isLoading,
    error,
  };
};
