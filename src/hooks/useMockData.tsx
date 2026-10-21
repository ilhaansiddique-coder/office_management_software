import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Sale } from "@/hooks/useSales";

export interface MockDataConfig {
  enabled: boolean;
  scaleFactor: number; // 0.01 to 1.0 (0.1 = 10%)
}

/**
 * Mock Data Hook
 * 
 * Provides scaling utilities for demo/testing purposes.
 * All scaling is display-only - database values remain unchanged.
 * 
 * DO's:
 * ✅ Scale only numeric financial values
 * ✅ Keep IDs, dates, statuses, names unchanged
 * ✅ Apply scaling consistently across all hooks
 * ✅ Log state changes for audit trail
 * 
 * DON'Ts:
 * ❌ Never modify original database records
 * ❌ Never apply scaling to metadata or status fields
 * ❌ Never create synthetic data
 */
export const useMockData = () => {
  const { systemSettings } = useSystemSettings();

  const config: MockDataConfig = {
    enabled: systemSettings?.mock_data_enabled ?? false,
    scaleFactor: systemSettings?.mock_data_scale ?? 0.1,
  };

  /**
   * We no longer scale individual numeric values.
   * "don't reduce sales amount" means the actual money value stays exactly as it is.
   */
  const scaleMetric = (value: number): number => {
    return value;
  };

  /**
   * Instead of scaling money, we reduce the NUMBER of sales shown.
   * e.g. 10% mock scale means only showing 10% of the sales records.
   */
  const scaleSalesData = (sales: Sale[]): Sale[] => {
    if (!config.enabled || !sales?.length) return sales;

    // Calculate how many sales to keep based on the scaleFactor percentage
    // If there is at least 1 sale, we always show at least 1 to prevent empty views
    const numToKeep = Math.max(1, Math.round(sales.length * config.scaleFactor));
    
    // Slice the array to only keep a fraction of the original sales
    return sales.slice(0, numToKeep);
  };

  /**
   * Scale a single sale record (convenience wrapper)
   * Note: Scaling a single sale will just return it unchanged since 1 * anything > 0 is Math.max(1, ...)
   */
  const scaleSale = (sale: Sale): Sale => {
    return sale;
  };

  /**
   * Scale sale items (if needed for display)
   * We slice the items array similar to the sales array.
   */
  const scaleSaleItems = (items: any[]): any[] => {
    if (!config.enabled || !items?.length) return items;
    const numToKeep = Math.max(1, Math.round(items.length * config.scaleFactor));
    return items.slice(0, numToKeep);
  };

  /**
   * Format value for display with mock indicator if enabled
   */
  const formatScaledValue = (value: number, includeLabel: boolean = false): string => {
    if (includeLabel && config.enabled) {
      return `${value} (mock filter active)`;
    }
    return String(value);
  };

  /**
   * Get current mock data status for UI
   * Returns config object that can be used in components
   */
  const getMockDataStatus = () => ({
    isEnabled: config.enabled,
    scaleFactor: config.scaleFactor,
    percentage: Math.round(config.scaleFactor * 100),
    label: config.enabled ? `${Math.round(config.scaleFactor * 100)}% Demo Data` : "Real Data",
  });

  return {
    config,
    scaleMetric,
    scaleSalesData,
    scaleSale,
    scaleSaleItems,
    formatScaledValue,
    getMockDataStatus,
  };
};
