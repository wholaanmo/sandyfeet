/**
 * Public Check-In Page
 *
 * Accepts a check-in credential (token/code) for guest self-check-in.
 * No reservation data is revealed until the credential is validated
 * server-side through an authorized staff flow or approved self-check-in policy.
 */

export const metadata = {
  title: 'Check In — Sandyfeet Resort',
  description: 'Enter your check-in credential to begin the check-in process.',
};

export default function CheckInPage() {
  return (
    <main className="min-h-screen bg-[#F8FCFF] px-4 py-16">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Check In</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter your check-in code or scan the QR code provided in your
            confirmation email.
          </p>
          <form className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="checkin-code"
                className="block text-sm font-medium text-gray-700"
              >
                Check-in Code
              </label>
              <input
                id="checkin-code"
                name="code"
                type="text"
                autoComplete="off"
                placeholder="Enter your code"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-describedby="checkin-help"
              />
              <p id="checkin-help" className="mt-1 text-xs text-gray-500">
                You can find this in your booking confirmation email.
              </p>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Verify Code
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
