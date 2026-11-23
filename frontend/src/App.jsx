import React, { useEffect } from 'react';
import { sincronizarConServidor } from './db/offlineDb';
import DashboardPecuario from './components/DashboardPecuario';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function App() {
  useEffect(() => {
    const handleOnline = () => {
      const token = localStorage.getItem('agro_token');
      if (token && API_URL) {
        sincronizarConServidor(API_URL, token);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return <DashboardPecuario />;
}
