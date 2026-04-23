// components/admin/withAuth.js
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function withAuth(Component, allowedRoles = ['admin']) {
  return function ProtectedRoute(props) {
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      const checkAuth = () => {
        const userType = localStorage.getItem('userType');
        const sessionToken = localStorage.getItem('sessionToken');
        const sessionExpiry = localStorage.getItem('sessionExpiry');
        
        const isValidSession = sessionToken && sessionExpiry && 
          parseInt(sessionExpiry) > Date.now();
        
        if (!isValidSession) {
          router.push('/login');
          return;
        }
        
        if (allowedRoles.includes(userType)) {
          setIsAuthorized(true);
        } else {
          // Redirect based on role
          if (userType === 'staff') {
            router.push('/dashboard/staff/overview');
          } else {
            router.push('/login');
          }
        }
        
        setIsLoading(false);
      };
      
      checkAuth();
    }, [router]);

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ocean-ice to-blue-white">
          <div className="text-center">
            <i className="fas fa-spinner fa-spin text-3xl text-ocean-light mb-3 block"></i>
            <p className="text-textSecondary">Verifying access...</p>
          </div>
        </div>
      );
    }

    if (!isAuthorized) {
      return null;
    }

    return <Component {...props} />;
  };
}