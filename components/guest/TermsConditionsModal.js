// components/guest/TermsConditionsModal.js
'use client';

import { useEffect, useState } from 'react';

export default function TermsConditionsModal({ onClose, onAccept }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const handleAccept = () => {
    if (onAccept) onAccept();
    handleClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-[5px] transition-all duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
      onMouseDown={handleClose}
    >
      <div
        className={`
          relative w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl 
          border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out
          ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 flex-none sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <i className="fas fa-file-contract text-base"></i>
            </div>
            <div>
              <h3 id="terms-modal-title" className="text-xl font-bold tracking-tight text-slate-900">
                Terms and Conditions of Use
              </h3>
              <p className="text-xs text-slate-500">Effective Date: May 23, 2026</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all shadow-sm active:scale-95"
            aria-label="Close"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-sm text-slate-700 leading-relaxed scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
          <div className="bg-amber-50 p-4 rounded-xl text-amber-800">
            <p className="text-sm">
              Please read these Terms and Conditions carefully before making a reservation or using the online booking platform at https://sandyfeetresort.vercel.app/ (the "Platform"). By completing a booking or using the Platform, you confirm that you have read, understood, and agreed to be bound by these Terms and Conditions.
            </p>
          </div>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-handshake text-blue-500 text-sm"></i>
              1. PARTIES TO THE AGREEMENT
            </h4>
            <p>These Terms and Conditions constitute a legally binding agreement between:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-600">
              <li>AVA Development Corporation, a corporation duly registered with the Securities and Exchange Commission (SEC), doing business under the trade name SANDYFEET #LIWLIWA CAMP AND EVENT SITE (referred to herein as "Sandyfeet," "we," "us," or "our"); and</li>
              <li>The guest, registrant, or any person completing a reservation through the Platform (referred to herein as "you," "your," or "guest").</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-home text-blue-500 text-sm"></i>
              2. ABOUT THE PROPERTY
            </h4>
            <p>Sandyfeet #Liwliwa Camp and Event Site is a beach camp and event venue located at:</p>
            <p className="font-medium">Purok 12, Sitio Liwliwa, San Felipe, Zambales 2204, Philippines</p>
            <p>The property offers the following amenities included with all bookings: spacious parking area, kitchen and grilling area, kitchen utensils, drinking water, and swimming pool. These amenities are available to guests on both day tour and overnight bookings.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-concierge-bell text-blue-500 text-sm"></i>
              3. SCOPE OF SERVICES
            </h4>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">3.1 Included Services</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Access to the swimming pool</li>
                <li>Use of the kitchen and grilling area</li>
                <li>Basic kitchen utensils</li>
                <li>Drinking water</li>
                <li>Spacious on-site parking</li>
              </ul>
              <p className="font-semibold text-slate-800 mt-2">3.2 Partner Activities (Not Included in Booking)</p>
              <p>The following activities are facilitated through third-party partners and are NOT bookable through the Platform. Guests interested in these activities must inform Sandyfeet staff directly upon arrival, and arrangements will be made on-site:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>ATV rides</li>
                <li>Banana boat rides</li>
              </ul>
              <p>Sandyfeet does not guarantee the availability of these partner activities and assumes no liability for incidents arising from their use. Separate terms and pricing apply.</p>
              <p className="font-semibold text-slate-800 mt-2">3.3 Accommodation Types and Capacities</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Ground Floor Room — Maximum capacity: 6 adults</li>
                <li>Tent — Maximum capacity: 4 persons</li>
                <li>Couple Room — Suitable for 1 to 2 persons</li>
                <li>Group Room — Suitable for 1 to 14 persons</li>
              </ul>
              <p>The total resort capacity is 48 guests at any given time, subject to availability at the time of booking. Exceeding the maximum capacity of any accommodation or the resort as a whole is strictly prohibited.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-calendar-alt text-blue-500 text-sm"></i>
              4. BOOKING AND RESERVATIONS
            </h4>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">4.1 How to Book</p>
              <p>Reservations must be made through the official online booking platform. Walk-in reservations are subject to availability. Sandyfeet reserves the right to decline any reservation at its discretion.</p>
              <p className="font-semibold text-slate-800 mt-2">4.2 Reservation Confirmation</p>
              <p>A booking is considered confirmed only upon receipt and verification of the required downpayment and submission of a valid government-issued identification document. Sandyfeet will notify you of the confirmation status through the Platform or via the contact details provided.</p>
              <p className="font-semibold text-slate-800 mt-2">4.3 Guest Information</p>
              <p>You agree to provide accurate, complete, and truthful information when completing your reservation. Sandyfeet reserves the right to cancel a booking if false or misleading information is discovered.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-credit-card text-blue-500 text-sm"></i>
              5. PAYMENT TERMS
            </h4>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">5.1 Downpayment Requirement</p>
              <p>A non-refundable downpayment equivalent to fifty percent (50%) of the total booking amount is required to secure a reservation. The downpayment must be settled through the payment method specified on the Platform.</p>
              <p className="font-semibold text-slate-800 mt-2">5.2 Balance Payment</p>
              <p>The remaining fifty percent (50%) balance of the total booking amount shall be settled either:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Upon arrival at the property before checking in</li>
              </ul>
              <p>Failure to settle the balance may result in denial of check-in or forfeiture of the reservation.</p>
              <p className="font-semibold text-slate-800 mt-2">5.3 Accepted Payment Methods</p>
              <p>Payment methods accepted are those listed on the Platform at the time of booking. Sandyfeet reserves the right to modify accepted payment methods at any time with prior notice.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-ban text-blue-500 text-sm"></i>
              6. CANCELLATION AND REFUND POLICY
            </h4>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">6.1 General Cancellation Policy</p>
              <p>The downpayment is generally non-refundable. If a guest cancels a confirmed reservation, the downpayment shall be forfeited in its entirety, except as provided under Section 6.2 below.</p>
              <p className="font-semibold text-slate-800 mt-2">6.2 Refunds for Special Circumstances</p>
              <p>A partial refund of fifty percent (50%) of the downpayment may be granted under the following special circumstances, subject to verification and management approval:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Medical emergency or hospitalization of the guest or an immediate family member, supported by a medical certificate or hospital record;</li>
                <li>Death of an immediate family member, supported by a death certificate;</li>
                <li>Natural disaster or calamity directly affecting the guest's ability to travel, as declared by relevant government authorities; or</li>
                <li>Government-mandated lockdowns, travel restrictions, or similar public health or safety measures that legally prevent travel to the property.</li>
              </ul>
              <p>Requests for refunds under special circumstances must be submitted in writing within seven (7) days of the original check-in date, together with supporting documentation. Sandyfeet reserves the right to request additional documents and to deny refund requests that do not meet the above criteria.</p>
              <p className="font-semibold text-slate-800 mt-2">6.3 No-Show Policy</p>
              <p>If a guest fails to arrive on the confirmed check-in date without prior notice of cancellation or rescheduling, the reservation shall be treated as a no-show, and the downpayment shall be forfeited in full.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-exchange-alt text-blue-500 text-sm"></i>
              7. RESCHEDULING POLICY
            </h4>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">7.1 Rescheduling While Booking is Pending</p>
              <p>Guests may modify or edit their reservation details (including the check-in date) only once, provided that the booking status is still marked as ‘Pending’ in the Platform. Once the booking is confirmed (i.e., after the downpayment has been verified), the right to edit or modify the reservation shall be forfeited.</p>
              <p className="font-semibold text-slate-800 mt-2">7.2 Rescheduling After Confirmation</p>
              <p>After a booking has been confirmed, rescheduling is permitted subject to the following conditions:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>A rescheduling request must be submitted at least one (1) full day (24 hours) before the original check-in date;</li>
                <li>Each booking may only be rescheduled once (1 time);</li>
                <li>The new date is subject to availability;</li>
                <li>Sandyfeet reserves the right to deny a rescheduling request if the conditions above are not met.</li>
              </ul>
              <p>To request rescheduling, guests must contact Sandyfeet at sandyfeetreservation@gmail.com or call +63 992-480-1104 / +63 908-812-7169.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-clock text-blue-500 text-sm"></i>
              8. CHECK-IN AND CHECK-OUT
            </h4>
            <p><span className="font-semibold">Check-In Time:</span> 2:00 PM &nbsp;|&nbsp; <span className="font-semibold">Check-Out Time:</span> 12:00 PM (noon)</p>
            <p>Early check-in and late check-out are subject to availability and may incur additional charges at the discretion of management. Guests who fail to check out by the designated time may be charged for an additional period.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-gavel text-blue-500 text-sm"></i>
              9. GUEST CONDUCT AND HOUSE RULES
            </h4>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">9.1 Noise and Curfew</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>The resort gates will be closed at 10:00 PM.</li>
                <li>Karaoke, loud music, and disruptive noise are strictly prohibited after 10:00 PM.</li>
                <li>Guests are expected to be respectful of other guests and neighboring areas at all times.</li>
              </ul>
              <p className="font-semibold text-slate-800 mt-2">9.2 Food and Beverages</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Outside food is permitted on the premises.</li>
                <li>Guests may use the grilling area and refrigerator, which are included in the booking.</li>
              </ul>
              <p className="font-semibold text-slate-800 mt-2">9.3 Pets</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Pets are allowed within the property. Pet owners are solely responsible for the behavior, safety, and cleanliness related to their pets.</li>
                <li>Guests are required to clean up after their pets at all times.</li>
              </ul>
              <p className="font-semibold text-slate-800 mt-2">9.4 Property Care</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Guests are responsible for any damage to the property, amenities, or equipment caused by themselves, their companions, or their pets.</li>
                <li>Sandyfeet reserves the right to charge guests for the cost of repair or replacement of any damaged items.</li>
              </ul>
              <p className="font-semibold text-slate-800 mt-2">9.5 Prohibited Activities</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Activities that pose a danger to other guests, staff, or the property are strictly prohibited.</li>
                <li>Sandyfeet reserves the right to immediately eject guests who violate these rules without entitlement to any refund.</li>
              </ul>
              <p className="font-semibold text-slate-800 mt-2">9.6 Guest Capacity</p>
              <p>Guests must not exceed the maximum occupancy limits per accommodation type or the overall resort capacity of 48 persons. Unauthorized additional guests will not be permitted on the premises.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-id-card text-blue-500 text-sm"></i>
              10. VALID IDENTIFICATION REQUIREMENT
            </h4>
            <p>All guests are required to present a valid government-issued or recognized identification document upon check-in or upon uploading through the Platform. The following IDs are accepted:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-600">
              <li>Philippine Passport</li>
              <li>Driver's License</li>
              <li>PhilSys National ID</li>
              <li>UMID (Unified Multi-Purpose Identification Card)</li>
              <li>PhilHealth ID</li>
              <li>Student ID (from a recognized educational institution)</li>
              <li>Other government-issued or recognized IDs, upon approval by management</li>
            </ul>
            <p>Sandyfeet reserves the right to refuse check-in to any guest who fails to present a valid ID.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-exclamation-triangle text-blue-500 text-sm"></i>
              11. LIMITATION OF LIABILITY
            </h4>
            <p>To the maximum extent permitted by applicable law:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-600">
              <li>Sandyfeet shall not be liable for any loss, theft, or damage to personal belongings brought onto the property;</li>
              <li>Sandyfeet shall not be liable for any injury, accident, or harm suffered by guests arising from the use of resort amenities, partner activities, or any other activities within the property, except where caused by Sandyfeet's gross negligence or willful misconduct;</li>
              <li>Sandyfeet does not guarantee the continuous availability of partner services (ATV, banana boat) and shall not be held liable for their unavailability;</li>
              <li>In no event shall Sandyfeet's total liability to any guest exceed the total amount paid by such guest for the reservation in question.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-cloud-rain text-blue-500 text-sm"></i>
              12. FORCE MAJEURE
            </h4>
            <p>Sandyfeet shall not be held liable for failure to perform its obligations under these Terms where such failure arises from events beyond its reasonable control, including but not limited to: acts of God, typhoons, floods, earthquakes, fire, government-mandated restrictions, epidemics, pandemics, civil unrest, or any other similar event. In such cases, Sandyfeet will make reasonable efforts to reschedule affected bookings.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-pen-alt text-blue-500 text-sm"></i>
              13. AMENDMENTS
            </h4>
            <p>Sandyfeet reserves the right to amend these Terms and Conditions at any time without prior notice. The latest version of the Terms will be posted on the Platform and shall be effective upon posting. Continued use of the Platform or completion of a booking after amendments are posted constitutes acceptance of the revised Terms.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-balance-scale text-blue-500 text-sm"></i>
              14. GOVERNING LAW
            </h4>
            <p>These Terms and Conditions shall be governed by and construed in accordance with the laws of the Republic of the Philippines. Any dispute arising from or in connection with these Terms shall be subject to the exclusive jurisdiction of the appropriate courts of the Republic of the Philippines.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-envelope text-blue-500 text-sm"></i>
              15. CONTACT INFORMATION
            </h4>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p>Email: sandyfeetreservation@gmail.com<br />
              Phone: +63 992-480-1104 / +63 908-812-7169<br />
              Address: Purok 12, Sitio Liwliwa, San Felipe, Zambales 2204, Philippines<br />
              Platform: https://sandyfeetresort.vercel.app/</p>
            </div>
            <p className="font-medium text-slate-800">By completing a booking on the Platform, you acknowledge that you have read, understood, and agreed to these Terms and Conditions in their entirety.</p>
          </section>
        </div>

        {/* Sticky Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-white flex justify-end flex-none sticky bottom-0">
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-xl bg-[#2563EB] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-all hover:shadow-md active:scale-[0.98]"
          >
            Accept & Agree
          </button>
        </div>
      </div>
    </div>
  );
}