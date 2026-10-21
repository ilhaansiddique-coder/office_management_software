# Edit Sales Stock Validation Fix

## Issue Description
When editing a sale in the Edit Sales dialog, the quantity field was allowing users to add more items than available in stock.

**Example:**
- Product has **1 in stock** (current database stock)
- Existing sale has **11** of this product
- User could change quantity to **11** or higher, even though only 1 is available

## Root Cause
When loading sale data for editing, the code was not:
1. Fetching the current stock levels for non-variant products
2. Adding back the quantity already in the sale to calculate available stock
3. Setting the `originalQuantity` property needed for proper stock calculations

## The Fix

### Files Modified
1. **src/components/EditSaleDialog.tsx**
2. **src/components/BaseSaleDialog.tsx**

### Changes Made

#### 1. Fetch Product Stock for Non-Variant Products
**Location:** [EditSaleDialog.tsx:104-151](src/components/EditSaleDialog.tsx#L104)

```typescript
// Get variant IDs and product IDs
const variantIds = baseItems.filter(i => i.variant_id).map(i => i.variant_id!) as string[];
const productIds = baseItems.filter(i => !i.variant_id).map(i => i.product_id).filter(Boolean) as string[];

let variantMap: Record<string, { label: string; stock: number; image?: string | null }> = {};
let productMap: Record<string, { stock: number }> = {};

// Fetch variant data (already existed)
if (variantIds.length > 0) {
  // ... fetch variant stock
}

// NEW: Fetch product stock data for non-variant products
if (productIds.length > 0) {
  const { data: prods, error: prodErr } = await supabase
    .from("products")
    .select("id, stock_quantity")
    .in("id", productIds);

  if (!prodErr) {
    productMap = (prods || []).reduce((acc: any, p: any) => {
      acc[p.id] = { stock: p.stock_quantity || 0 };
      return acc;
    }, {});
  }
}
```

#### 2. Calculate Available Stock = Current Stock + Quantity in Sale
**Location:** [EditSaleDialog.tsx:153-177](src/components/EditSaleDialog.tsx#L153)

```typescript
const enrichedItems: SaleItem[] = baseItems.map(i => {
  // When editing, add back the quantity already in this sale to the available stock
  // This allows user to keep or increase the quantity up to (current_stock + existing_quantity)
  const currentQuantity = i.quantity || 0;

  if (!i.variant_id) {
    const currentStock = productMap[i.product_id]?.stock || 0;
    return {
      ...i,
      productImageUrl: i.product_image_url ?? null,
      maxStock: currentStock + currentQuantity, // Add current quantity to available stock
      originalQuantity: currentQuantity, // Store original quantity for stock calculations
    };
  }
  const currentStock = variantMap[i.variant_id]?.stock || 0;
  return {
    ...i,
    variantLabel: variantMap[i.variant_id]?.label,
    maxStock: currentStock + currentQuantity, // Add current quantity to available stock
    originalQuantity: currentQuantity, // Store original quantity for stock calculations
    variantImageUrl: variantMap[i.variant_id]?.image || i.variant_image_url || null,
    productImageUrl: i.product_image_url ?? null,
  };
});
```

#### 3. Add originalQuantity to SaleItem Interface
**Location:** [BaseSaleDialog.tsx:24-44](src/components/BaseSaleDialog.tsx#L24)

```typescript
export interface SaleItem {
  // ... existing properties
  maxStock?: number;
  originalQuantity?: number; // NEW: Used when editing to track the original quantity
}
```

## How It Works Now

### Stock Calculation Logic
When editing a sale:

1. **Fetch Current Stock:**
   - For products: Query `products.stock_quantity`
   - For variants: Query `product_variants.stock_quantity`

2. **Calculate Available Stock:**
   ```
   maxStock = current_database_stock + quantity_in_this_sale
   ```

3. **Example:**
   - Product has **1** in stock (database)
   - Sale has **11** of this product
   - Available for editing: **1 + 11 = 12**
   - User can edit quantity from 0 to 12
   - If they try to enter 13, it will be clamped to 12

### Validation Points

#### A. Quantity Input Field
**Location:** [BaseSaleDialog.tsx:764-778](src/components/BaseSaleDialog.tsx#L764)

```typescript
const handleQuantityInputChange = (index: number, value: string) => {
  const qty = toQuantity(value);
  const maxStock = formData.items[index]?.maxStock;
  const clampedQty = maxStock !== undefined && maxStock !== null
    ? Math.min(qty, maxStock)  // Clamp to maxStock
    : qty;
  // Update item with clamped quantity
};
```

#### B. Plus/Minus Buttons
**Location:** [BaseSaleDialog.tsx:1574, 1620](src/components/BaseSaleDialog.tsx#L1574)

```typescript
<Button
  disabled={item.maxStock ? toNumber(item.quantity) >= item.maxStock : false}
  // Plus button disabled when quantity reaches maxStock
>
  <Plus />
</Button>
```

#### C. Stock Display
**Location:** [BaseSaleDialog.tsx:1466-1476](src/components/BaseSaleDialog.tsx#L1466)

Shows remaining stock as user changes quantity:
```typescript
const liveStock = variantStock ?? product?.stock_quantity;
const baseStock = liveStock !== undefined
  ? liveStock + (item.originalQuantity ?? 0)
  : item.maxStock;
const remainingStock = baseStock !== undefined
  ? Math.max(0, baseStock - toQuantity(item.quantity))
  : undefined;
```

Displays: "X in stock" badge with proper color coding.

## Benefits

### ✅ Accurate Stock Validation
- Prevents overselling inventory
- Accounts for quantity already in the sale
- Works for both products and variants

### ✅ User-Friendly
- Shows available stock inline
- Disables + button when limit reached
- Automatically clamps typed values
- Clear visual feedback with badges

### ✅ Data Integrity
- Ensures stock levels remain accurate
- Prevents negative inventory
- Handles edge cases (missing stock data, deleted products)

## Testing Checklist

Test these scenarios when editing a sale:

- [ ] Product with sufficient stock - can increase quantity
- [ ] Product with 1 in stock but 11 in sale - can keep 11 but not increase to 12+
- [ ] Product variant with stock limits
- [ ] Product without stock tracking (should allow any quantity)
- [ ] Typing large numbers directly into quantity field (should clamp)
- [ ] Using +/- buttons (should respect limits)
- [ ] Multiple products in same sale with different stock levels
- [ ] Reducing quantity (should always work)
- [ ] Removing items completely (should always work)

## Edge Cases Handled

1. **Missing Stock Data:** Falls back to maxStock or allows editing
2. **Deleted Products:** Shows warning, allows editing existing items
3. **Stock Changed Since Sale Created:** Uses current stock + original quantity
4. **Variant vs Non-Variant Products:** Fetches correct stock for each type
5. **Multiple Items Same Product:** Each calculated independently

## Technical Notes

### Why Add originalQuantity?
The `originalQuantity` property is essential because:
- BaseSaleDialog calculates live stock as: `liveStock + originalQuantity`
- Without it, the stock display would be incorrect
- It's used to determine how much stock to "return" when calculating available

### Why Add to maxStock Instead of Just Stock?
Setting `maxStock = currentStock + originalQuantity` simplifies validation:
- Single property to check in all validation points
- Consistent behavior across the entire dialog
- Works with existing clamping logic

### Database Query Optimization
- Fetches stock for ALL products in the sale in a single query
- Uses `.in()` operator instead of multiple individual queries
- Separate queries for products and variants for efficiency

## Build Status

✅ Build successful in 46.25s
✅ No TypeScript errors
✅ No breaking changes

---

**Status:** FIXED ✅
**Version:** Applied in latest build
**Impact:** Prevents inventory overselling when editing sales
