import React, { createContext, useContext, ReactNode } from 'react';
import { useMockData, MockDataConfig } from '@/hooks/useMockData';
import { Sale } from '@/hooks/useSales';

interface MockDataContextType {
  config: MockDataConfig;
  scaleMetric: (value: number) => number;
  scaleSalesData: (sales: Sale[]) => Sale[];
  scaleSale: (sale: Sale) => Sale;
  scaleSaleItems: (items: any[]) => any[];
  formatScaledValue: (value: number, includeLabel?: boolean) => string;
  getMockDataStatus: () => {
    isEnabled: boolean;
    scaleFactor: number;
    percentage: number;
    label: string;
  };
}

/**
 * MockDataContext
 * 
 * Provides mock data scaling utilities to all components
 * Ensures consistent scaling across the entire app
 * 
 * Usage:
 * const { scaleMetric, getMockDataStatus } = useMockDataContext();
 * 
 * Safety:
 * - Display-only scaling (no database modifications)
 * - Easy enable/disable in system settings
 * - Real data always accessible in database
 */
const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

export const useMockDataContext = () => {
  const context = useContext(MockDataContext);
  if (context === undefined) {
    throw new Error(
      'useMockDataContext must be used within a MockDataProvider. ' +
      'Make sure <MockDataProvider> wraps your component tree.'
    );
  }
  return context;
};

interface MockDataProviderProps {
  children: ReactNode;
}

/**
 * MockDataProvider
 * 
 * Wraps your app to provide mock data context
 * Should be placed high in the component tree, after SystemSettingsProvider
 * 
 * Example:
 * <SystemSettingsProvider>
 *   <MockDataProvider>
 *     <App />
 *   </MockDataProvider>
 * </SystemSettingsProvider>
 */
export const MockDataProvider: React.FC<MockDataProviderProps> = ({ children }) => {
  const mockData = useMockData();

  return (
    <MockDataContext.Provider value={mockData}>
      {children}
    </MockDataContext.Provider>
  );
};
