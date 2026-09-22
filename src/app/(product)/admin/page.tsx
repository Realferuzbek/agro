import { readSession } from '@/lib/server/auth';
import { AdminLogin, AdminWorkspace } from '@/components/admin';
export const metadata = { title: 'Administration' };
export default async function Page() {
  const session = await readSession();
  if (!session.isAdmin) return <AdminLogin forbidden={!!session.user} />;
  return <AdminWorkspace email={session.user?.email ?? ''} />;
}
