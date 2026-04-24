// app/guest/layout.js
import GuestNavbar from '@/components/guest/GuestNavbar';
import ChatBot from '@/components/guest/ChatBot';

export default function GuestLayout({ children }) {
  return (
    <>
      <GuestNavbar />
      <main className="min-h-screen-minus-navbar">
        {children}
      </main>
      <ChatBot />
    </>
  );
}