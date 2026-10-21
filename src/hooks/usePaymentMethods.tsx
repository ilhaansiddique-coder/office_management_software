import { useMemo } from "react";

export type PaymentTerms = "immediate" | "cod" | "credit" | "custom";
export type PaymentPaidBehavior = "full" | "zero" | "custom";
export type PaymentFeeType = "none" | "fixed" | "percent";

export interface PaymentMethod {
  id: string;
  key: string;
  label: string;
  type: string;
  enabled: boolean;
  default_terms: PaymentTerms;
  default_paid_behavior: PaymentPaidBehavior;
  fee_type: PaymentFeeType;
  fee_value: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  is_fallback?: boolean;
}

export type PaymentMethodInput = Omit<
  PaymentMethod,
  "id" | "created_at" | "updated_at" | "is_fallback"
> & { id?: string | null };

const normalizePaymentKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const STATIC_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "cash",
    key: "cash",
    label: "Cash",
    type: "cash",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 1,
    created_at: "",
    updated_at: "",
  },
  {
    id: "bkash",
    key: "bkash",
    label: "Bkash",
    type: "mobile",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 2,
    created_at: "",
    updated_at: "",
  },
  {
    id: "nagad",
    key: "nagad",
    label: "Nagad",
    type: "mobile",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 3,
    created_at: "",
    updated_at: "",
  },
  {
    id: "ibbl",
    key: "ibbl",
    label: "IBBL",
    type: "bank",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 4,
    created_at: "",
    updated_at: "",
  },
  {
    id: "brac_bank",
    key: "brac_bank",
    label: "Brac Bank",
    type: "bank",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 5,
    created_at: "",
    updated_at: "",
  },
  {
    id: "dbbl",
    key: "dbbl",
    label: "DBBL",
    type: "bank",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 6,
    created_at: "",
    updated_at: "",
  },
  {
    id: "city_bank",
    key: "city_bank",
    label: "City Bank",
    type: "bank",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 7,
    created_at: "",
    updated_at: "",
  },
  {
    id: "al_arafah",
    key: "al_arafah",
    label: "Al Arafah",
    type: "bank",
    enabled: true,
    default_terms: "immediate",
    default_paid_behavior: "full",
    fee_type: "none",
    fee_value: null,
    sort_order: 8,
    created_at: "",
    updated_at: "",
  },
  {
    id: "cod",
    key: "cod",
    label: "COD",
    type: "cod",
    enabled: true,
    default_terms: "cod",
    default_paid_behavior: "zero",
    fee_type: "none",
    fee_value: null,
    sort_order: 9,
    created_at: "",
    updated_at: "",
  },
  {
    id: "credit",
    key: "credit",
    label: "Credit",
    type: "credit",
    enabled: true,
    default_terms: "credit",
    default_paid_behavior: "zero",
    fee_type: "none",
    fee_value: null,
    sort_order: 10,
    created_at: "",
    updated_at: "",
  },
];

export const usePaymentMethods = () => {
  const paymentMethods = STATIC_PAYMENT_METHODS;
  const isLoading = false;
  const error = null;

  const upsertPaymentMethod = async (_input: PaymentMethodInput) => {
    throw new Error("Payment methods are hardcoded and cannot be modified.");
  };

  const deletePaymentMethod = async (_id: string) => {
    throw new Error("Payment methods are hardcoded and cannot be deleted.");
  };

  const methodLookup = useMemo(() => {
    return new Map(paymentMethods.map((method) => [method.key, method]));
  }, [paymentMethods]);

  const enabledPaymentMethods = useMemo(
    () => paymentMethods.filter((method) => method.enabled),
    [paymentMethods]
  );

  const getMethodLabel = (key?: string | null) => {
    if (!key) return "";
    return methodLookup.get(key)?.label || key;
  };

  const getMethodConfig = (key?: string | null) => {
    if (!key) return undefined;
    return methodLookup.get(key);
  };

  const isCreditMethod = (key?: string | null) => {
    const method = getMethodConfig(key);
    if (!method) return key === "credit";
    return method.default_terms === "credit" || method.type === "credit";
  };

  const isCodMethod = (key?: string | null) => {
    const method = getMethodConfig(key);
    if (!method) return key === "cod";
    return method.default_terms === "cod" || method.type === "cod";
  };

  return {
    paymentMethods,
    enabledPaymentMethods,
    isLoading,
    error,
    upsertPaymentMethod,
    deletePaymentMethod,
    isSaving: false,
    isDeleting: false,
    getMethodLabel,
    getMethodConfig,
    isCreditMethod,
    isCodMethod,
    normalizePaymentKey,
  };
};
