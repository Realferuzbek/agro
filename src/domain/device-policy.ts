/** Simulation/product policy, versioned independently from FAO equations. Times are model-clock seconds. */
export const DEVICE_QUALITY_POLICY = { freshnessSeconds: { weather: 3600, rain: 300, soil: 900, flow: 30, pressure: 30, valve: 30, pump: 30 }, maximumFutureSkewSeconds: 30, criticalKinds: ['weather', 'rain', 'flow', 'pressure', 'pump'] as const, soilDepthsCm: [20, 40, 60] as const };
