import { CommissionType } from '@/types';

export function calculateNet(total: number, directCosts: number) {
  return Math.max(0, total - directCosts);
}

export function calculateCommission(total: number, directCosts: number, type: CommissionType, value: number) {
  const net = calculateNet(total, directCosts);
  return type === 'PERCENT_NET' ? Math.round((net * value) / 100 * 100) / 100 : Math.max(0, value);
}
