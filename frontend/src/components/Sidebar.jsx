import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, Activity, Zap } from 'lucide-react';

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Zap size={16} />
        </div>
        <div>
          <div className="sidebar-logo-text">Webhook Adapter</div>
          <div className="sidebar-logo-sub">Universal v2</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'active' : ''}`
          }
        >
          <LayoutDashboard size={16} />
          Dashboard
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'active' : ''}`
          }
        >
          <Settings size={16} />
          Settings
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        Universal Webhook Adapter v2.0
      </div>
    </aside>
  );
};

export default Sidebar;
