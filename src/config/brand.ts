export const brand = {
  name: 'AgriFlow',
  tagline: 'Right water. Brighter tomorrows.',
  description: 'Thoughtful irrigation, grounded in science.',
  demoDisclosure: 'Demo — simulated field data',
  demoExplanation: 'Field and device readings are currently simulated. Agronomic calculations use the same deterministic engine designed for future live sensor data.',
  methodology: 'FAO-56-based methodology. AgriFlow is not certified or endorsed by FAO.',
} as const;

export const navigation = [
  { href: '/', label: 'Today', icon: 'today' },
  { href: '/field', label: 'Field', icon: 'field' },
  { href: '/irrigation', label: 'Irrigation', icon: 'irrigation' },
  { href: '/forecast', label: 'Forecast', icon: 'forecast' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/devices', label: 'Devices', icon: 'devices' },
] as const;
