import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { Toaster } from 'react-hot-toast';
import AnoAI from './components/ui/animated-shader-background';

const Layout = () => {
  return (
    <div className="app-shell" style={{ position: 'relative' }}>
      <AnoAI />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            fontSize: '13px',
            zIndex: 9999,
          },
        }}
      />
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', height: '100%', width: '100%' }}>
        <Sidebar />
        <div style={{ flex: 1, height: '100vh', overflow: 'hidden', display: 'flex' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
