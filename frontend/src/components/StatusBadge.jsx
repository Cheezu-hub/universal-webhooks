import React from 'react';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

const STATUS_MAP = {
  processed:       { cls: 'badge-processed',  icon: CheckCircle2, label: 'Processed' },
  delivered:       { cls: 'badge-delivered',  icon: CheckCircle2, label: 'Delivered' },
  failed:          { cls: 'badge-failed',     icon: XCircle,      label: 'Failed' },
  delivery_failed: { cls: 'badge-failed',     icon: XCircle,      label: 'Dlv Failed' },
  queued:          { cls: 'badge-queued',     icon: Clock,        label: 'Queued' },
  processing:      { cls: 'badge-processing', icon: Loader2,      label: 'Processing' },
  pending:         { cls: 'badge-pending',    icon: Clock,        label: 'Pending' },
};

const StatusBadge = ({ status }) => {
  const key = status?.toLowerCase();
  const cfg = STATUS_MAP[key] || { cls: 'badge-default', icon: Clock, label: status || 'Unknown' };
  const Icon = cfg.icon;
  const spin = key === 'processing';

  return (
    <span className={`badge ${cfg.cls}`}>
      <Icon size={11} style={spin ? { animation: 'spin 1s linear infinite' } : {}} />
      {cfg.label}
    </span>
  );
};

export default StatusBadge;
