export const BALANCE_PAYMENT_OPTIONS = [
  { value: 'digital', label: 'Digital' },
  { value: 'cash', label: 'Cash' },
];

export const formatBalancePaymentMethodLabel = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const match = BALANCE_PAYMENT_OPTIONS.find((opt) => opt.value === normalized);
  return match ? match.label : null;
};

export const isValidBalancePaymentMethod = (value) =>
  BALANCE_PAYMENT_OPTIONS.some((opt) => opt.value === value);
