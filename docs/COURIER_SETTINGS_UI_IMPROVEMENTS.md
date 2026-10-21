# Courier Settings UI Improvements

## Changes Made

### 1. **Desktop Layout Optimization**
On desktop screens (large screens and above), the courier settings now display in a **3-column grid**:
- **Column 1**: API Key
- **Column 2**: Secret Key  
- **Column 3**: Auto-Refresh Frequency (with toggle)

This makes better use of horizontal space and keeps related settings together.

### 2. **Auto-Refresh Toggle Switch**
Added a **toggle switch** to enable/disable auto-refresh:
- **ON**: Auto-refresh is enabled, dropdown is active
- **OFF**: Auto-refresh is disabled (saves as `0` in database), dropdown is grayed out

The toggle appears in the label of the "Auto-Refresh Frequency" field, showing the current state (ON/OFF).

### 3. **Simplified Dropdown**
When auto-refresh is **enabled**, users can select from:
- Every 1 hour
- Every 2 hours
- Every 3 hours
- Every 4 hours
- Every 6 hours
- Every 8 hours
- Every 12 hours
- Every 24 hours (1 day)
- Every 48 hours (2 days)

When **disabled** via the toggle, the dropdown is grayed out and the system saves `0` to the database.

### 4. **Responsive Design**
- **Mobile/Tablet** (< lg): Fields stack vertically (1 column)
- **Desktop** (≥ lg): Fields display in 3 columns side-by-side

## User Experience Benefits

✅ **Cleaner Layout**: All key settings visible in one row on desktop  
✅ **Intuitive Toggle**: Clear ON/OFF state with visual feedback  
✅ **Space Efficient**: Better use of horizontal space on larger screens  
✅ **Consistent**: Same layout pattern for both Steadfast and Pathao tabs  
✅ **Accessible**: Dropdown automatically disables when toggle is OFF  

## Technical Implementation

### State Management
```typescript
const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);
const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(60);
```

### Save Logic
```typescript
auto_refresh_interval_minutes: autoRefreshEnabled ? autoRefreshInterval : 0
```

When the toggle is OFF, the system saves `0` to the database, which the auto-refresh hook interprets as "disabled".

### Layout Classes
```typescript
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
```

This creates a responsive grid that:
- Shows 1 column on mobile/tablet
- Shows 3 columns on desktop (lg breakpoint and above)

## Screenshot Description

**Desktop View:**
```
┌─────────────────────────────────────────────────────────────────┐
│ API Credentials & Auto-Refresh                                  │
├──────────────────┬──────────────────┬──────────────────────────┤
│ API Key *        │ Secret Key *     │ Auto-Refresh Frequency   │
│ [••••••••••] 👁  │ [••••••••••] 👁  │ ON 🔘                    │
│                  │                  │ [Every 1 hour      ▼]    │
└──────────────────┴──────────────────┴──────────────────────────┘
```

**Mobile View:**
```
┌─────────────────────────────┐
│ API Key *                   │
│ [••••••••••] 👁             │
├─────────────────────────────┤
│ Secret Key *                │
│ [••••••••••] 👁             │
├─────────────────────────────┤
│ Auto-Refresh Frequency      │
│ ON 🔘                       │
│ [Every 1 hour      ▼]       │
└─────────────────────────────┘
```

## Files Modified
- `src/components/CourierWebhookSettings.tsx`
  - Added `autoRefreshEnabled` state
  - Changed grid from `sm:grid-cols-2` to `lg:grid-cols-3`
  - Added toggle switch in the Auto-Refresh label
  - Removed duplicate auto-refresh section
  - Updated save handlers to use toggle state
