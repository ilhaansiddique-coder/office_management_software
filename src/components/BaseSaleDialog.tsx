import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Minus, Trash2, Search, X, Loader2 } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useCustomers } from "@/hooks/useCustomers";
import { useCurrency } from "@/hooks/useCurrency";
import { useProductVariants } from "@/hooks/useProductVariants";
import { toast } from "@/utils/toast";
import Fuse from "fuse.js";
import { ProductIcon } from "@/components/ProductIcon";
import { calculateDueDate } from "@/utils/paymentTerms";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import {
  isValidDateInput,
  normalizeDateDisplayInput,
  toDisplayDateInput,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export interface SaleItem {
  id?: string;
  productId?: string;
  product_id?: string;
  productName?: string;
  product_name?: string;
  productImageUrl?: string | null;
  product_image_url?: string | null;
  rate: number;
  salePrice?: number;
  sale_price?: number | null;
  quantity: number;
  total: number;
  variantId?: string | null;
  variant_id?: string | null;
  variantLabel?: string;
  variantImageUrl?: string | null;
  variant_image_url?: string | null;
  maxStock?: number;
  originalQuantity?: number; // Used when editing to track the original quantity
}

export interface SaleFormData {
  saleDate?: string;
  customerId?: string;
  customer_id?: string;
  customerName: string;
  customer_name?: string;
  customerPhone?: string;
  customer_phone?: string;
  customerWhatsapp?: string;
  customer_whatsapp?: string;
  customerAddress?: string;
  customer_address?: string;
  additional_info?: string;
  cn_number?: string;
  courier_name?: string;
  paymentMethod: string;
  payment_method?: string;
  paymentStatus: string;
  payment_status?: string;
  amountPaid: number;
  amount_paid?: number;
  payment_splits?: Array<{ method: string; amount: number }>;
  discountPercent: number;
  discount_percent?: number;
  discountAmount: number;
  discount_amount?: number;
  charge: number;
  subtotal?: number;
  grand_total?: number;
  amount_due?: number;
  payment_terms?: 'immediate' | 'cod' | 'credit';
  credit_days?: number;
  due_date?: string | null;
  items: SaleItem[];
}

type SaleItemState = Omit<SaleItem, "quantity" | "total"> & {
  quantity: string;
  total: number;
  originalQuantity?: number;
};

type SaleFormState = Omit<
  SaleFormData,
  "amountPaid" | "discountPercent" | "discountAmount" | "charge" | "credit_days" | "items" | "payment_splits"
> & {
  amountPaid: string;
  discountPercent: string;
  discountAmount: string;
  charge: string;
  credit_days: string;
  payment_splits: Array<{ method: string; amount: string; _id?: string }>;
  items: SaleItemState[];
};

interface BaseSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  isEditing?: boolean;
  enableDraft?: boolean;
  draftStorageKey?: string;
  initialData?: SaleFormData;
  onSubmit: (data: SaleFormData, calculatedValues: {
    subtotal: number;
    discountAmount: number;
    grandTotal: number;
    amountDue: number;
  }) => Promise<void>;
  isLoading?: boolean;
}

