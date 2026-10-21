import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 格式化货币（人民币） */
export function formatCurrency(value: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '¥0';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** 格式化数字（千分位） */
export function formatNumber(value: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('zh-CN').format(Math.round(value));
}
