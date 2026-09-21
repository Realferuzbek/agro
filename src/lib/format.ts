export const number = (value: number, digits = 1) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
export const volume = (liters: number) => `${number(liters / 1000)} m³`;
export function duration(minutes: number) {
  if (!Number.isFinite(minutes)) return 'Unavailable';
  const rounded = Math.max(0, Math.round(minutes));
  return rounded < 60 ? `${rounded} min` : `${Math.floor(rounded / 60)} h ${rounded % 60} min`;
}
export const localDate = (date: string, options: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', month: 'short', day: 'numeric', ...options }).format(new Date(date));
export const localTime = (date: string) => localDate(date, { month: undefined, day: undefined, hour: '2-digit', minute: '2-digit', hour12: false });
