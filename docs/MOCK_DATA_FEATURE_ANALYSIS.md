# Mock Data Toggle Feature - Implementation Analysis & Discussion

**Status:** Pre-Implementation Analysis  
**Date:** March 29, 2026  
**Purpose:** Safe planning for mock data scaling feature in admin panel

---

## 📋 FEATURE OVERVIEW

**Requirement:** Create an admin panel toggle that scales sales data for demo/testing purposes.
- When **ENABLED**: Show scaled-down data (e.g., 10% of actual sales)
- When **DISABLED**: Show real data (100% unchanged)
- Impact: Display only, NO database modifications

---

## 🔍 CURRENT SYSTEM ANALYSIS

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────┐
│         Supabase Database (Source of Truth)         │
│  - sales table (real data, NEVER modified)          │
│  - system_settings table (stores toggle config)     │
└──────────────────────┬──────────────────────────────┘
                       │
               ┌───────▼────────┐
               │   React Query  │
               │   (Caching)    │
               └───────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐  ┌─────▼─────┐  ┌──────▼──────┐
   │Dashboard│  │Admin Panel │  │Sales Page   │
   │useDash- │  │Business    │  │useSales()   │
   │board()  │  │Analytics   │  │             │
   └────┬────┘  └─────┬─────┘  └──────┬──────┘
        │             │              │
        └─────────────┼──────────────┘
                      │
            ┌─────────▼──────────┐
            │ Mock Data Layer    │
            │ (Transform Display)│
            └────────────────────┘
                      │
                 ┌────▼────┐
                 │   UI    │
                 │(Display)│
                 └─────────┘
```

### Key Data Sources
1. **`useDashboard()` hook** - Calculates metrics (revenue, orders, customers, profit)
2. **`useSales()` hook** - Fetches raw sales records with items
3. **`BusinessAnalytics.tsx` component** - Displays aggregated stats

### Data Modification Points Analysis

| Component | Purpose | Current Role | Mock Impact |
|-----------|---------|--------------|-------------|
| `useDashboard.tsx` | Stats calculation | Aggregates sales data | ✅ Scale here |
| `useSales.tsx` | Sales fetching | Fetches raw sales | ✅ Scale here |
| `BusinessAnalytics.tsx` | UI rendering | Displays stats | ✅ Affected by above |
| Database (`supabase`) | Data storage | Source of truth | ❌ NEVER touch |
| `system_settings` table | App config | Store toggle flag | ✅ Extend this |

---

## ⚠️ RISKS & CONSTRAINTS

### DO's (Safe Practices)
✅ **DO** store toggle in `system_settings` table  
✅ **DO** apply scaling in hook data transformation (before UI)  
✅ **DO** scale ONLY numeric values (grand_total, revenue, fees, etc.)  
✅ **DO** use multiplier pattern (0.1 = 10%, 0.5 = 50%, etc.) for flexibility  
✅ **DO** cache configuration in React Query  
✅ **DO** add visible warning banner in admin when mock mode is active  
✅ **DO** log mock mode state changes for audit trail  
✅ **DO** make toggle easily reversible (no state pollution)  
✅ **DO** test all numeric calculations work with scaled values  
✅ **DO** document setting in code comments  

### DON'Ts (Must Avoid)
❌ **DON'T** modify database records directly  
❌ **DON'T** save fake data back to Supabase  
❌ **DON'T** use string find-replace scaling (brittle, error-prone)  
❌ **DON'T** intercept at database layer (violates separation of concerns)  
❌ **DON'T** break existing permission/RLS policies  
❌ **DON'T** create side-effects on other features (courier, payments, etc.)  
❌ **DON'T** forget to disable mock mode before production sync  
❌ **DON'T** apply scaling to IDs, status fields, or metadata  
❌ **DON'T** modify actual Payment Status, Courier Status fields  
❌ **DON'T** create new database tables without migration  

---

## 🏗️ PROPOSED IMPLEMENTATION STRATEGY

### Phase 1: Database Extension (Safer Approach)
**File:** `supabase/migrations/[NEW]_add_mock_data_toggle.sql`

```sql
ALTER TABLE "public"."system_settings" ADD COLUMN "mock_data_enabled" boolean DEFAULT false;
ALTER TABLE "public"."system_settings" ADD COLUMN "mock_data_scale" decimal DEFAULT 0.1; -- 0.1 = 10%
```

**Why this approach:**
- ✅ Extends existing settings table (no new tables)
- ✅ Backward compatible (defaults to disabled)
- ✅ Configurable scale factor
- ✅ Can be toggled on/off instantly
- ✅ Stored in database for persistence across sessions

### Phase 2: Context/Hook for Mock Data Logic
**New File:** `src/contexts/MockDataContext.tsx`

```typescript
interface MockDataConfig {
  enabled: boolean;
  scaleFactor: number; // 0.1 = 10%, 0.5 = 50%
}

