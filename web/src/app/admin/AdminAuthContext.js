'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      // Purge any lingering permanent localStorage cache for enhanced security
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');

      // Session-only storage: automatically destroyed when tab/browser is closed
      const sessionToken = sessionStorage.getItem('adminToken');
      const sessionUser = sessionStorage.getItem('adminUser');
      if (sessionToken && sessionUser) {
        setToken(sessionToken);
        setUser(JSON.parse(sessionUser));
      } else {
        setToken(null);
        setUser(null);
      }
    } catch (e) {
      console.error('Error loading admin auth session:', e);
      sessionStorage.removeItem('adminToken');
      sessionStorage.removeItem('adminUser');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback((authData) => {
    const t = authData.token;
    const u = authData.user || authData.admin || { fullName: 'Admin', email: authData.email, role: 'admin' };

    // Verify the user has admin role
    const role = (u.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'superadmin') {
      throw new Error('Access denied. Only admin users can access this panel.');
    }

    setToken(t);
    setUser(u);

    // Save exclusively to sessionStorage - never to persistent localStorage
    sessionStorage.setItem('adminToken', t);
    sessionStorage.setItem('adminUser', JSON.stringify(u));
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    router.push('/admin/login');
  }, [router]);

  return (
    <AdminAuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return ctx;
}
