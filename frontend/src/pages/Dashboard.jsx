import React, { useState, useEffect } from 'react';
import WebhookTable from '../components/WebhookTable';
import WebhookDetails from '../components/WebhookDetails';
import SimulateModal from '../components/SimulateModal';
import { getWebhooks, getSystemStatus } from '../services/api';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const [webhooks, setWebhooks] = useState([]);
  const [status, setStatus] = useState({ total: 0, processed: 0, failed: 0, queue_size: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
    // Poll every 3 seconds for Hackathon MVP
    const intervalId = setInterval(fetchData, 3000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchData = async () => {
    try {
      const [webhooksData, statusData] = await Promise.all([
        getWebhooks(),
        getSystemStatus()
      ]);
      setWebhooks(Array.isArray(webhooksData) ? webhooksData : webhooksData.items || webhooksData.data || []);
      setStatus(statusData);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const successRate = status.total > 0 
    ? Math.round((status.processed / status.total) * 100) 
    : 0;

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Main Content Area */}
      <div className={`h-full flex flex-col overflow-y-auto transition-all duration-300 ${selectedWebhook ? 'lg:w-1/2' : 'w-full'}`}>
        <div className="p-8">
          <div className="md:flex md:items-center md:justify-between mb-6">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Universal Adapter Hub
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Monitor live webhooks, AI normalization, and outbound delivery.
              </p>
            </div>
            <div className="mt-4 flex md:ml-4 md:mt-0 space-x-3">
              <button
                type="button"
                onClick={() => setIsSimulateModalOpen(true)}
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
              >
                Mock Webhook
              </button>
            </div>
          </div>

          {/* Analytics Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4 mb-8">
            <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 border border-gray-100">
              <dt className="truncate text-sm font-medium text-gray-500">Total Processed</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{status.total}</dd>
            </div>
            <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 border border-gray-100">
              <dt className="truncate text-sm font-medium text-gray-500">Success Rate</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-indigo-600">{successRate}%</dd>
            </div>
            <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 border border-gray-100">
              <dt className="truncate text-sm font-medium text-gray-500">Failed</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-red-600">{status.failed}</dd>
            </div>
            <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 border border-gray-100">
              <dt className="truncate text-sm font-medium text-gray-500">Queue Depth</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-amber-500">{status.queue_size}</dd>
            </div>
          </div>
          
          <WebhookTable 
            data={webhooks} 
            isLoading={isLoading} 
            selectedId={selectedWebhook?.id}
            onRowClick={(webhook) => setSelectedWebhook(webhook)} 
          />
        </div>
      </div>

      {/* Slide-over/Split Details Panel */}
      {selectedWebhook && (
        <div className="hidden lg:block lg:w-1/2 h-full z-10">
          <WebhookDetails 
            webhookId={selectedWebhook.id} 
            onClose={() => setSelectedWebhook(null)} 
          />
        </div>
      )}
      
      {/* Mobile Modal for Details */}
      {selectedWebhook && (
        <div className="lg:hidden fixed inset-0 z-50 bg-gray-900/50 flex flex-col justify-end">
          <div className="bg-white h-[90vh] rounded-t-2xl shadow-xl w-full flex flex-col overflow-hidden animate-slide-up">
            <WebhookDetails 
              webhookId={selectedWebhook.id} 
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
