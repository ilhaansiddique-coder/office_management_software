import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  useCourierPaymentRules,
  type CourierPaymentRule,
  type CourierPaymentRuleInput,
} from "@/hooks/useCourierPaymentRules";

const STATUS_LABELS: Record<string, string> = {
  not_sent: "Not Sent",
  sent: "Sent",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  payout_ready: "Payout Ready",
  cancelled: "Cancelled",
  returned: "Returned",
  lost: "Lost",
  pending: "Pending/Other",
};

const PROTECTED_STATUS_KEYS = new Set([
  "not_sent",
  "sent",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "payout_ready",
  "cancelled",
  "returned",
  "lost",
  "pending",
]);

interface CourierPaymentRulesSettingsProps {
  canEdit: boolean;
}

const buildNewRule = (): CourierPaymentRuleInput => ({
  status_key: "",
  payment_status: "pending",
  amount_paid_behavior: "keep",
  amount_due_behavior: "keep",
  use_backup: false,
  restore_inventory: false,
});

const normalizeStatusKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const CourierPaymentRulesSettings = ({ canEdit }: CourierPaymentRulesSettingsProps) => {
  const { courierPaymentRules, upsertRule, deleteRule, isSaving, isDeleting } = useCourierPaymentRules();
  const [rows, setRows] = useState<CourierPaymentRule[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [editor, setEditor] = useState<CourierPaymentRuleInput>(buildNewRule());
  const isProtectedStatus = selectedStatus !== "__new__" && PROTECTED_STATUS_KEYS.has(selectedStatus);

  useEffect(() => {
    setRows(courierPaymentRules.map((rule) => ({ ...rule })));
  }, [courierPaymentRules]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedStatus("__new__");
      setEditor(buildNewRule());
      return;
    }
    const hasSelected = selectedStatus && (selectedStatus === "__new__" || rows.some((row) => row.status_key === selectedStatus));
    const nextStatus = hasSelected ? selectedStatus : rows[0].status_key;
    setSelectedStatus(nextStatus);
    if (nextStatus !== "__new__") {
      const current = rows.find((row) => row.status_key === nextStatus);
      if (current) {
        setEditor({
          status_key: current.status_key,
          payment_status: current.payment_status,
          amount_paid_behavior: current.amount_paid_behavior,
          amount_due_behavior: current.amount_due_behavior,
          use_backup: current.use_backup,
          restore_inventory: current.restore_inventory,
        });
      }
    }
  }, [rows, selectedStatus]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aLabel = STATUS_LABELS[a.status_key] || a.status_key;
      const bLabel = STATUS_LABELS[b.status_key] || b.status_key;
      return aLabel.localeCompare(bLabel);
    });
  }, [rows]);

  const handleStatusSelect = (value: string) => {
    setSelectedStatus(value);
    if (value === "__new__") {
      setEditor(buildNewRule());
      return;
    }
    const current = rows.find((row) => row.status_key === value);
    if (!current) return;
    setEditor({
      status_key: current.status_key,
      payment_status: current.payment_status,
      amount_paid_behavior: current.amount_paid_behavior,
      amount_due_behavior: current.amount_due_behavior,
      use_backup: current.use_backup,
      restore_inventory: current.restore_inventory,
    });
  };

  const updateEditor = (field: keyof CourierPaymentRuleInput, value: string | boolean) => {
    setEditor((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const statusKey =
      selectedStatus === "__new__"
        ? normalizeStatusKey(editor.status_key)
        : selectedStatus;
    if (!statusKey) return;
    const payload: CourierPaymentRuleInput = {
      ...editor,
      status_key: statusKey,
    };
    await upsertRule(payload);
    setSelectedStatus(statusKey);
  };

  const handleDelete = async () => {
    if (!selectedStatus || selectedStatus === "__new__") return;
    if (isProtectedStatus) return;
    await deleteRule(selectedStatus);
    const remaining = rows.filter((row) => row.status_key !== selectedStatus);
    const next = remaining[0]?.status_key || "__new__";
    setSelectedStatus(next);
    if (next === "__new__") {
      setEditor(buildNewRule());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Courier Status Payment Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Simple explanation</p>
          <ul className="mt-2 space-y-1">
            <li>- When courier status changes, these rules decide payment status and paid/due.</li>
            <li>- Delivered uses COD collected: paid = previous + (due - fee).</li>
            <li>- Pending/Other restores backup if a delivery was reversed.</li>
          </ul>
        </div>

        <div className="rounded-lg border p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={selectedStatus || "__new__"} onValueChange={handleStatusSelect}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortedRows.map((row) => (
                    <SelectItem key={row.status_key} value={row.status_key}>
                      {STATUS_LABELS[row.status_key] || row.status_key}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">Create new status...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment Status</Label>
              <Select
                value={editor.payment_status}
                onValueChange={(value) => updateEditor("payment_status", value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Paid Behavior</Label>
              <Select
                value={editor.amount_paid_behavior}
                onValueChange={(value) => updateEditor("amount_paid_behavior", value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep</SelectItem>
                  <SelectItem value="zero">Set Zero</SelectItem>
                  <SelectItem value="cod_collected">COD Collected</SelectItem>
                  <SelectItem value="restore_backup">Restore Backup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due Behavior</Label>
              <Select
                value={editor.amount_due_behavior}
                onValueChange={(value) => updateEditor("amount_due_behavior", value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep</SelectItem>
                  <SelectItem value="zero">Set Zero</SelectItem>
                  <SelectItem value="restore_backup">Restore Backup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editor.use_backup}
                onCheckedChange={(checked) => updateEditor("use_backup", checked)}
                disabled={!canEdit}
              />
              <span className="text-sm text-muted-foreground">Save Backup</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editor.restore_inventory}
                onCheckedChange={(checked) => updateEditor("restore_inventory", checked)}
                disabled={!canEdit}
              />
              <span className="text-sm text-muted-foreground">Restore Inventory</span>
            </div>
          </div>

          {selectedStatus === "__new__" && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>New Status Key</Label>
                <Input
                  value={editor.status_key}
                  onChange={(e) => updateEditor("status_key", e.target.value)}
                  placeholder="out_for_delivery"
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || (selectedStatus === "__new__" && !editor.status_key.trim())}
              >
                Save Rule
              </Button>
              {selectedStatus !== "__new__" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={isDeleting || isProtectedStatus}
                >
                  {isProtectedStatus ? "Core rule" : "Delete"}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
