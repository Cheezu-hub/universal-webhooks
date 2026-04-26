import React, { useState, useEffect } from 'react';
import { Save, Bell, Shield, Webhook } from 'lucide-react';
import toast from 'react-hot-toast';

const Settings = () => {
  const [settings, setSettings] = useState({
    outboundUrl: '',
    notificationsEnabled: true,
    strictSignature: true,
  });

  useEffect(() => {
    const saved = localStorage.getItem('webhook_settings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = () => {
    localStorage.setItem('webhook_settings', JSON.stringify(settings));
    toast.success('Settings saved successfully!');
  };

  return (
    <div className="dashboard-root" style={{ width: '100%', overflowY: 'auto' }}>
      <div className="dashboard-inner" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Settings</h1>
            <p className="dashboard-subtitle">Configure your webhook adapter preferences.</p>
          </div>
        </div>

        <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Outbound URL */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              <Webhook size={16} color="var(--accent)" />
              Outbound Target URL
            </label>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Where should we forward the AI-normalized payloads?
            </p>
            <input
              type="url"
              name="outboundUrl"
              value={settings.outboundUrl}
              onChange={handleChange}
              placeholder="https://api.yourdomain.com/webhooks"
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

          {/* Notifications */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                <Bell size={16} color="var(--accent)" />
                Dashboard Notifications
              </label>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Show toast alerts when new webhooks arrive.
              </p>
            </div>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                name="notificationsEnabled"
                checked={settings.notificationsEnabled}
                onChange={handleChange}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
              />
            </label>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

          {/* Security */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                <Shield size={16} color="var(--accent)" />
                Strict Signature Verification
              </label>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Reject webhooks that fail HMAC signature checks.
              </p>
            </div>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                name="strictSignature"
                checked={settings.strictSignature}
                onChange={handleChange}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
              />
            </label>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleSave}>
              <Save size={16} />
              Save Settings
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Settings;
