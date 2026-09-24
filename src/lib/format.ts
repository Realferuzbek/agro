import type { Locale } from '@/config/i18n';

export const number = (value: number, digits = 1, locale: Locale = 'en') => {
  if (!Number.isFinite(value)) return String(value);
  const [whole, fraction] = value.toFixed(digits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'en' ? ',' : '\u00a0');
  return fraction === undefined ? grouped : `${grouped}${locale === 'en' ? '.' : ','}${fraction}`;
};
export const volume = (liters: number, locale: Locale = 'en') => `${number(liters / 1000, 1, locale)} m³`;
export function duration(minutes: number, locale: Locale = 'en') {
  if (!Number.isFinite(minutes)) return { en: 'Unavailable', uz: 'Mavjud emas', ru: 'Нет данных' }[locale];
  const rounded = Math.max(0, Math.round(minutes));
  const units = { en: ['min', 'h'], uz: ['daq', 'soat'], ru: ['мин', 'ч'] }[locale];
  return rounded < 60 ? `${rounded} ${units[0]}` : `${Math.floor(rounded / 60)} ${units[1]} ${rounded % 60} ${units[0]}`;
}
const months: Record<Locale, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
};
const weekdays: Record<Locale, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  uz: ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'],
  ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
};
const tashkentParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const localDate = (date: string, options: Intl.DateTimeFormatOptions = {}, locale: Locale = 'en') => {
  const parts = Object.fromEntries(tashkentParts.formatToParts(new Date(date)).map(part => [part.type, part.value]));
  const day = Number(parts.day), month = Number(parts.month), year = Number(parts.year);
  const showMonth = !Object.hasOwn(options, 'month') || options.month !== undefined;
  const showDay = !Object.hasOwn(options, 'day') || options.day !== undefined;
  const datePart = showMonth && showDay ? locale === 'en' ? `${months.en[month - 1]} ${day}` : locale === 'uz' ? `${day}-${months.uz[month - 1]}` : `${day} ${months.ru[month - 1]}` : showMonth ? months[locale][month - 1] : showDay ? String(day) : '';
  const yearPart = options.year ? `${datePart ? locale === 'ru' ? ' ' : ', ' : ''}${year}` : '';
  const weekdayPart = options.weekday ? weekdays[locale][new Date(Date.UTC(year, month - 1, day)).getUTCDay()] : '';
  const timePart = options.hour || options.minute ? `${parts.hour}:${parts.minute}` : '';
  return [weekdayPart, `${datePart}${yearPart}`, timePart].filter(Boolean).join(datePart && timePart ? ', ' : ' ');
};
export const localTime = (date: string, locale: Locale = 'en') => localDate(date, { month: undefined, day: undefined, hour: '2-digit', minute: '2-digit', hour12: false }, locale);
