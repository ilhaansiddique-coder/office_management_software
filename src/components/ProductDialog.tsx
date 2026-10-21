import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProducts, Product, CreateProductData } from "@/hooks/useProducts";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { Loader2, X, Plus, Package, DollarSign, Layers, History } from "lucide-react";
import { ImagePicker } from "./ImagePicker";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useProductVariants, AttributeDefinition } from "@/hooks/useProductVariants";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { logActivity } from "@/utils/activityLogger";
import { cn } from "@/lib/utils";

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

type ProductFormState = Omit<
  CreateProductData,
  "rate" | "cost" | "stock_quantity" | "low_stock_threshold"
> & {
  rate: string;
  cost: string;
  stock_quantity: string;
  low_stock_threshold: string;
};

type VariantFormRow = {
  sku?: string;
  rate?: number | null;
  cost?: number | null;
  quantity: string;
  low_stock_threshold?: string | null;
  image_url?: string;
};

export const ProductDialog = ({ open, onOpenChange, product }: ProductDialogProps) => {
  const { createProduct, updateProduct } = useProducts();
  const { businessSettings } = useBusinessSettings();
  const [formData, setFormData] = useState<ProductFormState>({
    name: "",
    sku: "",
    rate: "",
    cost: "",
    stock_quantity: "",
    low_stock_threshold: businessSettings?.low_stock_alert_quantity?.toString() || "12",
    image_url: "",
  });

  const isEditing = !!product;

  // Variations state
  const [hasVariants, setHasVariants] = useState<boolean>(product?.has_variants ?? false);
  const [attributes, setAttributes] = useState<AttributeDefinition[]>([]);
  const [attributeInputs, setAttributeInputs] = useState<string[]>([]);
  const [variantState, setVariantState] = useState<Record<string, VariantFormRow>>({});
  const [bulkRate, setBulkRate] = useState<string>("");
  const [bulkCost, setBulkCost] = useState<string>("");
  const [bulkLow, setBulkLow] = useState<string>("");
  const [bulkQty, setBulkQty] = useState<string>("");
  const attributeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const initialDataRef = useRef<{
    formData: ProductFormState;
    attributes: AttributeDefinition[];
    variantState: Record<string, VariantFormRow>;
    hasVariants: boolean;
  } | null>(null);


  const toNumber = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return 0;
    const str = String(value);
    return str.trim() === "" ? 0 : Number(str);
  };
  const toOptionalFloat = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return undefined;
    const str = String(value);
    if (str.trim() === "") return undefined;
    const parsed = parseFloat(str);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const toOptionalInt = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return undefined;
    const str = String(value);
    if (str.trim() === "") return undefined;
    const parsed = parseInt(str, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const setVariant = (key: string, patch: Partial<VariantFormRow>) => {
    setVariantState((prev) => ({
      ...prev,
      [key]: { quantity: "", ...prev[key], ...patch },
    }));
  };

  const applyBulk = () => {
    const r = toOptionalFloat(bulkRate);
    const c = toOptionalFloat(bulkCost);
    const l = toOptionalInt(bulkLow);
    const q = toOptionalInt(bulkQty);
    const next: Record<string, VariantFormRow> = {};
    combos.forEach((attrs) => {
      const key = JSON.stringify(attrs);
      const cur = variantState[key] || { quantity: "" };
      next[key] = {
        ...cur,
        rate: r ?? cur.rate ?? toNumber(formData.rate),
        cost: c ?? cur.cost ?? (formData.cost ? toNumber(formData.cost) : null),
        low_stock_threshold: l !== undefined
          ? String(l)
          : cur.low_stock_threshold ?? (
            businessSettings?.low_stock_alert_quantity !== undefined
              ? String(businessSettings.low_stock_alert_quantity)
              : (toOptionalInt(formData.low_stock_threshold) !== undefined
                ? String(toOptionalInt(formData.low_stock_threshold))
                : null)
          ),
        quantity: q !== undefined ? String(q) : cur.quantity,
      };
    });
    setVariantState(next);
  };

  const { variants: existingVariants, isLoading: variantsLoading, bulkUpsert, clearVariants } = useProductVariants(product?.id);

  const combos = useMemo(() => {
    if (!attributes.length) return [] as Array<Record<string, string>>;
    const lists = attributes.map(a => a.values.filter(v => v?.trim()).map(v => ({ [a.name]: v.trim() })));
    if (lists.some(l => l.length === 0)) return [] as Array<Record<string, string>>;
    const allCombos = lists.reduce((acc, list) => {
      const out: Array<Record<string, string>> = [];
      for (const a of acc) {
        for (const b of list) {
          out.push({ ...a, ...b });
        }
      }
      return out;
    }, [{} as Record<string, string>]);

    const uniqueCombos = Array.from(
      new Map(allCombos.map(combo => [JSON.stringify(combo), combo])).values()
    );

    return uniqueCombos;
  }, [attributes]);

  const totalVariantQty = useMemo(() => {
    return combos.reduce((sum, attrs) => {
      const qty = variantState[JSON.stringify(attrs)]?.quantity || "";
      return sum + toNumber(qty);
    }, 0);
  }, [combos, variantState]);

  const lowWarnings = useMemo(() => {
    return combos.reduce((acc, attrs) => {
      const key = JSON.stringify(attrs);
      const v = variantState[key];
      const threshold = toNumber(
        (v?.low_stock_threshold ?? formData.low_stock_threshold) || ""
      );
      const qty = toNumber(v?.quantity || "");
      return acc + (qty <= threshold ? 1 : 0);
    }, 0);
  }, [combos, variantState, formData.low_stock_threshold]);

  useEffect(() => {
    if (product) {
      const newFormData = {
        name: product.name,
        sku: product.sku || "",
        rate: String(product.rate ?? ""),
        cost: product.cost !== null && product.cost !== undefined ? String(product.cost) : "",
        stock_quantity: String(product.stock_quantity ?? ""),
        low_stock_threshold: String(product.low_stock_threshold ?? ""),
        image_url: product.image_url || "",
        has_variants: product.has_variants,
      };
      setFormData(newFormData);
      setHasVariants(!!product.has_variants);

      // Initialize snapshot with current known data; attributes/variants will be updated when loaded
      initialDataRef.current = {
        formData: newFormData,
        attributes: [],
        variantState: {},
        hasVariants: !!product.has_variants
      };
    } else {
      setFormData({
        name: "",
        sku: "",
        rate: "",
        cost: "",
        stock_quantity: "",
        low_stock_threshold: businessSettings?.low_stock_alert_quantity?.toString() || "12",
        image_url: "",
        has_variants: false,
      });
      setHasVariants(false);
      initialDataRef.current = null;
    }
    setAttributeInputs(attributes.map(() => "")); // Empty strings for input fields
  }, [product]);

  useEffect(() => {
    if (!product && businessSettings?.low_stock_alert_quantity) {
      setFormData(prev => ({
        ...prev,
        low_stock_threshold: businessSettings.low_stock_alert_quantity.toString()
      }));
    }
  }, [businessSettings?.low_stock_alert_quantity, product]);

  useEffect(() => {
    if (isEditing && product?.id && hasVariants) {
      (async () => {
        const { data, error } = await supabase
          .from('product_attributes')
          .select('id,name, product_attribute_values ( value )')
          .eq('product_id', product.id);
        if (!error && data) {
          const defs: AttributeDefinition[] = (data as any[]).map((row: any) => {
            const values = (row.product_attribute_values || []).map((v: any) => String(v.value));
            // Remove duplicates case-insensitively
            const seen = new Map<string, string>();
            values.forEach((val: string) => {
              const lower = val.toLowerCase();
              if (!seen.has(lower)) {
                seen.set(lower, val);
              }
            });
            return {
              name: row.name,
              values: Array.from(seen.values()),
            };
          });
          if (defs.length) {
            setAttributes(defs);
            setAttributeInputs(defs.map(() => ""));

            // Update snapshot if we have initial data
            if (initialDataRef.current) {
              initialDataRef.current.attributes = defs;
            }
          }
        }
      })();
    }
  }, [isEditing, product?.id, hasVariants]);

  useEffect(() => {
    if (hasVariants && existingVariants && existingVariants.length) {
      const vs: Record<string, VariantFormRow> = {};
      existingVariants.forEach((v) => {
        const key = JSON.stringify(v.attributes);
        vs[key] = {
          sku: v.sku ?? undefined,
          rate: v.rate,
          cost: v.cost,
          quantity: String(v.stock_quantity ?? ""),
          low_stock_threshold: v.low_stock_threshold !== null && v.low_stock_threshold !== undefined
            ? String(v.low_stock_threshold)
            : "",
          image_url: v.image_url ?? undefined,
        };
      });
      setVariantState(vs);

      // Update snapshot of variants
      if (initialDataRef.current) {
        initialDataRef.current.variantState = vs;
      }

      if (!attributes.length) {
        const nameSet = new Set<string>();
        existingVariants.forEach((v) => {
          Object.keys(v.attributes || {}).forEach((k) => nameSet.add(k));
        });
        const attrDefs: AttributeDefinition[] = Array.from(nameSet).map((name) => ({
          name,
          values: Array.from(new Set(existingVariants.map((v) => v.attributes[name]).filter(Boolean))),
        }));
        if (attrDefs.length) {
          setAttributes(attrDefs);
          setAttributeInputs(attrDefs.map((a) => formatInput(a.values)));

          // Update snapshot of attributes inferred from variants
          if (initialDataRef.current) {
            initialDataRef.current.attributes = attrDefs;
          }
        }
      }
    }
  }, [existingVariants, hasVariants]);

  const isModified = useMemo(() => {
    if (!isEditing || !initialDataRef.current) return true;

    const initial = initialDataRef.current;

    // Check form data
    if (JSON.stringify(formData) !== JSON.stringify(initial.formData)) return true;

    // Check hasVariants toggle
    if (hasVariants !== initial.hasVariants) return true;

    if (hasVariants) {
      // Check attributes
      if (JSON.stringify(attributes) !== JSON.stringify(initial.attributes)) return true;

      // Check variants
      // Only compare keys that exist in both or new keys.
      // We can iterate combos (current state)
      // Actually simply comparing variantState works if keys are deterministic.
      // But variantState keys are JSON.stringify(attrs). If attributes matched, keys match.
      // So compare values.

      // We need to be careful about undefined vs empty string in variant rows
      // Also, variantState might have extra entries if attributes changed.
      // It's safer to rely on attributes check for structure changes.
      // Here check values for existing variants.

      const currentKeys = Object.keys(variantState).sort();
      const initialKeys = Object.keys(initial.variantState).sort();

      if (JSON.stringify(currentKeys) !== JSON.stringify(initialKeys)) return true;

      for (const key of currentKeys) {
        const c = variantState[key];
        const s = initial.variantState[key];
        if (!s) return true;

        // Compare fields: sku, rate, cost, quantity, low_stock, image_url
        if ((c.sku || "") !== (s.sku || "")) return true;
        if (toNumber(c.rate) !== toNumber(s.rate)) return true;
        if (toNumber(c.cost) !== toNumber(s.cost)) return true;
        if (toNumber(c.quantity) !== toNumber(s.quantity)) return true;
        if (toNumber(c.low_stock_threshold) !== toNumber(s.low_stock_threshold)) return true;
        if ((c.image_url || "") !== (s.image_url || "")) return true;
      }
    }

    return false;
  }, [formData, attributes, variantState, hasVariants, isEditing]);

  useEffect(() => {
    if (attributeInputs.length !== attributes.length) {
      setAttributeInputs(attributes.map((a) => formatInput(a.values)));
    }
  }, [attributes, attributeInputs.length]);

  const formatValues = (raw: string) =>
    raw
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => v.charAt(0).toUpperCase() + v.slice(1));

  const formatInput = (values: string[]) => values.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(", ");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let savedProductId: string | null = null;
    try {
      const rateValue = toNumber(formData.rate);
      const basePayload: CreateProductData = {
        name: formData.name,
        sku: formData.sku,
        rate: rateValue,
        cost: toOptionalFloat(formData.cost),
        stock_quantity: toOptionalInt(formData.stock_quantity) ?? 0,
        low_stock_threshold:
          toOptionalInt(formData.low_stock_threshold) ??
          (businessSettings?.low_stock_alert_quantity || 12),
        image_url: formData.image_url,
        has_variants: formData.has_variants,
      };

      const buildVariantSummaries = () =>
        combos.map((attrs) => {
          const key = JSON.stringify(attrs);
          const v = variantState[key] || { quantity: "" };
          return {
            attributes: attrs,
            sku: v.sku || null,
            rate: v.rate ?? null,
            cost: v.cost ?? null,
            stock_quantity: toNumber(v.quantity || ""),
          };
        });
      const buildExistingVariantSummaries = () =>
        (existingVariants || []).map((v) => ({
          attributes: v.attributes || {},
          sku: v.sku || null,
          rate: v.rate ?? null,
          cost: v.cost ?? null,
          stock_quantity: v.stock_quantity ?? 0,
        }));

      if (hasVariants) {
        if (isEditing && product) {
          savedProductId = product.id;
          await updateProduct.mutateAsync({
            id: product.id,
            data: { ...basePayload, has_variants: true, stock_quantity: totalVariantQty },
          });
          const variantPayload = combos.map((attrs) => {
            const key = JSON.stringify(attrs);
            const v = variantState[key] || { quantity: "" };
            return {
              product_id: product.id,
              attributes: attrs,
              sku: v.sku || null,
              rate: v.rate ?? null,
              cost: v.cost ?? null,
              stock_quantity: toNumber(v.quantity || ""),
              low_stock_threshold: v.low_stock_threshold ? parseInt(v.low_stock_threshold, 10) : null,
              image_url: v.image_url || null,
            };
          });
          await bulkUpsert.mutateAsync({
            productId: product.id,
            hasVariants: true,
            attributes,
            variants: variantPayload as any,
          });

          const variantSummaries = buildVariantSummaries();
          const existingVariantSummaries = buildExistingVariantSummaries();
          const oldVariantSummaries = product.has_variants ? existingVariantSummaries : [];
          const oldVariantCount = product.has_variants ? existingVariantSummaries.length : 0;
          logActivity({
            action: "update",
            entityType: "products",
            entityId: product.id,
            summary: `Updated product "${formData.name}" with ${variantSummaries.length} variant(s)`,
            details: {
              old: {
                name: product.name,
                sku: product.sku,
                rate: product.rate,
                cost: product.cost,
                stock_quantity: product.stock_quantity,
                has_variants: product.has_variants,
                variant_count: oldVariantCount,
                variants: oldVariantSummaries,
              },
              new: {
                name: basePayload.name,
                sku: basePayload.sku,
                rate: basePayload.rate,
                cost: basePayload.cost,
                stock_quantity: totalVariantQty,
                has_variants: true,
                variant_count: variantSummaries.length,
                variants: variantSummaries,
              },
            },
          });
        } else {
          const created = await createProduct.mutateAsync({
            ...basePayload,
            has_variants: true,
            stock_quantity: totalVariantQty,
          });
          const productId = (created as any)?.id;
          savedProductId = productId || null;
          if (productId) {
            const variantPayload = combos.map((attrs) => {
              const key = JSON.stringify(attrs);
              const v = variantState[key] || { quantity: "" };
              return {
                product_id: productId,
                attributes: attrs,
                sku: v.sku || null,
                rate: v.rate ?? null,
                cost: v.cost ?? null,
                stock_quantity: toNumber(v.quantity || ""),
                low_stock_threshold: v.low_stock_threshold ? parseInt(v.low_stock_threshold, 10) : null,
                image_url: v.image_url || null,
              };
            });
            await bulkUpsert.mutateAsync({ productId, hasVariants: true, attributes, variants: variantPayload as any });

            const variantSummaries = buildVariantSummaries();
            logActivity({
              action: "insert",
              entityType: "products",
              entityId: productId,
              summary: `Created product "${formData.name}" with ${variantSummaries.length} variant(s)`,
              details: {
                new: {
                  name: basePayload.name,
                  sku: basePayload.sku,
                  rate: basePayload.rate,
                  cost: basePayload.cost,
                  stock_quantity: totalVariantQty,
                  has_variants: true,
                  variant_count: variantSummaries.length,
                  variants: variantSummaries,
                },
              },
            });
          }
        }
      } else {
        if (isEditing && product) {
          savedProductId = product.id;
          await updateProduct.mutateAsync({
            id: product.id,
            data: { ...basePayload, has_variants: false },
          });
          if (product.has_variants) {
            await clearVariants.mutateAsync(product.id);
          }

          logActivity({
            action: "update",
            entityType: "products",
            entityId: product.id,
            summary: `Updated product "${formData.name}"`,
            details: {
              old: {
                name: product.name,
                sku: product.sku,
                rate: product.rate,
                cost: product.cost,
                stock_quantity: product.stock_quantity,
                has_variants: product.has_variants,
              },
              new: {
                name: basePayload.name,
                sku: basePayload.sku,
                rate: basePayload.rate,
                cost: basePayload.cost,
                stock_quantity: basePayload.stock_quantity,
                has_variants: false,
              },
            },
          });
        } else {
          const created = await createProduct.mutateAsync({ ...basePayload, has_variants: false });
          const productId = (created as any)?.id;
          savedProductId = productId || null;

          logActivity({
            action: "insert",
            entityType: "products",
            entityId: productId || null,
            summary: `Created product "${formData.name}"`,
            details: {
              new: {
                name: basePayload.name,
                sku: basePayload.sku,
                rate: basePayload.rate,
                cost: basePayload.cost,
                stock_quantity: basePayload.stock_quantity,
                has_variants: false,
              },
            },
          });
        }
      }
    } catch (error) {
      console.error("Error saving product:", error);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    onOpenChange(false);
  };

  const handleChange = (field: keyof CreateProductData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isLoading = createProduct.isPending || updateProduct.isPending;

  const tabCount = isEditing ? 3 : 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl h-[90vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* ── Body ── */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <Tabs defaultValue="details" className="flex flex-col flex-1 overflow-hidden min-h-0">
            {/* ── Compact Header + Tabs ── */}
            <div className="px-5 pt-3 pb-0 border-b bg-gradient-to-br from-primary/5 via-primary/3 to-background shrink-0">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold leading-tight">
                    {isEditing ? "Edit Product" : "Add New Product"}
                  </DialogTitle>
                  {isEditing && product?.sku && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">{product.sku}</Badge>
                  )}
                </div>
              </div>
              <TabsList className={`w-full grid ${tabCount === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                <TabsTrigger value="details" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Package className="h-3.5 w-3.5 hidden sm:block" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="variants" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Layers className="h-3.5 w-3.5 hidden sm:block" />
                  Variants
                  {combos.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 leading-tight">{combos.length}</Badge>
                  )}
                </TabsTrigger>
                {isEditing && (
                  <TabsTrigger value="activity" className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <History className="h-3.5 w-3.5 hidden sm:block" />
                    Activity
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Scrollable tab content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {/* ════════════ DETAILS TAB ════════════ */}
              <TabsContent value="details" className="mt-0 space-y-4">
                {/* Basic Information */}
                <div className="rounded-xl border border-base-300 bg-base-100/50 overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-3 border-b border-base-300/70 bg-base-100">
                    <Package className="h-4 w-4 text-base-content/70" />
                    <span className="font-medium text-base-content/90 text-sm">Basic Information</span>
                  </div>
                  <div className="bg-base-100 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="name" className="text-xs font-medium text-base-content/70">Product Name *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => handleChange("name", e.target.value)}
                            placeholder="Enter product name"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="sku" className="text-xs font-medium text-base-content/70">SKU</Label>
                          <Input
                            id="sku"
                            value={formData.sku}
                            onChange={(e) => handleChange("sku", e.target.value)}
                            placeholder="Enter SKU"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5 md:w-[140px]">
                        <Label className="text-xs font-medium text-base-content/70">Featured Image</Label>
                        <ImagePicker
                          value={formData.image_url}
                          onChange={(url) => handleChange("image_url", url)}
                          onRemove={() => handleChange("image_url", "")}
                          placeholder="Select image"
                          size="lg"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing & Stock */}
                <div className="rounded-xl border border-accent/80 bg-accent/20 overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-3 border-b border-accent/60 bg-accent/40">
                    <DollarSign className="h-4 w-4 text-accent" />
                    <span className="font-medium text-accent text-sm">Pricing & Stock</span>
                  </div>
                  <div className="bg-base-100 p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="rate" className="text-xs font-medium text-base-content/70">Selling Price *</Label>
                        <Input
                          id="rate"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.rate}
                          onChange={(e) => handleChange("rate", e.target.value)}
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cost" className="text-xs font-medium text-base-content/70">Cost Price</Label>
                        <Input
                          id="cost"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.cost}
                          onChange={(e) => handleChange("cost", e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="stock_quantity" className="text-xs font-medium text-base-content/70">Stock Quantity</Label>
                        <Input
                          id="stock_quantity"
                          type="number"
                          min="0"
                          value={hasVariants ? String(totalVariantQty) : formData.stock_quantity}
                          onChange={(e) => handleChange("stock_quantity", e.target.value)}
                          placeholder="0"
                          disabled={hasVariants}
                        />
                        {hasVariants && (
                          <p className="text-[10px] text-accent/70">Auto-calculated from variants</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="low_stock_threshold" className="text-xs font-medium text-base-content/70">Low Stock Alert</Label>
                        <Input
                          id="low_stock_threshold"
                          type="number"
                          min="0"
                          value={formData.low_stock_threshold}
                          onChange={(e) => handleChange("low_stock_threshold", e.target.value)}
                          placeholder={businessSettings?.low_stock_alert_quantity?.toString() || "12"}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ════════════ VARIANTS TAB ════════════ */}
              <TabsContent value="variants" className="mt-0 space-y-4">
                {/* Toggle */}
                <div className="rounded-xl border border-base-300 bg-base-100/50 p-4 flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Enable Variations</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Add attributes (e.g., Size, Color) and manage variant stock.
                    </p>
                  </div>
                  <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
                </div>

                {hasVariants ? (
                  <>
                    {/* Attributes Panel */}
                    <div className="rounded-xl border border-secondary/80 bg-secondary/20 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-secondary/60 bg-secondary/40">
                        <div className="flex items-center gap-2.5">
                          <Layers className="h-4 w-4 text-secondary" />
                          <span className="font-medium text-secondary text-sm">Attributes</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-secondary/35 text-secondary hover:bg-secondary/12"
                          onClick={() => {
                            setAttributes([...attributes, { name: "", values: [] }]);
                            setAttributeInputs([...attributeInputs, ""]);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Attribute
                        </Button>
                      </div>
                      <div className="bg-base-100 p-4 space-y-3">
                        {attributes.map((attr, idx) => (
                          <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                            <div className="space-y-1">
                              <Label className="text-xs font-medium text-base-content/70">Attribute Name</Label>
                              <div className="flex gap-2">
                                <Input
                                  value={attr.name}
                                  onChange={(e) => {
                                    const copy = [...attributes];
                                    copy[idx] = { ...copy[idx], name: e.target.value };
                                    setAttributes(copy);
                                  }}
                                  placeholder="e.g., Size"
                                  className="flex-1"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 w-9 shrink-0 rounded-xl p-0 text-muted-foreground hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => {
                                    const copy = attributes.filter((_, i) => i !== idx);
                                    const inputsCopy = attributeInputs.filter((_, i) => i !== idx);
                                    setAttributes(copy);
                                    setAttributeInputs(inputsCopy);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-medium text-base-content/70">Values (comma separated or press Enter)</Label>
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <Input
                                    ref={(el) => attributeInputRefs.current[idx] = el}
                                    value={attributeInputs[idx] ?? ""}
                                    onChange={(e) => {
                                      const inputCopy = [...attributeInputs];
                                      inputCopy[idx] = e.target.value;
                                      setAttributeInputs(inputCopy);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const currentInput = attributeInputs[idx] ?? "";
                                        if (currentInput.trim()) {
                                          const newValues = currentInput.split(',').map(v => v.trim()).filter(Boolean);
                                          const copy = [...attributes];
                                          // Merge with case-insensitive duplicate check
                                          const existingLower = new Set(copy[idx].values.map(v => v.toLowerCase()));
                                          const uniqueNew = newValues.filter(v => !existingLower.has(v.toLowerCase()));
                                          copy[idx] = {
                                            ...copy[idx],
                                            values: [...copy[idx].values, ...uniqueNew]
                                          };
                                          setAttributes(copy);
                                          const inputCopy = [...attributeInputs];
                                          inputCopy[idx] = "";
                                          setAttributeInputs(inputCopy);
                                          // Keep focus on input for next value
                                          setTimeout(() => {
                                            (e.target as HTMLInputElement).focus();
                                          }, 0);
                                        }
                                      }
                                    }}
                                    placeholder="e.g., Small, Medium, Large"
                                    className="flex-1"
                                    enterKeyHint="done"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                  size="sm"
                                  className="h-9 w-9 shrink-0 rounded-xl p-0"
                                    onClick={() => {
                                      const currentInput = attributeInputs[idx] ?? "";
                                      if (currentInput.trim()) {
                                        const newValues = currentInput.split(',').map(v => v.trim()).filter(Boolean);
                                        const copy = [...attributes];
                                        // Merge with case-insensitive duplicate check
                                        const existingLower = new Set(copy[idx].values.map(v => v.toLowerCase()));
                                        const uniqueNew = newValues.filter(v => !existingLower.has(v.toLowerCase()));
                                        copy[idx] = {
                                          ...copy[idx],
                                          values: [...copy[idx].values, ...uniqueNew]
                                        };
                                        setAttributes(copy);
                                        const inputCopy = [...attributeInputs];
                                        inputCopy[idx] = "";
                                        setAttributeInputs(inputCopy);
                                        // Keep focus on input for next value
                                        setTimeout(() => {
                                          attributeInputRefs.current[idx]?.focus();
                                        }, 0);
                                      }
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                {/* Display saved values as badges */}
                                {attr.values.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {attr.values.map((value, valueIdx) => (
                                      <Badge
                                        key={valueIdx}
                                        variant="secondary"
                                        className="pl-2.5 pr-1.5 py-1 text-xs font-normal bg-base-200 text-base-content hover:bg-base-300 border border-base-content/25"
                                      >
                                        {value}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const copy = [...attributes];
                                            copy[idx] = {
                                              ...copy[idx],
                                              values: copy[idx].values.filter((_, i) => i !== valueIdx)
                                            };
                                            setAttributes(copy);
                                          }}
                                          className="ml-1.5 rounded-lg p-0.5 transition-colors hover:bg-secondary/24"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {!attributes.length && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            No attributes yet. Add one to start creating variants.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bulk Actions + Variants Matrix */}
                    {combos.length > 0 && (
                      <>
                        <div className="rounded-xl border border-base-300 bg-muted/50 p-3 grid grid-cols-1 sm:grid-cols-9 gap-2 items-end">
                          <div className="sm:col-span-2">
                            <Label className="text-xs text-base-content/70">Bulk Price</Label>
                            <Input type="number" step="0.01" value={bulkRate} onChange={(e) => setBulkRate(e.target.value)} placeholder={formData.rate} />
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-xs text-base-content/70">Bulk Cost</Label>
                            <Input type="number" step="0.01" value={bulkCost} onChange={(e) => setBulkCost(e.target.value)} placeholder={formData.cost} />
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-xs text-base-content/70">Bulk Low Stock</Label>
                            <Input type="number" value={bulkLow} onChange={(e) => setBulkLow(e.target.value)} placeholder={formData.low_stock_threshold} />
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-xs text-base-content/70">Bulk Qty</Label>
                            <Input type="number" min="0" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} placeholder="0" />
                          </div>
                          <div className="sm:col-span-1">
                            <Button type="button" className="w-full h-9" onClick={applyBulk}>Apply</Button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-base-300 overflow-hidden">
                          {/* Mobile: Card Layout */}
                          <div className="sm:hidden space-y-3 p-3">
                            {combos.map((attrs, i) => {
                              const key = JSON.stringify(attrs);
                              const v = variantState[key] || { quantity: "" };
                              const name = attributes.map((a) => (attrs as any)[a.name]).filter(Boolean).join(" | ");
                              return (
                                <div
                                  key={key + i}
                                  className="rounded-lg border bg-card p-3 space-y-3"
                                >
                                  {/* Variant Name Header */}
                                  <div className="flex items-start gap-2 pb-2 border-b">
                                    {/* Variant Number Removed */}
                                    <div className="flex-1 flex flex-wrap gap-1.5">
                                      {attributes.map((a) => {
                                        const value = (attrs as any)[a.name];
                                        if (!value) return null;
                                        return (
                                          <Badge
                                            key={a.name}
                                            variant="secondary"
                                            className="h-9 min-w-9 px-2.5 flex items-center justify-center rounded-full text-base font-bold bg-base-200 text-base-content border border-base-content/25 hover:bg-base-300"
                                          >
                                            {value}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Fields */}
                                  <div className="space-y-2.5">
                                    <div>
                                      <Label className="text-xs text-muted-foreground mb-1">SKU</Label>
                                      <Input
                                        value={v.sku || ""}
                                        onChange={(e) => setVariant(key, { sku: e.target.value })}
                                        placeholder={formData.sku ? `${formData.sku}-${i + 1}` : `Variant-${i + 1}`}
                                        className="h-9 text-sm"
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-xs text-muted-foreground mb-1">Price</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={v.rate ?? ""}
                                          onChange={(e) => setVariant(key, { rate: e.target.value ? parseFloat(e.target.value) : null })}
                                          placeholder={`${formData.rate}`}
                                          className="h-9 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-muted-foreground mb-1">Cost</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={v.cost ?? ""}
                                          onChange={(e) => setVariant(key, { cost: e.target.value ? parseFloat(e.target.value) : null })}
                                          placeholder={`${formData.cost || 0}`}
                                          className="h-9 text-sm"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-xs text-muted-foreground mb-1">Quantity</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={v.quantity}
                                          onChange={(e) => setVariant(key, { quantity: e.target.value })}
                                          className="h-9 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-muted-foreground mb-1">Low Stock</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={v.low_stock_threshold ?? ""}
                                          onChange={(e) => setVariant(key, { low_stock_threshold: e.target.value || null })}
                                          placeholder={formData.low_stock_threshold}
                                          className="h-9 text-sm"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 pt-2 border-t">
                                      <Label className="text-xs text-muted-foreground">Image</Label>
                                      <ImagePicker
                                        value={v.image_url || ""}
                                        onChange={(url) => setVariant(key, { image_url: url })}
                                        onRemove={() => setVariant(key, { image_url: "" })}
                                        placeholder="Select variant image"
                                        iconOnly={true}
                                        size="md"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Desktop: Table Layout */}
                          <div className="hidden sm:block max-h-96 overflow-auto">
                            <Table className="min-w-[900px]">
                              <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                  <TableHead className="font-semibold">Variant</TableHead>
                                  <TableHead className="font-semibold">SKU</TableHead>
                                  <TableHead className="font-semibold">Price</TableHead>
                                  <TableHead className="font-semibold">Cost</TableHead>
                                  <TableHead className="font-semibold">Qty</TableHead>
                                  <TableHead className="font-semibold">Low Stock</TableHead>
                                  <TableHead className="font-semibold">Image</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {combos.map((attrs, i) => {
                                  const key = JSON.stringify(attrs);
                                  const v = variantState[key] || { quantity: "" };
                                  const name = attributes.map((a) => (attrs as any)[a.name]).filter(Boolean).join(" | ");
                                  return (
                                    <TableRow
                                      key={key + i}
                                      className={cn(
                                        "hover:bg-muted/30 transition-colors",
                                        i % 2 === 0 ? "bg-background" : "bg-muted/10"
                                      )}
                                    >
                                      <TableCell className="whitespace-nowrap">
                                        <div className="flex flex-wrap gap-1.5">
                                          {attributes.map((a) => {
                                            const value = (attrs as any)[a.name];
                                            if (!value) return null;
                                            return (
                                              <Badge
                                                key={a.name}
                                                variant="secondary"
                                                className="h-8 min-w-8 px-2 flex items-center justify-center rounded-full text-sm font-bold bg-base-200 text-base-content border border-base-content/25 hover:bg-base-300"
                                              >
                                                {value}
                                              </Badge>
                                            );
                                          })}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Input value={v.sku || ""} onChange={(e) => setVariant(key, { sku: e.target.value })} placeholder={formData.sku ? `${formData.sku}-${i + 1}` : `Variant-${i + 1}`} />
                                      </TableCell>
                                      <TableCell>
                                        <Input type="number" step="0.01" value={v.rate ?? ""} onChange={(e) => setVariant(key, { rate: e.target.value ? parseFloat(e.target.value) : null })} placeholder={`${formData.rate}`} />
                                      </TableCell>
                                      <TableCell>
                                        <Input type="number" step="0.01" value={v.cost ?? ""} onChange={(e) => setVariant(key, { cost: e.target.value ? parseFloat(e.target.value) : null })} placeholder={`${formData.cost || 0}`} />
                                      </TableCell>
                                      <TableCell>
                                        <Input type="number" min={0} value={v.quantity} onChange={(e) => setVariant(key, { quantity: e.target.value })} />
                                      </TableCell>
                                      <TableCell>
                                        <Input type="number" min={0} value={v.low_stock_threshold ?? ""} onChange={(e) => setVariant(key, { low_stock_threshold: e.target.value || null })} placeholder={formData.low_stock_threshold} />
                                      </TableCell>
                                      <TableCell>
                                        <ImagePicker
                                          value={v.image_url || ""}
                                          onChange={(url) => setVariant(key, { image_url: url })}
                                          onRemove={() => setVariant(key, { image_url: "" })}
                                          placeholder="Select variant image"
                                          iconOnly={true}
                                          size="sm"
                                        />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Footer with Stats */}
                          <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-sm border-t bg-muted/20">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Variants: {combos.length}</Badge>
                              <Badge variant="secondary" className="text-xs">Total Stock: {totalVariantQty}</Badge>
                            </div>
                            {lowWarnings > 0 && (
                              <span className="text-destructive text-xs font-medium">
                                {lowWarnings} variant{lowWarnings > 1 ? "s" : ""} at or below low stock
                              </span>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-base-300">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50 mb-3">
                      <Layers className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Variations are disabled</p>
                    <p className="text-xs text-muted-foreground/70 mt-1 max-w-[240px]">
                      Enable the toggle above to add size, color, or other attributes.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ════════════ ACTIVITY TAB ════════════ */}
              {isEditing && product?.id && (
                <TabsContent value="activity" className="mt-0">
                  <ActivityLogPanel
                    entityType="products"
                    entityId={product.id}
                    cardClassName="border-0 shadow-none bg-transparent"
                    headerClassName="px-0 pt-0"
                    titleClassName="hidden"
                    contentClassName="px-0 pb-0"
                  />
                </TabsContent>
              )}
            </div>
          </Tabs>

          {/* ── Sticky Footer ── */}
          <div className="px-6 py-3 border-t bg-background/95 backdrop-blur-sm flex items-center justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || (isEditing && !isModified)}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? "Updating..." : "Creating..."}
                </>
              ) : (
                isEditing ? "Update Product" : "Create Product"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
