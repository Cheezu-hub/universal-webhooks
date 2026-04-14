import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, Activity } from 'lucide-react';

const Sidebar = () => {
  return (
    <div className="w-64 bg-white border-r border-gray-200 h-screen flex flex-col shadow-sm">
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <Activity className="w-6 h-6 text-indigo-600 mr-2" />
        <span className="font-bold text-lg text-gray-900 tracking-tight">Webhook Adapter</span>
      </div>
      
      <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        <NavLink 
          to="/" 
          className={({isActive}) => `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
        >
          <LayoutDashboard className="w-5 h-5 mr-3" />
          Dashboard
        </NavLink>
        <NavLink 
          to="/settings" 
          className={({isActive}) => `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
        >
          <Settings className="w-5 h-5 mr-3" />
          Settings
        </NavLink>
      </div>
      
      <div className="p-4 border-t border-gray-200 text-xs text-center text-gray-500">
        Universal Webhook Adapter v1.0
      </div>
    </div>
  );
};

export default Sidebar;
