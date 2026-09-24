export const brand = {
  name: 'Baraka Agro',
  shortName: 'Baraka',
  slug: 'baraka-agro',
  origin: 'https://barakaagro.app',
  mark: '/brand/baraka-agro-mark.svg',
  rasterMark: '/brand/baraka-agro-mark.png',
  socialImage: '/brand/baraka-agro-social.jpg',
  revealWebm: '/brand/baraka-agro-logo-reveal.webm',
  revealMp4: '/brand/baraka-agro-logo-reveal.mp4',
  color: '#154837',
  tagline: 'Clearer irrigation decisions.',
  description: 'Explore field conditions, irrigation plans, and their calculations in a simulated farm.',
  demoDisclosure: 'Demo — simulated field data',
  demoExplanation: 'Field and device readings are currently simulated. Agronomic calculations use the same deterministic engine designed for future live sensor data.',
  methodology: 'FAO-56-based methodology. Baraka Agro is not certified or endorsed by FAO.',
} as const;

export const navigation = [
  { href: '/', label: 'Today', icon: 'today' },
  { href: '/field', label: 'Field', icon: 'field' },
  { href: '/irrigation', label: 'Irrigation', icon: 'irrigation' },
  { href: '/forecast', label: 'Forecast', icon: 'forecast' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/devices', label: 'Devices', icon: 'devices' },
] as const;

export const brandCopy = {
  en: { demoDisclosure: brand.demoDisclosure, demoExplanation: brand.demoExplanation, methodology: brand.methodology },
  uz: { demoDisclosure: 'Namoyish · maʼlumotlar modellashtirilgan', demoExplanation: 'Dala va qurilma koʻrsatkichlari hozircha modellashtirilgan. Agronomik hisoblar keyinchalik haqiqiy sensor maʼlumotlari bilan ishlashi uchun yaratilgan bir xil aniq hisoblash tizimiga asoslanadi.', methodology: 'Hisoblash usuli FAO-56 ga asoslangan. Baraka Agro FAO tomonidan tasdiqlanmagan yoki qoʻllab-quvvatlanmagan.' },
  ru: { demoDisclosure: 'Демо · данные смоделированы', demoExplanation: 'Показания поля и устройств сейчас смоделированы. Агрономические расчёты выполняет тот же алгоритм, который рассчитан на работу с реальными датчиками в будущем.', methodology: 'Методика основана на FAO-56. Baraka Agro не сертифицирована и не одобрена ФАО.' },
} as const;