export const BaseSaleDialog = ({
  open,
  onOpenChange,
  title,
  isEditing = false,
  enableDraft = false,
  draftStorageKey,
  initialData,
  onSubmit,
  isLoading = false
}: BaseSaleDialogProps) => {
  const { products, refetch: refetchProducts } = useProducts();
  const { customers, isLoading: isCustomersLoading } = useCustomers();
  const { formatAmount, currencySymbol } = useCurrency();
  const { systemSettings } = useSystemSettings();
  const {
    paymentMethods,
    enabledPaymentMethods,
    getMethodLabel,
    getMethodConfig,
    isCreditMethod,
    isCodMethod,
  } = usePaymentMethods();

  const toNumber = (value: string | number) => (value === "" ? 0 : Number(value));
  const toQuantity = (value: string | number) => {
    if (value === "") return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.trunc(parsed));
  };
  const buildWhatsappFromPhone = (phone?: string | null) => {
    const digits = (phone || "").replace(/[^\d]/g, "");
    if (!digits) return "";
    return digits.startsWith("88") ? `+${digits}` : `+88${digits}`;
  };
  // Sort payment splits: regular methods first, then Credit, then COD (always last)
  const sortPaymentSplits = (splits: Array<{ method: string; amount: string }>) => {
    return [...splits].sort((a, b) => {
      const rank = (m: string) => {
        if (!m) return 0; // empty method stays in place
        if (isCodMethod(m)) return 2;
        if (isCreditMethod(m)) return 1;
        return 0;
      };
      return rank(a.method) - rank(b.method);
    });
  };

  const normalizePaymentSplits = (splits: Array<{ method: string; amount: string }>) =>
    splits
      .map((split) => ({
        method: split.method === "condition" ? "cod" : split.method,
        amount: toNumber(split.amount)
      }))
      .filter((split) => split.amount > 0);

  const resolveImageUrl = (url?: string | null) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return supabase.storage.from("product-images").getPublicUrl(url).data.publicUrl;
  };

  const [formData, setFormData] = useState<SaleFormState>({
    saleDate: "",
    customerId: "",
    customerName: "",
    customerPhone: "",
    customerWhatsapp: "",
    customerAddress: "",
    additional_info: "",
    cn_number: "",
    courier_name: "",
    paymentMethod: "",
    paymentStatus: "pending",
    payment_terms: "immediate",
    credit_days: "",
    due_date: null,
    amountPaid: "",
    payment_splits: [{ method: "", amount: "", _id: "0" }],
    discountPercent: "",
    discountAmount: "",
    charge: "",
    items: [],
  });

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("fixed");
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [productComboOpen, setProductComboOpen] = useState(false);
  const [customerNameDropdownOpen, setCustomerNameDropdownOpen] = useState(false);
  const [customerPhoneDropdownOpen, setCustomerPhoneDropdownOpen] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ url: string; name: string } | null>(null);
  const [variantSelectOpen, setVariantSelectOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suppressVariantCloseRef = useRef(false);
  const initialFormStateRef = useRef<SaleFormState | null>(null);
  const canPortal = typeof document !== "undefined";
  const [salePriceDrafts, setSalePriceDrafts] = useState<Record<string, string>>({});
  const manualSplitEditsRef = useRef<boolean[]>([]);
  const splitIdCounter = useRef(0);
  const nextSplitId = () => String(++splitIdCounter.current);
  const normalizedDraftStorageKey = useMemo(() => {
    if (!enableDraft || isEditing || !draftStorageKey) return null;
    return draftStorageKey;
  }, [enableDraft, isEditing, draftStorageKey]);
  const defaultMethodKey = enabledPaymentMethods[0]?.key || paymentMethods[0]?.key || "";
  const paymentMethodOptions = useMemo(() => {
    const options = (enabledPaymentMethods.length ? enabledPaymentMethods : paymentMethods).map(
      (method) => ({
        key: method.key,
        label: method.label,
        enabled: method.enabled,
      })
    );

    const existingKeys = new Set(options.map((option) => option.key));
    formData.payment_splits.forEach((split) => {
      if (!split.method || existingKeys.has(split.method)) return;
      options.push({
        key: split.method,
        label: getMethodLabel(split.method),
        enabled: false,
      });
      existingKeys.add(split.method);
    });

    return options;
  }, [enabledPaymentMethods, paymentMethods, formData.payment_splits, getMethodLabel]);

  const getLocalDateInputValue = useCallback((value?: string) => {
    return toDisplayDateInput(value, systemSettings.timezone);
  }, [systemSettings.timezone]);

  const getDefaultFormState = useCallback(
    (): SaleFormState => ({
      saleDate: getLocalDateInputValue(),
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerWhatsapp: "",
      customerAddress: "",
      additional_info: "",
      cn_number: "",
      courier_name: "",
      paymentMethod: "",
      paymentStatus: "pending",
      payment_terms: "immediate",
      credit_days: "",
      due_date: null,
      amountPaid: "",
      payment_splits: [{ method: "", amount: "", _id: nextSplitId() }],
      discountPercent: "",
      discountAmount: "",
      charge: "",
      items: [],
    }),
    [getLocalDateInputValue]
  );

  const normalizeDraftState = useCallback((raw: any): SaleFormState | null => {
    if (!raw || typeof raw !== "object") return null;

    const rawSplits = Array.isArray(raw.payment_splits) ? raw.payment_splits : [];
    const payment_splits = (rawSplits.length ? rawSplits : [{ method: "", amount: "" }]).map((split: any) => ({
      method: String(split?.method || ""),
      amount: String(split?.amount ?? ""),
      _id: split?._id ? String(split._id) : nextSplitId(),
    }));

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems.map((item: any) => {
      const qty = String(item?.quantity ?? "0");
      const rate = Number(item?.rate) || 0;
      const salePriceRaw = item?.salePrice ?? item?.sale_price;
      const salePrice = salePriceRaw === undefined || salePriceRaw === null ? undefined : Number(salePriceRaw);
      const quantityNumber = toQuantity(qty);
      return {
        ...item,
        quantity: qty,
        rate,
        salePrice,
        total: Number(item?.total) || quantityNumber * (salePrice ?? rate),
      };
    });

    return {
      saleDate: raw.saleDate
        ? toDisplayDateInput(String(raw.saleDate), systemSettings.timezone)
        : getLocalDateInputValue(),
      customerId: String(raw.customerId || ""),
      customerName: String(raw.customerName || ""),
      customerPhone: String(raw.customerPhone || ""),
      customerWhatsapp: String(raw.customerWhatsapp || ""),
      customerAddress: String(raw.customerAddress || ""),
      additional_info: String(raw.additional_info || ""),
      cn_number: String(raw.cn_number || ""),
      courier_name: String(raw.courier_name || ""),
      paymentMethod: String(raw.paymentMethod || ""),
      paymentStatus: String(raw.paymentStatus || "pending"),
      payment_terms: (raw.payment_terms === "credit" || raw.payment_terms === "cod") ? raw.payment_terms : "immediate",
      credit_days: String(raw.credit_days || ""),
      due_date: raw.due_date ?? null,
      amountPaid: String(raw.amountPaid || ""),
      payment_splits,
      discountPercent: String(raw.discountPercent || ""),
      discountAmount: String(raw.discountAmount || ""),
      charge: String(raw.charge || ""),
      items,
    };
  }, [getLocalDateInputValue, systemSettings.timezone]);

  const clearDraftState = useCallback(() => {
    if (!normalizedDraftStorageKey || typeof window === "undefined") return;
    localStorage.removeItem(normalizedDraftStorageKey);
  }, [normalizedDraftStorageKey]);

  const persistDraftState = useCallback((state: SaleFormState) => {
    if (!normalizedDraftStorageKey || typeof window === "undefined") return;
    try {
      localStorage.setItem(normalizedDraftStorageKey, JSON.stringify(state));
    } catch (error) {
      console.warn("Failed to persist sale draft:", error);
    }
  }, [normalizedDraftStorageKey]);

  const updateSaleDate = useCallback((rawValue: string) => {
    const nextSaleDate = normalizeDateDisplayInput(rawValue);
    setFormData((prev) => {
      const nextState = {
        ...prev,
        saleDate: nextSaleDate,
      };

      const creditDays = parseInt(prev.credit_days || "0") || 0;
      if (creditDays > 0) {
        nextState.due_date = isValidDateInput(nextSaleDate)
          ? calculateDueDate(nextSaleDate, creditDays)
          : null;
      }

      return nextState;
    });
  }, []);

  const handlePreviewPointerEnter = (url: string, name: string) => (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    setHoverPreview({ url, name });
  };

  const handlePreviewPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    setHoverPreview(null);
  };

  // Initialize form data when dialog opens or initial data changes
  useEffect(() => {
    if (!open) {
      manualSplitEditsRef.current = [];
      setProductComboOpen(false);
      setSelectedVariantId(null);
      setVariantSelectOpen(false);
      setCustomerNameDropdownOpen(false);
      setCustomerPhoneDropdownOpen(false);
      setHoverPreview(null);
      return;
    }

    if (initialData) {
      // Map data to consistent format
      const mappedData: SaleFormState = {
        saleDate: initialData.saleDate || getLocalDateInputValue((initialData as any).created_at),
        customerId: initialData.customerId || initialData.customer_id || "",
        customerName: initialData.customerName || initialData.customer_name || "",
        customerPhone: initialData.customerPhone || initialData.customer_phone || "",
        customerWhatsapp: initialData.customerWhatsapp || initialData.customer_whatsapp || "",
        customerAddress: initialData.customerAddress || initialData.customer_address || "",
        additional_info: initialData.additional_info || "",
        cn_number: initialData.cn_number || "",
        courier_name: initialData.courier_name || "",
        paymentMethod: initialData.paymentMethod || initialData.payment_method || defaultMethodKey,
        paymentStatus: initialData.paymentStatus || initialData.payment_status || "pending",
        payment_terms: initialData.payment_terms || "immediate",
        credit_days: initialData.credit_days !== undefined ? String(initialData.credit_days) : "",
        due_date: initialData.due_date || null,
        amountPaid: (initialData.amountPaid ?? initialData.amount_paid) !== undefined
          ? String(initialData.amountPaid ?? initialData.amount_paid)
          : "",
        payment_splits: sortPaymentSplits(
          (initialData.payment_splits && initialData.payment_splits.length > 0)
            ? initialData.payment_splits.map((split) => ({
              method: split.method === "condition" ? "cod" : split.method,
              amount: String(split.amount ?? ""),
              _id: nextSplitId(),
            }))
            : [{
              method: initialData.paymentMethod === "condition"
                ? "cod"
                : (initialData.paymentMethod || initialData.payment_method || defaultMethodKey),
              amount: (initialData.amountPaid ?? initialData.amount_paid) !== undefined
                ? String(initialData.amountPaid ?? initialData.amount_paid)
                : "",
              _id: nextSplitId(),
            }]),
        discountPercent: (initialData.discountPercent ?? initialData.discount_percent) !== undefined
          ? String(initialData.discountPercent ?? initialData.discount_percent)
          : "",
        discountAmount: (initialData.discountAmount ?? initialData.discount_amount) !== undefined
          ? String(initialData.discountAmount ?? initialData.discount_amount)
          : "",
        charge: String(initialData.charge ?? 0),
        items: initialData.items.map((item) => {
          const qty = toNumber(item.quantity ?? 0);
          const total = Number(item.total ?? 0);
          const derivedSalePrice = qty > 0 ? total / qty : item.rate;
          return {
            ...item,
            productId: item.productId || item.product_id,
            productName: item.productName || item.product_name,
            productImageUrl: item.productImageUrl || item.product_image_url || null,
            variantId: item.variantId || item.variant_id,
            salePrice: item.salePrice ?? item.sale_price ?? derivedSalePrice,
            quantity: String(item.quantity ?? 0),
            total,
            variantImageUrl: item.variantImageUrl || item.variant_image_url || null,
            originalQuantity: qty,
          };
        }),
      };
      setFormData(mappedData);
      initialFormStateRef.current = mappedData;
      return;
    }

    if (normalizedDraftStorageKey && typeof window !== "undefined") {
      try {
        const rawDraft = localStorage.getItem(normalizedDraftStorageKey);
        if (rawDraft) {
          const parsedDraft = normalizeDraftState(JSON.parse(rawDraft));
          if (parsedDraft) {
            setFormData(parsedDraft);
            initialFormStateRef.current = parsedDraft;
            return;
          }
        }
      } catch (error) {
        console.warn("Failed to load sale draft:", error);
      }
    }

    const defaultState = getDefaultFormState();
    setFormData(defaultState);
    initialFormStateRef.current = defaultState;
    setSelectedProductId("");
    setProductSearchTerm("");
    setProductComboOpen(false);
    setSelectedVariantId(null);
    setVariantSelectOpen(false);
    setCustomerNameDropdownOpen(false);
    setCustomerPhoneDropdownOpen(false);
    setHoverPreview(null);
  }, [open, initialData, defaultMethodKey, getLocalDateInputValue, getDefaultFormState, normalizedDraftStorageKey, normalizeDraftState]);

  useEffect(() => {
    if (!open || !normalizedDraftStorageKey || initialData) return;
    persistDraftState(formData);
  }, [open, formData, normalizedDraftStorageKey, initialData, persistDraftState]);

  useEffect(() => {
    if (!open || initialData || enabledPaymentMethods.length === 0) return;
    const availableKeys = new Set(enabledPaymentMethods.map((method) => method.key));
    setFormData((prev) => {
      const needsPaymentMethod = prev.paymentMethod && !availableKeys.has(prev.paymentMethod);
      const needsSplitFix = prev.payment_splits.some((split) => split.method && !availableKeys.has(split.method));
      if (!needsPaymentMethod && !needsSplitFix) return prev;
      return {
        ...prev,
        paymentMethod: needsPaymentMethod ? "" : prev.paymentMethod,
        payment_splits: prev.payment_splits.map((split) =>
          split.method && !availableKeys.has(split.method)
            ? { ...split, method: "" }
            : split
        ),
      };
    });
  }, [open, initialData, enabledPaymentMethods, defaultMethodKey]);

  // Searchable products functionality
  const normalizeText = useMemo(() => (text: string) => {
    return text.toLowerCase()
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^\w\s]/g, ' ') // Replace non-alphanumeric with spaces
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }, []);

  const fuse = useMemo(() => {
    if (!products) return null;

    const searchData: any[] = [];

    products.forEach(product => {
      searchData.push({
        ...product,
        searchType: 'product',
        searchText: `${product.name} ${product.sku || ''}`.toLowerCase()
      });
    });

    return new Fuse(searchData, {
      keys: ['searchText', 'name', 'sku'],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 1
    });
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];

    if (!productSearchTerm.trim()) {
      return products;
    }

    const searchTerm = productSearchTerm.trim().toLowerCase();

    // First try simple string matching (faster)
    const simpleMatches = products.filter(product => {
      const name = product.name.toLowerCase();
      const sku = (product.sku || '').toLowerCase();
      return name.includes(searchTerm) || sku.includes(searchTerm);
    });

    // If we have matches, return them
    if (simpleMatches.length > 0) {
      return simpleMatches;
    }

    // Otherwise use fuzzy search (slower but more flexible)
    if (!fuse) return [];

    const searchResults = fuse.search(searchTerm);
    return searchResults.slice(0, 50).map(result => result.item);
  }, [products, productSearchTerm, fuse]);

  const selectedProduct = filteredProducts.find(p => p.id === selectedProductId);
  const { variants: currentVariants = [], refetch: refetchVariants } = useProductVariants(selectedProduct?.has_variants ? selectedProductId : undefined as any);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      refetchProducts();
      if (selectedProduct?.has_variants && selectedProductId) {
        refetchVariants();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [open, refetchProducts, refetchVariants, selectedProduct?.has_variants, selectedProductId]);

  // Filter customers by name
  const filteredCustomersByName = useMemo(() => {
    if (!customers || !formData.customerName.trim()) return [];
    const searchTerm = formData.customerName.toLowerCase();
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(searchTerm) ||
      (customer.alias_names || []).some((alias) => alias.toLowerCase().includes(searchTerm))
    ).slice(0, 5); // Limit to 5 results
  }, [customers, formData.customerName]);

  // Filter customers by phone
  const filteredCustomersByPhone = useMemo(() => {
    if (!customers || !formData.customerPhone?.trim()) return [];
    const searchTerm = formData.customerPhone.toLowerCase();
    return customers.filter(customer =>
      customer.phone?.toLowerCase().includes(searchTerm)
    ).slice(0, 5); // Limit to 5 results
  }, [customers, formData.customerPhone]);

  // Calculate totals
  const subtotal = formData.items.reduce((sum, item) => {
    const qty = toQuantity(item.quantity);
    const salePrice = item.salePrice ?? item.rate;
    return sum + qty * salePrice;
  }, 0);
  const discountPercentValue = toNumber(formData.discountPercent);
  const discountAmountValue = toNumber(formData.discountAmount);
  const chargeValue = toNumber(formData.charge);
  const normalizedSplits = normalizePaymentSplits(formData.payment_splits);
  const paidSplitTotal = normalizedSplits
    .filter((split) => {
      if (!split.method) return false;
      if (isCodMethod(split.method) || isCreditMethod(split.method)) return false;
      return true;
    })
    .reduce((sum, split) => sum + split.amount, 0);
  const totalSplitPaid = normalizedSplits.reduce((sum, split) => sum + split.amount, 0);
  const splitMethods = formData.payment_splits
    .map((split) => split.method)
    .filter(Boolean);
  const hasCreditMethod = splitMethods.some((method) => isCreditMethod(method));
  const hasCodMethod = splitMethods.some((method) => isCodMethod(method));
  const amountPaidValue = paidSplitTotal;
  const creditSplitTotal = normalizedSplits
    .filter((split) => split.method && isCreditMethod(split.method))
    .reduce((sum, split) => sum + split.amount, 0);
  const displayPaidValue = paidSplitTotal + creditSplitTotal;
  const discountAmount = discountType === "percentage"
    ? (subtotal * discountPercentValue) / 100
    : discountAmountValue;
  const grandTotal = subtotal - discountAmount + chargeValue;
  const amountDue = grandTotal - amountPaidValue;
  const displayDue = Math.max(0, grandTotal - displayPaidValue);

  // Auto-update payment status based on amount paid
  useEffect(() => {
    if (formData.paymentStatus === "cancelled") return;
    if (amountPaidValue === 0) {
      setFormData(prev => ({ ...prev, paymentStatus: "pending" }));
    } else if (amountPaidValue >= grandTotal) {
      setFormData(prev => ({ ...prev, paymentStatus: "paid" }));
    } else {
      setFormData(prev => ({ ...prev, paymentStatus: "partial" }));
    }
  }, [amountPaidValue, grandTotal, formData.paymentStatus]);

  // Sync paid behavior defaults from payment method settings (no hardcoded fallbacks)
  useEffect(() => {
    if (paymentMethods.length === 0) return;
    setFormData(prev => {
      let changed = false;
      const nextSplits = prev.payment_splits.map((split) => {
        const methodConfig = getMethodConfig(split.method);
        if (!methodConfig) return split;
        if (methodConfig.default_paid_behavior === "full") {
          const hasSingleSplit = prev.payment_splits.length === 1;
          const currentAmount = Number(split.amount || 0);
          const splitIndex = prev.payment_splits.indexOf(split);
          if (hasSingleSplit && currentAmount <= 0 && !manualSplitEditsRef.current[splitIndex]) {
            changed = true;
            return { ...split, amount: String(grandTotal) };
          }
        }
        return split;
      });
      if (!changed) return prev;
      return { ...prev, payment_splits: nextSplits };
    });
  }, [paymentMethods, getMethodConfig, grandTotal]);

  // Auto-adjust last payment split when discount/charge changes
  // This keeps the last payment field synced with grandTotal - otherSplits
  // Works for both increasing AND decreasing discount amounts
  useEffect(() => {
    setFormData(prev => {
      // Only proceed if there's a last split with a method selected
      const lastSplitIndex = prev.payment_splits.length - 1;
      const lastSplit = prev.payment_splits[lastSplitIndex];
      if (!lastSplit || !lastSplit.method) return prev;

      // Calculate what the other splits total (excluding last)
      const otherSplitsTotal = prev.payment_splits.slice(0, -1).reduce((sum, split) => sum + Number(split.amount || 0), 0);

      // New amount for last split = grandTotal - other splits (but not less than 0)
      const newLastAmount = Math.max(0, grandTotal - otherSplitsTotal);

      // Only update if the new amount is different (avoid infinite loops)
      const currentLastAmount = Number(lastSplit.amount || 0);
      if (currentLastAmount !== newLastAmount) {
        const nextSplits = prev.payment_splits.map((split, i) =>
          i === lastSplitIndex ? { ...split, amount: String(newLastAmount) } : split
        );
        return { ...prev, payment_splits: nextSplits };
      }
      return prev;
    });
  }, [grandTotal, formData.discountAmount, formData.discountPercent, formData.charge]);

  const isModified = useMemo(() => {
    if (!isEditing || !initialFormStateRef.current) return true;
    return JSON.stringify(formData) !== JSON.stringify(initialFormStateRef.current);
  }, [formData, isEditing]);

  const clearSelectedCustomer = () => {
    setFormData(prev => ({
      ...prev,
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerWhatsapp: "",
      customerAddress: "",
      courier_name: "",
      additional_info: "",
    }));
  };

  const handleCustomerSelectFromName = (customer: any) => {
    setFormData(prev => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || "",
      customerWhatsapp: customer.whatsapp || "",
      customerAddress: customer.address || "",
      additional_info: customer.additional_info || "",
    }));
    setCustomerNameDropdownOpen(false);
  };

  const handleCustomerSelectFromPhone = (customer: any) => {
    setFormData(prev => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || "",
      customerWhatsapp: customer.whatsapp || "",
      customerAddress: customer.address || "",
      additional_info: customer.additional_info || "",
    }));
    setCustomerPhoneDropdownOpen(false);
  };

  const handleCustomerSelect = (customerId: string) => {
    if (!customerId) {
      clearSelectedCustomer();
      return;
    }
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setFormData(prev => ({
        ...prev,
        customerId,
        customerName: customer.name,
        customerPhone: customer.phone || "",
        customerWhatsapp: customer.whatsapp || "",
        customerAddress: customer.address || "",
        additional_info: customer.additional_info || "",
      }));
    }
  };

  const addSimpleProduct = (product: any) => {
    setHoverPreview(null);
    const existingItem = formData.items.find(
      item => (item.productId || item.product_id) === product.id
    );

    if (existingItem) {
      const index = formData.items.indexOf(existingItem);
      updateQuantity(index, toQuantity(existingItem.quantity) + 1);
    } else {
      setFormData(prev => ({
        ...prev,
        items: [
          ...prev.items,
          {
            productId: product.id,
            productName: product.name,
            productImageUrl: product.image_url || null,
            rate: product.rate,
            salePrice: product.rate,
            quantity: "1",
            total: product.rate,
            maxStock: product.stock_quantity ?? 0,
            originalQuantity: 0,
          },
        ],
      }));
    }

    setSelectedProductId("");
    setSelectedVariantId(null);
    setProductSearchTerm("");
    setProductComboOpen(false);
  };

  const addVariantProduct = (product: any, variant: any) => {
    setHoverPreview(null);
    const maxStock = variant.stock_quantity || 0;
    if (maxStock <= 0) {
      toast.error("Selected variant is out of stock");
      return;
    }

    const existingItemIndex = formData.items.findIndex(
      i => (i.productId || i.product_id) === product.id && (i.variantId || i.variant_id) === variant.id
    );
    const rate = (variant.rate ?? product.rate) as number;
    if (existingItemIndex >= 0) {
      const existing = formData.items[existingItemIndex];
      const existingQty = toNumber(existing.quantity);
      const newQty = Math.min(existingQty + 1, maxStock);
      updateQuantity(existingItemIndex, newQty);
    } else {
      const label = Object.entries(variant.attributes || {})
        .map(([k, v]) => `${v}`)
        .join(" / ");
      setFormData(prev => ({
        ...prev,
        items: [
          ...prev.items,
          {
            productId: product.id,
            productName: product.name,
            productImageUrl: product.image_url || null,
            rate,
            salePrice: rate,
            quantity: "1",
            total: rate,
            variantId: variant.id,
            variantLabel: label,
            variantImageUrl: variant.image_url || product.image_url || null,
            maxStock,
            originalQuantity: 0,
          },
        ],
      }));
    }

    // For variable products, only reset variant selection, keep product selected
    setSelectedVariantId(null);
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    const normalizedQuantity = toQuantity(newQuantity);
    if (normalizedQuantity <= 0) {
      removeItem(index);
      return;
    }
    const maxStock = formData.items[index]?.maxStock;
    const clampedQuantity = maxStock !== undefined && maxStock !== null
      ? Math.min(normalizedQuantity, maxStock)
      : normalizedQuantity;

    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index
          ? { ...item, quantity: String(clampedQuantity), total: clampedQuantity * (item.salePrice ?? item.rate) }
          : item
      )
    }));
  };

  const handleQuantityInputChange = (index: number, value: string) => {
    const qty = toQuantity(value);
    const maxStock = formData.items[index]?.maxStock;
    const clampedQty = maxStock !== undefined && maxStock !== null
      ? Math.min(qty, maxStock)
      : qty;
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index
          ? { ...item, quantity: String(clampedQty), total: clampedQty * (item.salePrice ?? item.rate) }
          : item
      )
    }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  useEffect(() => {
    if (!products.length || formData.items.length === 0) return;
    setFormData((prev) => {
      let changed = false;
      const nextItems = prev.items.map((item) => {
        const productId = item.productId || item.product_id;
        const product = products.find((p) => p.id === productId);
        if (!product) return item;
        const variantStock = item.variantId
          ? product.product_variants?.find((variant) => variant.id === item.variantId)?.stock_quantity
          : undefined;
        const liveStock = variantStock ?? product.stock_quantity ?? 0;

        // When editing a sale, we need to add back the original quantity to available stock
        // originalQuantity is set in EditSaleDialog for items that were already in the sale
        const originalQty = item.originalQuantity || 0;
        const nextMaxStock = Math.max(0, liveStock + originalQty);

        if (item.maxStock !== nextMaxStock) {
          changed = true;
          return {
            ...item,
            maxStock: nextMaxStock,
          };
        }
        return item;
      });
      return changed ? { ...prev, items: nextItems } : prev;
    });
  }, [products, formData.items.length]);

  const addPaymentSplit = () => {
    setFormData(prev => {
      const splits = prev.payment_splits;
      // Insert new empty row before COD/Credit rows so they stay at the bottom
      const firstSpecialIdx = splits.findIndex(s => isCodMethod(s.method) || isCreditMethod(s.method));
      const newSplit = { method: "", amount: "", _id: nextSplitId() };
      if (firstSpecialIdx >= 0) {
        const next = [...splits];
        next.splice(firstSpecialIdx, 0, newSplit);
        return { ...prev, payment_splits: next };
      }
      return { ...prev, payment_splits: [...splits, newSplit] };
    });
  };

  useEffect(() => {
    const targetLength = formData.payment_splits.length;
    const current = manualSplitEditsRef.current;
    if (current.length < targetLength) {
      manualSplitEditsRef.current = [
        ...current,
        ...Array(targetLength - current.length).fill(false),
      ];
    } else if (current.length > targetLength) {
      manualSplitEditsRef.current = current.slice(0, targetLength);
    }
  }, [formData.payment_splits.length]);

  // When the dialog opens, sanitize duplicate payment methods by clearing later duplicates.
  useEffect(() => {
    if (!open) return;
    setFormData((prev) => {
      const seen = new Set<string>();
      let changed = false;
      const nextSplits = prev.payment_splits.map((split) => {
        if (!split.method) return split;
        if (seen.has(split.method)) {
          changed = true;
          return { ...split, method: "" };
        }
        seen.add(split.method);
        return split;
      });
      return changed ? { ...prev, payment_splits: nextSplits } : prev;
    });
  }, [open]);

  const updatePaymentSplit = (index: number, field: "method" | "amount", value: string) => {
    setFormData(prev => {
      if (field === "amount") {
        manualSplitEditsRef.current[index] = true;
      }
      if (field === "method" && value) {
        const isDuplicateMethod = prev.payment_splits.some(
          (split, i) => i !== index && split.method === value
        );
        if (isDuplicateMethod) {
          toast.error("This payment method is already added");
          return prev;
        }
      }
      const nextSplits = prev.payment_splits.map((split, i) =>
        i === index ? { ...split, [field]: value } : split
      );
      const lastIndex = prev.payment_splits.length - 1;

      // Cap amount for fields to prevent total from exceeding grandTotal
      if (field === "amount") {
        if (index !== lastIndex) {
          // For non-last fields: cap based on grandTotal minus OTHER non-last fields only
          // (exclude the last field from calculation so user can freely edit upper fields)
          const otherNonLastTotal = nextSplits.reduce((sum, split, i) => {
            if (i === index || i === lastIndex) return sum;
            return sum + toNumber(split.amount);
          }, 0);
          const maxAllowed = Math.max(0, grandTotal - otherNonLastTotal);
          const currentAmount = Math.min(maxAllowed, toNumber(nextSplits[index].amount));
          nextSplits[index].amount = String(currentAmount);
        } else {
          // For the last field: cap based on grandTotal minus all other fields
          const otherTotal = nextSplits.reduce((sum, split, i) => {
            if (i === index) return sum;
            return sum + toNumber(split.amount);
          }, 0);
          const maxAllowed = Math.max(0, grandTotal - otherTotal);
          const currentAmount = Math.min(maxAllowed, toNumber(nextSplits[index].amount));
          nextSplits[index].amount = String(currentAmount);
        }
      }
      let nextTerms = prev.payment_terms;
      if (field === "method") {
        const methodConfig = getMethodConfig(value);
        if (methodConfig && methodConfig.default_terms !== "custom") {
          nextTerms = methodConfig.default_terms;
        }
        const currentAmount = Number(nextSplits[index].amount || 0);
        // For non-last fields, exclude last field from calculation
        const otherTotal = prev.payment_splits.reduce((sum, split, i) => {
          if (i === index) return sum;
          if (index !== lastIndex && i === lastIndex) return sum; // Skip last field for non-last
          return sum + toNumber(split.amount);
        }, 0);
        const remaining = Math.max(0, grandTotal - otherTotal);
        // Auto-fill with remaining amount only if no amount set yet
        if (!manualSplitEditsRef.current[index] && currentAmount <= 0) {
          nextSplits[index].amount = String(remaining);
        }
        // Cap amount when selecting method to prevent exceeding grandTotal
        if (currentAmount > remaining) {
          nextSplits[index].amount = String(remaining);
        }
        if (isCreditMethod(value) && !prev.credit_days) {
          const saleDate = prev.saleDate || getLocalDateInputValue();
          const dueDate = calculateDueDate(saleDate, 30);
          // Reposition credit before COD
          const creditSplit = nextSplits[index];
          const without = nextSplits.filter((_, i) => i !== index);
          const codIdx = without.findIndex(s => isCodMethod(s.method));
          const insertAt = codIdx >= 0 ? codIdx : without.length;
          without.splice(insertAt, 0, creditSplit);
          const oldEdits = [...manualSplitEditsRef.current];
          manualSplitEditsRef.current = without.map((s) => {
            const oldIdx = nextSplits.indexOf(s);
            return oldIdx >= 0 ? oldEdits[oldIdx] ?? false : false;
          });
          return {
            ...prev,
            payment_terms: nextTerms,
            payment_splits: without,
            credit_days: "30",
            due_date: dueDate,
          };
        }
      }
      // Auto-update the last payment split with remaining amount when editing other splits
      // This ensures the last field always shows: grandTotal - sum of other fields
      if (field === "amount" && prev.payment_splits.length > 1 && index !== lastIndex) {
        // Always update last field when editing any other field
        if (nextSplits[lastIndex]?.method) {
          const otherTotal = nextSplits.reduce((sum, split, i) => {
            if (i === lastIndex) return sum;
            return sum + toNumber(split.amount);
          }, 0);
          const remaining = Math.max(0, grandTotal - otherTotal);
          nextSplits[lastIndex] = { ...nextSplits[lastIndex], amount: String(remaining) };
        }
      }
      // Reposition the changed split to maintain order: regular → credit → cod
      if (field === "method" && value) {
        const split = nextSplits[index];
        const without = nextSplits.filter((_, i) => i !== index);
        let insertAt = without.length;
        if (isCodMethod(value)) {
          // COD always at the very end
          insertAt = without.length;
        } else if (isCreditMethod(value)) {
          // Credit goes before COD
          const codIdx = without.findIndex(s => isCodMethod(s.method));
          insertAt = codIdx >= 0 ? codIdx : without.length;
        } else {
          // Regular methods go before Credit/COD
          const specialIdx = without.findIndex(s => isCodMethod(s.method) || isCreditMethod(s.method));
          insertAt = specialIdx >= 0 ? specialIdx : without.length;
        }
        if (insertAt !== index || without.length !== nextSplits.length - 1) {
          without.splice(insertAt, 0, split);
          // Sync manualSplitEditsRef to match new positions
          const oldEdits = [...manualSplitEditsRef.current];
          manualSplitEditsRef.current = without.map((s) => {
            const oldIdx = nextSplits.indexOf(s);
            return oldIdx >= 0 ? oldEdits[oldIdx] ?? false : false;
          });
          return {
            ...prev,
            payment_terms: nextTerms,
            payment_splits: without,
          };
        }
      }
      return {
        ...prev,
        payment_terms: nextTerms,
        payment_splits: nextSplits,
      };
    });
  };

  const removePaymentSplit = (index: number) => {
    setFormData(prev => {
      const nextSplits = prev.payment_splits.filter((_, i) => i !== index);
      return {
        ...prev,
        payment_splits: nextSplits.length ? nextSplits : [{ method: "", amount: "", _id: nextSplitId() }]
      };
    });
  };

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === formData.customerId),
    [customers, formData.customerId]
  );

  const customerStats = useMemo(() => {
    if (!selectedCustomer) return null;
    const total = Number(selectedCustomer.order_count || 0);
    const received = Number(selectedCustomer.delivered_count || 0);
    const returned = Number(selectedCustomer.returned_count || 0);
    const pending = selectedCustomer.pending_count !== undefined
      ? Number(selectedCustomer.pending_count || 0)
      : Math.max(0, total - received - returned - Number(selectedCustomer.cancelled_count || 0));

    return { total, pending, received, returned };
  }, [selectedCustomer]);

  const formatCount = (value: number) => value.toLocaleString("en-US");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (formData.items.length === 0) {
      toast.error("Please add at least one product");
      return;
    }

    if (!formData.customerName.trim()) {
      toast.error("Please enter customer name");
      return;
    }
    if (!formData.courier_name || !formData.courier_name.trim()) {
      toast.error("Please select a delivery option");
      return;
    }

    const stockIssues = formData.items
      .map((item) => {
        const productId = item.productId || item.product_id;
        const product = products.find((p) => p.id === productId);
        const variantStock = item.variantId
          ? product?.product_variants?.find((variant) => variant.id === item.variantId)?.stock_quantity
          : undefined;
        const liveStock = variantStock ?? product?.stock_quantity;

        // When editing, maxStock already includes originalQuantity added back
        // So we can use it directly for validation
        const maxStock = item.maxStock ?? liveStock;
        if (maxStock === undefined || maxStock === null) return null;

        const requestedQty = toQuantity(item.quantity);

        // Check if requested quantity exceeds available stock
        // For editing: maxStock = current_stock + originalQuantity (already added in EditSaleDialog)
        // For new sales: maxStock = current_stock (originalQuantity is 0)
        if (requestedQty > maxStock) {
          // Calculate actual available stock for error message
          const originalQty = item.originalQuantity || 0;
          const actualAvailableStock = liveStock ?? 0;
          const displayStock = actualAvailableStock + originalQty;

          return {
            name: item.productName || item.product_name || product?.name || "Product",
            maxStock: displayStock,
          };
        }
        return null;
      })
      .filter(Boolean) as Array<{ name: string; maxStock: number }>;

    if (stockIssues.length > 0) {
      const first = stockIssues[0];
      toast.error(`"${first.name}" only has ${first.maxStock} in stock.`);
      return;
    }

    setIsSubmitting(true);

    const normalizedSplits = normalizePaymentSplits(formData.payment_splits);
    const splitsTotal = normalizedSplits.reduce((sum, split) => sum + split.amount, 0);
    const dueRemaining = Math.max(0, grandTotal - splitsTotal);
    const codKey = paymentMethods.find((method) => isCodMethod(method.key))?.key || "cod";
    const creditKey = paymentMethods.find((method) => isCreditMethod(method.key))?.key || "credit";
    const desiredDueTerms: "immediate" | "cod" | "credit" =
      formData.payment_terms === "credit" || hasCreditMethod
        ? "credit"
        : formData.payment_terms === "cod" || hasCodMethod || dueRemaining > 0
          ? "cod"  // Auto-default to COD if there's any due amount
          : "immediate";
    const finalSplits = (() => {
      const updated = [...normalizedSplits];
      const dueIndex = updated.findIndex((split) =>
        desiredDueTerms === "credit"
          ? isCreditMethod(split.method)
          : desiredDueTerms === "cod"
            ? isCodMethod(split.method)
            : false
      );
      if (dueIndex >= 0) {
        const otherTotal = updated.reduce((sum, split, i) => {
          if (i === dueIndex) return sum;
          return sum + split.amount;
        }, 0);
        const remaining = Math.max(0, grandTotal - otherTotal);
        updated[dueIndex] = {
          ...updated[dueIndex],
          amount: remaining,
        };
        return updated;
      }
      if (dueRemaining > 0) {
        if (desiredDueTerms === "credit") {
          return [...updated, { method: creditKey, amount: dueRemaining }];
        }
        if (desiredDueTerms === "cod") {
          return [...updated, { method: codKey, amount: dueRemaining }];
        }
      }
      return updated;
    })();
    const uniqueSplitMethods = Array.from(new Set(finalSplits.map((split) => split.method).filter(Boolean)));
    const hasCreditFinal = uniqueSplitMethods.some((method) => isCreditMethod(method));
    const hasCodFinal = uniqueSplitMethods.some((method) => isCodMethod(method));
    const normalizedPaymentMethod = uniqueSplitMethods.length === 1
      ? uniqueSplitMethods[0]
      : uniqueSplitMethods.length > 1
        ? "mixed"
        : formData.paymentMethod;

    const saleDateValue = formData.saleDate || getLocalDateInputValue();
    if (!isValidDateInput(saleDateValue)) {
      toast.error("Enter the sale date in DD/MM/YYYY format.");
      setIsSubmitting(false);
      return;
    }

    const normalizedData: SaleFormData = {
      ...formData,
      saleDate: saleDateValue,
      customerWhatsapp: formData.customerWhatsapp || buildWhatsappFromPhone(formData.customerPhone),
      paymentMethod: normalizedPaymentMethod,
      amountPaid: amountPaidValue,
      payment_splits: finalSplits,
      discountPercent: discountPercentValue,
      discountAmount: discountAmountValue,
      charge: chargeValue,
      payment_terms: hasCreditFinal ? "credit" : hasCodFinal ? "cod" : "immediate",
      ...(hasCreditFinal ? {
        credit_days: parseInt(formData.credit_days || "30") || 30,
        due_date: formData.due_date || calculateDueDate(saleDateValue, 30)
      } : {
        credit_days: undefined,
        due_date: null
      }),
      items: formData.items.map(item => ({
        ...item,
        product_image_url: item.productImageUrl ?? item.product_image_url ?? null,
        variant_image_url: item.variantImageUrl ?? item.variant_image_url ?? null,
        quantity: toNumber(item.quantity),
        total: toNumber(item.quantity) * (item.salePrice ?? item.rate),
      })),
    };

    try {
      await onSubmit(normalizedData, {
        subtotal,
        discountAmount,
        grandTotal,
        amountDue
      });
      clearDraftState();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Loading sale data and preparing the form.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <div className="text-muted-foreground">Loading sale data...</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-6xl max-h-[90vh] overflow-y-auto p-3 sm:p-4"
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 !px-0 !py-1 md:!py-1 text-left">
            <DialogTitle className="text-[1.75rem] leading-none">{title}</DialogTitle>
            <div className="flex items-center pr-8">
              <Input
                type="text"
                value={formData.saleDate}
                onChange={(e) => updateSaleDate(e.target.value)}
                inputMode="numeric"
                maxLength={10}
                placeholder="dd/MM/yyyy"
                aria-invalid={Boolean(formData.saleDate) && !isValidDateInput(formData.saleDate)}
                className="date-input-tight w-[150px] shrink-0 pl-2 pr-1"
              />
            </div>
          </DialogHeader>

          <form
            onSubmit={handleSubmit}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const target = event.target as HTMLElement | null;
              const tagName = target?.tagName?.toLowerCase();
              if (tagName === "textarea") return;
              if (tagName === "button") return;
              event.preventDefault();
            }}
            className="space-y-8"
          >
            {/* Customer Details */}
            <Card className="overflow-hidden border-2 bg-gradient-to-r from-info/50 to-secondary/50">
              <CardHeader className="!flex-none !flex-row !items-center !space-y-0 rounded-t-xl border-b bg-gradient-to-r from-info/30 to-secondary/30 !px-4 !py-3">
                <div className="flex w-full items-center gap-3">
                  <CardTitle className="shrink-0 text-base leading-none text-info">Customer Details</CardTitle>
                  {formData.customerId && customerStats && (
                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 md:grid-cols-4">
                      {[
                        { label: "Total Orders", value: customerStats.total, tone: "text-foreground" },
                        { label: "Pending Orders", value: customerStats.pending, tone: "text-warning" },
                        { label: "Received Orders", value: customerStats.received, tone: "text-success" },
                        { label: "Returned Orders", value: customerStats.returned, tone: "text-destructive" },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-lg border bg-background/60 px-3 py-2.5 shadow-sm"
                        >
                          {isCustomersLoading ? (
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{stat.label}</div>
                              <div className="h-6 w-14 animate-pulse rounded bg-muted" />
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{stat.label}</div>
                              <div className={`text-lg font-semibold ${stat.tone}`}>
                                {formatCount(stat.value)}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isEditing && (
                    <div className="ml-auto flex items-center gap-2">
                      <Button type="submit" disabled={formData.items.length === 0 || isSubmitting || isLoading || (isEditing && !isModified)}>
                        {isSubmitting ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Updating...
                          </span>
                        ) : (
                          "Update Sale"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <div className="relative">
                      <Select
                        key={formData.customerId || 'no-customer'}
                        value={formData.customerId ? formData.customerId : undefined}
                        onValueChange={handleCustomerSelect}
                        onOpenChange={(open) => {
                          if (!open) {
                            setCustomerNameDropdownOpen(false);
                            setCustomerPhoneDropdownOpen(false);
                          }
                        }}
                      >
                        <SelectTrigger className={formData.customerId ? "pr-10" : undefined}>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[min(60vh,420px)] overflow-y-auto">
                          {customers.map(customer => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name} {customer.phone && `- ${customer.phone}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formData.customerId && (
                        <button
                          type="button"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            clearSelectedCustomer();
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-50 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
                          aria-label="Clear selected customer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <div className="relative">
                      <Input
                        value={formData.customerName}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, customerName: e.target.value }));
                          setCustomerNameDropdownOpen(true);
                        }}
                        onFocus={() => setCustomerNameDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setCustomerNameDropdownOpen(false), 200)}
                        placeholder="Customer name"
                        required
                      />
                      {customerNameDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 z-50 bg-background border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {filteredCustomersByName.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                              No customers found
                            </div>
                          ) : (
                            filteredCustomersByName.map(customer => (
                              <div
                                key={customer.id}
                                className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                                onClick={() => handleCustomerSelectFromName(customer)}
                              >
                                <div className="font-medium">{customer.name}</div>
                                {(customer.alias_names || []).length > 0 && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    Aliases: {(customer.alias_names || []).join(", ")}
                                  </div>
                                )}
                                {customer.phone && (
                                  <div className="text-sm text-muted-foreground">{customer.phone}</div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <div className="relative">
                      <Input
                        value={formData.customerPhone || ""}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, customerPhone: e.target.value }));
                          setCustomerPhoneDropdownOpen(true);
                        }}
                        onFocus={() => setCustomerPhoneDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setCustomerPhoneDropdownOpen(false), 200)}
                        placeholder="Phone"
                      />
                      {customerPhoneDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 z-50 bg-background border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {filteredCustomersByPhone.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                              No customers found
                            </div>
                          ) : (
                            filteredCustomersByPhone.map(customer => (
                              <div
                                key={customer.id}
                                className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                                onClick={() => handleCustomerSelectFromPhone(customer)}
                              >
                                <div className="font-medium">{customer.name}</div>
                                {(customer.alias_names || []).length > 0 && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    Aliases: {(customer.alias_names || []).join(", ")}
                                  </div>
                                )}
                                <div className="text-sm text-muted-foreground">{customer.phone}</div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input
                      value={formData.customerAddress || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, customerAddress: e.target.value }))}
                      placeholder="Address"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Delivery Option</Label>
                    <Select
                      value={formData.courier_name || ""}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, courier_name: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select delivery option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Store Pickup">Store Pickup</SelectItem>
                        <SelectItem value="Local Rider">Local Rider</SelectItem>
                        <SelectItem value="Sundorban">Sundorban</SelectItem>
                        <SelectItem value="Janani">Janani</SelectItem>
                        <SelectItem value="SR">SR</SelectItem>
                        <SelectItem value="AJR">AJR</SelectItem>
                        <SelectItem value="Karatoa">Karatoa</SelectItem>
                        <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                        <SelectItem value="Ahmed">Ahmed</SelectItem>
                        <SelectItem value="Steadfast">Steadfast</SelectItem>
                        <SelectItem value="Pathao">Pathao</SelectItem>
                        <SelectItem value="SA">SA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>CN Number</Label>
                    <Input
                      value={formData.cn_number || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, cn_number: e.target.value }))}
                      placeholder="Consignment number"
                    />
                  </div>
                </div>

                {/* Additional Info */}
                <div className="space-y-2">
                  <Label>Additional Info</Label>
                  <Input
                    value={formData.additional_info || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, additional_info: e.target.value }))}
                    placeholder="Additional info"
                  />
                </div>

              </CardContent>
            </Card>

            {/* Product Selection */}
            <Card className="relative z-20 overflow-visible border-2 bg-gradient-to-r from-success/50 to-success/50">
              <CardHeader className="!flex-none !space-y-0 rounded-t-xl border-b bg-gradient-to-r from-success/30 to-success/30 !px-4 !py-3">
                <CardTitle className="text-base leading-none text-success">Add Products</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Search products..."
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      onFocus={() => setProductComboOpen(true)}
                      className="pr-10"
                    />
                    {productSearchTerm && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setProductSearchTerm("");
                          setProductComboOpen(false);
                          setSelectedProductId("");
                          setSelectedVariantId(null);
                          setVariantSelectOpen(false);
                        }}
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {productComboOpen && productSearchTerm && (
                      <div className="absolute top-full left-0 right-0 z-50 bg-background border border-border rounded-md shadow-lg max-h-80 overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No products found
                          </div>
                        ) : (
                          filteredProducts.map(product => {
                            const isSelected = formData.items.some(item =>
                              (item.productId || item.product_id) === product.id
                            );

                            return (
                              <div
                                key={product.id}
                                className={`p-3 border-b last:border-b-0 flex items-center gap-3 ${isSelected
                                  ? 'bg-base-100 dark:bg-base-300'
                                  : 'hover:bg-accent cursor-pointer'
                                  }`}
                                onClick={() => {
                                  setHoverPreview(null);
                                  if (!product.has_variants) {
                                    addSimpleProduct(product);
                                    return;
                                  }

                                  // Only reset variant selection if switching to a different product
                                  if (selectedProductId !== product.id) {
                                    setSelectedVariantId(null);
                                  }
                                  setSelectedProductId(product.id);
                                  setProductSearchTerm(product.name);
                                  setProductComboOpen(false);
                                }}
                              >
                                <div
                                  className="flex-shrink-0"
                                  onPointerEnter={resolveImageUrl(product.image_url) ? handlePreviewPointerEnter(resolveImageUrl(product.image_url) as string, product.name) : undefined}
                                  onPointerLeave={handlePreviewPointerLeave}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const resolvedUrl = resolveImageUrl(product.image_url);
                                    if (resolvedUrl) {
                                      setHoverPreview({ url: resolvedUrl, name: product.name });
                                    }
                                  }}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                >
                                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-md overflow-hidden bg-muted">
                                    {resolveImageUrl(product.image_url) ? (
                                      <img
                                        src={resolveImageUrl(product.image_url) as string}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                                        <ProductIcon className="w-6 h-6" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate flex items-center gap-2">
                                    {product.name}
                                    {isSelected && (
                                      <span className="text-xs bg-success/12 text-success px-2 py-1 rounded-full">
                                        Added
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {currencySymbol}{product.rate}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {selectedProduct?.has_variants && (
                  <div className="mt-4 space-y-2">
                    <Label>Variant</Label>
                    <Select
                      open={variantSelectOpen}
                      onOpenChange={(nextOpen) => {
                        if (!nextOpen && suppressVariantCloseRef.current) {
                          suppressVariantCloseRef.current = false;
                          setVariantSelectOpen(true);
                          return;
                        }
                        setVariantSelectOpen(nextOpen);
                      }}
                      value={selectedVariantId ?? ""}
                      onValueChange={(v) => {
                        suppressVariantCloseRef.current = true;
                        setSelectedVariantId(v);
                        const variant = currentVariants.find(item => item.id === v);
                        if (!variant || !selectedProduct) return;
                        addVariantProduct(selectedProduct, variant);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select variant" />
                      </SelectTrigger>
                      <SelectContent>
                        {currentVariants.map(v => {
                          const label = Object.entries(v.attributes || {}).map(([k, val]) => `${val}`).join(" / ");
                          const isOutOfStock = (v.stock_quantity || 0) <= 0;
                          const existingItemIndex = formData.items.findIndex(item =>
                            (item.productId || item.product_id) === selectedProductId &&
                            (item.variantId || item.variant_id) === v.id
                          );
                          const isInCart = existingItemIndex >= 0;
                          const disabled = isOutOfStock;

                          const variantImageUrl = resolveImageUrl(v.image_url || selectedProduct?.image_url || null);

                          return (
                            <SelectItem
                              key={v.id}
                              value={v.id}
                              disabled={disabled}
                              className="pl-3 pr-3 py-2 data-[state=checked]:pl-3"
                            >
                              <div className="flex items-center justify-between w-full gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden bg-muted flex-shrink-0"
                                    onPointerEnter={variantImageUrl ? handlePreviewPointerEnter(variantImageUrl, `${selectedProduct?.name || "Variant"} ${label}`) : undefined}
                                    onPointerLeave={handlePreviewPointerLeave}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (variantImageUrl) {
                                        setHoverPreview({
                                          url: variantImageUrl,
                                          name: `${selectedProduct?.name || "Variant"} ${label}`,
                                        });
                                      }
                                    }}
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                  >
                                    {variantImageUrl ? (
                                      <img
                                        src={variantImageUrl}
                                        alt={`${label} variant`}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                                        <ProductIcon className="w-6 h-6" />
                                      </div>
                                    )}
                                  </div>
                                  <span className="truncate">
                                    {label} - {currencySymbol}{v.rate || selectedProduct.rate}
                                    {isInCart && (
                                      <span className="ml-2 text-xs bg-success/12 text-success px-1 py-0.5 rounded">
                                        Added
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {isOutOfStock ? "Out of stock" : `${v.stock_quantity} in stock`}
                                  </span>
                                  {isInCart && (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-error/35 text-error hover:bg-error/12"
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                      }}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        removeItem(existingItemIndex);
                                      }}
                                      aria-label="Remove variant"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Products */}
            {formData.items.length > 0 && (
              <Card className="overflow-hidden border-2 bg-gradient-to-r from-secondary/50 to-secondary/50">
                <CardHeader className="!flex-none !space-y-0 rounded-t-xl border-b bg-gradient-to-r from-secondary/30 to-secondary/30 !px-4 !py-3">
                  <CardTitle className="text-base leading-none text-secondary">Selected Products</CardTitle>
                </CardHeader>
                <CardContent className="w-full p-4">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow className="hidden sm:table-row">
                        <TableHead className="w-[45%]">Product</TableHead>
                        <TableHead className="hidden sm:table-cell w-[8%] text-center">Rate</TableHead>
                        <TableHead className="w-[25%] text-center">Quantity</TableHead>
                        <TableHead className="hidden sm:table-cell w-[12%] text-center">Total</TableHead>
                        <TableHead className="w-[10%] text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formData.items.map((item, index) => {
                        const product = products.find(p => p.id === (item.productId || item.product_id));
                        const variantStock = item.variantId
                          ? product?.product_variants?.find((variant) => variant.id === item.variantId)?.stock_quantity
                          : undefined;
                        const liveStock = variantStock ?? product?.stock_quantity;
                        const isCancelledSale = String(formData.paymentStatus || "").toLowerCase() === "cancelled";
                        const baseStock = liveStock !== undefined
                          ? isCancelledSale
                            ? liveStock
                            : liveStock + (item.originalQuantity ?? 0)
                          : item.maxStock;
                        const remainingStock = baseStock !== undefined
                          ? Math.max(0, isCancelledSale ? baseStock : baseStock - toQuantity(item.quantity))
                          : undefined;
                        const stockExceeded = baseStock !== undefined && toQuantity(item.quantity) > baseStock;
                        const stockOut = baseStock !== undefined && baseStock <= 0;
                        return (
                          <TableRow
                            key={`${item.productId || item.product_id}-${index}`}
                            className={`block w-full sm:table-row ${stockExceeded || stockOut ? "bg-error/12" : ""}`}
                          >
                            <TableCell
                              className={`block w-full px-1 sm:table-cell sm:p-4 ${index === 0 ? "pt-0" : "pt-3"
                                } ${index === formData.items.length - 1 ? "pb-0" : "pb-3"}`}
                            >
                              <div className="flex items-start gap-3 sm:items-center">
                                {(() => {
                                  const displayImageUrl = resolveImageUrl(
                                    item.variantImageUrl
                                    || item.productImageUrl
                                    || item.product_image_url
                                    || product?.image_url
                                    || null
                                  );
                                  return (
                                    <div
                                      className="flex-shrink-0"
                                      onPointerEnter={displayImageUrl ? handlePreviewPointerEnter(displayImageUrl, product?.name || "Product") : undefined}
                                      onPointerLeave={handlePreviewPointerLeave}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (displayImageUrl) {
                                          setHoverPreview({ url: displayImageUrl, name: product?.name || "Product" });
                                        }
                                      }}
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                      }}
                                    >
                                      <div className="w-20 h-20 sm:w-20 sm:h-20 rounded-md overflow-hidden bg-muted">
                                        {displayImageUrl ? (
                                          <img
                                            src={displayImageUrl}
                                            alt={product?.name || "Product"}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                          />
                                        ) : (
                                          <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                                            <ProductIcon className="w-6 h-6" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div className="relative min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2 font-medium break-words">
                                    <span>{item.productName || item.product_name}</span>
                                    {remainingStock !== undefined && (
                                      <span
                                        className={`hidden sm:inline rounded-full px-2 py-0.5 text-xs ${stockExceeded || stockOut
                                          ? "bg-error/12 text-error"
                                          : "bg-success/12 text-success"
                                          }`}
                                      >
                                        {stockExceeded ? `${baseStock} in stock` : `${remainingStock} in stock`}
                                      </span>
                                    )}
                                  </div>
                                  {item.variantLabel && (
                                    <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground break-words sm:block">
                                      <span>{item.variantLabel}</span>
                                    </div>
                                  )}
                                  {remainingStock !== undefined && (
                                    <span
                                      className={`sm:hidden absolute right-0 top-0 rounded-full px-2 py-0.5 text-xs ${stockExceeded || stockOut
                                        ? "bg-error/12 text-error"
                                        : "bg-success/12 text-success"
                                        }`}
                                    >
                                      {stockExceeded ? baseStock : remainingStock}
                                    </span>
                                  )}
                                  {(stockExceeded || stockOut) && (
                                    <div className="mt-1 text-xs text-error">
                                      {stockOut
                                        ? "Out of stock. Please adjust quantity."
                                        : "Quantity exceeds stock. Please adjust."}
                                    </div>
                                  )}
                                  <div className="mt-1 text-xs text-muted-foreground sm:hidden">
                                    {formatAmount(item.rate)}
                                  </div>
                                  <div className="mt-2 ml-auto flex w-full items-center justify-end gap-2 text-right sm:hidden">
                                    <span className="text-sm text-muted-foreground">{formatAmount(item.total)}</span>
                                    <div className="flex items-center rounded-xl border bg-background px-0.5 py-0.5">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateQuantity(index, toNumber(item.quantity) - 1)}
                                        disabled={toNumber(item.quantity) <= 1}
                                        className="h-7 w-7 rounded-xl p-0"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={item.quantity}
                                        onChange={(e) => handleQuantityInputChange(index, e.target.value)}
                                        className="h-7 w-auto min-w-[3ch] border-0 bg-transparent px-1 py-0 text-center shadow-none focus-visible:ring-0"
                                        style={{ width: `${Math.max(3, String(item.quantity).length + 1)}ch` }}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateQuantity(index, toNumber(item.quantity) + 1)}
                                        disabled={item.maxStock ? toNumber(item.quantity) >= item.maxStock : false}
                                        className="h-7 w-7 rounded-xl p-0"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeItem(index)}
                                      className="h-8 w-8 p-0 text-error hover:text-error"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-center align-middle">{formatAmount(item.rate)}</TableCell>
                            <TableCell className="hidden sm:table-cell sm:p-4 text-center">
                              <div className="flex flex-nowrap items-center justify-center gap-3">
                                <div className="flex items-center rounded-xl border bg-background px-1 py-0.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateQuantity(index, toNumber(item.quantity) - 1)}
                                    disabled={toNumber(item.quantity) <= 1}
                                    className="h-8 w-8 rounded-xl p-0"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={item.quantity}
                                    onChange={(e) => handleQuantityInputChange(index, e.target.value)}
                                    className="h-8 w-12 border-0 bg-transparent text-center shadow-none focus-visible:ring-0"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateQuantity(index, toNumber(item.quantity) + 1)}
                                    disabled={item.maxStock ? toNumber(item.quantity) >= item.maxStock : false}
                                    className="h-8 w-8 rounded-xl p-0"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-center align-middle">{formatAmount(item.total)}</TableCell>
                            <TableCell className="hidden sm:table-cell text-center align-middle">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItem(index)}
                                className="text-error hover:text-error"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Invoice Preview */}
            {formData.items.length > 0 && (() => {
              const grouped = formData.items.reduce((acc, item) => {
                const productId = item.productId || item.product_id || "";
                const productName = item.productName || item.product_name || "Item";
                const rate = toNumber(item.rate);
                const salePrice = item.salePrice ?? item.rate;
                // Group by product + sale price (variants are listed together).
                const key = `${productId}::${salePrice ?? rate}`;
                const quantity = toQuantity(item.quantity);
                const unitPrice = salePrice ?? rate;
                if (!acc[key]) {
                  acc[key] = {
                    key,
                    productId,
                    productName,
                    rate,
                    salePrice: unitPrice,
                    quantity: 0,
                    total: 0,
                    variants: new Set<string>(),
                  };
                }
                acc[key].quantity += quantity;
                acc[key].total += quantity * unitPrice;
                if (item.variantLabel) {
                  acc[key].variants.add(item.variantLabel);
                }
                return acc;
              }, {} as Record<string, { key: string; productId: string; productName: string; rate: number; salePrice: number; quantity: number; total: number; variants: Set<string> }>);

              const rows = Object.values(grouped);
              const handleGroupSalePriceChange = (groupKey: string, nextValue: string) => {
                const nextPrice = nextValue === "" ? undefined : toNumber(nextValue);
                setFormData((prev) => ({
                  ...prev,
                  items: prev.items.map((item) => {
                    const productId = item.productId || item.product_id || "";
                    const itemRate = toNumber(item.rate);
                    const currentSalePrice = item.salePrice ?? item.rate;
                    const key = `${productId}::${currentSalePrice ?? itemRate}`;
                    if (key !== groupKey) return item;
                    const price = nextPrice ?? itemRate;
                    const qty = toQuantity(item.quantity);
                    return {
                      ...item,
                      salePrice: nextPrice,
                      total: price * qty,
                    };
                  }),
                }));
              };
              const handleGroupSalePriceDraftChange = (groupKey: string, nextValue: string) => {
                setSalePriceDrafts((prev) => ({
                  ...prev,
                  [groupKey]: nextValue,
                }));
              };
              const commitGroupSalePriceDraft = (groupKey: string) => {
                const draft = salePriceDrafts[groupKey];
                if (draft === undefined) return;
                handleGroupSalePriceChange(groupKey, draft);
                setSalePriceDrafts((prev) => {
                  const next = { ...prev };
                  delete next[groupKey];
                  return next;
                });
              };

              return (
                <Card className="overflow-hidden border-2 bg-gradient-to-r from-success/50 to-accent/50">
                  <CardHeader className="!flex-none !space-y-0 rounded-t-xl border-b bg-gradient-to-r from-success/30 to-accent/30 !px-4 !py-3">
                    <CardTitle className="text-base leading-none text-success">Invoice Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="w-full p-4">
                    <Table className="w-full table-fixed">
                      <TableHeader>
                        <TableRow className="hidden sm:table-row">
                          <TableHead className="w-[45%]">Item Description</TableHead>
                          <TableHead className="w-[10%] text-center">Qty</TableHead>
                          <TableHead className="w-[15%] text-center">Price</TableHead>
                          <TableHead className="w-[15%] text-center">Sale Price</TableHead>
                          <TableHead className="w-[15%] text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((group) => {
                          const variantLabel = Array.from(group.variants).join(" + ");
                          const description = `${group.productName}${variantLabel ? ` * ${variantLabel}` : ""}`;
                          return (
                            <TableRow key={`memo-${group.key}`} className="block sm:table-row">
                              <TableCell className="block sm:table-cell sm:align-top">
                                <div className="break-words text-sm font-medium">{description}</div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:hidden">
                                  <div>
                                    <span className="font-medium text-foreground">Qty:</span> {group.quantity}
                                  </div>
                                  <div>
                                    <span className="font-medium text-foreground">Price:</span> {formatAmount(group.rate)}
                                  </div>
                                  <div className="col-span-2 flex items-center gap-2">
                                    <span className="font-medium text-foreground">Sale:</span>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      pattern="[0-9.]*"
                                      value={salePriceDrafts[group.key] ?? String(group.salePrice ?? group.rate)}
                                      onChange={(e) => {
                                        handleGroupSalePriceDraftChange(group.key, e.target.value);
                                      }}
                                      onBlur={() => {
                                        commitGroupSalePriceDraft(group.key);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          commitGroupSalePriceDraft(group.key);
                                        }
                                      }}
                                      className="h-7 w-[110px] text-center"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <span className="font-medium text-foreground">Amount:</span>{" "}
                                    {formatAmount(group.total)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-center align-top">{group.quantity}</TableCell>
                              <TableCell className="hidden sm:table-cell text-center align-top">{formatAmount(group.rate)}</TableCell>
                              <TableCell className="hidden sm:table-cell text-center align-top">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  pattern="[0-9.]*"
                                  value={salePriceDrafts[group.key] ?? String(group.salePrice ?? group.rate)}
                                  onChange={(e) => {
                                    handleGroupSalePriceDraftChange(group.key, e.target.value);
                                  }}
                                  onBlur={() => {
                                    commitGroupSalePriceDraft(group.key);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      commitGroupSalePriceDraft(group.key);
                                    }
                                  }}
                                  className="h-8 w-[100px] text-center"
                                />
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-right align-top">
                                {formatAmount(group.total)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Payment & Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="overflow-hidden border-2 bg-gradient-to-r from-warning/50 to-warning/50">
                <CardHeader className="!flex-none !space-y-0 rounded-t-xl border-b bg-gradient-to-r from-warning/30 to-warning/30 !px-4 !py-3">
                  <CardTitle className="text-base leading-none text-warning">Payment Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  {/* Charge, Discount Amount, and Discount Type Toggle on same line */}
                  <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto] gap-3 items-end">
                    <div className="space-y-2">
                      <Label>Charge</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        value={formData.charge}
                        onChange={(e) => setFormData(prev => ({ ...prev, charge: e.target.value }))}
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Discount Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        max={discountType === "percentage" ? "100" : String(subtotal)}
                        step="1"
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        value={discountType === "percentage" ? formData.discountPercent : formData.discountAmount}
                        onChange={(e) => {
                          let value = e.target.value;
                          // Cap discount: percentage max 100, fixed max subtotal
                          if (discountType === "percentage") {
                            const numVal = Number(value);
                            if (numVal > 100) value = "100";
                          } else {
                            const numVal = Number(value);
                            if (numVal > subtotal) value = String(subtotal);
                          }
                          setFormData(prev => ({
                            ...prev,
                            discountPercent: discountType === "percentage" ? value : prev.discountPercent,
                            discountAmount: discountType === "fixed" ? value : prev.discountAmount,
                          }));
                        }}
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Type</Label>
                      <div className="flex h-10 items-center gap-2 rounded-xl border px-3 py-1.5">
                        <Switch
                          checked={discountType === "percentage"}
                          onCheckedChange={(checked) => setDiscountType(checked ? "percentage" : "fixed")}
                        />
                        <span className="text-sm font-semibold text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>


                  {/* Payment Methods */}
                  <div className="space-y-2">
                    <Label>Payment Methods</Label>
                    <div className="space-y-2">
                      {formData.payment_splits.map((split, index) => (
                        <div key={split._id || `payment-split-${index}`} className="flex items-center gap-2">
                          {(() => {
                            const methodsUsedByOthers = new Set(
                              formData.payment_splits
                                .filter((_, i) => i !== index)
                                .map((s) => s.method)
                                .filter(Boolean)
                            );
                            const optionsForRow = paymentMethodOptions.filter(
                              (option) => option.key === split.method || !methodsUsedByOthers.has(option.key)
                            );
                            return (
                              <Select
                                value={split.method}
                                onValueChange={(value) => updatePaymentSplit(index, "method", value)}
                              >
                                <SelectTrigger className={cn(
                                  "h-9",
                                  split.method ? "w-[170px]" : "w-full"
                                )}>
                                  <SelectValue placeholder="Select payment method" />
                                </SelectTrigger>
                                <SelectContent>
                                  {optionsForRow.map((option) => (
                                    <SelectItem key={option.key} value={option.key} disabled={!option.enabled}>
                                      {option.label}{!option.enabled ? " (disabled)" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                          {split.method && (
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={split.amount}
                              onChange={(e) => updatePaymentSplit(index, "amount", e.target.value)}
                              placeholder="0"
                              className="h-9 flex-1"
                            />
                          )}
                          {isCreditMethod(split.method) && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Days</Label>
                              <Input
                                type="number"
                                min="1"
                                max="365"
                                value={formData.credit_days}
                                onChange={(e) => {
                                  const days = parseInt(e.target.value) || 0;
                                  const saleDate = formData.saleDate || getLocalDateInputValue();
                                  const dueDate = days > 0 ? calculateDueDate(saleDate, days) : null;
                                  setFormData(prev => ({
                                    ...prev,
                                    credit_days: e.target.value,
                                    due_date: dueDate
                                  }));
                                }}
                                placeholder="30"
                                className="h-9 w-[90px]"
                              />
                            </div>
                          )}
                          {formData.payment_splits.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removePaymentSplit(index)}
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {split.method && index === formData.payment_splits.length - 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={addPaymentSplit}
                              className="h-9 w-9 rounded-xl"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {hasCreditMethod && formData.due_date && (
                    <p className="text-sm text-muted-foreground">
                      Due Date: {formData.due_date}
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label>Order Status</Label>
                    <Select value={formData.paymentStatus} onValueChange={(value) => {
                      if (value === "paid") {
                        // When "Paid" is selected, automatically set amount paid to grand total
                        setFormData(prev => ({
                          ...prev,
                          paymentStatus: value,
                          amountPaid: String(grandTotal)
                        }));
                      } else {
                        setFormData(prev => ({ ...prev, paymentStatus: value }));
                      }
                    }}>
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
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-2 bg-gradient-to-r from-accent/50 to-info/50">
                <CardHeader className="!flex-none !space-y-0 rounded-t-xl border-b bg-gradient-to-r from-accent/30 to-info/30 !px-4 !py-3">
                  <CardTitle className="text-base leading-none text-accent">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatAmount(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-{formatAmount(discountAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Charge:</span>
                    <span>{formatAmount(toNumber(formData.charge))}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg border-t pt-2">
                    <span>Grand Total:</span>
                    <span>{formatAmount(grandTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount Paid:</span>
                    <span>{formatAmount(displayPaidValue)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Amount Due:</span>
                    <span className={displayDue > 0 ? "text-destructive" : "text-success"}>
                      {formatAmount(displayDue)}
                    </span>
                  </div>
                  <div className="hidden md:flex justify-end gap-4 pt-4">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={formData.items.length === 0 || isSubmitting || isLoading || (isEditing && !isModified)}>
                      {isSubmitting ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {isEditing ? "Updating..." : "Creating..."}
                        </span>
                      ) : (
                        isEditing ? "Update Sale" : "Create Sale"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-4 pt-4 md:hidden">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={formData.items.length === 0 || isSubmitting || isLoading || (isEditing && !isModified)}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isEditing ? "Updating..." : "Creating..."}
                  </span>
                ) : (
                  isEditing ? "Update Sale" : "Create Sale"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog >
      {hoverPreview && canPortal
        ? createPortal(
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 pointer-events-auto sm:pointer-events-none"
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") return;
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              if (event.nativeEvent.button === 0) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            <div className="relative w-56 h-56 sm:w-80 sm:h-80 rounded-md overflow-hidden border bg-background shadow-xl">
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-base-content/70 text-base-100 sm:hidden"
                onPointerDownCapture={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseDownCapture={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setHoverPreview(null);
                }}
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={hoverPreview.url}
                alt={`${hoverPreview.name} preview`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>,
          document.body
        )
        : null
      }
    </>
  );
};

