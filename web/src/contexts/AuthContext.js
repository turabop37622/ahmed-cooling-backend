'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      if (savedToken) {
        // Check if token is expired by decoding the payload
        try {
          const payload = JSON.parse(atob(savedToken.split('.')[1]));
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            // Token expired — clear storage
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          } else {
            setToken(savedToken);
            if (savedUser) setUser(JSON.parse(savedUser));
          }
        } catch {
          // Invalid token format — clear
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  const login = (response) => {
    const { token: newToken, user: newUser } = response;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const updateUser = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
