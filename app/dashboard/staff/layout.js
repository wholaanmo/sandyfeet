import { redirect } from 'next/navigation';
import { verifyDashboardSession } from '@/lib/session-server';
import StaffDashboardShell from '@/components/staff/StaffDashboardShell';

export default async function StaffLayout({ children }) {
  const session = await verifyDashboardSession();
  if (!session || (session.role !== 'staff' && session.role !== 'admin')) {
    redirect('/login');
  }
  return <StaffDashboardShell>{children}</StaffDashboardShell>;
}
