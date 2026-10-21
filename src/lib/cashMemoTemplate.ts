import { BusinessSettings } from "@/hooks/useBusinessSettings";
import { SystemSettings } from "@/hooks/useSystemSettings";

interface SaleData {
  id: string;
  invoice_number: string;
  created_at: string;
  customer_name: string;
  saved_customer_name?: string | null;
  customer_phone?: string;
  customer_address?: string;
  customer_email?: string;
  subtotal: number;
  discount_percent?: number;
  discount_amount?: number;
  grand_total: number;
  amount_paid?: number;
  amount_due?: number;
  fee?: number;
  payment_method: string;
  courier_name?: string;
  cn_number?: string | null;
  additional_info?: string;
  sale_items?: Array<{
    id: string;
    product_name: string;
    quantity: number;
    rate: number;
    sale_price?: number | null;
    total: number;
    variant_id?: string;
    variant_attributes?: Record<string, string> | string | string[] | null;
    attributes?: Record<string, string> | string | string[] | null;
  }>;
}

// Function to format currency
const formatCurrency = (amount: number, currencySymbol: string = '?'): string => {
  const hasDecimals = !Number.isInteger(amount);
  return `${currencySymbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  })}`;
};

// Function to format date
const formatDate = (dateString: string, format: string = 'dd/MM/yyyy'): string => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  return format
    .replace('dd', day)
    .replace('MM', month)
    .replace('yyyy', year.toString());
};

