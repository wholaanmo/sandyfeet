/**
 * Public Calendar Page
 *
 * Shows resort availability overview. This is the active route for
 * /calendar as listed in the repository baseline.
 */

export const metadata = {
  title: 'Calendar — Sandyfeet Resort',
  description: 'View resort room and day-tour availability.',
};

export default function CalendarPage() {
  return (
    <main className="min-h-screen bg-[#F8FCFF] px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-gray-900">
          Availability Calendar
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Check room and day-tour availability for your preferred dates.
        </p>
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">
            Calendar view coming soon. Please check individual room pages for
            current availability.
          </p>
        </div>
      </div>
    </main>
  );
}
