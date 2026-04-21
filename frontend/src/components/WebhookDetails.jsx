import React, { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import { X, RefreshCw, AlertTriangle } from 'lucide-react';
import { getWebhookDetails, replayWebhook } from '../services/api';
import toast from 'react-hot-toast';

const JSONBlock = ({ title, data }) => {
  const text = data
    ? JSON.stringify(data, null, 2)
    : 'No data available.';
  return (
    <div className="json-viewer-container">
      <div className="json-viewer-title">{title}</div>
      <pre className="json-viewer-content">{text}</pre>
    </div>
  );
};

const WebhookDetails = ({ webhookId, onClose }) => {
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  useEffect(() => {
    if (webhookId) fetchDetails();
  }, [webhookId]);

  const fetchDetails = async () => {
    setIsLoading(true);
    try {
      setDetails(await getWebhookDetails(webhookId));
    } catch {
      toast.error('Failed to load webhook details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplay = async () => {
    setIsReplaying(true);
    const id = toast.loading('Replaying webhook…');
    try {
      await replayWebhook(webhookId);
      toast.success('Webhook replayed!', { id });
      fetchDetails();
    } catch {
      toast.error('Replay failed', { id });
    } finally {
      setIsReplaying(false);
    }
  };

  if (!webhookId) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* Header */}
      <div className="details-header">
        <div>
          <h2>Webhook Details</h2>
          <p>{webhookId}</p>
        </div>
        <div className="details-actions">
          {details?.status === 'processed' && (
            <button className="btn-ghost" onClick={handleReplay} disabled={isReplaying}>
              <RefreshCw size={12} className={isReplaying ? 'spin' : ''} />
              {isReplaying ? 'Replaying…' : 'Replay'}
            </button>
          )}
          <button className="btn-icon" onClick={onClose}><X size={17} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : details ? (
          <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            {/* Meta row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={details.status} />
              {details.provider && (
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 20,
                  background: 'var(--border)', color: 'var(--text-dim)', fontWeight: 600
                }}>
                  {details.provider}
                </span>
              )}
              {details.confidence != null && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  AI confidence: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(details.confidence * 100)}%</strong>
                </span>
              )}
            </div>

            {/* Error detail */}
            {details.error_detail && (
              <div style={{
                display: 'flex', gap: 8, padding: '10px 12px',
                background: '#ef444412', border: '1px solid #ef444440',
                borderRadius: 8, fontSize: 12, color: 'var(--danger)'
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                {details.error_detail}
              </div>
            )}

            {/* JSON panels */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minHeight: 0 }}>
              <JSONBlock title="Raw Payload" data={
                typeof details.normalized_payload?.payload === 'object'
                  ? details.normalized_payload?.payload
                  : details
              } />
              <JSONBlock title="Normalized" data={details.normalized_payload} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
            No details available.
          </div>
        )}
      </div>
    </div>
  );
};

export default WebhookDetails;
