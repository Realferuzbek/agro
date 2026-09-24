import { readSession } from '@/lib/server/auth';
import { AdminLogin, AdminWorkspace } from '@/components/admin';
import { brand } from '@/config/brand';
import { privateTitles, requestLocale } from '@/config/seo';
export async function generateMetadata() { const locale = await requestLocale(); return { title: `${privateTitles[locale].admin} · ${brand.name}`, robots: { index: false, follow: false } }; }
export default async function Page() {
  const session = await readSession();
  if (!session.isAdmin) return <AdminLogin forbidden={!!session.user} />;
  return <AdminWorkspace email={session.user?.email ?? ''} permissions={session.permissions} canManageAdmins={session.canManageAdmins} />;
}
