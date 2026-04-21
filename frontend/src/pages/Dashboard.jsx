import React, { useState, useEffect, useCallback } from 'react';
import WebhookTable from '../components/WebhookTable';
import WebhookDetails from '../components/WebhookDetails';
import SimulateModal from '../components/SimulateModal';
import { getWebhooks, getSystemStatus, SSE_URL } from '../services/api';
import toast from 'react-hot-toast';
import { Activity, CheckCircle, XCircle, Layers, Wifi, WifiOff } from 'lucide-react';

const StatCard = ({ label, value, icon: Icon, color, subtext }) => (
  <div className="stat-card">
    <div className="stat-card-inner">
      <div className="stat-icon" style={{ background: `${color}18`, color }}>
        <Icon size={20} />
      </div>
      <div className="stat-content">
        <dt className="stat-label">{label}</dt>
        <dd className="stat-value" style={{ color }}>{value}</dd>
        {subtext && <p className="stat-subtext">{subtext}</p>}
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const [webhooks, setWebhooks] = useState([]);
  const [status, setStatus] = useState({ total: 0, processed: 0, failed: 0, queue_size: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [webhooksData, statusData] = await Promise.all([
        getWebhooks(),
        getSystemStatus()
      ]);
      setWebhooks(Array.isArray(webhooksData) ? webhooksData : []);
      setStatus(statusData);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to connect to the backend. Is it running?');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // SSE real-time updates — replaces the setInterval polling
  useEffect(() => {
    let es;
    let retryTimeout;

    const connect = () => {
      es = new EventSource(SSE_URL);

      es.onopen = () => {
        setIsLive(true);
        setError(null);
      };

      es.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'webhook_update' || msg.type === 'webhook_received') {
            // Pull fresh data when any webhook changes
            fetchData();
          }
        } catch (_) {}
      };

      es.onerror = () => {
        setIsLive(false);
        es.close();
        // Reconnect after 3 seconds
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      if (es) es.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [fetchData]);

  const successRate = status.total > 0
    ? Math.round((status.processed / status.total) * 100)
    : 0;

  return (
    <div className="dashboard-root">
      {/* Main Content Area */}
      <div className={`dashboard-main ${selectedWebhook ? 'split' : ''}`}>
        <div className="dashboard-inner">

          {/* Header */}
          <div className="dashboard-header">
            <div>
              <h1 className="dashboard-title">
                <Activity className="dashboard-title-icon" size={26} />
                Universal Adapter Hub
              </h1>
              <p className="dashboard-subtitle">
                Monitor live webhooks, AI normalization, and outbound delivery.
              </p>
            </div>
            <div className="dashboard-header-actions">
              <span className={`live-badge ${isLive ? 'live' : 'offline'}`}>
                {isLive ? <Wifi size={12} /> : <WifiOff size={12} />}
                {isLive ? 'Live' : 'Offline'}
              </span>
              <button
                id="simulate-btn"
                onClick={() => setIsSimulateModalOpen(true)}
                className="btn-primary"
              >
                + Simulate Webhook
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <XCircle size={16} />
              {error}
            </div>
          )}

          {/* Stats Cards */}
          <div className="stats-grid">
            <StatCard
              label="Total Webhooks"
              value={status.total}
              icon={Layers}
              color="#6366f1"
              subtext="All time"
            />
            <StatCard
              label="Success Rate"
              value={`${successRate}%`}
              icon={CheckCircle}
              color="#10b981"
              subtext={`${status.processed} processed`}
            />
            <StatCard
              label="Failed"
              value={status.failed}
              icon={XCircle}
              color="#ef4444"
              subtext="Exhausted retries"
            />
            <StatCard
              label="Queue Depth"
              value={status.queue_size}
              icon={Activity}
              color="#f59e0b"
              subtext="Pending jobs"
            />
          </div>

          {/* Webhook Table */}
          <WebhookTable
            data={webhooks}
            isLoading={isLoading}
            selectedId={selectedWebhook?.request_id}
            onRowClick={(webhook) => setSelectedWebhook(webhook)}
          />
        </div>
      </div>

      {/* Split Details Panel (desktop) */}
      {selectedWebhook && (
        <div className="details-panel">
          <WebhookDetails
            webhookId={selectedWebhook.request_id}
            onClose={() => setSelectedWebhook(null)}
          />
        </div>
      )}

      {/* Mobile Modal for Details */}
      {selectedWebhook && (
        <div className="mobile-details-overlay" onClick={() => setSelectedWebhook(null)}>
          <div className="mobile-details-sheet" onClick={e => e.stopPropagation()}>
            <WebhookDetails
              webhookId={selectedWebhook.request_id}
              onClose={() => setSelectedWebhook(null)}
            />
          </div>
        </div>
      )}

      {/* Simulate Modal */}
      <SimulateModal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        onSimulateSuccess={fetchData}
      />
    </div>
  );
};

export default Dashboard;
