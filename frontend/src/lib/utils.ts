import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`
}
