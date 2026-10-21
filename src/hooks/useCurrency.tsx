import { useSystemSettingsContext } from '@/contexts/SystemSettingsContext';
import { formatCurrency, formatCurrencyDetailed } from '@/lib/currency';

export const useCurrency = () => {
  const { systemSettings } = useSystemSettingsContext();

  const formatAmount = (amount: number) => {
    return formatCurrency(amount, systemSettings.currency_symbol);
  };

  const formatAmountDetailed = (amount: number) => {
    return formatCurrencyDetailed(amount, systemSettings.currency_symbol);
  };

  return {
    formatAmount,
    formatAmountDetailed,
    currencySymbol: systemSettings.currency_symbol,
    currencyCode: systemSettings.currency_code,
  };
};