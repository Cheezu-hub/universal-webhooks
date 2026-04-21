import React, { useState } from 'react';
import { simulateWebhook, simulateCustom } from '../services/api';
import toast from 'react-hot-toast';
import { X, Zap, GitBranch, ShoppingBag, Code2, ChevronRight } from 'lucide-react';

const TABS = [
  { id: 'stripe',   label: 'Stripe',   icon: Zap },
  { id: 'github',   label: 'GitHub',   icon: GitBranch },
  { id: 'shopify',  label: 'Shopify',  icon: ShoppingBag },
  { id: 'custom',   label: 'Custom',   icon: Code2 },
];

const DEFAULT_CUSTOM = JSON.stringify({
  event: "order.placed",
  source: "my-app",
  timestamp: new Date().toISOString(),
  data: {
    order_id: "ORD-12345",
    customer: "rajan@example.com",
    total: 99.99,
    currency: "USD"
  }
}, null, 2);

const SimulateModal = ({ isOpen, onClose, onSimulateSuccess }) => {
  const [activeTab, setActiveTab] = useState('stripe');
  const [isLoading, setIsLoading] = useState(false);
  const [customJson, setCustomJson] = useState(DEFAULT_CUSTOM);
  const [jsonError, setJsonError] = useState(null);

  if (!isOpen) return null;

  const handlePreset = async (provider) => {
    setIsLoading(true);
    try {
      await simulateWebhook(provider);
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} webhook fired!`, {
        icon: '⚡',
        style: { borderRadius: '10px', background: '#1e293b', color: '#f1f5f9' }
      });
      onSimulateSuccess();
      onClose();
    } catch {
      toast.error('Simulation failed. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomSend = async () => {
    setJsonError(null);
    let parsed;
    try {
      parsed = JSON.parse(customJson);
    } catch (e) {
      setJsonError(`Invalid JSON: ${e.message}`);
      return;
    }
    setIsLoading(true);
    try {
      await simulateCustom(parsed, 'custom');
      toast.success('Custom webhook fired!', {
        icon: '🚀',
        style: { borderRadius: '10px', background: '#1e293b', color: '#f1f5f9' }
      });
      onSimulateSuccess();
      onClose();
    } catch {
      toast.error('Custom simulation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const presetDescriptions = {
    stripe: { title: 'Payment Succeeded', desc: 'Simulates a Stripe payment_intent.succeeded event with a $25 charge.', action: () => handlePreset('stripe') },
    github: { title: 'Push Event',         desc: 'Simulates a GitHub push to the main branch with a demo commit.',        action: () => handlePreset('github') },
    shopify: { title: 'Order Placed',      desc: 'Simulates a Shopify order.created event for a $99.99 purchase.',        action: () => handlePreset('shopify') },
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Simulation Hub</h2>
            <p className="modal-subtitle">Fire a test webhook to see the AI normalization pipeline in action.</p>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`modal-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="modal-body">
          {activeTab === 'custom' ? (
            <div className="custom-json-panel">
              <label className="json-label">JSON Payload</label>
              <textarea
                className={`json-editor ${jsonError ? 'json-error-border' : ''}`}
                value={customJson}
                onChange={e => { setCustomJson(e.target.value); setJsonError(null); }}
                spellCheck={false}
                rows={12}
              />
              {jsonError && <p className="json-error-msg">{jsonError}</p>}
              <button
                className="btn-primary w-full mt-4"
                onClick={handleCustomSend}
                disabled={isLoading}
              >
                {isLoading ? 'Sending…' : 'Send Custom Webhook'}
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div className="preset-panel">
              {Object.keys(presetDescriptions).filter(k => k === activeTab).map(key => {
                const p = presetDescriptions[key];
                return (
                  <div key={key} className="preset-card">
                    <h3 className="preset-title">{p.title}</h3>
                    <p className="preset-desc">{p.desc}</p>
                    <button
                      className="btn-primary w-full"
                      onClick={p.action}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Sending…' : `Fire ${p.title}`}
                      <ChevronRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimulateModal;