// Function to format time (HH:MM:SS)
const formatTime = (date: Date = new Date()): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// Generate Cash Memo HTML
export const generateCashMemoHTML = (
  sale: SaleData,
  businessSettings: BusinessSettings,
  systemSettings: SystemSettings
): string => {
  const faviconHref = businessSettings.logo_url || '/favicon.ico';
  const currencySymbol = systemSettings.currency_symbol || '?';
  const addressLine = businessSettings.address_line1 || businessSettings.address || '';
  const printedAtTime = formatTime();
  const chargeValue = (sale as any).fee ?? 0;
  const rawDueAmount = (sale as any).review_amount_due ?? sale.amount_due ?? 0;
  const rawPaidAmount = (sale as any).review_amount_paid ?? sale.amount_paid ?? 0;
  const grandTotalValue = Number((sale as any).grand_total ?? sale.grand_total ?? 0) || 0;

  const normalizeMethodKey = (value?: string | null) => {
    const raw = String(value || "").toLowerCase().trim();
    return raw === "condition" ? "cod" : raw;
  };
  const isCodMethod = (value?: string | null) => normalizeMethodKey(value) === "cod";

  const paymentTerms = String((sale as any).payment_terms || "immediate").toLowerCase();
  const paymentMethod = normalizeMethodKey((sale as any).payment_method);
  const splits: Array<{ method?: string | null; amount?: number | null }> =
    ((sale as any).sale_payments || (sale as any).payment_splits || []) as any[];

  const codSplitTotal = splits
    .filter((split) => isCodMethod(split.method))
    .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  const creditSplitTotal = splits
    .filter((split) => normalizeMethodKey(split.method) === "credit")
    .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);

  const hasCodSplit = codSplitTotal > 0;
  const isCreditSale = paymentTerms === "credit" || paymentMethod === "credit";
  const hasCreditSplit = creditSplitTotal > 0;
  const inferredCodSale = !isCreditSale && rawDueAmount > 0;
  const isCodSale = paymentTerms === "cod" || paymentMethod === "cod" || hasCodSplit || inferredCodSale;

  // Only COD should count as due on the invoice.
  const codDueAmount = isCodSale
    ? (hasCodSplit ? codSplitTotal : Math.max(0, rawDueAmount - chargeValue))
    : 0;
  const dueAmount = codDueAmount;
  const creditDueAmount = isCreditSale
    ? (hasCreditSplit ? creditSplitTotal : Math.max(0, rawDueAmount))
    : 0;

  // Everything not COD should be treated as paid on the invoice.
  const amountPaidValue = grandTotalValue > 0
    ? Math.max(0, grandTotalValue - dueAmount)
    : Math.max(0, rawPaidAmount);

  const courierName = sale.courier_name || '';
  const courierNameLower = courierName.toLowerCase();
  const isSteadfast = courierNameLower.includes('steadfast');
  const isStorePickup = courierNameLower.includes('store pickup');
  const conditionValue = codDueAmount + chargeValue;
  const isFullyPaid =
    dueAmount <= 0 ||
    (sale as any).payment_status === 'paid';
  const showPaidStamp = isFullyPaid && !isCreditSale;
  const showCreditStamp = isCreditSale && creditDueAmount > 0;
  const discountValue = (() => {
    if (typeof (sale as any).discount_amount === 'number') {
      return (sale as any).discount_amount;
    }
    if (typeof (sale as any).discount_percent === 'number') {
      return (sale.subtotal || 0) * ((sale as any).discount_percent / 100);
    }
    return 0;
  })();
  const formatVariantLabel = (attrs?: Record<string, string> | string | string[] | null): string => {
    if (!attrs) return "";
    if (typeof attrs === "string") return attrs;
    if (Array.isArray(attrs)) return attrs.filter(Boolean).join(" / ");
    if (typeof attrs === "object") return Object.values(attrs).filter(Boolean).join(" / ");
    return "";
  };

  const formatDescription = (item: SaleData["sale_items"][number]) => {
    // Prefer pre-built description if provided by backend/hook
    const prebuilt = (item as any).description_for_print as string | undefined;
    if (prebuilt) {
      return prebuilt.replace(/\n/g, "<br/>");
    }

    const variantLabel = formatVariantLabel(
      (item as any).variant_label ||
      item.variant_attributes ||
      (item as any).attributes
    );
    const base = `${item.product_name}${variantLabel ? ` * ${variantLabel}` : ""}`;
    return base.replace(/\n/g, "<br/>");
  };

  const formatVariantsWithLineBreaks = (
    productName: string,
    variantOrder: string[],
    variantCounts: Map<string, number>
  ) => {
    if (!variantOrder.length) {
      return productName;
    }

    const basePrefix = `${productName} * `;
    const chunks = variantOrder.map((label, index) => {
      const count = variantCounts.get(label) || 0;
      const prefix = index === 0 ? "" : "+";
      return `<span class="variant-chunk">${prefix}${label}(${count})</span>`;
    });

    return `${basePrefix}${chunks.join("")}`;
  };

  const getItemUnitPrice = (item: SaleData["sale_items"][number]) => {
    const explicitPrice = (item as any).sale_price ?? (item as any).salePrice;
    if (typeof explicitPrice === "number" && Number.isFinite(explicitPrice)) {
      return explicitPrice;
    }
    const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity ?? 0);
    const total = typeof item.total === "number" ? item.total : Number(item.total ?? 0);
    if (qty > 0 && Number.isFinite(total)) {
      return total / qty;
    }
    return typeof item.rate === "number" ? item.rate : 0;
  };

  // Group items by product and rate, merging variant labels and quantities
  const groupItemsForPrint = (items: SaleData["sale_items"] | undefined) => {
    const groups = new Map<string, {
      product_name: string;
      quantity: number;
      rate: number;
      total: number;
      variantOrder: string[];
      variantCounts: Map<string, number>;
    }>();

    if (!items) return [] as {
      description: string;
      quantity: number;
      rate: number;
      total: number;
    }[];

    for (const raw of items as any[]) {
      if (!raw) continue;
      const productName = raw.product_name || "";
      const unitPrice = getItemUnitPrice(raw);
      const key = `${productName}__${unitPrice}`;

      const variantLabel = (raw as any).variant_label
        || formatVariantLabel(
          raw.variant_attributes ||
          (raw as any).attributes
        );

      const variantKey = typeof variantLabel === "string" ? variantLabel.trim() : "";
      const quantity = raw.quantity || 0;
      const total = raw.total || 0;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.total += total;
        if (variantKey) {
          const prev = existing.variantCounts.get(variantKey) || 0;
          if (prev === 0) {
            existing.variantOrder.push(variantKey);
          }
          existing.variantCounts.set(variantKey, prev + quantity);
        }
      } else {
        groups.set(key, {
          product_name: productName,
          quantity,
          rate: unitPrice,
          total,
          variantOrder: variantKey ? [variantKey] : [],
          variantCounts: new Map(variantKey ? [[variantKey, quantity]] : []),
        });
      }
    }

    return Array.from(groups.values()).map(group => {
      const descBase = formatVariantsWithLineBreaks(
        group.product_name,
        group.variantOrder,
        group.variantCounts
      );

      return {
        description: descBase.replace(/\n/g, "<br/>"),
        quantity: group.quantity,
        rate: group.rate,
        total: group.total,
      };
    });
  };

  // Prepare items with dynamic height-based pagination
  const items = sale.sale_items || [];
  const groupedItems = groupItemsForPrint(items);
  const hasCharge = (chargeValue || 0) > 0;
  const hasDiscount = discountValue > 0;
  const hasAdv = (sale.amount_paid || 0) > 0;
  const hasDue = (sale.amount_due || 0) > 0;
  const totalsRowCount =
    2 + // Total + Due always render
    (hasCharge ? 1 : 0) +
    (hasDiscount ? 1 : 0) +
    (hasAdv ? 1 : 0);

  // Height budget for table body rows (in mm)
  // A5 = 210mm. Non-table areas: title ~8, header ~28, table-head ~6,
  // table-wrap padding ~3, totals ~28, signs ~18, footer ~8 � 99mm base
  // Row height estimation constants
  const SINGLE_ROW_H = 6.2;        // mm for a single-line row
  const TWO_LINE_ROW_H = 9.5;      // mm for a two-line row
  const DESC_CHARS_PER_LINE = 38;   // approx chars fitting in description column
  const MAX_ROWS_PER_PAGE = 12;

  const TOTALS_EXTRA = Math.max(0, totalsRowCount - 2) * 5;
  // Limit budget to MAX_ROWS_PER_PAGE or physical space, whichever is smaller.
  // We add a small buffer (+ 5) so that one or two double-line items don't immediately reduce the row count to 11.
  const TABLE_BODY_BUDGET = Math.min(100 - TOTALS_EXTRA, (MAX_ROWS_PER_PAGE * SINGLE_ROW_H) + 5);

  const estimateItemHeight = (desc: string): number => {
    const plain = desc.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
    const lines = Math.ceil(plain.length / DESC_CHARS_PER_LINE);
    return lines <= 1 ? SINGLE_ROW_H : TWO_LINE_ROW_H;
  };

  // Build pages: fit all items on one page when possible (sacrifice blank rows),
  // only split to multiple pages when items genuinely exceed the budget.
  const paginatedPages: Array<{
    pageItems: typeof groupedItems;
    startIndex: number;
    fillRows: number;
  }> = [];

  {
    // First: check if ALL items can fit on a single page (even with zero blank rows)
    const totalItemsHeight = groupedItems.reduce(
      (sum, item) => sum + estimateItemHeight(item.description), 0
    );

    if (groupedItems.length === 0) {
      // Empty invoice � one page, all blank rows
      paginatedPages.push({
        pageItems: [],
        startIndex: 0,
        fillRows: Math.floor(TABLE_BODY_BUDGET / SINGLE_ROW_H),
      });
    } else if (totalItemsHeight <= TABLE_BODY_BUDGET) {
      // All items fit on one page � fill leftover space with blank rows
      const remainingHeight = Math.max(0, TABLE_BODY_BUDGET - totalItemsHeight);
      const fillRows = Math.floor(remainingHeight / SINGLE_ROW_H);
      paginatedPages.push({
        pageItems: [...groupedItems],
        startIndex: 0,
        fillRows,
      });
    } else {
      // Items exceed one page � split across pages.
      // Non-last pages get zero blank rows to maximise item space.
      // Only the last page gets blank rows to pad the table.
      let remaining = [...groupedItems];
      let globalIdx = 0;

      while (remaining.length > 0) {
        let heightUsed = 0;
        let count = 0;

        for (const item of remaining) {
          const h = estimateItemHeight(item.description);
          if (count > 0 && heightUsed + h > TABLE_BODY_BUDGET) break;
          heightUsed += h;
          count++;
        }
        if (count === 0) count = 1;

        const pageItems = remaining.slice(0, count);
        remaining = remaining.slice(count);

        const isLastPage = remaining.length === 0;
        const leftover = Math.max(0, TABLE_BODY_BUDGET - heightUsed);
        const fillRows = isLastPage ? Math.floor(leftover / SINGLE_ROW_H) : 0;

        paginatedPages.push({ pageItems, startIndex: globalIdx, fillRows });
        globalIdx += count;
      }
    }
  }

  const totalPages = paginatedPages.length;

  const pages = paginatedPages.map((pg, pageIndex) => {
    const rows: string[] = [];

    for (let i = 0; i < pg.pageItems.length; i++) {
      const gi = pg.startIndex + i;
      const item = pg.pageItems[i];
      rows.push(`
          <div class="grid-row" style="display:flex;flex-direction:row;align-items:stretch;border-bottom:1px solid #1f8a3b;">
            <div class="grid-cell col-sl" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:8%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;"><span class="cell-content">${String(gi + 1).padStart(2, '0')}</span></div>
            <div class="grid-cell col-desc" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;width:52%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;flex-grow:1;"><div class="desc-clamp">${item.description}</div></div>
            <div class="grid-cell col-qty" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:12%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;"><span class="cell-content">${item.quantity}</span></div>
            <div class="grid-cell col-price" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:14%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;"><span class="cell-content">${formatCurrency(item.rate, currencySymbol)}</span></div>
            <div class="grid-cell col-amount" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:14%;padding:1.4mm 1.3mm;"><span class="cell-content">${formatCurrency(item.total, currencySymbol)}</span></div>
          </div>`);
    }

    for (let i = 0; i < pg.fillRows; i++) {
      const gi = pg.startIndex + pg.pageItems.length + i;
      rows.push(`
          <div class="grid-row empty-row" style="display:flex;flex-direction:row;align-items:stretch;border-bottom:1px solid #1f8a3b;">
            <div class="grid-cell col-sl" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:8%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;min-height:5mm;"><span class="cell-content">${String(gi + 1).padStart(2, '0')}</span></div>
            <div class="grid-cell col-desc" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;width:52%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;flex-grow:1;min-height:5mm;"><span class="cell-content">&nbsp;</span></div>
            <div class="grid-cell col-qty" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:12%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;min-height:5mm;"><span class="cell-content">&nbsp;</span></div>
            <div class="grid-cell col-price" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:14%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;min-height:5mm;"><span class="cell-content">&nbsp;</span></div>
            <div class="grid-cell col-amount" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:14%;padding:1.4mm 1.3mm;min-height:5mm;"><span class="cell-content">&nbsp;</span></div>
          </div>`);
    }

    return {
      itemRows: rows.join(''),
      isLastPage: pageIndex === totalPages - 1,
    };
  });

  // Get base URL for absolute font paths (fixes mobile production issues)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const html = `
