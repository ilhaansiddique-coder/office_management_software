import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentMethods, type PaymentMethodInput } from "@/hooks/usePaymentMethods";

type EditableMethod = PaymentMethodInput & { id?: string | null };

const PROTECTED_METHOD_KEYS = new Set([
  "cash",
  "bkash",
  "nagad",
  "bank_transfer",
  "cod",
  "credit",
]);

const buildNewMethod = (): EditableMethod => ({
  key: "",
  label: "",
  type: "custom",
  enabled: true,
  default_terms: "custom",
  default_paid_behavior: "custom",
  fee_type: "none",
  fee_value: null,
  sort_order: 0,
});

interface PaymentMethodsSettingsProps {
  canEdit: boolean;
}

export const PaymentMethodsSettings = ({ canEdit }: PaymentMethodsSettingsProps) => {
  const {
    paymentMethods,
    upsertPaymentMethod,
    deletePaymentMethod,
    isSaving,
    isDeleting,
    normalizePaymentKey,
  } = usePaymentMethods();

  const [rows, setRows] = useState<EditableMethod[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [editor, setEditor] = useState<EditableMethod>(buildNewMethod());
  const isProtectedKey = selectedKey !== "__new__" && PROTECTED_METHOD_KEYS.has(selectedKey);

  useEffect(() => {
    const normalized = paymentMethods.map((method) => ({
      id: method.is_fallback ? null : method.id,
      key: method.key,
      label: method.label,
      type: method.type,
      enabled: method.enabled,
      default_terms: method.default_terms,
      default_paid_behavior: method.default_paid_behavior,
      fee_type: method.fee_type,
      fee_value: method.fee_value,
      sort_order: method.sort_order,
    }));
    setRows(normalized);
  }, [paymentMethods]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedKey("__new__");
      setEditor(buildNewMethod());
      return;
    }
    const hasSelected =
      selectedKey &&
      (selectedKey === "__new__" || rows.some((row) => row.key === selectedKey));
    const nextKey = hasSelected ? selectedKey : rows[0].key;
    setSelectedKey(nextKey);
    if (nextKey !== "__new__") {
      const current = rows.find((row) => row.key === nextKey);
      if (current) {
        setEditor({ ...current });
      }
    }
  }, [rows, selectedKey]);

  const isValidNew = useMemo(() => {
    return Boolean(editor.label.trim());
  }, [editor.label]);

  const handleSelect = (value: string) => {
    setSelectedKey(value);
    if (value === "__new__") {
      setEditor(buildNewMethod());
      return;
    }
    const current = rows.find((row) => row.key === value);
    if (current) setEditor({ ...current });
  };

  const updateEditor = (field: keyof EditableMethod, value: string | boolean | number | null) => {
    setEditor((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!editor.label.trim()) return;
    const normalizedKey =
      selectedKey === "__new__"
        ? normalizePaymentKey(editor.key || editor.label)
        : selectedKey;
    const payload: PaymentMethodInput = {
      ...editor,
      key: normalizedKey,
      label: editor.label.trim(),
      type: editor.type.trim() || "custom",
    };
    await upsertPaymentMethod(payload);
    setSelectedKey(normalizedKey);
  };

  const handleDelete = async () => {
    if (!editor.id || selectedKey === "__new__") return;
    if (isProtectedKey) {
      return;
    }
    await deletePaymentMethod(editor.id);
    const remaining = rows.filter((row) => row.key !== selectedKey);
    const nextKey = remaining[0]?.key || "__new__";
    setSelectedKey(nextKey);
    if (nextKey === "__new__") setEditor(buildNewMethod());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How this works (simple)</p>
          <ul className="mt-2 space-y-1">
            <li>- Label: what shows on the Sales screen and invoices.</li>
            <li>- Type: used to group methods (cash vs online) in Sales review.</li>
            <li>- Terms: auto-sets payment terms (Pay Now, COD, Pay Later).</li>
            <li>- Paid behavior: auto-fills paid amount (Full or Zero).</li>
            <li>- Enabled: shows/hides the method in Sales.</li>
            <li>- Order: controls dropdown order.</li>
          </ul>
        </div>
        <div className="rounded-lg border p-3">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="space-y-1 md:col-span-2">
              <Label>Method</Label>
              <Select value={selectedKey || "__new__"} onValueChange={handleSelect}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rows.map((row) => (
                    <SelectItem key={row.key} value={row.key}>
                      {row.label || row.key}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">Create new method...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Key</Label>
              <Input
                value={editor.key}
                onChange={(e) => updateEditor("key", e.target.value)}
                disabled={!canEdit || selectedKey !== "__new__"}
                placeholder="cash"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={editor.label}
                onChange={(e) => updateEditor("label", e.target.value)}
                disabled={!canEdit}
                placeholder="Cash"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Input
                value={editor.type}
                onChange={(e) => updateEditor("type", e.target.value)}
                disabled={!canEdit}
                placeholder="custom"
              />
            </div>
            <div className="space-y-1">
              <Label>Terms</Label>
              <Select
                value={editor.default_terms}
                onValueChange={(value) => updateEditor("default_terms", value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="immediate">Pay Now</SelectItem>
                  <SelectItem value="cod">COD</SelectItem>
                  <SelectItem value="credit">Pay Later</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Paid Behavior</Label>
              <Select
                value={editor.default_paid_behavior}
                onValueChange={(value) => updateEditor("default_paid_behavior", value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="zero">Zero</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Order</Label>
              <Input
                type="number"
                min="0"
                value={editor.sort_order ?? 0}
                onChange={(e) => updateEditor("sort_order", Number(e.target.value) || 0)}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editor.enabled}
                onCheckedChange={(checked) => updateEditor("enabled", checked)}
                disabled={!canEdit}
              />
              <span className="text-sm text-muted-foreground">Enabled</span>
            </div>
          </div>

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || (selectedKey === "__new__" && !isValidNew)}
              >
                Save
              </Button>
              {selectedKey !== "__new__" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={isDeleting || isProtectedKey}
                >
                  {isProtectedKey ? "Core method" : "Delete"}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
