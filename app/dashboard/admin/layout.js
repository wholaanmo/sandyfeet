import { redirect } from 'next/navigation';
import { verifyDashboardSession } from '@/lib/session-server';
import AdminDashboardShell from '@/components/admin/AdminDashboardShell';

export default async function AdminLayout({ children }) {
  const session = await verifyDashboardSession();
  if (!session || session.role !== 'admin') {
    redirect('/login');
  }
  return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
