// components/guest/IdRequestViewModal.js
'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { uploadImage } from '@/lib/cloudinary';
import {
  VALID_ID_OPTIONS,
  submitGuestValidIdResubmission,
} from '@/lib/idRequestUtils';
import { formatDateOnly } from '@/app/my-bookings/utils';

function IdRequestSubmitConfirmModal({ isOpen, onConfirm, onCancel, sending }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
    } else {
      setIsClosing(true);
      const timeoutId = window.setTimeout(() => {
        setIsVisible(false);
        document.body.style.overflow = 'unset';
      }, 200);
      return () => window.clearTimeout(timeoutId);
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-all duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <MotionlessConfirmModalBackdrop />
      <div
        className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-200 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#4D8CF5]/5 blur-2xl" />
        <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-[#1E3A8A]/5 blur-3xl" />

        <div className="relative border-b border-[#4D8CF5]/15 px-6 py-5">
          <MotionlessConfirmModalHeader />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#4D8CF5]/15 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[#1E3A8A] transition-all hover:bg-[#4D8CF5]/5 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#3b7ae0] disabled:opacity-60"
          >
            {sending ? (
              <>
                <i className="fas fa-spinner fa-spin text-xs" />
                Sending...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane text-xs" />
                Confirm Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MotionlessConfirmModalBackdrop() {
  return <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />;
}

function MotionlessConfirmModalHeader() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#4D8CF5]/10">
        <i className="fas fa-id-card text-lg text-[#4D8CF5]" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-[#1E3A8A]">Submit New Valid ID?</h3>
        <p className="mt-1 text-sm text-[#5C7AA6]">
          Your new valid ID will be sent to the resort for review.
        </p>
      </div>
    </div>
  );
}

function ValidIdImagePreview({ imageUrl }) {
  return (
    <div className="relative mt-3 h-44 w-full overflow-hidden rounded-xl border border-[#4D8CF5]/15 bg-[#f8fbff]">
      <Image
        src={imageUrl}
        alt="Valid ID"
        fill
        className="object-contain p-2"
        sizes="(max-width: 768px) 100vw, 640px"
        unoptimized
      />
    </div>
  );
}

export default function IdRequestViewModal({ notification, isOpen, onClose }) {
  const fileInputRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [validIdType, setValidIdType] = useState('Passport');
  const [validIdImage, setValidIdImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [localIdRequest, setLocalIdRequest] = useState(null);

  const idRequest = localIdRequest || notification?.idRequest;
  const isFulfilled = idRequest?.status === 'fulfilled';

  useEffect(() => {
    if (!notification) return;
    setLocalIdRequest(notification.idRequest);
    setValidIdType('Passport');
    setValidIdImage(null);
    setError('');
    setSuccess('');
    setShowConfirm(false);
  }, [notification]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
    } else {
      setIsClosing(true);
      const timeoutId = window.setTimeout(() => {
        setIsVisible(false);
        document.body.style.overflow = 'unset';
      }, 200);
      return () => window.clearTimeout(timeoutId);
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isVisible || !notification) return null;

  const dateLabel = notification.bookingType === 'daytour'
    ? formatDateOnly(notification.selectedDate)
    : `${formatDateOnly(notification.checkIn)} – ${formatDateOnly(notification.checkOut)}`;

  const previousIdImage = idRequest?.previousValidIdImage;
  const previousIdType = idRequest?.previousValidIdType;

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const url = await uploadImage(file);
      setValidIdImage(url);
    } catch (uploadError) {
      console.error('Failed to upload valid ID:', uploadError);
      setError('Failed to upload valid ID. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!validIdImage || !validIdType) {
      setError('Please select a valid ID type and upload a photo first.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await submitGuestValidIdResubmission({
        collectionName: notification.collectionName,
        docId: notification.docId,
        parentBookingId: notification.parentBookingId,
        validIdType,
        validIdImage,
        existingIdRequest: idRequest,
      });
      setLocalIdRequest({
        ...idRequest,
        status: 'fulfilled',
        fulfilledAt: new Date().toISOString(),
      });
      setSuccess('Your new valid ID has been submitted successfully.');
    } catch (submitError) {
      console.error('Failed to submit valid ID:', submitError);
      setError(submitError.message || 'Failed to submit valid ID. Please try again.');
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-200 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          className={`relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-200 ${
            isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#4D8CF5]/5 blur-2xl" />
          <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-[#1E3A8A]/5 blur-3xl" />

          <div className="relative flex items-start justify-between border-b border-[#4D8CF5]/15 px-6 py-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#4D8CF5]">
                ID Request
              </p>
              <h3 className="mt-1 text-lg font-bold text-[#1E3A8A]">{notification.title}</h3>
              <p className="mt-1 text-sm text-[#5C7AA6]">
                {notification.typeLabel} · {notification.bookingId} · {dateLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#4D8CF5]/15 text-[#5C7AA6] transition hover:bg-[#4D8CF5]/10"
              aria-label="Close"
            >
              <i className="fas fa-times" />
            </button>
          </div>

          <MotionlessConfirmModalBody
            idRequest={idRequest}
            previousIdType={previousIdType}
            previousIdImage={previousIdImage}
            isFulfilled={isFulfilled}
            validIdType={validIdType}
            setValidIdType={setValidIdType}
            validIdImage={validIdImage}
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
            uploading={uploading}
            sending={sending}
            setError={setError}
            setShowConfirm={setShowConfirm}
            error={error}
            success={success}
          />
        </div>
      </div>

      <IdRequestSubmitConfirmModal
        isOpen={showConfirm}
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleSend}
        sending={sending}
      />
    </>
  );
}

function MotionlessConfirmModalBody({
  idRequest,
  previousIdType,
  previousIdImage,
  isFulfilled,
  validIdType,
  setValidIdType,
  validIdImage,
  fileInputRef,
  handleFileChange,
  uploading,
  sending,
  setError,
  setShowConfirm,
  error,
  success,
}) {
  return (
    <div className="relative flex-1 space-y-5 overflow-y-auto px-6 py-5">
      <section className="rounded-xl border border-[#4D8CF5]/15 bg-[#f8fbff] p-4">
        <h4 className="text-sm font-bold text-[#1E3A8A]">Admin ID request note</h4>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#5C7AA6]">
          {idRequest?.adminMessage || 'No additional message provided.'}
        </p>
      </section>

      <section className="rounded-xl border border-[#4D8CF5]/15 bg-white p-4">
        <h4 className="text-sm font-bold text-[#1E3A8A]">Previously uploaded valid ID</h4>
        <p className="mt-1 text-sm text-[#5C7AA6]">
          Type:{' '}
          <span className="font-semibold text-[#1E3A8A]">{previousIdType || 'Not specified'}</span>
        </p>
        {previousIdImage ? (
          <ValidIdImagePreview imageUrl={previousIdImage} />
        ) : (
          <p className="mt-3 text-sm text-[#5C7AA6]">No previous valid ID image on file.</p>
        )}
      </section>

      <section className="rounded-xl border border-[#4D8CF5]/15 bg-white p-4">
        <h4 className="text-sm font-bold text-[#1E3A8A]">Upload a new valid ID</h4>

        {isFulfilled ? (
          <MotionlessConfirmModalFulfilledMessage />
        ) : (
          <MotionlessConfirmModalUploadSection
            validIdType={validIdType}
            setValidIdType={setValidIdType}
            validIdImage={validIdImage}
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
            uploading={uploading}
            sending={sending}
            setError={setError}
            setShowConfirm={setShowConfirm}
          />
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </p>
        )}
      </section>
    </div>
  );
}

function MotionlessConfirmModalFulfilledMessage() {
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
      Already uploaded a new valid ID
    </div>
  );
}

function MotionlessConfirmModalUploadSection({
  validIdType,
  setValidIdType,
  validIdImage,
  fileInputRef,
  handleFileChange,
  uploading,
  sending,
  setError,
  setShowConfirm,
}) {
  return (
    <>
      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#5C7AA6]">
          Valid ID type
        </label>
        <select
          value={validIdType}
          onChange={(e) => setValidIdType(e.target.value)}
          className="w-full rounded-xl border border-[#4D8CF5]/20 bg-white px-3 py-2.5 text-sm font-medium text-[#1E3A8A] outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20"
        >
          {VALID_ID_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {validIdImage && <ValidIdImagePreview imageUrl={validIdImage} />}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-[#f8fbff] px-4 py-2.5 text-sm font-semibold text-[#1E3A8A] transition hover:bg-[#EEF5FF] disabled:opacity-60"
        >
          <i className={`fas ${uploading ? 'fa-spinner fa-spin' : 'fa-camera'} text-xs`} />
          {uploading ? 'Uploading...' : 'Upload Photo'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!validIdImage || !validIdType) {
              setError('Please select a valid ID type and upload a photo first.');
              return;
            }
            setError('');
            setShowConfirm(true);
          }}
          disabled={uploading || sending || !validIdImage}
          className="inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3b7ae0] disabled:opacity-60"
        >
          <i className="fas fa-paper-plane text-xs" />
          Send
        </button>
      </div>
    </>
  );
}