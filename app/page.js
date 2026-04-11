// app/page.js
import GuestLayout from './guest/layout';
import GuestHomePage from '@/components/guest/GuestHomePage';

export default function HomePage() {
  return (
    <GuestLayout>
      <GuestHomePage />
    </GuestLayout>
  );
}
