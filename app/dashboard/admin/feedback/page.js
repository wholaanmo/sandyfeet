// app/dashboard/admin/feedback/page.js
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', feedback: null });

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => setNotification({ show: false, message: '', type: '' }), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const feedbacksRef = collection(db, 'feedbacks');
    const q = query(feedbacksRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const feedbacksList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        feedbacksList.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt || 0),
        });
      });
      setFeedbacks(feedbacksList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching feedbacks:', error);
      setNotification({ show: true, message: 'Failed to load feedbacks.', type: 'error' });
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };

  const handlePublish = async (feedback) => {
    setActionLoading(prev => ({ ...prev, [feedback.id]: true }));
    try {
      const feedbackRef = doc(db, 'feedbacks', feedback.id);
      await updateDoc(feedbackRef, {
        status: 'Published',
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      showNotification('Feedback published successfully!', 'success');
      if (isViewModalOpen) setIsViewModalOpen(false);
      setConfirmModal({ show: false, type: '', feedback: null });
    } catch (error) {
      console.error('Error publishing feedback:', error);
      showNotification('Failed to publish feedback.', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [feedback.id]: false }));
    }
  };

  const handleDontPublish = async (feedback) => {
    setActionLoading(prev => ({ ...prev, [feedback.id]: true }));
    try {
      const feedbackRef = doc(db, 'feedbacks', feedback.id);
      await updateDoc(feedbackRef, {
        status: 'Not Published',
        updatedAt: new Date().toISOString()
      });
      showNotification('Feedback marked as Not Published.', 'success');
      if (isViewModalOpen) setIsViewModalOpen(false);
      setConfirmModal({ show: false, type: '', feedback: null });
    } catch (error) {
      console.error('Error updating feedback:', error);
      showNotification('Failed to update feedback.', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [feedback.id]: false }));
    }
  };

  const handleArchive = async (feedback) => {
    setActionLoading(prev => ({ ...prev, [feedback.id]: true }));
    try {
      const feedbackRef = doc(db, 'feedbacks', feedback.id);
      await updateDoc(feedbackRef, {
        archived: true,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      showNotification('Feedback archived successfully.', 'success');
      if (isViewModalOpen) setIsViewModalOpen(false);
      setConfirmModal({ show: false, type: '', feedback: null });
    } catch (error) {
      console.error('Error archiving feedback:', error);
      showNotification('Failed to archive feedback.', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [feedback.id]: false }));
    }
  };

  const openPublishConfirm = (feedback) => setConfirmModal({ show: true, type: 'publish', feedback });
  const openDontPublishConfirm = (feedback) => setConfirmModal({ show: true, type: 'dontpublish', feedback });
  const openArchiveConfirm = (feedback) => setConfirmModal({ show: true, type: 'archive', feedback });

  const getStatusBadge = (feedback) => {
    const status = feedback.status || 'Pending';
    switch(status) {
      case 'Published': return { label: 'Published', color: 'bg-emerald-100 text-emerald-700' };
      case 'Not Published': return { label: 'Not Published', color: 'bg-red-100 text-red-600' };
      default: return { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' };
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const renderStars = (rating) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );

  const filteredFeedbacks = feedbacks.filter(feedback => {
    if (feedback.archived) return false;
    return feedback.guestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.bookingId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.comment?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getModalContent = () => {
    if (!confirmModal.feedback) return {};
    const type = confirmModal.type;
    const feedback = confirmModal.feedback;
    switch(type) {
      case 'publish':
        return {
          icon: 'fas fa-check-circle',
          iconBg: 'bg-emerald-100',
          iconColor: 'text-emerald-500',
          title: 'Publish Feedback',
          message: `Are you sure you want to publish the feedback from "${feedback.guestName || 'Guest'}"? It will be visible to guests on the website.`,
          confirmText: 'Publish',
          confirmGradient: 'from-emerald-500 to-emerald-600',
          confirmAction: () => handlePublish(feedback)
        };
      case 'dontpublish':
        return {
          icon: 'fas fa-times-circle',
          iconBg: 'bg-red-100',
          iconColor: 'text-red-500',
          title: "Don't Publish",
          message: `Are you sure you want to mark the feedback from "${feedback.guestName || 'Guest'}" as "Not Published"? It will not be shown publicly.`,
          confirmText: "Don't Publish",
          confirmGradient: 'from-red-500 to-red-600',
          confirmAction: () => handleDontPublish(feedback)
        };
      case 'archive':
        return {
          icon: 'fas fa-archive',
          iconBg: 'bg-amber-100',
          iconColor: 'text-amber-500',
          title: 'Archive Feedback',
          message: `Are you sure you want to archive the feedback from "${feedback.guestName || 'Guest'}"? It will be moved to the archive and can be restored later.`,
          confirmText: 'Archive',
          confirmGradient: 'from-amber-500 to-amber-600',
          confirmAction: () => handleArchive(feedback)
        };
      default: return {};
    }
  };

  const modalContent = getModalContent();

  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
        <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">Guest Feedback Management</h1>
        <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">Review, publish, and manage guest testimonials</p>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'}`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle text-red-500' : 'fas fa-check-circle text-green-500'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative w-full group">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm"></i>
          <input
            type="text"
            placeholder="Search by guest name, booking ID, or feedback content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-5 py-3 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm"
          />
        </div>
      </div>

      {/* Feedbacks Table */}
      {loading ? (
        <div className="flex justify-center items-center h-48"><i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Guest</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Rating</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Feedback</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Submitted On</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeedbacks.length === 0 ? (
                  <tr><td colSpan="7" className="px-4 py-12 text-center text-neutral"><i className="fas fa-comment-dots text-5xl mb-3 opacity-50 block"></i><p className="text-lg">No feedback submissions found</p><p className="text-sm">Guest feedback will appear here once submitted</p></td></tr>
                ) : (
                  filteredFeedbacks.map((feedback) => (
                    <tr key={feedback.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-4 py-3"><div className="font-medium text-textPrimary text-sm">{feedback.guestName || 'Guest'}</div><div className="text-[10px] text-neutral">{feedback.guestEmail}</div></td>
                      <td className="px-4 py-3"><span className="font-mono text-xs">{feedback.bookingId}</span></td>
                      <td className="px-4 py-3">{renderStars(feedback.rating)}</td>
                      <td className="px-4 py-3"><p className="text-xs text-textSecondary line-clamp-2 max-w-[250px]">{feedback.comment}</p></td>
                      <td className="px-4 py-3 text-xs text-textSecondary">{formatDate(feedback.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center whitespace-nowrap px-2 py-1 rounded-full text-[10px] font-medium ${getStatusBadge(feedback).color}`}>
                          {getStatusBadge(feedback).label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => { setSelectedFeedback(feedback); setIsViewModalOpen(true); }} className="w-8 h-8 rounded-lg bg-[#7AAAF8]/10 text-[#1E3A8A] hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center justify-center" title="View Details"><i className="fas fa-eye text-sm"></i></button>
                          <button onClick={() => openArchiveConfirm(feedback)} disabled={actionLoading[feedback.id]} className="w-8 h-8 rounded-lg bg-gray-500/10 text-gray-600 hover:bg-gray-500 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50" title="Archive"><i className="fas fa-archive text-sm"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feedback Details Modal */}
      {isViewModalOpen && selectedFeedback && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => setIsViewModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                  <i className="fas fa-comment-dots text-blue-500 text-sm"></i>
                </div>
                <h3 className="text-lg font-bold text-textPrimary">Feedback Details</h3>
              </div>
              <button onClick={() => setIsViewModalOpen(false)} className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Guest Name</p>
                  <p className="text-sm font-medium text-gray-800">{selectedFeedback.guestName || 'Guest'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Email</p>
                  <p className="text-sm font-medium text-gray-800">{selectedFeedback.guestEmail}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Booking ID</p>
                  <p className="text-sm font-medium text-gray-800 font-mono">{selectedFeedback.bookingId}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Rating</p>
                  <div className="mt-1">{renderStars(selectedFeedback.rating)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedFeedback).color}`}>
                    {getStatusBadge(selectedFeedback).label}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Submitted On</p>
                  <p className="text-sm font-medium text-gray-800">{formatDate(selectedFeedback.createdAt)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Feedback</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedFeedback.comment}</p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => openPublishConfirm(selectedFeedback)}
                disabled={actionLoading[selectedFeedback.id]}
                className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-check text-sm"></i>
                <span>Publish</span>
              </button>
              <button
                onClick={() => openDontPublishConfirm(selectedFeedback)}
                disabled={actionLoading[selectedFeedback.id]}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-times text-sm"></i>
                <span>Don't Publish</span>
              </button>
              <button
                onClick={() => openArchiveConfirm(selectedFeedback)}
                disabled={actionLoading[selectedFeedback.id]}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-archive text-sm"></i>
                <span>Archive</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && confirmModal.feedback && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className={`w-14 h-14 mx-auto mb-3 rounded-full ${modalContent.iconBg} flex items-center justify-center`}>
                <i className={`${modalContent.icon} ${modalContent.iconColor} text-2xl`}></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">{modalContent.title}</h3>
              <p className="text-textSecondary text-sm">{modalContent.message}</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmModal({ show: false, type: '', feedback: null })} disabled={actionLoading[confirmModal.feedback.id]} className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300 disabled:opacity-50">Cancel</button>
              <button onClick={modalContent.confirmAction} disabled={actionLoading[confirmModal.feedback.id]} className={`px-5 py-2 bg-gradient-to-r ${modalContent.confirmGradient} rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 flex items-center gap-2`}>
                {actionLoading[confirmModal.feedback.id] && <i className="fas fa-spinner fa-spin"></i>}
                {actionLoading[confirmModal.feedback.id] ? 'Processing...' : modalContent.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-slideInRight { animation: slideInRight 0.3s ease-out; }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
}