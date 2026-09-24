import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/auth/', '/admin', '/en/admin', '/uz/admin', '/ru/admin'] }, sitemap: `${brand.origin}/sitemap.xml`, host: brand.origin };
}
