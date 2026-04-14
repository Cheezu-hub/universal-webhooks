import React from 'react';
import StatusBadge from './StatusBadge';
import { cn } from '../utils/cn';
import { ChevronRight } from 'lucide-react';

const WebhookTable = ({ data, onRowClick, selectedId, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 h-64">
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No webhooks yet</h3>
        <p className="mt-1 text-sm text-gray-500">Waiting for incoming webhooks...</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-xl">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">ID</th>
            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">AI Status</th>
            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Delivery</th>
            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Timestamp</th>
            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map((webhook) => (
            <tr 
              key={webhook.request_id} 
              onClick={() => onRowClick(webhook)}
              className={cn(
                "cursor-pointer transition-colors duration-150 hover:bg-indigo-50/60",
                selectedId === webhook.request_id && "bg-indigo-50 border-l-4 border-indigo-500"
              )}
            >
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                <span className="font-mono text-xs">{webhook.request_id.substring(0, 15)}...</span>
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                <StatusBadge status={webhook.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                {webhook.outbound_status ? <StatusBadge status={webhook.outbound_status} /> : <span className="text-gray-400">-</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                {new Date(webhook.timestamp || webhook.created_at).toLocaleString()}
              </td>
              <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                 <ChevronRight className="w-5 h-5 text-gray-400 inline-block" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WebhookTable;
