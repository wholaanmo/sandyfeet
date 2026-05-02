// lib/auditLogger.js
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { auth } from './firebase';

/**
 * Log an admin action to the audit logs
 * @param {Object} params - Log parameters
 * @param {string} params.action - Action performed
 * @param {string} params.module - Module/page where action occurred
 * @param {string} params.details - Detailed description of the action
 * @param {Object} params.userData - Optional user data override
 */
export const logAdminAction = async ({ action, module, details, userData = null }) => {
  try {
    let userInfo = userData;
    
    if (!userInfo) {
      // ✅ First try to get user info from localStorage (persists across sessions)
      if (typeof window !== 'undefined') {
        const storedName = localStorage.getItem('userName');
        const storedEmail = localStorage.getItem('userEmail');
        const storedRole = localStorage.getItem('userType');
        if (storedName) {
          userInfo = {
            name: storedName,
            email: storedEmail,
            role: storedRole,
          };
        }
      }
    }
    
    // Fallback to Firebase Auth and Firestore if localStorage not available
    if (!userInfo && auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        userInfo = userDoc.data();
      } else {
        userInfo = {
          name: auth.currentUser.email,
          email: auth.currentUser.email,
          role: 'admin'
        };
      }
    }
    
    const logEntry = {
      action: action,
      module: module,
      details: details,
      timestamp: serverTimestamp(),
      userId: userInfo?.uid || auth.currentUser?.uid || 'unknown',
      userName: userInfo?.name || userInfo?.email || 'Unknown User',
      userEmail: userInfo?.email || auth.currentUser?.email || '',
      userRole: userInfo?.role || 'admin'
    };
    
    const logsRef = collection(db, 'auditLogs');
    await addDoc(logsRef, logEntry);
    
    console.log('Audit log created:', logEntry);
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw – logging should not interrupt main functionality
  }
};