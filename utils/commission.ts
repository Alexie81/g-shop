import { CommissionType } from '@/types';

export function calculateNet(total: number, directCosts: number) {
  return Math.max(0, total - directCosts);
}

export function calculateCommission(total: number, directCosts: number, type: CommissionType, value: number) {
  const net = calculateNet(total, directCosts);
  if (type === 'FIXED') return Math.max(0, value);
  const base = type === 'PERCENT_TOTAL' ? Math.max(0, total) : net;
  return Math.round((base * value) / 100 * 100) / 100;
}
