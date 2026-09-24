'use client';
import { useLocale } from '@/components/locale-provider';
import * as format from './format';

export function useFormat() {
  const locale = useLocale();
  return {
    number: (value: number, digits = 1) => format.number(value, digits, locale),
    volume: (liters: number) => format.volume(liters, locale),
    duration: (minutes: number) => format.duration(minutes, locale),
    localDate: (date: string, options: Intl.DateTimeFormatOptions = {}) => format.localDate(date, options, locale),
    localTime: (date: string) => format.localTime(date, locale),
  };
}
