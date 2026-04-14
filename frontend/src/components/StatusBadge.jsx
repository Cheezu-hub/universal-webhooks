import React from 'react';
import { cn } from '../utils/cn';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

const StatusBadge = ({ status, className }) => {
  const statusConfig = {
    processed: {
      color: 'bg-green-100 text-green-700 border-green-200',
      icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />,
      label: 'Processed'
    },
    delivered: {
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />,
      label: 'Delivered'
    },
    failed: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: <XCircle className="w-3.5 h-3.5 mr-1.5" />,
      label: 'Failed'
    },
    delivery_failed: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: <XCircle className="w-3.5 h-3.5 mr-1.5" />,
      label: 'Delivery Failed'
    },
    queued: {
      color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      icon: <Clock className="w-3.5 h-3.5 mr-1.5" />,
      label: 'Queued'
    },
    processing: {
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: <Clock className="w-3.5 h-3.5 mr-1.5" />,
      label: 'Processing'
    },
    pending: {
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <Clock className="w-3.5 h-3.5 mr-1.5" />,
      label: 'Pending'
    }
  };

  const config = statusConfig[status?.toLowerCase()] || {
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: <Clock className="w-3.5 h-3.5 mr-1.5" />,
    label: status || 'Unknown'
  };

  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border",
      config.color,
      className
    )}>
      {config.icon}
      {config.label}
    </span>
  );
};

export default StatusBadge;
