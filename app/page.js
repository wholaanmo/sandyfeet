import GuestLayout from './guest/layout';
import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <GuestLayout>
      <div className="bg-white min-h-screen overflow-hidden text-[#143B36]">
        {/* --- HERO SECTION --- */}
        <section className="relative w-full max-w-7xl mx-auto px-6 pt-32 pb-20 mt-12 md:pt-40 md:flex md:items-center md:min-h-[85vh]">
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
          <div className="md:w-7/12 relative h-[500px] mt-16 md:mt-0">
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
              <Image src="/assets/GroupRoom/Group Room 1.jpg" alt="Group Room" fill className="object-cover" />
            </div>
          </div>
        </section>

        {/* --- GALLERY SECTION --- */}
        <section className="bg-white/50 py-24 pb-32 border-t border-gray-100/50">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
              LIVE MOMENTS
            </span>
            <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-6">
              Gallery in Motion
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto mb-16 px-4">
              A quick look at the vibe around Sandyfeet, from bright mornings by the pool to laid-back sunsets.
            </p>
            
            {/* Fixed Height Image Row */}
            <div className="flex justify-center gap-4 h-[300px] overflow-hidden px-4 relative">
               {/* Sand dollar decorative icon placeholder (absolute) */}
               <div className="absolute right-10 -top-10 w-16 h-16 bg-[#f7eedc] rounded-full opacity-60"></div>
              
              <div className="w-1/4 rounded-3xl overflow-hidden relative opacity-70 group hover:opacity-100 hover:w-1/3 transition-all duration-500 cursor-pointer">
                <Image src="/assets/View/Second floor view.jpg" alt="Pathway" fill className="object-cover" />
              </div>
              <div className="w-1/3 rounded-3xl overflow-hidden relative shadow-lg group hover:w-2/5 transition-all duration-500 cursor-pointer z-10">
                <Image src="/assets/GroundFloor/GroundFloor 2.jpg" alt="Veranda" fill className="object-cover" />
              </div>
              <div className="w-2/5 rounded-3xl overflow-hidden relative shadow-lg group hover:w-1/2 transition-all duration-500 cursor-pointer z-10">
                <Image src="/assets/View/IMG_20260327_134714.jpg" alt="Poolside Building" fill className="object-cover" />
              </div>
              <div className="w-1/3 rounded-3xl overflow-hidden relative shadow-lg group hover:w-2/5 transition-all duration-500 cursor-pointer z-10">
                <Image src="/assets/View/FrontView.jpg" alt="Day View" fill className="object-cover" />
              </div>
            </div>
          </div>
        </section>

        {/* --- FEATURED PACKAGES --- */}
        <section className="py-24 relative">
           <div className="max-w-7xl mx-auto px-6">
             <div className="text-center mb-16 relative">
                {/* Decorative sandals */}
                <div className="absolute -left-10 top-0 w-24 h-24 bg-gray-100 rounded opacity-60 rotate-45 hidden md:block"></div>

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
                   <Image src="/assets/GroupRoom/Group Room 1.jpg" alt="Group Room" fill className="object-cover" />
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
           </div>
        </section>

        {/* --- TESTIMONIALS --- */}
        <section className="py-24 bg-white border-t border-gray-50 pb-40">
           <div className="max-w-7xl mx-auto px-6">
             <div className="text-center mb-16">
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
                   <Image src="/assets/Icon/tent.png" alt="Tree" width={100} height={100}/>
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
      </div>
    </GuestLayout>
  );
}
