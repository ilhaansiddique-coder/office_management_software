export type PaidBehavior = "keep" | "zero" | "cod_collected" | "restore_backup";
export type DueBehavior = "keep" | "zero" | "restore_backup";

export interface CourierPaymentRule {
  status_key: string;
  payment_status: string;
  amount_paid_behavior: PaidBehavior;
  amount_due_behavior: DueBehavior;
  use_backup: boolean;
  restore_inventory: boolean;
  created_at: string;
  updated_at: string;
  is_fallback?: boolean;
}

export type CourierPaymentRuleInput = Omit<
  CourierPaymentRule,
  "created_at" | "updated_at" | "is_fallback"
>;

const FALLBACK_RULES: CourierPaymentRule[] = [
  {
    status_key: "delivered",
    payment_status: "paid",
    amount_paid_behavior: "cod_collected",
    amount_due_behavior: "zero",
    use_backup: true,
    restore_inventory: false,
    created_at: "",
    updated_at: "",
    is_fallback: true,
  },
  {
    status_key: "cancelled",
    payment_status: "cancelled",
    amount_paid_behavior: "zero",
    amount_due_behavior: "zero",
    use_backup: false,
    restore_inventory: true,
    created_at: "",
    updated_at: "",
    is_fallback: true,
  },
  {
    status_key: "returned",
    payment_status: "cancelled",
    amount_paid_behavior: "zero",
    amount_due_behavior: "zero",
    use_backup: false,
    restore_inventory: true,
    created_at: "",
    updated_at: "",
    is_fallback: true,
  },
  {
    status_key: "lost",
    payment_status: "cancelled",
    amount_paid_behavior: "zero",
    amount_due_behavior: "zero",
    use_backup: false,
    restore_inventory: false,
    created_at: "",
    updated_at: "",
    is_fallback: true,
  },
  {
    status_key: "pending",
    payment_status: "pending",
    amount_paid_behavior: "restore_backup",
    amount_due_behavior: "restore_backup",
    use_backup: false,
    restore_inventory: false,
    created_at: "",
    updated_at: "",
    is_fallback: true,
  },
];

export const useCourierPaymentRules = () => {
  const normalizeStatusKey = (value?: string | null) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const resolvedRules = FALLBACK_RULES;
  const isLoading = false;
  const error = null;

  const upsertRule = async (_input: CourierPaymentRuleInput) => {
    throw new Error("Courier rules are hardcoded and cannot be modified.");
  };

  const deleteRule = async (_statusKey: string) => {
    throw new Error("Courier rules are hardcoded and cannot be deleted.");
  };

  const ruleLookup = useMemo(() => {
    return new Map(resolvedRules.map((rule) => [rule.status_key, rule]));
  }, [resolvedRules]);

  const getRuleForStatus = (status?: string | null) => {
    const key = normalizeStatusKey(status);
    return ruleLookup.get(key) || ruleLookup.get("pending");
  };

  return {
    courierPaymentRules: resolvedRules,
    isLoading,
    error,
    upsertRule,
    deleteRule,
    isSaving: false,
    isDeleting: false,
    getRuleForStatus,
  };
};
import { useMemo } from "react";
