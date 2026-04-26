import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, Zap, Menu, ChevronLeft } from 'lucide-react';

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} style={{ width: isCollapsed ? '70px' : '220px', transition: 'width 0.3s ease', position: 'relative' }}>
      <div className="sidebar-logo" style={{ padding: isCollapsed ? '20px 0' : '20px 18px', justifyContent: isCollapsed ? 'center' : 'flex-start', minHeight: '80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="sidebar-logo-icon" style={{ overflow: 'hidden' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            {!isCollapsed && (
              <div style={{ marginLeft: '10px' }}>
                <div className="sidebar-logo-text">Webhook Adapter</div>
                <div className="sidebar-logo-sub">Universal v2</div>
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className="btn-icon" 
            title="Toggle Sidebar"
            style={{ 
              position: isCollapsed ? 'absolute' : 'static',
              top: isCollapsed ? '70px' : 'auto',
              background: 'var(--border-soft)',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            {isCollapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '10px 0' : '9px 12px' }}
        >
          <LayoutDashboard size={18} style={{ flexShrink: 0 }} />
          {!isCollapsed && <span>Dashboard</span>}
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '10px 0' : '9px 12px' }}
        >
          <Settings size={18} style={{ flexShrink: 0 }} />
          {!isCollapsed && <span>Settings</span>}
        </NavLink>
      </nav>

      <div className="sidebar-footer" style={{ padding: '14px 16px', fontSize: '10px', color: 'var(--text-muted)', display: isCollapsed ? 'none' : 'block' }}>
        v2.0.0 Stable
      </div>
    </aside>
  );
};

export default Sidebar;