export const useMockData = () => {
  const { systemSettings } = useSystemSettings();
  
  const config: MockDataConfig = {
    enabled: systemSettings.mock_data_enabled || false,
    scaleFactor: systemSettings.mock_data_scale || 0.1
  };
  
  const scaleSalesData = (sales: Sale[]): Sale[] => {
    if (!config.enabled) return sales;
    
    return sales.map(sale => ({
      ...sale,
      grand_total: sale.grand_total * config.scaleFactor,
      subtotal: sale.subtotal * config.scaleFactor,
      amount_paid: sale.amount_paid * config.scaleFactor,
      amount_due: sale.amount_due * config.scaleFactor,
      // Keep other fields unchanged
    }));
  };
  
  const scaleMetric = (value: number): number => {
    return config.enabled ? value * config.scaleFactor : value;
  };
  
  return { config, scaleSalesData, scaleMetric };
};
```

### Phase 3: Integration Points
1. **`useDashboard.tsx`** - Apply `scaleMetric()` to revenue calculations (4 places)
2. **`useSales.tsx`** - Apply `scaleSalesData()` to fetched sales (if needed for display)
3. **`BusinessAnalytics.tsx`** - No changes needed (inherits from hooks)

### Phase 4: UI in Admin Panel
**File:** `src/components/admin/SystemSettings.tsx` - Add new collapsible section:

```typescript
<CollapsibleCard
  title="Mock Data Configuration"
  description="For demo/testing purposes only. Scales down all sales metrics."
  icon={TestTube} // or similar icon
  sectionKey="mockData"
>
  {systemSettings.mock_data_enabled && (
    <DismissibleAlert 
      type="warning" 
      title="⚠️ Mock Data Mode Active"
      description="You are viewing scaled data. Real data is unchanged in database."
    />
  )}
  
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Switch
        checked={systemForm.mock_data_enabled}
        onCheckedChange={(checked) => 
          setSystemForm({...systemForm, mock_data_enabled: checked})
        }
        disabled={!canEdit}
      />
      <Label>Enable Mock Data Mode</Label>
    </div>
    
    <div>
      <Label>Scale Factor (0.1 = 10%, 0.5 = 50%)</Label>
      <Input
        type="number"
        min="0.01"
        max="1"
        step="0.1"
        value={systemForm.mock_data_scale}
        onChange={(e) => 
          setSystemForm({
            ...systemForm, 
            mock_data_scale: parseFloat(e.target.value)
          })
        }
        disabled={!canEdit || !systemForm.mock_data_enabled}
      />
    </div>
  </div>
