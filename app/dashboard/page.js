import Link from 'next/link';

export default function DashboardPage() {
	return (
		<main className="min-h-screen bg-[#F8FCFF] px-4 py-16">
			<div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
				<p className="mt-2 text-sm text-gray-600">Choose a dashboard module to continue.</p>
				<div className="mt-5 flex flex-col gap-3 sm:flex-row">
					<Link
						href="/dashboard/admin/overview"
						className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						Go to Admin Dashboard
					</Link>
					<Link
						href="/dashboard/staff/overview"
						className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						Go to Staff Dashboard
					</Link>
				</div>
			</div>
		</main>
	);
}