<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="${faviconHref}">
<title>Cash Memo - ${sale.invoice_number}</title>
<style>
@font-face {
  font-family: "Manrope";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("${baseUrl}/fonts/Manrope-400.woff2") format("woff2");
}
@font-face {
  font-family: "Manrope";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("${baseUrl}/fonts/Manrope-500.woff2") format("woff2");
}
@font-face {
  font-family: "Manrope";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("${baseUrl}/fonts/Manrope-600.woff2") format("woff2");
}
@font-face {
  font-family: "Manrope";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("${baseUrl}/fonts/Manrope-700.woff2") format("woff2");
}
@font-face {
  font-family: "Manrope";
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("${baseUrl}/fonts/Manrope-800.woff2") format("woff2");
}
/* ---- PRINT SETUP ---- */
@page { size: A5 portrait; margin: 0; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
/* ---- BASE ---- */
:root{
  --brand:#1f8a3b;      /* main green */
  --brand-dark:#0d5a25; /* deeper green */
  --line:#1f8a3b;       /* table lines */
  --ink:#0a0a0a;
  --muted:#3d3d3d;
  --bg:#eff8f0;         /* very light green tint */
}
*{ box-sizing:border-box; }
html,body{ height:100%; }
body{ flex-direction:column; }
body{
  margin:0;
  padding:5px;
  font: 12px/1.35 "Manrope", "Noto Sans Bengali", "SolaimanLipi", ui-sans-serif, system-ui, sans-serif;
  color:var(--ink);
  background:#e5e7eb;
  display:flex;
  justify-content:center;
  align-items:flex-start;
  min-height:100vh;
}
.memo{
  width: 148mm;
  height: 210mm;
  max-width: 148mm;
  border: 1px solid var(--brand);
  background: #fff;
  position:relative;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display:flex;
  flex-direction:column;
  page-break-after: avoid;
}
.memo.page-break{
  page-break-after: always;
}
.content-wrapper{
  flex:1;
  display:flex;
  flex-direction:column;
  justify-content:flex-start;
}
@media print{
  body{
    background:#fff;
    padding:0;
  }
  .memo{
    box-shadow:none;
    break-after: avoid-page;
    width: 148mm !important;
    height: 210mm !important;
    max-width: 148mm !important;
    transform: none !important;
    margin: 0 auto !important;
  }
}

/* Mobile responsive styles - only for screen viewing, not PDF generation */
@media screen and (max-width: 600px) {
  body:not(.pdf-mode) {
    padding: 0;
    align-items: flex-start;
    justify-content: flex-start;
  }
  body:not(.pdf-mode) .memo {
    width: 100vw !important;
    max-width: 100vw !important;
    height: auto !important;
    min-height: 100vh;
    border: none;
    border-radius: 0;
    box-shadow: none;
    transform-origin: top left;
  }
  /* Force full size when pdf-mode class is present */
  body.pdf-mode {
    padding: 0;
  }
  body.pdf-mode .memo {
    width: 148mm !important;
    max-width: 148mm !important;
    height: 210mm !important;
    transform: none !important;
  }
  body:not(.pdf-mode) .title-top {
    font-size: 14px;
    padding: 2mm 4mm;
    letter-spacing: 2px;
  }
  body:not(.pdf-mode) .header {
    grid-template-columns: 1fr;
    gap: 3mm;
    padding: 2mm 4mm;
  }
  body:not(.pdf-mode) .header-left {
    gap: 2mm;
  }
  body:not(.pdf-mode) .header-left .brand {
    font-size: 14px;
  }
  body:not(.pdf-mode) .header-left .tag {
    font-size: 7px;
    white-space: nowrap;
  }
  body:not(.pdf-mode) .logo {
    width: 12mm;
    height: 12mm;
  }
  body:not(.pdf-mode) .header-right {
    font-size: 10px;
    padding-left: 0;
  }
  body:not(.pdf-mode) .header-right:before {
    display: none;
  }
  body:not(.pdf-mode) .serial {
    font-size: 10px;
  }
  body:not(.pdf-mode) .table-wrap {
    padding: 1mm 2mm;
  }
  body:not(.pdf-mode) .items th,
  body:not(.pdf-mode) .items td {
    padding: 1mm;
    font-size: 9px;
  }
  body:not(.pdf-mode) .col-sl { width: 8%; }
  body:not(.pdf-mode) .col-desc { width: 44%; }
  body:not(.pdf-mode) .col-qty { width: 12%; }
  body:not(.pdf-mode) .col-price { width: 18%; }
  body:not(.pdf-mode) .col-amount { width: 18%; }
  body:not(.pdf-mode) .totals {
    padding: 0 2mm;
    gap: 2mm;
  }
  body:not(.pdf-mode) .totals:has(.left-section) {
    grid-template-columns: 1fr;
    gap: 3mm;
  }
  body:not(.pdf-mode) .sum .row .k,
  body:not(.pdf-mode) .sum .row .v {
    font-size: 11px;
    padding: 1.5mm;
  }
  body:not(.pdf-mode) .courier-name {
    font-size: 16px;
  }
  body:not(.pdf-mode) .courier-cn .cn-value {
    font-size: 16px;
  }
  body:not(.pdf-mode) .condition-line {
    font-size: 13px;
  }
  body:not(.pdf-mode) .paid-stamp,
  body:not(.pdf-mode) .credit-stamp {
    font-size: 14px;
    padding: 2mm 5mm;
  }
  body:not(.pdf-mode) .signs {
    padding: 2mm 3mm;
    gap: 3mm;
    min-height: 12mm;
  }
  body:not(.pdf-mode) .sig {
    font-size: 9px;
    padding-top: 8mm;
  }
  body:not(.pdf-mode) .sig:before {
    top: 5mm;
  }
  body:not(.pdf-mode) .footer {
    padding: 1mm 3mm;
    font-size: 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2mm;
    flex-wrap: nowrap;
  }
  body:not(.pdf-mode) .footer .printed-at {
    font-size: 8.5px;
    white-space: nowrap;
    flex-shrink: 0;
    margin-bottom: 0;
    text-align: right;
  }
  body:not(.pdf-mode) .footer .ayah {
    flex: 1;
    min-width: 0;
  }
}
.title-top{
  text-align:right;
  text-transform:uppercase;
  font-weight:800;
  color:var(--brand-dark);
  letter-spacing:3px;
  font-size:18px;
  padding:0.5mm 8mm 0.5mm;
  background: var(--bg);
  border:2px solid var(--brand);
  border-bottom:none;
}
.header{
  display:grid;
  grid-template-columns: 67% 33%;
  align-items:flex-start;
  gap:2mm;
  padding:0px 4mm 2mm;
  background: var(--bg);
  border:none;
}
.header-right{
  position:relative;
}
.header-right:before{
  content:"";
  position:absolute;
  left:-1.5mm;
  top:0;
  bottom:-11px;
  width:2px;
  background: var(--brand);
}
.header-left{
  display:flex;
  align-items:flex-start;
  gap:4mm;
  padding-top:1px;
  margin-top:-20px;
}
.header-left .brand{
  font-weight:800;
  letter-spacing:.8px;
  color:var(--brand-dark);
  font-size:16px;
  line-height:1.1;
  margin-top:0;
}
.header-left .tag{
  font-size:7.5px;
  color:var(--muted);
  white-space:nowrap;
  line-height:1.2;
}
.logo{
  width:16mm; height:16mm; background:#fff; border:2px solid var(--brand); border-radius:50%;
  display:grid; place-items:center;
  flex-shrink:0;
  overflow:hidden;
}
.logo img{
  width:100%;
  height:100%;
  object-fit:cover;
  border-radius:50%;
}
.logo svg{ width:10mm; height:10mm; fill:var(--brand); }
.header-right{
  text-align:left;
  font-size:12px;
  line-height:1.25;
  margin-top:9px;
  padding-left:2px;
  max-width:100%;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.header-right .row{
  white-space:normal;
  margin-bottom:0.5mm;
}
.header-right .row:last-child{
  margin-bottom:0;
}

.serial{
  font-size:11px;
}
.serial b{ color:var(--brand-dark); padding-left:2mm; }

/* Items Grid - Using CSS Grid instead of table for reliable vertical alignment in PDF */
.table-wrap{ padding:1mm 5mm 1mm; }
.table-wrap{ padding-top:4px; }

/* Grid-based items layout - Using flexbox rows with absolute positioning for content */
.items-grid {
  width: 100%;
  border: 1px solid var(--line);
  font-size: 10.5px;
}
.items-grid .grid-row {
  display: flex;
  flex-direction: row;
  align-items: stretch; /* All cells same height */
  border-bottom: 1px solid var(--line);
}
.items-grid .grid-row:last-child {
  border-bottom: none;
}
.items-grid .grid-row.header-row {
  background: rgba(31,138,59,.08);
  font-weight: 700;
  text-transform: capitalize;
}
.items-grid .grid-cell {
  display: flex;
  flex-direction: column;
  justify-content: flex-start; /* Content at TOP */
  align-items: stretch;
  padding: 1.4mm 1.3mm;
  border-right: 1px solid var(--line);
  word-break: break-word;
  line-height: 1.35;
  box-sizing: border-box;
  flex-shrink: 0;
}
.items-grid .grid-cell:last-child {
  border-right: none;
}
.items-grid .grid-cell.col-sl { width: 8%; text-align: center; align-items: center; }
.items-grid .grid-cell.col-desc { width: 52%; white-space: pre-wrap; text-transform: capitalize; flex-grow: 1; flex-shrink: 1; align-items: flex-start; }
.items-grid .grid-cell.col-qty { width: 12%; text-align: center; align-items: center; }
.items-grid .grid-cell.col-price { width: 14%; text-align: center; align-items: center; }
.items-grid .grid-cell.col-amount { width: 14%; text-align: center; align-items: center; }
.variant-chunk {
  display: inline-block;
  white-space: nowrap;
}

/* Content always at top - using block display */
.desc-clamp {
  display: block;
  line-height: 1.15;
  margin: 0;
  padding: 0;
}

.cell-content {
  display: block;
  line-height: 1.35;
  margin: 0;
  padding: 0;
}

/* Empty row styling */
.items-grid .grid-row.empty-row .grid-cell {
  min-height: 5mm;
}

/* Legacy table support (fallback) */
table.items {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid var(--line);
}
.items th, .items td {
  border: 1px solid var(--line);
  font-size: 10.5px;
  word-break: break-word;
  vertical-align: top;
  padding: 1.4mm 1.3mm;
}
.items thead th {
  background: rgba(31,138,59,.08);
  font-weight: 700;
  text-transform: capitalize;
}

/* Totals block */
.totals{
  display:flex;
  justify-content:flex-end;
  gap:4mm; margin-top:2mm; align-items:start;
}
.totals:has(.left-section){
  display:grid; grid-template-columns: 1fr 45mm;
}
.left-section{
  display:flex;
  flex-direction:column;
  gap:2mm;
}
.note{
  font-size:11.5px; color:var(--muted);
}
.courier-name{
  font-size:22px;
  color:var(--ink);
  font-weight:700;
}
.courier-cn{
  margin-top:1mm;
}
.courier-cn .cn-value{
  font-size:20px;
  font-weight:700;
}
.additional-info{
  font-size:13px;
  color:var(--muted);
  margin-top:1mm;
}

.condition-line{
  font-size:16px;
  color:var(--ink);
  font-weight:700;
  margin-top:1mm;
}
.sum{
  border:1px solid var(--line);
}
.sum .row{
  display:grid; grid-template-columns: 1fr 1fr; border-bottom:1px solid var(--line);
  align-items: start;
}
.sum .row:last-child{ border-bottom:0; }
.sum .row .k{
  padding:2mm; background:rgba(31,138,59,.06); font-weight:700; font-size:13px;
  display: flex; align-items: flex-start; height: 100%;
}
.sum .row .v{
  padding:2mm; text-align:right; font-variant-numeric: tabular-nums; font-size:13px;
  display: flex; align-items: flex-start; justify-content: flex-end; height: 100%;
}

/* Signatures */
.signs{
  display:grid; grid-template-columns:1fr 1fr; gap:6mm;
  padding:1mm 6mm 2mm;
  margin-top:auto;
  min-height:16mm;
}
.sig{
  position:relative; padding-top:10mm; text-align:center; font-size:10px; color:var(--muted);
}
.sig:before{
  content:""; position:absolute; left:0; right:0; top:7mm; height:0;
  border-top:1px solid var(--brand);
}

/* Footer Hadith/ayah */
.footer{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:2mm;
  flex-wrap:nowrap;
  padding:1mm 6mm 1.5mm;
  border-top: 2px solid var(--brand);
  background:linear-gradient(180deg, #fff 0%, var(--bg) 100%);
  font-size:10.5px; color:#1a1a1a;
}
.footer .printed-at{
  font-size:10px;
  color:#2a2a2a;
  margin-bottom:0;
  white-space:nowrap;
  flex-shrink:0;
  text-align:right;
}
.footer .ayah{
  display:block;
  flex:1;
  min-width:0;
  padding:0.5mm 2mm;
  border-left:3px solid var(--brand);
}

/* Utility for placeholder lines when values empty */
.placeholder{
  display:inline-block; min-width:22mm; border-bottom:1px dotted #999; height:1.2em;
}

/* Optional watermark for copy control (toggle display:none to hide) */
.watermark{
  position:absolute; inset:auto 0 45%; text-align:center;
  opacity:.06; font-weight:800; letter-spacing:4px; font-size:46px;
  color:var(--brand-dark); display:none;
}
.paid-stamp{
  display:inline-block;
  align-self:flex-start;
  width:fit-content;
  max-width:max-content;
  margin-top:2.5mm;
  transform:rotate(-8deg);
  color:#7ac943;
  border:2px solid #7ac943;
  font-weight:800;
  letter-spacing:2px;
  text-transform:uppercase;
  padding:2.5mm 7mm;
  font-size:18px;
  border-radius:2mm;
}
.credit-stamp{
  display:inline-block;
  align-self:flex-start;
  width:fit-content;
  max-width:max-content;
  margin-top:2.5mm;
  transform:rotate(-8deg);
  color:#dc2626;
  border:2px solid #dc2626;
  font-weight:800;
  letter-spacing:2px;
  text-transform:uppercase;
  padding:2.5mm 7mm;
  font-size:18px;
  border-radius:2mm;
}
.page-note{
  margin-top:auto;
  padding:3mm 6mm;
  text-align:center;
  font-size:12.5px;
  color:var(--muted);
  border-top:1px dashed var(--line);
}
</style>
</head>
<body class="pdf-mode">
  ${pages.map((page) => `
  <div class="memo${page.isLastPage ? '' : ' page-break'}">
    <div class="content-wrapper">
      <div class="title-top">INVOICE</div>
      
      <div class="header">
        <div class="header-left">
          ${businessSettings.logo_url ? `
          <div class="logo" aria-label="Logo">
            <img src="${businessSettings.logo_url}" alt="${businessSettings.business_name} Logo" />
          </div>
          ` : `
          <div class="logo" aria-label="Logo">
            <!-- simple palm icon fallback -->
            <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
              <path d="M12 2c2.8 0 4.7 1.1 6 2.5-2.6-.3-4.6.2-6 1.7-1.4-1.5-3.4-2-6-1.7C7.3 3.1 9.2 2 12 2ZM8 7c2.5.1 4 .7 4 2.3 0-1.6 1.5-2.2 4-2.3-1.2 1.4-2.6 2.1-4 2.1S9.2 8.4 8 7Zm3 4.5h2v10h-2v-10Z"/>
            </svg>
          </div>
          `}
          <div>
            <div class="brand">${(businessSettings.business_name || 'RAHE DEEN').toUpperCase()}</div>
            <div class="tag">${businessSettings.tagline || 'WE SUPPLY ALL KINDS OF READY MADE GARMENTS'}</div>
            <div class="header-contact" style="margin-top:0.5mm;">
              ${businessSettings.phone ? `<div><strong>Phone:</strong> ${businessSettings.phone}${businessSettings.whatsapp && businessSettings.whatsapp !== businessSettings.phone ? ` | ${businessSettings.whatsapp}` : ''}</div>` : ''}
              ${(businessSettings.primary_email || businessSettings.email) ? `<div><strong>Email:</strong> ${businessSettings.primary_email || businessSettings.email}</div>` : ''}
              ${addressLine ? `<div><strong>Address:</strong> ${addressLine}</div>` : ''}
            </div>
            <div class="serial" style="margin-top:1mm;">INV NO: <b>${sale.invoice_number}</b></div>
          </div>
        </div>
        
        <div class="header-right">
          <div class="row"><strong>Name:</strong> ${sale.customer_name || 'Walk-in Customer'}</div>
          ${sale.saved_customer_name && sale.saved_customer_name !== sale.customer_name ? `<div class="row"><strong>Saved Customer:</strong> ${sale.saved_customer_name}</div>` : ''}
          <div class="row"><strong>Address:</strong> ${sale.customer_address || '-'}</div>
          <div class="row"><strong>Phone:</strong> ${sale.customer_phone || '-'}</div>
          <div class="row"><strong>Date:</strong> ${formatDate(sale.created_at, systemSettings.date_format || 'dd/MM/yyyy')}</div>
        </div>
        <div class="watermark">INVOICE</div>
      </div>
      <div class="table-wrap">
        <div class="items-grid" style="width:100%;border:1px solid #1f8a3b;font-size:10.5px;">
          <div class="grid-row header-row" style="display:flex;flex-direction:row;align-items:stretch;border-bottom:1px solid #1f8a3b;background:rgba(31,138,59,.08);font-weight:700;">
            <div class="grid-cell col-sl" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:8%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;">SL.</div>
            <div class="grid-cell col-desc" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;width:52%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;flex-grow:1;">Item Description</div>
            <div class="grid-cell col-qty" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:12%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;">Qty.</div>
            <div class="grid-cell col-price" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:14%;padding:1.4mm 1.3mm;border-right:1px solid #1f8a3b;">Price</div>
            <div class="grid-cell col-amount" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:14%;padding:1.4mm 1.3mm;">Amount</div>
          </div>
          ${page.itemRows}
        </div>

        ${page.isLastPage ? `
        <div class="totals">
          <div class="left-section">
            ${businessSettings.invoice_footer_message ? `<div class="note">${businessSettings.invoice_footer_message}</div>` : ''}
            ${sale.courier_name ? `<div class="courier-name"><strong>${isStorePickup ? sale.courier_name : `Courier: ${sale.courier_name}`}</strong></div>` : ''}
            ${sale.cn_number ? `<div class="courier-cn"><span class="cn-value">#${sale.cn_number}</span></div>` : ''}
            ${sale.additional_info ? `<div class="additional-info">${sale.additional_info}</div>` : ''}
            ${conditionValue > 0 && !isSteadfast && !isStorePickup ? `<div class="condition-line">COD = ${formatCurrency(codDueAmount, currencySymbol)} + Charge</div>` : ''}
            ${showPaidStamp ? `<div class="paid-stamp">Paid</div>` : ''}
            ${showCreditStamp ? `<div class="credit-stamp">Credit</div>` : ''}
          </div>
          <div class="sum">
            ${chargeValue > 0 ? `<div class="row" style="display:grid;grid-template-columns:1fr 1fr;align-items:start;"><div class="k" style="display:flex;align-items:flex-start;padding:2mm;">Charge</div><div class="v" style="display:flex;align-items:flex-start;justify-content:flex-end;padding:2mm;">${formatCurrency(chargeValue, currencySymbol)}</div></div>` : ''}
            <div class="row" style="display:grid;grid-template-columns:1fr 1fr;align-items:start;"><div class="k" style="display:flex;align-items:flex-start;padding:2mm;">Total</div><div class="v" style="display:flex;align-items:flex-start;justify-content:flex-end;padding:2mm;">${formatCurrency((sale.subtotal || 0) + chargeValue, currencySymbol)}</div></div>
            ${discountValue > 0 ? `<div class="row" style="display:grid;grid-template-columns:1fr 1fr;align-items:start;"><div class="k" style="display:flex;align-items:flex-start;padding:2mm;">Discount</div><div class="v" style="display:flex;align-items:flex-start;justify-content:flex-end;padding:2mm;">-${formatCurrency(discountValue, currencySymbol)}</div></div>` : ''}
            ${isCreditSale
        ? (creditDueAmount > 0 ? `<div class="row" style="display:grid;grid-template-columns:1fr 1fr;align-items:start;"><div class="k" style="display:flex;align-items:flex-start;padding:2mm;">Credit</div><div class="v" style="display:flex;align-items:flex-start;justify-content:flex-end;padding:2mm;">${formatCurrency(creditDueAmount, currencySymbol)}</div></div>` : '')
        : (amountPaidValue > 0 ? `<div class="row" style="display:grid;grid-template-columns:1fr 1fr;align-items:start;"><div class="k" style="display:flex;align-items:flex-start;padding:2mm;">Adv</div><div class="v" style="display:flex;align-items:flex-start;justify-content:flex-end;padding:2mm;">${formatCurrency(amountPaidValue, currencySymbol)}</div></div>` : '')
      }
            ${dueAmount > 0 ? `<div class="row" style="display:grid;grid-template-columns:1fr 1fr;align-items:start;"><div class="k" style="display:flex;align-items:flex-start;padding:2mm;">Due</div><div class="v" style="display:flex;align-items:flex-start;justify-content:flex-end;padding:2mm;">${formatCurrency(dueAmount, currencySymbol)}</div></div>` : ''}
          </div>
        </div>
        ` : `<div class="page-note">Continued on next page...</div>`}
      </div>

      ${page.isLastPage ? `
      <div class="signs">
        <div class="sig">Customer's sign</div>
        <div class="sig">Merchant's sign</div>
      </div>
      ` : `<div style="height:6mm;"></div>`}
    </div>

    ${page.isLastPage ? `
    <div class="footer flex flex-row">
      <div class="ayah">আল্লাহ ব্যবসায়কে হালাল এবং সুদকে হারাম করেছেন (সূরা বাকারা : ২৭৫)</div>
      <div class="printed-at">Printed At: ${printedAtTime}</div>
    </div>
    ` : ''}
  </div>
  `).join('')}
</body>
</html>`;

  return html;
};
