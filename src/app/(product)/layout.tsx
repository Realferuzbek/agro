import { readProductState } from '@/lib/server/product';
import { ProductProvider } from '@/components/product-provider';
import { AppShell } from '@/components/app-shell';
export const dynamic = 'force-dynamic';
export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const initial = await readProductState();
  return <ProductProvider initial={initial}><AppShell>{children}</AppShell></ProductProvider>;
}
