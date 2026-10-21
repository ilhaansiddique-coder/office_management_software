import React, { createContext, useContext, ReactNode } from 'react';
import { useSystemSettings, SystemSettings } from '@/hooks/useSystemSettings';

interface SystemSettingsContextType {
  systemSettings: SystemSettings;
  updateSystemSettings: (data: Partial<SystemSettings>) => void;
  isLoading: boolean;
  isUpdating: boolean;
}

const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

export const useSystemSettingsContext = () => {
  const context = useContext(SystemSettingsContext);
  if (context === undefined) {
    throw new Error('useSystemSettingsContext must be used within a SystemSettingsProvider');
  }
  return context;
};

interface SystemSettingsProviderProps {
  children: ReactNode;
}

export const SystemSettingsProvider: React.FC<SystemSettingsProviderProps> = ({ children }) => {
  const { systemSettings, updateSystemSettings, isLoading, isUpdating } = useSystemSettings();

  return (
    <SystemSettingsContext.Provider
      value={{
        systemSettings,
        updateSystemSettings,
        isLoading,
        isUpdating,
      }}
    >
      {children}
    </SystemSettingsContext.Provider>
  );
};