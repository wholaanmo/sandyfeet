import GuestLayout from './guest/layout';
import Image from 'next/image';
import Link from 'next/link';

const galleryImages = [
  { src: '/assets/View/Front view.jpg', alt: 'Sandyfeet front view' },
  { src: '/assets/View/Second floor view.jpg', alt: 'Second floor view' },
  { src: '/assets/Facilities/Pool.jpg', alt: 'Pool area' },
  { src: '/assets/GroundFloor/Ground floor room.jpg', alt: 'Ground floor room exterior' },
  { src: '/assets/Tent/Tents.jpg', alt: 'Camping tents' },
  { src: '/assets/Facilities/Bonfire.jpg', alt: 'Bonfire night setup' },
];

export default function HomePage() {
  return (
    <GuestLayout>
      <div className="bg-white min-h-screen overflow-hidden text-[#143B36]">

        {/* --- HERO SECTION --- */}
        <section className="relative w-full max-w-7xl mx-auto px-6 pt-24 pb-12 mt-6 md:pt-32 md:flex md:items-center md:min-h-[75vh]">
          {/* Left Content */}
          <div className="md:w-5/12 z-10">
            <span className="text-[#3B82F6] font-bold text-[10px] tracking-widest uppercase mb-4 block">
              Sandyfeet Resort & Camp
            </span>
            <h1 className="font-playfair text-[3.5rem] md:text-[5rem] leading-[1.05] text-[#0f2824] mb-6 tracking-tight">
              Escape to the <br /> shore. Book <br /> your stay.
            </h1>
            <p className="text-[#4A6762] text-lg mb-10 max-w-md leading-relaxed pr-8">
              Reserve rooms and day tours in minutes. Enjoy a quick and smooth booking flow from search to confirmation.
            </p>
            <div className="flex gap-4 items-center">
              <Link
                href="/rooms"
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-3.5 rounded-full text-base font-semibold shadow-xl shadow-blue-500/20 transition-all hover:-translate-y-0.5"
              >
                Explore Rooms
              </Link>
              <Link
                href="/day-tour"
                className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-8 py-3.5 rounded-full text-base font-semibold shadow-sm transition-all hover:-translate-y-0.5"
              >
                Book a Day Tour
              </Link>
            </div>
          </div>

          {/* Right Images (Collage) */}
          <div className="md:w-7/12 relative h-[500px] mt-10 md:mt-0">
            {/* Main Center Image */}
            <div className="absolute right-12 top-0 z-20 transform -rotate-2 hover:rotate-0 transition-transform duration-500 rounded-[2rem] border-8 border-white shadow-2xl overflow-hidden w-[460px] h-[320px]">
              <Image src="/assets/View/IMG3.jpg" alt="Pool View" fill className="object-cover" />
            </div>
            {/* Top Left Smaller Image */}
            <div className="absolute left-8 top-[-30px] z-10 transform -rotate-12 hover:-rotate-6 transition-transform duration-500 rounded-3xl border-8 border-white shadow-xl overflow-hidden w-[220px] h-[220px]">
              <Image src="/assets/View/Banner.jpg" alt="Camp View" fill className="object-cover" />
            </div>
            {/* Bottom Left Image */}
            <div className="absolute -left-4 bottom-12 z-30 transform rotate-3 hover:rotate-6 transition-transform duration-500 rounded-3xl border-8 border-white shadow-xl overflow-hidden w-[260px] h-[180px]">
              <Image src="/assets/GroundFloor/Ground floor room.jpg" alt="Room View" fill className="object-cover" />
            </div>
            {/* Bottom Right Image */}
            <div className="absolute right-0 -bottom-8 z-40 transform rotate-6 hover:rotate-12 transition-transform duration-500 rounded-3xl border-8 border-white shadow-xl overflow-hidden w-[180px] h-[180px]">
              <Image src="/assets/View/Front view.jpg" alt="Signage" fill className="object-cover" />
            </div>
            {/* Top Right Tiny Image */}
            <div className="absolute right-40 -top-16 z-0 transform rotate-12 hover:rotate-6 transition-transform duration-500 rounded-2xl border-[6px] border-white shadow-xl overflow-hidden w-[160px] h-[160px]">
              <Image src="/assets/GroupRoom/GroupRoom1.1.jpg" alt="Group Room" fill className="object-cover" />
            </div>
          </div>
        </section>

        {/* --- GALLERY SECTION --- */}
        <section className="bg-white/70 py-16 pb-20">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
              LIVE MOMENTS
            </span>
            <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-6">
              Gallery in Motion
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto mb-10 px-4">
              A quick look at the vibe around Sandyfeet, from bright mornings by the pool to laid-back sunsets.
            </p>
            
            <div className="relative overflow-hidden px-1">
              <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-white/90 to-transparent" />
              <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-white/90 to-transparent" />
              <div className="absolute right-8 -top-8 z-20 hidden h-16 w-16 md:block">
                <Image src="/assets/Icon/Shell.png" alt="Shell icon" fill className="object-contain opacity-80" />
              </div>

              <div className="gallery-track flex w-max gap-4 md:gap-6">
                {[...galleryImages, ...galleryImages].map((image, index) => (
                  <div
                    key={`${image.src}-${index}`}
                    className="relative h-[220px] w-[320px] flex-none overflow-hidden rounded-3xl shadow-[0_10px_24px_rgb(0,0,0,0.08)] md:h-[300px] md:w-[430px]"
                  >
                    <Image src={image.src} alt={image.alt} fill className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FEATURED PACKAGES --- */}
           <section className="py-16 relative">
           <div className="max-w-7xl mx-auto px-6">
             <div className="text-center mb-12 relative">
                {/* Decorative sandals */}
                <div className="absolute -left-10 top-0 hidden h-24 w-24 rotate-[15deg] opacity-70 md:block">
                  <Image src="/assets/Icon/Sadals.png" alt="Sandals icon" fill className="object-contain" />
                </div>

               <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-6">
                 Featured packages
               </h2>
               <p className="text-[#3B82F6] max-w-xl mx-auto">
                 Explore our top-picked stays designed for your perfect getaway.
               </p>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {/* Card 1 */}
               <div className="bg-white rounded-[2rem] p-4 shadow-[0_12px_40px_rgb(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.1)] transition-all flex flex-col border border-gray-50">
                 <div className="relative w-full h-[240px] rounded-3xl overflow-hidden mb-6">
                   <Image src="/assets/GroundFloor/Room 1.jpg" alt="Ground Floor Room" fill className="object-cover" />
                   <span className="absolute top-4 left-4 bg-white/95 text-gray-800 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                     Most Popular
                   </span>
                 </div>
                 <div className="px-2 flex-grow flex flex-col">
                   <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Good for 4 Persons</span>
                   <h3 className="font-playfair text-2xl font-bold mb-8 text-[#0f2824]">Ground Floor Room</h3>
                   
                   <div className="mt-auto flex items-center justify-between">
                     <span className="text-[#3B82F6] font-bold text-xl">PHP 3,000</span>
                     <Link href="/rooms" className="text-gray-600 font-semibold text-sm border border-gray-200 px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors">
                       View Details
                     </Link>
                   </div>
                 </div>
               </div>

               {/* Card 2 */}
               <div className="bg-white rounded-[2rem] p-4 shadow-[0_12px_40px_rgb(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.1)] transition-all flex flex-col border border-gray-50">
                 <div className="relative w-full h-[240px] rounded-3xl overflow-hidden mb-6">
                   <Image src="/assets/GroupRoom/GroupRoom1.2.jpg" alt="Group Room" fill className="object-cover" />
                   <span className="absolute top-4 left-4 bg-white/95 text-gray-800 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                     For Groups
                   </span>
                 </div>
                 <div className="px-2 flex-grow flex flex-col">
                   <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Good for 10 to 14 Persons</span>
                   <h3 className="font-playfair text-2xl font-bold mb-8 text-[#0f2824]">Group Room</h3>
                   
                   <div className="mt-auto flex items-center justify-between">
                     <span className="text-[#3B82F6] font-bold text-xl">PHP 10,500</span>
                     <Link href="/rooms" className="text-gray-600 font-semibold text-sm border border-gray-200 px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors">
                       View Details
                     </Link>
                   </div>
                 </div>
               </div>

               {/* Card 3 */}
               <div className="bg-white rounded-[2rem] p-4 shadow-[0_12px_40px_rgb(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.1)] transition-all flex flex-col border border-gray-50">
                 <div className="relative w-full h-[240px] rounded-3xl overflow-hidden mb-6">
                   <Image src="/assets/View/IMG3.jpg" alt="Couple Room" fill className="object-cover" />
                   <span className="absolute top-4 left-4 bg-white/95 text-gray-800 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                     For Couples
                   </span>
                 </div>
                 <div className="px-2 flex-grow flex flex-col">
                   <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Best for Couples</span>
                   <h3 className="font-playfair text-2xl font-bold mb-8 text-[#0f2824]">Couple Room</h3>
                   
                   <div className="mt-auto flex items-center justify-between">
                     <span className="text-[#3B82F6] font-bold text-xl">PHP 2,000</span>
                     <Link href="/rooms" className="text-gray-600 font-semibold text-sm border border-gray-200 px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors">
                       View Details
                     </Link>
                   </div>
                 </div>
               </div>
             </div>

             {/* Explore All Rooms Button */}
             <div className="text-center mt-8">
               <Link href="/rooms" className="inline-block bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-8 py-3.5 rounded-full text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5">
                 Explore All Rooms
               </Link>
             </div>
           </div>
        </section>

        {/* --- WHY GUESTS LOVE IT & STATS --- */}
        <section className="py-16 relative bg-gray-50/50">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left side texts */}
            <div>
              <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
                WHY GUESTS LOVE IT
              </span>
              <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-12">
                Simple booking, real getaway energy
              </h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Fast reservation confirmation</span>
                </div>
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Clear payment instructions</span>
                </div>
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Helpful staff communication</span>
                </div>
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Track booking in one tap</span>
                </div>
              </div>
            </div>

            {/* Right side stats blocks */}
            <div className="flex flex-col gap-6">
              <div className="bg-[#4285F4] rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-blue-500/20">
                <span className="text-white/80 font-bold text-[10px] tracking-widest uppercase mb-4 block relative z-10">HAPPY GUESTS</span>
                <div className="font-playfair text-5xl font-bold mb-2 relative z-10">1,200+</div>
                <p className="text-white/90 text-sm relative z-10">Bookings handled with a smooth flow</p>
                <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
              </div>

              <div className="bg-[#f0bb8e] rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-orange-500/10">
                <span className="text-white/90 font-bold text-[10px] tracking-widest uppercase mb-4 block relative z-10">AVG BOOKING TIME</span>
                <div className="font-playfair text-5xl font-bold mb-2 relative z-10 text-[#0f2824]">3 min</div>
                <p className="text-[#0f2824]/80 text-sm relative z-10">From details submission to reference code</p>
                <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/20 rounded-full blur-2xl"></div>
              </div>
            </div>
          </div>
        </section>

        {/* --- TESTIMONIALS --- */}
           <section className="py-16 bg-white border-t border-gray-50 pb-24">
           <div className="max-w-7xl mx-auto px-6">
             <div className="text-center mb-12">
               <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
                 GUEST STORIES
               </span>
               <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824]">
                 Testimonials
               </h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                {/* Decorative palm tree */}
                <div className="absolute -left-12 -top-12 z-0 opacity-80 decoration-clip hidden md:block">
                 <Image src="/assets/Icon/Coconut tree.png" alt="Palm tree" width={100} height={100} />
                </div>

               <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] relative z-10 flex flex-col h-full">
                 <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-lg">A</div>
                   <div>
                     <h4 className="font-bold text-[#0f2824]">Aira M.</h4>
                     <p className="text-gray-400 text-[10px] tracking-widest uppercase">WEEKEND GUEST</p>
                   </div>
                 </div>
                 <p className="text-gray-600 leading-relaxed mb-8 flex-grow text-[15px]">
                   "Super easy booking process and the place looked exactly like the photos. The pool vibe at sunset is 10/10."
                 </p>
                 <div className="flex gap-1 mt-auto">
                   {[1,2,3,4,5].map(i => (
                     <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbc674]"></div>
                   ))}
                 </div>
               </div>

               <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] relative z-10 flex flex-col h-full">
                 <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-lg">J</div>
                   <div>
                     <h4 className="font-bold text-[#0f2824]">Jules P.</h4>
                     <p className="text-gray-400 text-[10px] tracking-widest uppercase">BIRTHDAY CELEBRANT</p>
                   </div>
                 </div>
                 <p className="text-gray-600 leading-relaxed mb-8 flex-grow text-[15px]">
                   "We reserved for a small celebration and everything felt smooth from payment upload to confirmation update."
                 </p>
                 <div className="flex gap-1 mt-auto">
                   {[1,2,3,4,5].map(i => (
                     <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbc674]"></div>
                   ))}
                 </div>
               </div>

               <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] relative z-10 flex flex-col h-full">
                 <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-lg">M</div>
                   <div>
                     <h4 className="font-bold text-[#0f2824]">Mark & Elle</h4>
                     <p className="text-gray-400 text-[10px] tracking-widest uppercase">COUPLE ROOM STAY</p>
                   </div>
                 </div>
                 <p className="text-gray-600 leading-relaxed mb-8 flex-grow text-[15px]">
                   "The room was cozy and clean, staff was responsive, and tracking our booking status gave us peace of mind."
                 </p>
                 <div className="flex gap-1 mt-auto">
                   {[1,2,3,4,5].map(i => (
                     <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbc674]"></div>
                   ))}
                 </div>
               </div>
             </div>
           </div>
        </section>

        {/* --- HOW IT WORKS --- */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
              PROCESS
            </span>
            <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-14">
              How it works
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 relative">
               {/* Connecting Line */}
               <div className="hidden md:block absolute top-[44px] left-[15%] right-[15%] h-[1px] bg-gray-200 z-0"></div>

              {/* Step 1 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">1</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Coconut tree.png" alt="Pick a Stay" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Pick a Stay</h4>
                <p className="text-gray-500 text-sm">Select a room or day tour package.</p>
              </div>

              {/* Step 2 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">2</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Shell.png" alt="Details" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Details</h4>
                <p className="text-gray-500 text-sm">Enter your booking dates and information.</p>
              </div>

              {/* Step 3 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">3</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Sand Castle.png" alt="Pay" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Pay</h4>
                <p className="text-gray-500 text-sm">Transfer 50% deposit and upload proof.</p>
              </div>

              {/* Step 4 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">4</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Floters.png" alt="Relax" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Relax</h4>
                <p className="text-gray-500 text-sm">We verify and you get ready to chill.</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- MAP / FIND US SECTION --- */}
        <section className="py-16 bg-[#FAFAFA] border-t border-gray-100">
          <div className="max-w-[70rem] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-10 bg-white rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-50 items-center">
            {/* Left Texts */}
            <div>
              <span className="text-gray-500 font-bold text-[10px] tracking-widest uppercase mb-4 block">FIND US</span>
              <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-8">
                Where is Sandyfeet Liwliwa?
              </h2>
              <p className="text-gray-600 mb-8 max-w-sm">
                Sandyfeet Camp and Event Site is located in Liwliwa, San Felipe, Zambales. Open the map below for direct navigation.
              </p>
              
              <div className="mb-10 text-sm text-gray-500">
                <p className="font-bold text-gray-800 mb-1">Sandyfeet #Liwliwa Camp and Event Site</p>
                <p>San Felipe, Zambales, Philippines</p>
              </div>

              <a
                href="https://maps.app.goo.gl/vw8YdNve2sEoVrVM9"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-3.5 rounded-full text-sm font-semibold shadow-md transition-all hover:shadow-lg shadow-blue-500/20"
              >
                Open in Google Maps
              </a>
            </div>

            <a
              href="https://maps.app.goo.gl/vw8YdNve2sEoVrVM9"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block h-[360px] w-full overflow-hidden rounded-3xl border border-gray-200/60"
            >
              <Image
                src="/assets/View/Front view.jpg"
                alt="Sandyfeet Liwliwa location preview"
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-white/90 px-4 py-3 text-left backdrop-blur-sm">
                <p className="text-sm font-semibold text-[#0f2824]">Open Live Map</p>
                <p className="text-xs text-gray-600">Tap to open Google Maps directions to Sandyfeet, Liwliwa.</p>
              </div>
            </a>
          </div>
        </section>

        {/* --- FOOTER --- */}
        <footer className="py-14 bg-white border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 mb-10">
            
            {/* Column 1: Brand & Info */}
            <div className="flex flex-col">
              <Link href="/" className="flex items-center gap-3 group mb-6">
                <div className="relative w-12 h-12">
                  <Image src="/assets/sandyfeet.png" alt="SandyFeet Logo" fill className="object-contain" />
                </div>
                <div className="flex flex-col justify-center">
                  <span className="font-playfair font-bold text-[#143B36] text-[22px] leading-none mb-1">
                    Sandyfeet
                  </span>
                  <span className="text-gray-400 text-[9px] tracking-[0.2em] font-medium">
                    LIWLIWA CAMP & EVENT SITE
                  </span>
                </div>
              </Link>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm mb-8">
                Escape the ordinary. Secure your spot directly online in just a few clicks. Room reservations, day tour booking, and event packages at Sandyfeet Camp.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center hover:bg-[#3B82F6] hover:text-white transition-all">
                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd"></path></svg>
                </a>
              </div>
            </div>

            {/* Column 2: Explore Links */}
            <div>
              <h4 className="font-bold text-[#0f2824] uppercase text-xs tracking-wider mb-8">Explore</h4>
              <ul className="flex flex-col gap-5 text-sm text-gray-500">
                <li><Link href="/" className="hover:text-[#3B82F6] transition-colors">Home Page</Link></li>
                <li><Link href="/rooms" className="hover:text-[#3B82F6] transition-colors">Room Offers</Link></li>
                <li><Link href="/day-tour" className="hover:text-[#3B82F6] transition-colors">Book a Day Tour</Link></li>
                <li><Link href="/reservation-tracker" className="hover:text-[#3B82F6] transition-colors">Track Reservation</Link></li>
              </ul>
            </div>

            {/* Column 3: Contact Info */}
            <div>
              <h4 className="font-bold text-[#0f2824] uppercase text-xs tracking-wider mb-8">Need to Know</h4>
              <div className="flex flex-col gap-6 text-sm">
                <div className="flex gap-4">
                  <div className="mt-1 text-gray-400">🕒</div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Check-in / Out</p>
                    <p className="text-gray-500">In: 2:00 PM • Out: 12:00 NN</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1 text-gray-400">📞</div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Contact Us</p>
                    <p className="text-gray-500">0908 812 7169</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="max-w-7xl mx-auto px-6 pt-6 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-400">
            <p>© 2026 Sandyfeet Camp & Event Site. All rights reserved.</p>
            <div className="flex gap-6">
              <Link href="#" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
              <Link href="#" className="hover:text-gray-600 transition-colors">Terms of Service</Link>
            </div>
          </div>
        </footer>

      </div>
    </GuestLayout>
  );
}
