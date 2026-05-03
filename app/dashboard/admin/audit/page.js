// app/dashboard/admin/audit/page.js
'use client';

import { useState, useEffect } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, onSnapshot, where } from 'firebase/firestore';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState('');
  const [dateFilteredLogs, setDateFilteredLogs] = useState([]);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  // Pagination
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    // Set up real-time listener for audit logs
    const logsRef = collection(db, 'auditLogs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const logsList = [];
      querySnapshot.forEach((doc) => {
        logsList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setLogs(logsList);
      setLoading(false);

      // Set last document for pagination
      if (querySnapshot.docs.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length === 50);
      } else {
        setHasMore(false);
      }
    }, (error) => {
      console.error('Error fetching audit logs:', error);
      setNotification({ show: true, message: 'Failed to load audit logs.', type: 'error' });
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // When a date filter is selected, fetch ALL logs for that specific date range in real time.
  useEffect(() => {
    if (!selectedDateFilter) {
      setDateFilteredLogs([]);
      return;
    }
    const [year, month, day] = selectedDateFilter.split('-').map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
    const logsRef = collection(db, 'auditLogs');
    const q = query(
      logsRef,
      where('timestamp', '>=', start),
      where('timestamp', '<', end),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const logsList = [];
      querySnapshot.forEach((docSnap) => {
        logsList.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      setDateFilteredLogs(logsList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching date-filtered audit logs:', error);
      setNotification({ show: true, message: 'Failed to load date-filtered logs.', type: 'error' });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedDateFilter]);

  // Auto-hide notification
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: '', type: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;

    setLoadingMore(true);
    try {
      const logsRef = collection(db, 'auditLogs');
      const q = query(
        logsRef,
        orderBy('timestamp', 'desc'),
        startAfter(lastVisible),
        limit(50)
      );

      const querySnapshot = await getDocs(q);
      const newLogs = [];
      querySnapshot.forEach((doc) => {
        newLogs.push({
          id: doc.id,
          ...doc.data()
        });
      });

      setLogs(prev => [...prev, ...newLogs]);
      if (querySnapshot.docs.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length === 50);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more logs:', error);
      setNotification({ show: true, message: 'Failed to load more logs.', type: 'error' });
    } finally {
      setLoadingMore(false);
    }
  };

  const logsSource = selectedDateFilter ? dateFilteredLogs : logs;

  const filteredLogs = logsSource.filter(log => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      log.userName?.toLowerCase().includes(searchLower) ||
      log.userRole?.toLowerCase().includes(searchLower) ||
      log.module?.toLowerCase().includes(searchLower) ||
      log.details?.toLowerCase().includes(searchLower)
    );
    return matchesSearch;
  });

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
          }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle text-red-500' : 'fas fa-check-circle text-green-500'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
        <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Audit Logs
        </h1>
        <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
          Track all actions across the system
        </p>
      </div>

      {/* Search + Date Filter */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative w-full md:col-span-2 group">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>

          <input
            type="text"
            placeholder="Search by user, role, module, or action details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-10 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
          />

          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral hover:text-[#4D8CF5] transition-colors duration-300"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        <div className="relative w-full">
          <input
            type="date"
            value={selectedDateFilter}
            onChange={(e) => setSelectedDateFilter(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm bg-white text-textPrimary shadow-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 hover:border-[#4D8CF5]/60 transition-all duration-300 appearance-none"
          />

        </div>
      </div>

      {/* Audit Logs Table */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Module</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-neutral">
                      <i className="fas fa-history text-4xl mb-3 block"></i>
                      {searchTerm ? 'No matching audit logs found' : 'No audit logs found'}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-6 py-4 text-textSecondary text-sm whitespace-nowrap">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-textPrimary">{log.userName}</div>
                        <div className="text-xs text-neutral">{log.userEmail}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${log.userRole === 'admin'
                            ? 'bg-ocean-lighter/10 text-ocean-light border border-ocean-lighter/30'
                            : 'bg-ocean-ice text-textSecondary border border-ocean-light/20'
                          }`}>
                          {log.userRole}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-left">
                        <span className={`inline-flex px-3 py-1 rounded-full font-medium bg-gray-50 text-gray-700 border border-gray-200 break-words whitespace-normal text-left ${(log.module?.length || 0) > 20 ? 'text-[10px]' : 'text-xs'
                          }`}>
                          {log.module}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-textSecondary text-sm">
                          {log.details}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Load More Button */}
          {!selectedDateFilter && hasMore && filteredLogs.length > 0 && (
            <div className="p-4 text-center border-t border-ocean-light/10">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-xl font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? (
                  <span><i className="fas fa-spinner fa-spin mr-2"></i> Loading...</span>
                ) : (
                  <span><i className="fas fa-chevron-down mr-2"></i> Load More</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}