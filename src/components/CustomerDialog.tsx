import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomers, Customer, CreateCustomerData } from "@/hooks/useCustomers";
import { useUserRole } from "@/hooks/useUserRole";
import { useCustomerCredit } from "@/hooks/useCustomerCredit";
import { useCurrency } from "@/hooks/useCurrency";
import { Loader2 } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { logActivity } from "@/utils/activityLogger";

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
}

export const CustomerDialog = ({ open, onOpenChange, customer }: CustomerDialogProps) => {
  const { createCustomer, updateCustomer } = useCustomers();
  const { hasPermission } = useUserRole();
  const { data: creditInfo } = useCustomerCredit(customer?.id);
  const { formatAmount } = useCurrency();
  const [formData, setFormData] = useState<CreateCustomerData>({
    name: "",
    phone: "",
    address: "",
    tags: [],
    status: "inactive",
    additional_info: "",
    credit_limit: 0,
  });

  const isEditing = !!customer;
  const canAddCustomer = hasPermission('customers.add');
  const canEditCustomer = hasPermission('customers.edit');
  const canSave = isEditing ? canEditCustomer : canAddCustomer;

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name,
        phone: customer.phone || "",
        address: customer.address || "",
        tags: customer.tags || [],
        status: customer.status || "inactive",
        additional_info: customer.additional_info || "",
        credit_limit: customer.credit_limit || 0,
      });
    } else {
      setFormData({
        name: "",
        phone: "",
        address: "",
        tags: [],
        status: "inactive",
        additional_info: "",
        credit_limit: 0,
      });
    }
  }, [customer]);

  const buildWhatsappFromPhone = (phone?: string) => {
    const digits = (phone || "").replace(/[^\d]/g, "");
    if (!digits) return undefined;
    return digits.startsWith("88") ? `+${digits}` : `+88${digits}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSave) return;
    
    try {
      const payload = {
        ...formData,
        whatsapp: buildWhatsappFromPhone(formData.phone),
      };
      if (isEditing) {
        await updateCustomer.mutateAsync({ id: customer.id, data: payload });
        logActivity({
          action: "update",
          entityType: "customers",
          entityId: customer.id,
          summary: `Updated customer "${formData.name}"`,
          details: {
            old: {
              name: customer.name,
              phone: customer.phone || null,
              address: customer.address || null,
              status: customer.status || null,
              additional_info: customer.additional_info || null,
            },
            new: {
              name: formData.name,
              phone: formData.phone || null,
              address: formData.address || null,
              status: formData.status || null,
              additional_info: formData.additional_info || null,
            },
          },
        });
      } else {
        const created = await createCustomer.mutateAsync(payload);
        const customerId = (created as any)?.id || null;
        logActivity({
          action: "insert",
          entityType: "customers",
          entityId: customerId,
          summary: `Created customer "${formData.name}"`,
          details: {
            new: {
              name: formData.name,
              phone: formData.phone || null,
              address: formData.address || null,
              status: formData.status || null,
              additional_info: formData.additional_info || null,
            },
          },
        });
      }
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleChange = (field: keyof CreateCustomerData, value: string | string[] | number) => {
    setFormData(prev => ({ ...prev, [field]: field === 'credit_limit' ? Number(value) || 0 : value }));
  };

  const isLoading = createCustomer.isPending || updateCustomer.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Customer" : "Add New Customer"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the customer information below." : "Enter the details for the new customer."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Customer Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Enter customer name"
              required
              disabled={!canSave}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="Enter phone number"
              disabled={!canSave}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleChange("address", e.target.value)}
              placeholder="Enter customer address"
              rows={3}
              disabled={!canSave}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => handleChange("status", value)} disabled={!canSave}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additional_info">Additional Info</Label>
            <Input
              id="additional_info"
              value={formData.additional_info || ""}
              onChange={(e) => handleChange("additional_info", e.target.value)}
              placeholder="Enter any additional information (e.g., VIP, Wholesale, Notes, etc.)"
              disabled={!canSave}
            />
            <p className="text-xs text-muted-foreground">
              Enter any additional information or notes for this customer
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit_limit">Credit Limit</Label>
            <Input
              id="credit_limit"
              type="number"
              min="0"
              step="1"
              value={formData.credit_limit || 0}
              onChange={(e) => handleChange("credit_limit", e.target.value)}
              placeholder="0"
              disabled={!canSave}
            />
            <p className="text-xs text-muted-foreground">
              Maximum credit amount allowed for this customer (0 = no credit)
            </p>
          </div>

          {creditInfo && (
            <div className="space-y-2">
              <Label>Credit Status</Label>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Limit</p>
                  <p className="font-medium">{formatAmount(creditInfo.creditLimit)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Used</p>
                  <p className="font-medium">{formatAmount(creditInfo.creditUsed)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Available</p>
                  <p className="font-medium text-success">{formatAmount(creditInfo.creditAvailable)}</p>
                </div>
              </div>
            </div>
          )}


          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {canSave && (
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditing ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  isEditing ? "Update Customer" : "Create Customer"
                )}
              </Button>
            )}
          </DialogFooter>
        </form>

      </DialogContent>
    </Dialog>
  );
};
