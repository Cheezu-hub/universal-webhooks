import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { Toaster } from 'react-hot-toast';

const Layout = () => {
  return (
    <div className="flex bg-gray-50 h-screen overflow-hidden text-gray-900">
      <Toaster position="top-right" />
      <Sidebar />
      <div className="flex-1 h-screen overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
