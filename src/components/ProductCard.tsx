import { Edit, Trash2, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/useCurrency";
import { useProductVariants } from "@/hooks/useProductVariants";
import { Product } from "@/hooks/useProducts";
import { ProductIcon } from "@/components/ProductIcon";
import { PermissionGate } from "@/components/PermissionGate";
import { useState } from "react";

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isDuplicating: boolean;
  isDeleting: boolean;
}

export const ProductCard = ({
  product,
  onEdit,
  onDelete,
  onDuplicate,
  isDuplicating,
  isDeleting
}: ProductCardProps) => {
  const { formatAmount } = useCurrency();
  const { variants } = useProductVariants(product.has_variants ? product.id : undefined);
  const [isVariantsExpanded, setIsVariantsExpanded] = useState(false);

  const getStatus = () => {
    if (product.has_variants) {
      // For products with variants, check total stock across all variants
      const totalVariantStock = (variants || []).reduce((total, variant) => total + variant.stock_quantity, 0);
      if (totalVariantStock <= 0) return "Stock Out";
      if (totalVariantStock <= product.low_stock_threshold) return "Low Stock";
      return "In Stock";
    } else {
      // For products without variants, use the product's stock_quantity
      if (product.stock_quantity <= 0) return "Stock Out";
      if (product.stock_quantity <= product.low_stock_threshold) return "Low Stock";
      return "In Stock";
    }
  };

  const status = getStatus();
  const stockValue = product.has_variants
    ? (variants || []).reduce((total, variant) => {
      const unitCost = variant.cost ?? variant.rate ?? 0;
      return total + (variant.stock_quantity * unitCost);
    }, 0)
    : product.stock_quantity * (product.cost || product.rate);

  const getVariantLabel = (attributes: Record<string, string>) => {
    // Get the first attribute value (usually Size, Color, etc.)
    const values = Object.values(attributes);
    return values.length > 0 ? values[0] : 'Variant';
  };

  return (
    <Card className="group hover:shadow-md transition-all duration-200 overflow-hidden h-full flex flex-col">
      {/* Compact Image Section */}
      <div className="relative">
        <div className="aspect-[3/2] w-full overflow-hidden bg-muted">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.svg';
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
              <ProductIcon className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/40" />
            </div>
          )}
        </div>

        {/* Compact Status Badge */}
        <div className="absolute top-2 right-2">
          {product.is_deleted ? (
            <Badge variant="destructive" className="shadow-sm text-xs px-1.5 py-0.5">
              Deleted
            </Badge>
          ) : (
            <Badge
              variant={
                status === "In Stock" ? "default" :
                  status === "Low Stock" ? "secondary" :
                    "destructive"
              }
              className="shadow-sm text-xs px-1.5 py-0.5"
            >
              {status}
            </Badge>
          )}
        </div>
      </div>

      {/* Compact Content Section */}
      <CardContent className="p-3 flex-1 flex flex-col">
        {/* Product Name & SKU */}
        <div className="mb-2">
          <h3 className="font-semibold text-base leading-tight line-clamp-2 mb-0.5">{product.name}</h3>
          {product.sku && (
            <p className="text-xs text-muted-foreground truncate">{product.sku}</p>
          )}
        </div>

        {/* Variants or Attributes */}
        {product.has_variants && variants.length > 0 ? (
          <div className="mb-2 space-y-1">
            <div className="flex justify-between items-center text-xs font-medium text-muted-foreground">
              <span>{Object.keys(variants[0]?.attributes || {})[0] || 'Variant'}:</span>
              <span>Stock</span>
            </div>
            <div className="space-y-0.5">
              {(isVariantsExpanded ? variants : variants.slice(0, 4)).map((variant) => (
                <div key={variant.id} className="flex justify-between items-center text-sm py-0.5 px-1.5 bg-muted/40 rounded">
                  <span className="truncate flex-1 mr-1">{getVariantLabel(variant.attributes)}</span>
                  <span className={`font-medium ${variant.stock_quantity <= 0 ? "text-destructive" : ""}`}>
                    {variant.stock_quantity}
                  </span>
                </div>
              ))}
            </div>
            {variants.length > 4 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVariantsExpanded(!isVariantsExpanded);
                }}
                className="w-full text-xs text-primary hover:text-primary/80 font-medium flex items-center justify-center gap-0.5 pt-0.5"
              >
                {isVariantsExpanded ? (
                  <>
                    <ChevronUp className="h-2.5 w-2.5" />
                    Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-2.5 w-2.5" />
                    +{variants.length - 4}
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <>
            {product.has_variants && (
              <div className="mb-2">
                <Badge variant="secondary" className="text-xs px-1.5 py-0">Has Variants</Badge>
              </div>
            )}
            {(product.size || product.color) && (
              <div className="flex flex-wrap gap-1 mb-2">
                {product.size && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{product.size}</span>
                )}
                {product.color && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{product.color}</span>
                )}
              </div>
            )}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Compact Stats Section */}
        <div className="space-y-1.5 pt-2 border-t mt-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Price</span>
            <span className="text-lg font-bold text-primary">{formatAmount(product.rate)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Items</span>
            <span className="text-sm font-semibold">
              {product.has_variants
                ? (variants || []).reduce((total, variant) => total + variant.stock_quantity, 0)
                : product.stock_quantity}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Value</span>
            <span className="text-sm font-semibold text-primary">{formatAmount(stockValue)}</span>
          </div>
        </div>

        {/* Compact Action Buttons */}
        <div className="flex gap-1.5 pt-2 mt-2 border-t">
          <PermissionGate permission="products.edit">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(product)}
              aria-label="Edit product"
              className="flex-1 h-8"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
          </PermissionGate>
          <PermissionGate permission="products.duplicate">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDuplicate(product.id)}
              disabled={isDuplicating}
              aria-label="Duplicate product"
              className="flex-1 h-8"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </PermissionGate>
          <PermissionGate permission="products.delete">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(product.id)}
              disabled={isDeleting || product.is_deleted}
              className="flex-1 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              aria-label={product.is_deleted ? "Product already deleted" : "Delete product"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </PermissionGate>
        </div>
      </CardContent>
    </Card>
  );
};
