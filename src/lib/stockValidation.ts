import { CreateProductData } from "@/hooks/useProducts";
import { Omit } from "@tanstack/react-query";
import { ProductVariant } from "@/hooks/useProductVariants";

export function validateProductStock<T extends Partial<CreateProductData>>(data: T): T {
  if (data.stock_quantity !== undefined && data.stock_quantity < 0) {
    return { ...data, stock_quantity: 0 };
  }
  return data;
}

export function validateVariantStock<T extends Partial<Omit<ProductVariant, "id" | "created_at" | "updated_at">>>(data: T): T {
  if (data.stock_quantity !== undefined && data.stock_quantity < 0) {
    return { ...data, stock_quantity: 0 };
  }
  return data;
}

export function validateVariantsStock<T extends Partial<Omit<ProductVariant, "id" | "created_at" | "updated_at">>[]>(variants: T): T {
  return variants.map(v => validateVariantStock(v)) as T;
}

