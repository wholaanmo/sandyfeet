import Link from 'next/link';
import Image from 'next/image';
import GuestHomeRoomsGallery from './GuestHomeRoomsGallery';
import SandyFeetLogoMark from './SandyFeetLogoMark';

function iconSrc(filename) {
  return `/assets/Icon/${encodeURIComponent(filename)}`;
}

const HERO_IMG = '/assets/landing-hero-bg.png';

export default function GuestHomePage() {
  return (
    <div className="relative overflow-x-hidden bg-[var(--color-blue-white)]">
      {/* Hero: light layout, photo in a rounded container (travel-site style) */}
      <section className="relative -mt-16 pt-16 md:-mt-20 md:pt-20">
        <div className="mx-auto max-w-7xl px-4 pb-4 pt-8 sm:px-6 sm:pb-6 sm:pt-10 lg:px-8 lg:pb-8 lg:pt-12">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14 lg:gap-x-16">
            <div className="order-2 text-center lg:order-1 lg:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-mid sm:text-sm">
                Liwliwa · Camp &amp; event site
              </p>
              <h1 className="mt-3 font-playfair text-[2.35rem] font-bold leading-[1.1] tracking-tight text-[#0c4a5c] sm:text-5xl lg:text-[3.15rem]">
                Beach memories you&apos;ll never forget
              </h1>
              <p className="mx-auto mt-5 max-w-xl font-poppins text-base leading-relaxed text-slate-600 lg:mx-0">
                Stay steps from the pool, book day tours in a tap, and track reservations in one calm,
                modern place—built for Sandy Feet guests.
              </p>

              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
                <Link
                  href="/rooms"
                  className="inline-flex items-center justify-center rounded-full bg-[#15546A] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_14px_36px_-12px_rgba(21,84,106,0.55)] transition hover:bg-[#0f3d4d]"
                >
                  Book your stay
                </Link>
                <Link
                  href="/day-tour"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#15546A]/25 bg-white px-8 py-3.5 text-sm font-semibold text-[#15546A] transition hover:border-[#15546A]/45 hover:bg-slate-50"
                >
                  <i className="fas fa-play text-xs opacity-80" aria-hidden />
                  Explore day tours
                </Link>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="relative mx-auto w-full max-w-md lg:max-w-none">
                <div
                  className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-cyan-100/90 via-ocean-pale/80 to-ocean-ice blur-md sm:-inset-2 sm:rounded-[2.25rem]"
                  aria-hidden
                />
                <div className="relative aspect-[4/5] w-full max-h-[min(540px,72svh)] overflow-hidden rounded-[1.65rem] shadow-[0_28px_70px_-20px_rgba(21,84,106,0.35)] ring-1 ring-slate-200/90 sm:rounded-[1.85rem] lg:max-h-[580px]">
                  <Image
                    src={HERO_IMG}
                    alt="Sandy Feet resort pool and villas"
                    fill
                    priority
                    className="object-cover object-center"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Booking strip overlapping next section */}
        <div className="relative z-10 mx-auto -mb-2 max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.2)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:p-5">
            <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
              <span className="flex items-center gap-2">
                <i className="fas fa-map-marker-alt text-ocean-mid" aria-hidden />
                Liwliwa, Zambales
              </span>
              <span className="flex items-center gap-2">
                <i className="fas fa-calendar-alt text-ocean-mid" aria-hidden />
                Flexible dates
              </span>
              <span className="flex items-center gap-2">
                <i className="fas fa-tag text-ocean-mid" aria-hidden />
                Best rates on direct booking
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Link
                href="/rooms"
                className="text-center text-sm font-semibold text-ocean-deep underline-offset-2 hover:underline sm:text-left"
              >
                Preview rooms
              </Link>
              <Link
                href="/rooms"
                className="inline-flex items-center justify-center rounded-full bg-[#15546A] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#0f3d4d]"
              >
                Book now
              </Link>
            </div>
          </div>
        </div>

        <div className="h-6 sm:h-8" aria-hidden />
      </section>

      {/* Rooms + gallery (mock-style) */}
      <GuestHomeRoomsGallery />

      <div className="relative bg-white">
        {/* Day tour CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-4 sm:px-6 lg:px-8 lg:pt-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-ocean-deep to-ocean-mid px-8 py-12 text-white shadow-xl sm:px-12 sm:py-14">
            <div
              className="absolute -right-16 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-white/10 blur-2xl"
              aria-hidden
            />
            <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="font-playfair text-3xl font-bold sm:text-4xl">Day tours &amp; outings</h2>
                <p className="mt-3 max-w-xl text-white/90">
                  Add adventure to your stay—explore curated experiences without the clutter.
                </p>
                <Link
                  href="/day-tour"
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-ocean-deep shadow-md transition hover:bg-ocean-ice"
                >
                  <Image
                    src={iconSrc('ATV.png')}
                    alt=""
                    width={28}
                    height={28}
                    className="object-contain"
                  />
                  Browse day tours
                </Link>
              </div>
              <div className="relative mx-auto hidden h-36 w-36 shrink-0 md:block md:h-40 md:w-40">
                <Image
                  src={iconSrc('Beach ball.png')}
                  alt=""
                  fill
                  className="object-contain drop-shadow-lg"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="flex items-center gap-3">
                  <SandyFeetLogoMark className="h-12 w-12" sizes="48px" />
                  <span className="font-playfair text-xl font-bold text-slate-900">Sandy Feet</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Simple booking, clear updates, and a calm experience from browse to check-in.
                </p>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Explore</h3>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li>
                    <Link href="/rooms" className="hover:text-ocean-mid">
                      Rooms
                    </Link>
                  </li>
                  <li>
                    <Link href="/day-tour" className="hover:text-ocean-mid">
                      Day tour
                    </Link>
                  </li>
                  <li>
                    <Link href="/reservation-tracker" className="hover:text-ocean-mid">
                      Reservation tracker
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Support</h3>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li>
                    <Link href="/feedback" className="hover:text-ocean-mid">
                      Feedback
                    </Link>
                  </li>
                  <li>
                    <Link href="/" className="hover:text-ocean-mid">
                      Home
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Stay in touch</h3>
                <p className="mt-4 text-sm text-slate-600">
                  Questions about a booking? Use feedback or your reservation confirmation for the fastest path.
                </p>
              </div>
            </div>
            <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500 sm:flex-row">
              <p>© {new Date().getFullYear()} Sandy Feet Reservation</p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link href="/rooms" className="hover:text-ocean-mid">
                  Book
                </Link>
                <Link href="/reservation-tracker" className="hover:text-ocean-mid">
                  Tracker
                </Link>
                <Link href="/feedback" className="hover:text-ocean-mid">
                  Feedback
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
