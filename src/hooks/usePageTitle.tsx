import { useEffect } from 'react';
import { useBusinessSettings } from './useBusinessSettings';

export const usePageTitle = () => {
  const { businessSettings } = useBusinessSettings();

  useEffect(() => {
    if (businessSettings?.business_name) {
      document.title = `${businessSettings.business_name} - Inventory Management`;
    } else {
      document.title = 'Inventory Management System';
    }
  }, [businessSettings?.business_name]);
};
