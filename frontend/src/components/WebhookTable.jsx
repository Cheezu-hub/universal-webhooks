import React from 'react';
import StatusBadge from './StatusBadge';
import { ChevronRight, Inbox } from 'lucide-react';

const SkeletonRow = () => (
  <div className="skeleton-row">
    <div className="skeleton" style={{ height: 14 }} />
    <div className="skeleton" style={{ height: 22, width: 80 }} />
    <div className="skeleton" style={{ height: 22, width: 80 }} />
    <div className="skeleton" style={{ height: 14, width: 120 }} />
    <div />
  </div>
);

const WebhookTable = ({ data, onRowClick, selectedId, isLoading }) => {
  return (
    <div className="table-container">
      {/* Header */}
      <div className="table-header-row">
        <span>Request ID</span>
        <span>AI Status</span>
        <span>Delivery</span>
        <span>Timestamp</span>
        <span />
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <>
          {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
        </>
      )}

      {/* Empty state */}
      {!isLoading && (!data || data.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon"><Inbox size={40} /></div>
          <h3>No webhooks yet</h3>
          <p>Use the Simulation Hub to fire a test webhook, or send one to the endpoint.</p>
        </div>
      )}

      {/* Rows */}
      {!isLoading && data && data.map((webhook) => (
        <div
          key={webhook.request_id}
          className={`table-row ${selectedId === webhook.request_id ? 'selected' : ''}`}
          onClick={() => onRowClick(webhook)}
        >
          <span className="table-cell-id">{webhook.request_id?.substring(0, 18)}…</span>
          <span><StatusBadge status={webhook.status} /></span>
          <span>
            {webhook.outbound_status
              ? <StatusBadge status={webhook.outbound_status} />
              : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
            }
          </span>
          <span className="table-cell">
            {new Date(webhook.created_at).toLocaleString(undefined, {
              month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            })}
          </span>
          <span style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <ChevronRight size={16} />
          </span>
        </div>
      ))}
    </div>
  );
};

export default WebhookTable;
