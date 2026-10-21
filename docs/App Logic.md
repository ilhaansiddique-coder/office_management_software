# App Logics Documentation

This document provides a comprehensive overview of all business logic, permissions, visibility rules, and configuration patterns used throughout the Rahestock application.

---

## Table of Contents

1. [User Roles & Permissions](#user-roles--permissions)
2. [Route Protection & Navigation](#route-protection--navigation)
3. [Courier Integration Logic](#courier-integration-logic)
4. [Order Status Management](#order-status-management)
5. [Payment Methods](#payment-methods)
6. [Visibility & UI Logic](#visibility--ui-logic)

---

## User Roles & Permissions

### Role Hierarchy

| Role | Description | Permission Level |
|------|-------------|-----------------|
| `admin` | Full system access | All permissions (`*`) - bypasses all checks |
| `manager` | Department management | Configurable permissions via `role_permissions` table |
| `staff` | Day-to-day operations | Configurable permissions via `role_permissions` table |
| `viewer` | Read-only access | Limited view permissions only |

### Permission System Architecture

**Location:** `src/hooks/useUserRole.tsx`, `src/hooks/usePermissions.tsx`

```
Admin Check → Bypass all permissions (return true)
     ↓ (if not admin)
Fetch role_permissions table → Check if permission_key exists with allowed=true
```

### Default Permissions by Role

**Location:** `src/constants/permissions.ts`

#### Manager Default Permissions
```typescript
[
  "access.dashboard", "access.alerts",
  "products.view", "products.add", "products.duplicate", "products.edit", "products.delete", "products.import_export",
  "inventory.view", "inventory.adjust_stock",
  "sales.view", "sales.create", "sales.edit",
  "invoices.view", "invoices.download_print", "invoices.export",
  "customers.view", "customers.add", "customers.edit", "customers.import_export", "customers.view_history",
  "reports.view", "reports.export",
  "settings.view_business", "settings.manage_notifications", "settings.manage_appearance", "settings.change_password"
]
```

#### Staff Default Permissions
```typescript
[
  "access.dashboard", "access.alerts",
  "products.view",
  "inventory.view",
  "sales.view", "sales.create",
  "invoices.view", "invoices.download_print",
  "customers.view", "customers.add", "customers.edit",
  "settings.change_password"
]
```

#### Viewer Default Permissions
```typescript
[
  "access.dashboard", "access.alerts",
  "products.view",
  "inventory.view",
  "sales.view",
  "invoices.view",
  "customers.view",
  "reports.view",
  "settings.view_business"
]
```

### Permission Keys Reference

| Category | Permission Key | Description |
|----------|---------------|-------------|
| **Access** | `access.dashboard` | View dashboard |
| | `access.alerts` | View alerts page |
| **Products** | `products.view` | View products list |
| | `products.add` | Add new products |
| | `products.edit` | Edit existing products |
| | `products.delete` | Delete products |
| | `products.duplicate` | Duplicate products |
| | `products.import_export` | Import/export products |
| **Inventory** | `inventory.view` | View inventory |
| | `inventory.adjust_stock` | Adjust stock levels |
| **Sales** | `sales.view` | View sales list |
| | `sales.create` | Create new sales |
| | `sales.edit` | Edit existing sales |
| | `sales.delete` | Delete sales |
| **Invoices** | `invoices.view` | View invoices |
| | `invoices.download_print` | Download/print invoices |
| | `invoices.export` | Export invoices |
| **Customers** | `customers.view` | View customers |
| | `customers.add` | Add customers |
| | `customers.edit` | Edit customers |
| | `customers.delete` | Delete customers |
| | `customers.import_export` | Import/export customers |
| | `customers.view_history` | View customer history |
| **Reports** | `reports.view` | View reports |
| | `reports.export` | Export reports |
| **Settings** | `settings.view_business` | View business settings |
| | `settings.edit_business` | Edit business settings |
| | `settings.manage_notifications` | Manage notification settings |
| | `settings.manage_appearance` | Manage appearance settings |
| | `settings.change_password` | Change own password |
| **Admin** | `admin.manage_roles` | Manage user roles and permissions |
| **Courier** | `courier.send` | Send orders to courier |
| | `courier.refresh` | Refresh courier status |

### PermissionGate Component

**Location:** `src/components/PermissionGate.tsx`

Usage:
```tsx
<PermissionGate permission="products.edit">
  <Button>Edit Product</Button>
</PermissionGate>

// With fallback
<PermissionGate permission="admin.manage_roles" fallback={<span>Access Denied</span>}>
  <AdminPanel />
</PermissionGate>
```

---

## Route Protection & Navigation

### ProtectedRoute Component

**Location:** `src/components/ProtectedRoute.tsx`

#### Route Permission Mapping

| Path | Required Permission |
|------|---------------------|
| `/` | `access.dashboard` |
| `/products` | `products.view` |
| `/sales` | `sales.view` |
| `/customers` | `customers.view` |
| `/reports` | `reports.view` |
| `/invoices` | `invoices.view` |
| `/alerts` | `access.alerts` |
| `/settings` | `settings.view_business` |
| `/admin` | `admin.manage_roles` |

#### Route Protection Flow

```
1. Check if user is authenticated
   ↓ (not authenticated)
   Redirect to /auth

2. Check if admin recovery needed (no role assigned)
   ↓ (needs recovery)
   Show AdminRecovery component

3. Check required permission
   ↓ (no permission)
   Find fallback path based on available permissions
   Show toast "You don't have permission..."
   Redirect to fallback path

4. Render protected content
```

### Sidebar Navigation Visibility

**Location:** `src/components/AppSidebar.tsx`

Menu items are filtered by permission:
```tsx
menuItems.filter((item) => hasPermission(item.permissionKey))
```

Special logic for Trash access:
```tsx
const canAccessTrash =
  hasPermission("products.delete") ||
  hasPermission("sales.delete") ||
  hasPermission("customers.delete");
```

---

## Courier Integration Logic

### Supported Couriers

| Courier | API Sending | Status Refresh | Tracking Timeline | Configuration Required |
|---------|-------------|----------------|-------------------|----------------------|
| Steadfast | Yes | Yes | Yes | API Key + Secret Key |
| Pathao | Yes | Yes | Yes | Access Token + Store ID |
| Sundorban | No | Yes | Yes | None (scraping-based) |
| Janani/Janani Express | No | Yes | Yes | None (scraping-based) |
| Other couriers | No | No | No | N/A |

### Courier Configuration Check

**Location:** `src/hooks/useWebhookSettings.tsx`

```typescript
// Check if courier has API credentials configured
isCourierConfigured(courier: 'Steadfast' | 'Pathao'): boolean

// Check if courier is enabled in settings
isCourierEnabled(courier: 'Steadfast' | 'Pathao'): boolean

// Check if courier is ready to use (configured AND enabled)
isCourierReady(courier: 'Steadfast' | 'Pathao'): boolean
```

### Configuration Requirements

**Steadfast:**
```typescript
webhookSettings.steadfast_api_key && webhookSettings.steadfast_secret_key
```

**Pathao:**
```typescript
webhookSettings.pathao_access_token && webhookSettings.pathao_store_id
```

### Button Enable/Disable Logic

**Location:** `src/pages/Sales.tsx`

#### "Send to Courier" Button (Truck icon)

```typescript
const canSendToCourier = (sale: any) => {
  const courierName = String(sale.courier_name || "").trim().toLowerCase();
  if (!courierName) return false;

  // Only Steadfast and Pathao support sending via API
  if (courierName === "steadfast") return isCourierReady("Steadfast");
  if (courierName === "pathao") return isCourierReady("Pathao");

  // Other couriers require manual CN entry
  return false;
};

// Button: disabled={!canSendToCourier(sale)}
```

#### "View Courier Status" Button (PackageSearch icon)

Only shown when `shouldShowCourierButtons(sale)` returns true (meaning CN number exists and courier is configured).

#### "Refresh Status" Button (RefreshCw icon)

```typescript
const shouldShowCourierButtons = (sale: Sale) => {
  // Must have CN number
  if (!sale.consignment_id && !sale.cn_number) return false;

  const courierName = String(sale.courier_name || "").trim().toLowerCase();

  // Check if courier tracking is available
  if (courierName === "steadfast") return isCourierReady("Steadfast");
  if (courierName === "pathao") return isCourierReady("Pathao");
  if (courierName === "sundorban") return true; // Always if has CN
  if (courierName === "janani" || courierName === "janani express") return true;

  return false;
};

// Button: disabled={isRefreshingStatuses || refreshingIndividual === sale.id || !shouldShowCourierButtons(sale)}
```

### Button State Summary

| Courier | Has CN | API Configured | Send Button | Refresh Button |
|---------|--------|----------------|-------------|----------------|
| Steadfast | - | Yes | Enabled | - |
| Steadfast | - | No | Disabled | - |
| Steadfast | Yes | Yes | - | Enabled |
| Steadfast | Yes | No | - | Disabled |
| Pathao | - | Yes | Enabled | - |
| Pathao | - | No | Disabled | - |
| Pathao | Yes | Yes | - | Enabled |
| Pathao | Yes | No | - | Disabled |
| Sundorban | Yes | N/A | Disabled | Enabled |
| Janani | Yes | N/A | Disabled | Enabled |
| Other | Any | N/A | Disabled | Disabled |

### Tracking Number vs Consignment ID

**Steadfast has two identifiers:**
- `consignment_id` - Numeric ID for API operations (e.g., `1234567`)
- `tracking_number` (tracking_code) - Alphanumeric code for public tracking (e.g., `SFR260210ST210D6F1BD`)

**Database columns:**
- `sales.consignment_id` - Stores numeric consignment ID
- `sales.cn_number` - Alternative/legacy CN number field
- `sales.tracking_number` - Stores alphanumeric tracking code

**Usage:**
- API calls use `consignment_id`
- Public tracking URL uses `tracking_number`: `https://steadfast.com.bd/t/{tracking_number}`

---

## Order Status Management

### Courier Status Values

**Location:** `src/components/ManualCourierStatusSelector.tsx`

| Status Value | Label | Color |
|--------------|-------|-------|
| `not_sent` | Not Sent | Gray |
| `pending` | Pending | Yellow |
| `in_review` | In Review | Yellow |
| `sent` | Sent | Blue |
| `in_transit` | In Transit | Blue |
| `delivery_ready` | Delivery Ready | Teal |
| `out_for_delivery` | Out for Delivery | Orange |
| `delivered` | Delivered | Green |
| `payout_ready` | Payout Ready | Purple |
| `returned` | Returned | Red |
| `lost` | Lost | Red |
| `cancelled` | Cancelled | Red |

### Cancelled Status Set

Statuses that trigger inventory restoration:
```typescript
const CANCELLED_STATUSES = new Set(["cancelled", "returned", "lost"]);
```

### Steadfast Status Code Mapping

**Location:** `supabase/functions/steadfast-status-check/index.ts`

| Code | Status |
|------|--------|
| -2 | Partial Delivered |
| -1 | Cancelled |
| 0 | In Review |
| 1 | In Transit |
| 2 | Delivered |
| 3 | On Hold |
| 4 | Pending |
| 5 | Returned |
| 6 | Return in Transit |
| 7 | Return Acknowledged |
| 8 | Settled/Paid |
| 10 | Return Delivered |

### Status Update Flow

```
Manual Status Change
       ↓
Check if status is in CANCELLED_STATUSES
       ↓ (yes)
Check if inventory_restored flag is false
       ↓ (not restored)
Fetch sale items with product/variant IDs
       ↓
Restore stock quantities to products/variants
       ↓
Set inventory_restored = true
       ↓
Log activity
```

---

## Payment Methods

### Static Payment Methods

**Location:** `src/hooks/usePaymentMethods.tsx`

| Key | Label | Type | Default Terms | Default Paid Behavior |
|-----|-------|------|---------------|----------------------|
| `cash` | Cash | cash | immediate | full |
| `bkash` | Bkash | mobile | immediate | full |
| `nagad` | Nagad | mobile | immediate | full |
| `ibbl` | IBBL | bank | immediate | full |
| `dbbl` | DBBL | bank | immediate | full |
| `city_bank` | City Bank | bank | immediate | full |
| `al_arafah` | Al Arafah | bank | immediate | full |
| `cod` | COD | cod | cod | zero |
| `credit` | Credit | credit | credit | zero |

### Payment Terms

| Term | Description |
|------|-------------|
| `immediate` | Payment expected immediately |
| `cod` | Cash on Delivery |
| `credit` | Payment deferred/on credit |
| `custom` | Custom payment terms |

### Payment Behavior

| Behavior | Description |
|----------|-------------|
| `full` | Full amount marked as paid by default |
| `zero` | Zero amount marked as paid by default (COD/Credit) |
| `custom` | Custom amount entry required |

### Key Normalization

```typescript
const normalizePaymentKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
```

Special case: `"condition"` normalizes to `"cod"`

### Discount Amount Validation

**Location:** `src/components/BaseSaleDialog.tsx`

Discount amount is capped to prevent negative Grand Total:

| Discount Type | Maximum Allowed |
|---------------|-----------------|
| Fixed Amount | Subtotal (e.g., if subtotal is ৳19,880, max discount is ৳19,880) |
| Percentage | 100% |

This ensures Grand Total can never go below ৳0.

### Payment Split Auto-Adjustment Logic

**Location:** `src/components/BaseSaleDialog.tsx`

When multiple payment methods are added (e.g., Cash + COD), the **last payment field always auto-updates** to show the remaining amount needed to reach the Grand Total.

#### Behavior:

1. **When discount/charge changes:**
   - Last payment field automatically adjusts to: `Grand Total - Sum of other payment fields`
   - Works for both increasing AND decreasing discount amounts

2. **When editing NON-LAST fields (e.g., Cash when COD is last):**
   - Field is capped to: `Grand Total - Sum of other NON-LAST fields`
   - Last field is EXCLUDED from the cap calculation, so you can freely edit upper fields
   - The last field auto-updates with the remaining amount
   - Example: Grand Total = ৳19,800, Cash = ৳500 → COD becomes ৳19,300
   - Example: Grand Total = ৳19,800, Cash = ৳19,800 → COD becomes ৳0

3. **When editing the LAST field:**
   - Field is capped to: `Grand Total - Sum of all other fields`
   - Cannot exceed the remaining amount after other fields

4. **Formula:**
   ```
   For Non-Last Fields: Max = Grand Total - Sum of Other Non-Last Fields
   For Last Field: Max = Grand Total - Sum of All Other Fields
   Last Field Auto-Update = max(0, Grand Total - Sum of Non-Last Fields)
   ```

#### Example:

| Field | Amount | Note |
|-------|--------|------|
| Subtotal | ৳19,880 | |
| Discount | -৳45 | User adds discount |
| **Grand Total** | **৳19,835** | |
| Cash (1st payment) | ৳500 | User enters manually |
| COD (2nd payment) | ৳19,335 | **Auto-calculated** |

#### Code:
```typescript
// Auto-adjust last payment split when discount/charge changes
useEffect(() => {
  const otherSplitsTotal = payment_splits.slice(0, -1).reduce(...);
  const newLastAmount = Math.max(0, grandTotal - otherSplitsTotal);
  // Update last split amount
}, [grandTotal, discountAmount, discountPercent, charge]);

// Auto-update last field when editing other payment amounts
if (field === "amount" && payment_splits.length > 1) {
  const lastIndex = payment_splits.length - 1;
  if (lastIndex !== index && lastSplit.method) {
    const remaining = Math.max(0, grandTotal - otherTotal);
    nextSplits[lastIndex].amount = String(remaining);
  }
}
```

---

## Visibility & UI Logic

### Sidebar Menu Items

**Location:** `src/components/AppSidebar.tsx`

```typescript
const menuItems = [
  { title: "Dashboard", url: "/", icon: Home, permissionKey: 'access.dashboard' },
  { title: "Products", url: "/products", icon: Package, permissionKey: 'products.view' },
  { title: "Sales (POS)", url: "/sales", icon: ShoppingCart, permissionKey: 'sales.view' },
  { title: "Customers", url: "/customers", icon: Users, permissionKey: 'customers.view' },
  { title: "Reports", url: "/reports", icon: BarChart3, permissionKey: 'reports.view' },
  { title: "Invoices", url: "/invoices", icon: FileText, permissionKey: 'invoices.view' },
  { title: "Alerts", url: "/alerts", icon: Bell, permissionKey: 'access.alerts' },
];
```

### Admin/Settings Visibility

- **Settings link:** Always visible (requires `settings.view_business`)
- **Admin link:** Only visible to users with `admin.manage_roles` permission

### Sales Table Header Actions

**Location:** `src/pages/Sales.tsx`

The "Refresh All" button is located in the **Actions column header** of the Sales History table:
- **Icon-only button** (no text label)
- **Permission:** `courier.refresh`
- **Tooltip:** "Refresh all courier statuses"
- **Function:** Opens a confirmation dialog to refresh all pending courier statuses in the current filtered view

```tsx
<TableHead>
  <div className="flex items-center gap-2">
    Actions
    <PermissionGate permission="courier.refresh">
      <Button onClick={() => setShowBulkRefreshDialog(true)}>
        <RefreshCw />
      </Button>
    </PermissionGate>
  </div>
</TableHead>
```

### Courier Status Dialog Visibility

**Location:** `src/components/CourierStatusDialog.tsx`

The dialog shows different sections based on courier type:

| Section | Steadfast | Pathao | Sundorban | Janani |
|---------|-----------|--------|-----------|--------|
| Tracking Code (editable) | Yes | No | No | No |
| CN Number | Yes | Yes | Yes | Yes |
| Courier Details | Yes | Yes | Yes | Yes |
| Tracking History | Yes | Yes | Yes | Yes |
| External Tracking Link | Yes | Yes | No | No |

### Real-time Permission Updates

**Location:** `src/hooks/useUserRole.tsx`

Permissions are updated in real-time via Supabase channels:
```typescript
supabase
  .channel(`role-permissions-${userRole.role}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" }, () => {
    queryClient.invalidateQueries({ queryKey: ["role-permissions", userRole.role] });
  })
  .subscribe();
```

Refresh interval: 15 seconds

---

## Database Schema Notes

### Key Tables

| Table | Purpose |
|-------|---------|
| `user_roles` | Maps users to roles |
| `role_permissions` | Maps roles to permission keys |
| `sales` | Sales records with courier tracking fields |
| `courier_webhook_settings` | Courier API configurations |

### Sales Table Courier Fields

| Column | Type | Description |
|--------|------|-------------|
| `courier_name` | TEXT | Name of courier service |
| `courier_status` | TEXT | Current delivery status |
| `consignment_id` | TEXT | Numeric API identifier |
| `cn_number` | TEXT | Alternative CN number |
| `tracking_number` | TEXT | Alphanumeric tracking code |
| `last_status_check` | TIMESTAMP | Last status refresh time |
| `inventory_restored` | BOOLEAN | Whether stock was restored for cancelled orders |

---

## Edge Functions

### Courier-Related Functions

| Function | Purpose |
|----------|---------|
| `steadfast-create-order` | Create order in Steadfast API |
| `steadfast-status-check` | Check order status from Steadfast |
| `pathao-proxy` | Proxy requests to Pathao API |
| `pathao-status-check` | Check order status from Pathao |
| `janani-status-check` | Scrape order status from Janani |
| `sundorban-status-check` | Scrape order status from Sundorban |
| `courier-status-check` | Generic status check dispatcher |
| `courier-webhook` | Handle incoming courier webhooks |
| `auto-refresh-courier-status` | Background auto-refresh for statuses |

---

*Last updated: 2026-02-13*
*Document version: 1.0*
