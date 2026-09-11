'use client';

import { useEffect, useState } from 'react';
import { uploadImage } from '@/lib/cloudinary';
import { compressImage } from '@/lib/imageUtils';
import { VALID_ID_OPTIONS } from '@/lib/guestValidId';

const emptyForm = {
  validIdType: 'Passport',
  validIdOther: '',
  validIdName: '',
  validIdUrl: '',
  validIdSelfieUrl: '',
};

export default function InlineValidIdUpload({ profile, updateGuestProfile, onComplete }) {
  const [form, setForm] = useState(emptyForm);
  const [uploadingField, setUploadingField] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm({
      validIdType: profile?.validIdType || 'Passport',
      validIdOther: profile?.validIdOther || '',
      validIdName: profile?.validIdName || '',
      validIdUrl: profile?.validIdUrl || '',
      validIdSelfieUrl: profile?.validIdSelfieUrl || '',
    });
  }, [profile]);

  const handleUpload = async (event, field) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessage('Each image must be 10MB or smaller.');
      return;
    }

    setUploadingField(field);
    setMessage('');
    try {
      const compressedFile = await compressImage(file, { maxSizeMB: 0.2, maxDimension: 1400 });
      const imageUrl = await uploadImage(compressedFile);
      setForm((prev) => ({ ...prev, [field]: imageUrl }));
    } catch (error) {
      console.error('Failed to upload verification image:', error);
      setMessage('Unable to upload this image right now. Please try again.');
    } finally {
      setUploadingField('');
    }
  };

  const handleSave = async () => {
    if (!form.validIdType) {
      setMessage('Select an ID type before continuing.');
      return;
    }
    if (form.validIdType === 'Other' && !form.validIdOther.trim()) {
      setMessage('Specify the ID type before continuing.');
      return;
    }
    if (!form.validIdName.trim()) {
      setMessage('Enter the name exactly as printed on the ID.');
      return;
    }
    if (!form.validIdUrl || !form.validIdSelfieUrl) {
      setMessage('Upload both the ID photo/scan and the photo of you holding the same ID.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await updateGuestProfile({
        validIdType: form.validIdType,
        validIdOther: form.validIdType === 'Other' ? form.validIdOther.trim() : '',
        validIdName: form.validIdName.trim(),
        validIdUrl: form.validIdUrl,
        validIdSelfieUrl: form.validIdSelfieUrl,
      });
      onComplete?.();
    } catch (error) {
      console.error('Failed to save verification details:', error);
      setMessage('Unable to save your verification details right now.');
    } finally {
      setSaving(false);
    }
  };

  const uploadCard = (field, title, description, icon, alt) => (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-ocean-mid"><i className={`fas ${icon}`} /></span>
        <div><p className="text-sm font-semibold text-textPrimary">{title}</p><p className="mt-1 text-xs leading-5 text-textSecondary">{description}</p></div>
      </div>
      <label className="relative block cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-ocean-light/40 bg-white transition hover:border-ocean-mid">
        <input type="file" accept="image/*" onChange={(event) => handleUpload(event, field)} disabled={Boolean(uploadingField)} className="absolute inset-0 z-10 size-full cursor-pointer opacity-0" aria-label={title} />
        {form[field] ? <img src={form[field]} alt={alt} className="h-44 w-full object-contain" /> : <div className="flex h-44 flex-col items-center justify-center px-4 text-center text-sm text-textSecondary"><i className={`fas ${uploadingField === field ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} mb-3 text-2xl text-ocean-mid`} /><span className="font-semibold text-ocean-mid">{uploadingField === field ? 'Uploading…' : 'Choose a file'}</span><span className="mt-1 text-xs">JPG or PNG, up to 10MB</span></div>}
      </label>
      {form[field] && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700"><i className="fas fa-check-circle" /> Uploaded · click to replace</p>}
    </div>
  );

  return (
    <div className="rounded-2xl border border-ocean-light/20 bg-white p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">Valid ID type</span><select value={form.validIdType} onChange={(event) => setForm((prev) => ({ ...prev, validIdType: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20">{VALID_ID_OPTIONS.map((option) => <option key={option} value={option}>{option === 'Other' ? 'Other valid ID' : option}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">Name printed on ID</span><input value={form.validIdName} onChange={(event) => setForm((prev) => ({ ...prev, validIdName: event.target.value }))} placeholder="Exactly as shown on your ID" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" /></label>
      </div>
      {form.validIdType === 'Other' && <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">Specify ID type</span><input value={form.validIdOther} onChange={(event) => setForm((prev) => ({ ...prev, validIdOther: event.target.value }))} placeholder="Enter the ID type" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" /></label>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {uploadCard('validIdUrl', 'Photo or scan of ID', 'Make sure the name, photo, and ID number are readable.', 'fa-id-card', 'Uploaded valid ID')}
        {uploadCard('validIdSelfieUrl', 'Person holding the ID', 'Take a clear photo of yourself holding the same ID.', 'fa-camera', 'Person holding valid ID')}
      </div>
      {message && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><i className="fas fa-circle-exclamation mr-2" />{message}</p>}
      <button type="button" onClick={handleSave} disabled={saving || Boolean(uploadingField)} className="mt-5 w-full rounded-xl bg-ocean-mid px-4 py-3 text-sm font-semibold text-white hover:bg-ocean-deep disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving verification…' : 'Save verification and continue'}<i className="fas fa-arrow-right ml-2" /></button>
    </div>
  );
}
