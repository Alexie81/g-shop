export type ClientPaymentStatus = 'UNPAID' | 'PAID';

export type ClientFinanceValue = {
  currencyCode: string;
  exchangeRateToRon: number;
  workPrice: number;
  diagnosticFee: number;
  advancePaid: number;
  discountPercent: number;
  actualPartsCost: number;
  displayedPartsCost: number;
  displayedLaborCost: number;
  paymentStatus: ClientPaymentStatus;
};

export type ClientFinanceExpense = {
  id: string;
  description: string;
  amount: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
};

export type ClientFinanceParticipant = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  isAssigned: boolean;
};

export type ClientFinanceHistoryItem = {
  id: string;
  summary: string;
  userName?: string;
  createdAt: string;
};

export type ClientFinanceCalculation = {
  subtotal: number;
  discountAmount: number;
  totalDue: number;
  receivedAmount: number;
  remainingDue: number;
  additionalExpenses: number;
  internalCosts: number;
  collaboratorCost: number;
  collaboratorPaid: number;
  gshopNet: number;
  displayedBreakdownDifference: number;
  exchangeRateToRon: number;
};

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const nonNegative = (value: number) => Math.max(0, finite(value));
export const roundMoney = (value: number) => Math.round((finite(value) + Number.EPSILON) * 100) / 100;

export function calculateClientFinance(
  value: ClientFinanceValue,
  expenses: readonly Pick<ClientFinanceExpense, 'amount'>[],
  collaboratorCost = 0,
  collaboratorPaid = 0,
): ClientFinanceCalculation {
  const workPrice = nonNegative(value.workPrice);
  const diagnosticFee = nonNegative(value.diagnosticFee);
  const subtotal = roundMoney(workPrice + diagnosticFee);
  const discountPercent = Math.min(100, nonNegative(value.discountPercent));
  const discountAmount = roundMoney(subtotal * discountPercent / 100);
  const totalDue = roundMoney(Math.max(0, subtotal - discountAmount));
  const advance = nonNegative(value.advancePaid);
  const receivedAmount = value.paymentStatus === 'PAID' ? totalDue : roundMoney(Math.min(advance, totalDue));
  const remainingDue = value.paymentStatus === 'PAID' ? 0 : roundMoney(Math.max(0, totalDue - receivedAmount));
  const additionalExpenses = roundMoney(expenses.reduce((total, expense) => total + nonNegative(expense.amount), 0));
  const actualPartsCost = nonNegative(value.actualPartsCost);
  const normalizedCollaboratorCost = roundMoney(nonNegative(collaboratorCost));
  const normalizedCollaboratorPaid = roundMoney(nonNegative(collaboratorPaid));
  const internalCosts = roundMoney(actualPartsCost + additionalExpenses);
  const gshopNet = roundMoney(receivedAmount - internalCosts - normalizedCollaboratorPaid);
  const displayedBreakdownDifference = roundMoney(
    nonNegative(value.displayedPartsCost) + nonNegative(value.displayedLaborCost) - workPrice,
  );

  return {
    subtotal,
    discountAmount,
    totalDue,
    receivedAmount,
    remainingDue,
    additionalExpenses,
    internalCosts,
    collaboratorCost: normalizedCollaboratorCost,
    collaboratorPaid: normalizedCollaboratorPaid,
    gshopNet,
    displayedBreakdownDifference,
    exchangeRateToRon: value.currencyCode === 'RON' ? 1 : nonNegative(value.exchangeRateToRon),
  };
}

export function parseFinanceNumber(text: string): number {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function formatFinanceMoney(value: number, currencyCode: string): string {
  const amount = finite(value);
  try {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} ${currencyCode}`;
  }
}

export function toRon(value: number, currencyCode: string, exchangeRateToRon: number): number {
  if (currencyCode === 'RON') return roundMoney(value);
  return roundMoney(value * nonNegative(exchangeRateToRon));
}
