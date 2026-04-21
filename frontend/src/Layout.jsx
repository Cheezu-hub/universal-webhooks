import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { Toaster } from 'react-hot-toast';

const Layout = () => {
  return (
    <div className="app-shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e2535',
            color: '#f1f5f9',
            border: '1px solid #252d3d',
            borderRadius: '10px',
            fontSize: '13px',
          },
        }}
      />
      <Sidebar />
      <div style={{ flex: 1, height: '100vh', overflow: 'hidden', display: 'flex' }}>
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
