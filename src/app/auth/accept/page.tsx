import type { Metadata } from 'next';
import { AuthAccept } from '@/components/auth-accept';
import { brand } from '@/config/brand';
import { privateTitles, requestLocale } from '@/config/seo';

export async function generateMetadata(): Promise<Metadata> { const locale = await requestLocale(); return { title: `${privateTitles[locale].account} · ${brand.name}`, robots: { index: false, follow: false }, referrer: 'no-referrer' }; }
export default function Page(){return <AuthAccept/>;}
