import { redirect } from 'next/navigation';

export default function LegacyRoomRedirectPage({ params }) {
  redirect(`/rooms/${params.slug}`);
}
