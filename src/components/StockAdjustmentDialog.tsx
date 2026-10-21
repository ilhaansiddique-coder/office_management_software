import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/utils/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useUserRole } from "@/hooks/useUserRole";
import { logActivity } from "@/utils/activityLogger";

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AdjustmentData {
  productId: string;
  type: "in" | "out";
  quantity: string;
  reason: string;
}

export const StockAdjustmentDialog = ({ open, onOpenChange }: StockAdjustmentDialogProps) => {
  const { products } = useProducts();
  const { user } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = useUserRole();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<AdjustmentData>({
    productId: "",
    type: "in",
    quantity: "",
    reason: "",
  });
  
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormData({
        productId: "",
        type: "in",
        quantity: "",
        reason: "",
      });
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (permissionsLoading || !hasPermission("inventory.adjust_stock")) {
      toast.error("You do not have permission to adjust stock.");
      return;
    }
    
    const quantityValue = formData.quantity.trim() ? Number(formData.quantity) : 0;

    if (!formData.productId || quantityValue <= 0) {
      toast.error("Please select a product and enter a valid quantity");
      return;
    }

    setIsLoading(true);
    
    try {
      const product = products.find(p => p.id === formData.productId);
      if (!product) {
        toast.error("Product not found");
        return;
      }

      const adjustmentQuantity = formData.type === "in" ? quantityValue : -quantityValue;
      const newStockQuantity = product.stock_quantity + adjustmentQuantity;
      
      if (newStockQuantity < 0) {
        toast.error("Insufficient stock for this adjustment");
        return;
      }

      // Update product stock
      const { error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newStockQuantity })
        .eq("id", formData.productId);

      if (updateError) throw updateError;

      // Log the inventory change
      const { error: logError } = await supabase
        .from("inventory_logs")
        .insert({
          product_id: formData.productId,
          type: formData.type,
          quantity: quantityValue,
          reason: formData.reason,
          created_by: user?.id,
        });

      if (logError) throw logError;

      logActivity({
        action: "stock_adjustment",
        entityType: "products",
        entityId: formData.productId,
        summary: `Stock ${formData.type === "in" ? "added" : "removed"}: ${quantityValue} units for "${product.name}"`,
        details: {
          old: { stock_quantity: product.stock_quantity },
          new: { stock_quantity: newStockQuantity },
          adjustment_type: formData.type,
          adjustment_quantity: quantityValue,
          reason: formData.reason || null,
        },
      });

      toast.success("Stock adjusted successfully");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to adjust stock: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProduct = products.find(p => p.id === formData.productId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-lg md:max-w-2xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
        </DialogHeader>
        {!hasPermission("inventory.adjust_stock") && !permissionsLoading ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You do not have permission to adjust inventory levels.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select value={formData.productId} onValueChange={(value) => setFormData(prev => ({ ...prev, productId: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map(product => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} (Current: {product.stock_quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct && (
            <div className="text-sm text-muted-foreground">
              Current stock: {selectedProduct.stock_quantity} units
            </div>
          )}

          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <Select value={formData.type} onValueChange={(value: "in" | "out") => setFormData(prev => ({ ...prev, type: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Stock In (+)</SelectItem>
                <SelectItem value="out">Stock Out (-)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
              placeholder="Enter quantity"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Reason for adjustment (optional)"
              rows={3}
            />
          </div>

          {selectedProduct && (formData.quantity.trim() ? Number(formData.quantity) : 0) > 0 && (
            <div className="text-sm p-3 bg-muted rounded-md">
              <strong>Preview:</strong><br />
              Current stock: {selectedProduct.stock_quantity}<br />
              Adjustment: {formData.type === "in" ? "+" : "-"}{formData.quantity}<br />
              New stock: {selectedProduct.stock_quantity + (formData.type === "in" ? Number(formData.quantity) : -Number(formData.quantity))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || permissionsLoading}>
              {isLoading ? "Adjusting..." : "Adjust Stock"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