</CollapsibleCard>
```

### Phase 5: Safety Features
1. **Visual Warning Banner** - Show in Admin panel header when mock mode active
2. **Audit Logging** - Log toggle state changes to activity logs
3. **Clear Naming** - Use "Mock Data" consistently everywhere
4. **Tooltip Docs** - Explain what mock mode does

---

## 💾 DATA FLOW EXAMPLES

### Example 1: Real Mode (Disabled)
```
Real DB: grand_total = 1000
→ useDashboard calculates: totalRevenue = 1000
→ Mock context: scaleFactor = 1.0 (disabled)
→ Display: "৳1000"
```

### Example 2: Mock Mode (10% Scale)
```
Real DB: grand_total = 1000
→ useDashboard calculates: totalRevenue = 1000
→ Mock context: scaleFactor = 0.1 (mock enabled)
→ Displayed value = 1000 * 0.1 = 100
→ Display: "৳100" ⚠️ (MOCK DATA)
```

**KEY POINT:** Database always has real data (1000). Only display is scaled.

---

## 🔒 SECURITY & ISOLATION CHECKLIST

- [ ] Mock scaling never touches Supabase data
- [ ] Scaling only affects display layer (hooks & UI)
- [ ] Toggle is admin-only (uses existing permission system)
- [ ] No synthetic data creation or injection
- [ ] No RLS policy changes needed
- [ ] Real data persists even if toggle is on
- [ ] Turning off toggle immediately restores real display
- [ ] No permanent state changes
- [ ] Audit trail logs toggle state changes
- [ ] Data integrity unaffected

---

## ⚡ IMPLEMENTATION EFFORT

| Phase | Files | Effort | Risk |
|-------|-------|--------|------|
| DB Migration | 1 file | Low | ⚪ None |
| Context/Hook | 1 new file | Medium | 🟢 Low |
| Hook Integration | 2 existing files (useDashboard, useSales) | Medium | 🟢 Low |
| UI Component | 1 existing file (SystemSettings) | Low | 🟢 Low |
| Testing | Manual QA | High | 🟡 Medium |
| **Total** | ~5 files | **4-6 hours** | **🟢 LOW** |

---

## 🚨 EDGE CASES & VALIDATION

| Scenario | Current Handling | Proposed Handling |
|----------|------------------|-------------------|
| Scale factor = 0 | Valid math | ✅ Allowed (shows zero revenue) |
| Scale factor = 1 | No scaling | ✅ Works (same as disabled) |
| Toggle on/off rapidly | UI flickers? | ✅ React Query cached correctly |
| Old sales + mock toggle | New sales only? | ✅ Scaling applies to ALL displayed sales |
| Filter by date + mock | Scaling applies? | ✅ YES - scaling happens after filtering |
| Export/Report features | Will mock data export? | ⚠️ Need to check if exports use hooks |
| Courier/Payment status | Should these scale? | ❌ NO - only financial values |

---

## ❓ QUESTIONS BEFORE IMPLEMENTATION

1. **Scale Factor Flexibility**
   - Should admin be able to customize the scale percentage (10%, 5%, 50%)?
   - Or use a fixed percentage?
   - **Recommendation:** Customizable (0.01 to 1.0)

2. **What Fields Should Scale?**
   - grand_total ✅
   - subtotal ✅
   - amount_paid ✅
   - amount_due ✅
   - profit/revenue ✅
   - fees ✅
   - What about prices per item? ✅
   - Courier fees? ⚠️ Discuss
   - Payment split amounts? ✅

3. **UI Location**
   - Add to SystemSettings admin tab? ✅ (Recommended)
   - Or create separate "Testing" admin tab?
   - Show warning on Dashboard when active? ✅ (Yes)

4. **Audit Requirements**
   - Log when mock mode is turned on/off? ✅
   - Log the scale factor changes? ✅
   - Include in activity logs visible to admins?

5. **Reports & Exports**
   - Should exports include mock data or real data?
   - Should PDFs show a watermark "MOCK DATA" when in mock mode?
   - Recommendation: Always show real data in exports (not mocked)

---

## 📝 IMPLEMENTATION SAFETY CHECKLIST

Before we code, confirm:

- [ ] You understand the data isn't modified in DB
- [ ] You want scale factor to be configurable
- [ ] You want visual warning when mock mode is active
- [ ] You want audit logging of toggle changes
- [ ] You understand this affects ALL displayed metrics
- [ ] You want to proceed with Phase 1-5 above

---

## 🎯 NEXT STEPS

Choose one:

**Option A: Proceed with Implementation**
- I'll implement all 5 phases exactly as outlined
- Zero modifications to existing functions (only extensions)
- Comprehensive testing before integration

**Option B: Discuss Modifications**
- What should we adjust?
- Any concerns about the approach?
- Different scale factors for different modules?

**Option C: Phase by Phase**
- Start with Phase 1 (DB migration only)
- Then Phase 2, 3, etc. (review after each phase)

---

**What's your preference? Any changes to the plan?**
