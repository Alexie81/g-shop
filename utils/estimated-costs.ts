import { ClientFinanceValue } from '@/utils/client-finance';
import { EstimatedCosts } from '@/types';

const roundMoney = (value: number) => Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100) / 100;

export function calculateEstimatedCosts(value: Partial<EstimatedCosts>): EstimatedCosts {
  const diagnosticFee = roundMoney(value.diagnosticFee ?? 0);
  const partsCost = roundMoney(value.partsCost ?? 0);
  const laborCost = roundMoney(value.laborCost ?? 0);
  const advancePaid = roundMoney(value.advancePaid ?? 0);
  const discountPercent = Math.min(100, roundMoney(value.discountPercent ?? 0));
  const subtotal = roundMoney(diagnosticFee + partsCost + laborCost);
  const discountAmount = roundMoney(subtotal * discountPercent / 100);
  const totalDue = roundMoney(subtotal - discountAmount);
  const receivedAmount = roundMoney(Math.min(advancePaid, totalDue));

  return {
    diagnosticFee,
    partsCost,
    laborCost,
    advancePaid,
    discountPercent,
    currencyCode: value.currencyCode?.toUpperCase() || 'RON',
    subtotal,
    discountAmount,
    totalDue,
    receivedAmount,
    remainingDue: roundMoney(totalDue - receivedAmount),
  };
}

export function estimatedCostsFromFinance(value: ClientFinanceValue): EstimatedCosts {
  return calculateEstimatedCosts({
    diagnosticFee: value.diagnosticFee,
    partsCost: value.displayedPartsCost,
    laborCost: value.displayedLaborCost,
    advancePaid: value.advancePaid,
    discountPercent: value.discountPercent,
    currencyCode: value.currencyCode,
  });
}

export function financeFromEstimatedCosts(current: ClientFinanceValue, value: EstimatedCosts): ClientFinanceValue {
  return {
    ...current,
    currencyCode: value.currencyCode,
    exchangeRateToRon: value.currencyCode === 'RON' ? 1 : current.exchangeRateToRon,
    workPrice: value.partsCost + value.laborCost,
    diagnosticFee: value.diagnosticFee,
    advancePaid: value.advancePaid,
    discountPercent: value.discountPercent,
    displayedPartsCost: value.partsCost,
    displayedLaborCost: value.laborCost,
  };
}

export function estimatedDateFromWorkingDays(receivedAt: string, workingDays: number): string | undefined {
  const received = new Date(receivedAt);
  if (!Number.isFinite(received.getTime()) || !Number.isInteger(workingDays) || workingDays < 0) return undefined;
  const result = new Date(received);
  let remaining = workingDays;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result.toISOString();
}
