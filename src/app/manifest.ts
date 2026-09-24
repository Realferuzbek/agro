import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';

export default function manifest(): MetadataRoute.Manifest {
  return { name: brand.name, short_name: brand.shortName, description: brand.description, start_url: '/en', display: 'standalone', background_color: '#fcf8ee', theme_color: brand.color, icons: [
    { src: brand.mark, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/brand/baraka-agro-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/brand/baraka-agro-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ] };
}
