
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, Archive } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { ProductIcon } from "@/components/ProductIcon";

interface ProductVariant {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
  attributes: Record<string, string>;
  rate?: number | null;
  cost?: number | null;
}

interface InventoryProductCardProps {
  product: {
    id: string;
    type: 'product' | 'parent';
    name: string;
    sku: string | null;
    stock_quantity: number | null;
    low_stock_threshold: number | null;
    image_url: string | null;
    rate?: number | null;
    cost?: number | null;
    variants: ProductVariant[];
  };
  onImageClick: (imageUrl: string) => void;
}

export const InventoryProductCard = ({ product, onImageClick }: InventoryProductCardProps) => {
  const { formatAmount } = useCurrency();
  const { businessSettings } = useBusinessSettings();

  const getStockStatus = (stock: number, threshold: number | null) => {
    if (stock <= 0) return { status: "Out of Stock", variant: "destructive" as const };
    // Use business settings low stock threshold if available, otherwise fall back to product threshold
    const lowStockThreshold = businessSettings?.low_stock_alert_quantity || threshold || 12;
    if (stock <= lowStockThreshold) return { status: "Low Stock", variant: "secondary" as const };
    return { status: "In Stock", variant: "default" as const };
  };

  // For simple products (no variants)
  if (product.type === 'product') {
    const stockInfo = getStockStatus(product.stock_quantity || 0, product.low_stock_threshold);
    
    return (
      <Card className="hover:shadow-lg transition-all duration-200 overflow-hidden">
        <div className="relative">
          <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
            {product.image_url ? (
              <img 
                src={product.image_url} 
                alt={product.name}
                className="h-full w-full object-cover transition-transform duration-200 hover:scale-105 cursor-pointer"
                onClick={() => onImageClick(product.image_url!)}
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                <ProductIcon className="w-16 h-16 text-muted-foreground/50" />
              </div>
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-2">
            <Badge 
              variant={stockInfo.variant}
              className="shadow-md"
            >
              {stockInfo.status}
            </Badge>
          </div>
        </div>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-lg leading-tight capitalize">{product.name}</h3>
              {product.sku && <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold text-primary">{formatAmount(product.rate || 0)}</span>
                <span className="text-sm font-medium">Stock: {product.stock_quantity}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {(() => {
                  const unitPrice = (product.rate ?? 0) as number;
                  const value = (product.stock_quantity || 0) * unitPrice;
                  return (
                    <>Stock Value: <span className="font-medium text-foreground">{formatAmount(value)}</span></>
                  );
                })()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // For products with variants
  const totalStock = product.variants.reduce((sum, variant) => sum + (variant.stock_quantity || 0), 0);
  
  // Get unique attribute keys from all variants
  const attributeKeys = Array.from(
    new Set(
      product.variants.flatMap(variant => Object.keys(variant.attributes))
    )
  );

  const getVariantLabel = (attributes: Record<string, string>) => {
    // Get the first attribute value (usually Size, Color, etc.)
    const values = Object.values(attributes);
    return values.length > 0 ? values[0] : 'Variant';
  };
  
  return (
    <Card className="hover:shadow-lg transition-all duration-200 overflow-hidden">
      <div className="relative">
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
          {product.image_url ? (
            <img 
              src={product.image_url} 
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-200 hover:scale-105 cursor-pointer"
              onClick={() => onImageClick(product.image_url!)}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
              <Archive className="w-16 h-16 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <div className="absolute top-2 right-2 flex gap-2">
          <Badge variant="secondary" className="shadow-md">
            Variable Product
          </Badge>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-lg leading-tight capitalize">{product.name}</h3>
            {product.sku && <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>}
            
            {/* Show variations in the format from the products page */}
            {product.variants.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-sm font-medium text-muted-foreground">
                  <span>Select {Object.keys(product.variants[0]?.attributes || {})[0] || 'Variant'}:</span>
                  <span>Stock</span>
                </div>
                <div className="space-y-1">
                  {product.variants.map((variant) => (
                    <div key={variant.id} className="flex justify-between items-center text-sm py-1 px-2 bg-muted/50 rounded">
                      <span>{getVariantLabel(variant.attributes)}</span>
                      <span className={variant.stock_quantity < 0 ? "text-destructive" : ""}>{variant.stock_quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold text-primary">{formatAmount(product.rate || 0)}</span>
              <span className="text-sm font-medium">Total Stock: {totalStock}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {(() => {
                const totalValue = product.variants.reduce((sum, v) => {
                  const unitPrice = (v.rate ?? product.rate ?? 0) as number;
                  return sum + (v.stock_quantity || 0) * unitPrice;
                }, 0);
                return (
                  <>Stock Value: <span className="font-medium text-foreground">{formatAmount(totalValue)}</span></>
                );
              })()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
