export const formatCurrency = (amount: number, currencySymbol: string = '৳'): string => {
  return `${currencySymbol}${Math.round(amount).toLocaleString()}`;
};

export const formatCurrencyDetailed = (amount: number, currencySymbol: string = '৳'): string => {
  return `${currencySymbol}${amount.toFixed(2)}`;
};