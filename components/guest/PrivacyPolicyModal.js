// components/guest/PrivacyPolicyModal.js
'use client';

import { useEffect, useState } from 'react';

export default function PrivacyPolicyModal({ onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // Wait for animation to finish before calling onClose
    setTimeout(onClose, 200);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-[5px] transition-all duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-policy-title"
      onMouseDown={handleClose}
    >
      <div
        className={`
          relative w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl 
          border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out
          ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 flex-none sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <i className="fas fa-shield-alt text-base"></i>
            </div>
            <div>
              <h3 id="privacy-policy-title" className="text-xl font-bold tracking-tight text-slate-900">
                Privacy Policy
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
  
  <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 italic shadow-sm">
    <strong className="font-semibold text-slate-700">
      AVA Development Corporation
    </strong>
    <br />
    doing business as{" "}
    <strong className="font-semibold text-slate-700">
      SANDYFEET #LIWLIWA CAMP AND EVENT SITE
    </strong>
  </div>


          <p className="text-justify">
            AVA Development Corporation, doing business as SANDYFEET #LIWLIWA CAMP AND EVENT SITE ("Sandyfeet," "we," "us," or "our"), is committed to protecting your personal information in accordance with Republic Act No. 10173, also known as the Data Privacy Act of 2012, and its Implementing Rules and Regulations.
            This Privacy Policy explains what personal data we collect, how we use it, how we protect it, and your rights as a data subject. This Policy applies to all personal data collected through our online booking platform at https://sandyfeetresort.vercel.app/ (the "Platform") and through any other interactions with Sandyfeet.
          </p>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-building text-blue-500 text-sm"></i>
              1. IDENTITY OF THE PERSONAL INFORMATION CONTROLLER
            </h4>
            <p>The Personal Information Controller for purposes of this Policy is:</p>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="font-semibold">AVA Development Corporation</p>
              <p className="text-slate-600">doing business as SANDYFEET #LIWLIWA CAMP AND EVENT SITE<br />
              Purok 12, Sitio Liwliwa, San Felipe, Zambales 2204, Philippines<br />
              Email: sandyfeetreservation@gmail.com<br />
              Phone: +63 992-480-1104 / +63 908-812-7169</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-database text-blue-500 text-sm"></i>
              2. WHAT PERSONAL DATA WE COLLECT
            </h4>
            <p>When you use the Platform or make a reservation, we may collect the following categories of personal data:</p>
            <div className="space-y-3 pl-2">
              <div>
                <p className="font-semibold text-slate-800">2.1 Identity and Contact Information</p>
                <ul className="list-disc pl-6 mt-1 space-y-1 text-slate-600">
                  <li>Full name</li>
                  <li>Email address</li>
                  <li>Mobile number</li>
                  <li>Home address</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-800">2.2 Identification Documents</p>
                <ul className="list-disc pl-6 mt-1 space-y-1 text-slate-600">
                  <li>A scanned copy or photograph of a valid government-issued or recognized ID, which may include: Passport, Driver's License, PhilSys National ID, UMID, PhilHealth ID, Student ID, or other recognized identification.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-800">2.3 Booking and Transaction Information</p>
                <ul className="list-disc pl-6 mt-1 space-y-1 text-slate-600">
                  <li>Reservation details (dates, accommodation type, number of guests)</li>
                  <li>Payment records and transaction history</li>
                  <li>Special requests or notes</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-800">2.4 Technical and Usage Data</p>
                <ul className="list-disc pl-6 mt-1 space-y-1 text-slate-600">
                  <li>IP address and device information</li>
                  <li>Browser type and operating system</li>
                  <li>Cookies and usage data collected through the Platform (see Section 8 on Cookies)</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-bullseye text-blue-500 text-sm"></i>
              3. PURPOSE OF PROCESSING PERSONAL DATA
            </h4>
            <p>We collect and process your personal data for the following legitimate purposes:</p>
            <ol className="list-decimal pl-6 space-y-1 text-slate-600">
              <li>To process, confirm, and manage your reservation;</li>
              <li>To verify your identity through the submission of valid identification documents;</li>
              <li>To communicate with you regarding your booking, including confirmations, reminders, and updates;</li>
              <li>To process payments and maintain accurate financial records;</li>
              <li>To ensure compliance with applicable laws and regulations;</li>
              <li>To facilitate future bookings and improve your experience as a returning guest;</li>
              <li>To maintain security and order within the resort premises;</li>
              <li>To respond to your inquiries, complaints, or requests;</li>
              <li>To improve the functionality and user experience of the Platform.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-gavel text-blue-500 text-sm"></i>
              4. LEGAL BASIS FOR PROCESSING
            </h4>
            <p>We process your personal data on the following legal bases under the Data Privacy Act of 2012:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-600">
              <li><strong>Performance of a contract</strong> — processing is necessary to fulfill your reservation and the obligations arising from it;</li>
              <li><strong>Compliance with a legal obligation</strong> — we may process your data to comply with applicable Philippine laws and regulations;</li>
              <li><strong>Legitimate interests</strong> — we process limited technical and usage data to maintain and improve the Platform;</li>
              <li><strong>Consent</strong> — where required by law, we will seek your explicit consent before processing your personal data.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-server text-blue-500 text-sm"></i>
              5. STORAGE OF PERSONAL DATA
            </h4>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">5.1 Where Your Data is Stored</p>
              <p>Your personal data, including identification documents uploaded through the Platform, is stored securely in our cloud-based system. Access to your personal data, including uploaded identification documents, is restricted to authorized Sandyfeet administrators only. These administrators use your data solely for the purpose of verifying the authenticity of your identification and managing your reservation.</p>
              <p className="font-semibold text-slate-800 mt-2">5.2 Retention Period</p>
              <p>We retain your personal data, including your identification documents and booking history, for a period of two (2) years from the date of your last completed stay or transaction. This retention period is maintained to facilitate future bookings and to comply with applicable record-keeping obligations. After the retention period, your personal data will be securely disposed of or anonymized, unless we are required by law to retain it for a longer period.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-share-alt text-blue-500 text-sm"></i>
              6. SHARING OF PERSONAL DATA
            </h4>
            <p>Sandyfeet does not sell, rent, trade, or otherwise disclose your personal data to third parties for commercial purposes.</p>
            <p>We may only share your personal data in the following limited circumstances:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-600">
              <li>With authorized Sandyfeet administrators and staff who require access to process your reservation;</li>
              <li>With government agencies or law enforcement authorities where required or authorized by law;</li>
              <li>With our legal advisors or auditors, strictly as necessary for the performance of their professional functions, and subject to appropriate confidentiality agreements.</li>
            </ul>
            <p>We do not share your personal data with advertising partners, data brokers, or any other commercial third parties.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-user-shield text-blue-500 text-sm"></i>
              7. YOUR RIGHTS AS A DATA SUBJECT
            </h4>
            <p>Under the Data Privacy Act of 2012 and its Implementing Rules and Regulations, you have the following rights with respect to your personal data:</p>
            <ol className="list-decimal pl-6 space-y-1 text-slate-600">
              <li>Right to be Informed</li>
              <li>Right to Access</li>
              <li>Right to Rectification</li>
              <li>Right to Erasure or Blocking</li>
              <li>Right to Object</li>
              <li>Right to Data Portability</li>
              <li>Right to File a Complaint</li>
            </ol>
            <p className="mt-2">To exercise any of the above rights, please send a written request to sandyfeetreservation@gmail.com. We will respond to your request within a reasonable time and in accordance with applicable law.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-cookie-bite text-blue-500 text-sm"></i>
              8. COOKIES AND TRACKING TECHNOLOGIES
            </h4>
            <p>The Platform uses cookies and similar tracking technologies to enhance your browsing experience and improve Platform functionality.</p>
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">8.1 Types of Cookies We Use</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li><strong>Essential Cookies</strong> — Required for the Platform to function properly. These cannot be disabled.</li>
                <li><strong>Functional Cookies</strong> — Used to remember your preferences and improve your experience on return visits.</li>
                <li><strong>Analytics Cookies</strong> — Used to understand how users interact with the Platform, allowing us to improve its functionality and performance.</li>
              </ul>
              <p className="font-semibold text-slate-800 mt-2">8.2 Managing Cookies</p>
              <p>You may adjust your browser settings to refuse or delete cookies. However, please note that disabling certain cookies may affect the functionality of the Platform and your ability to complete a reservation.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-lock text-blue-500 text-sm"></i>
              9. DATA SECURITY
            </h4>
            <p>We implement reasonable and appropriate technical and organizational security measures to protect your personal data from unauthorized access, disclosure, alteration, or destruction. These measures include restricting access to personal data to authorized administrators only and using secure storage systems.</p>
            <p>While we take data security seriously, no method of electronic transmission or storage is completely secure. In the event of a personal data breach that poses a significant risk to your rights and freedoms, we will notify the National Privacy Commission and the affected data subjects in accordance with applicable law.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-child text-blue-500 text-sm"></i>
              10. CHILDREN'S DATA
            </h4>
            <p>The Platform is not directed at children under the age of eighteen (18). We do not knowingly collect personal data from minors without the consent of their parent or legal guardian. If you believe we have inadvertently collected data from a minor, please contact us immediately at sandyfeetreservation@gmail.com so we can promptly take the necessary action.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-edit text-blue-500 text-sm"></i>
              11. CHANGES TO THIS PRIVACY POLICY
            </h4>
            <p>We reserve the right to update or amend this Privacy Policy at any time to reflect changes in our practices, legal requirements, or Platform features. The updated Policy will be posted on the Platform with a revised effective date. Your continued use of the Platform following the posting of changes constitutes your acceptance of the updated Privacy Policy.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-1 flex items-center gap-2">
              <i className="fas fa-phone-alt text-blue-500 text-sm"></i>
              12. CONTACT US
            </h4>
            <p>For any questions, concerns, or requests regarding this Privacy Policy or the processing of your personal data, please contact:</p>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="font-semibold">Sandyfeet #Liwliwa Camp and Event Site — Data Privacy Officer</p>
              <p className="text-slate-600">Email: sandyfeetreservation@gmail.com<br />
              Phone: +63 992-480-1104 / +63 908-812-7169<br />
              Address: Purok 12, Sitio Liwliwa, San Felipe, Zambales 2204, Philippines</p>
            </div>
            <p>You also have the right to file a complaint with the National Privacy Commission (NPC) of the Philippines at www.privacy.gov.ph.</p>
            <p className="mt-2 font-medium text-slate-800">By using the Platform, you acknowledge that you have read and understood this Privacy Policy and consent to the processing of your personal data as described herein.</p>
          </section>
        </div>

        {/* Sticky Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-white flex justify-end flex-none sticky bottom-0">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl bg-slate-100 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-all active:scale-[0.98] shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}