import React, { useState, useEffect } from 'react';
import JSONViewer from './JSONViewer';
import { X, RefreshCw } from 'lucide-react';
import { getWebhookDetails, replayWebhook } from '../services/api';
import toast from 'react-hot-toast';

const WebhookDetails = ({ webhookId, onClose }) => {
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  useEffect(() => {
    if (webhookId) {
      fetchDetails();
    }
  }, [webhookId]);

  const fetchDetails = async () => {
    setIsLoading(true);
    try {
      const data = await getWebhookDetails(webhookId);
      setDetails(data);
    } catch (error) {
      toast.error('Failed to load webhook details');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplay = async () => {
    setIsReplaying(true);
    const replayToast = toast.loading('Replaying webhook...');
    try {
      await replayWebhook(webhookId);
      toast.success('Webhook replayed successfully', { id: replayToast });
      // Optionally refresh here
      fetchDetails();
    } catch (error) {
      toast.error('Failed to replay webhook', { id: replayToast });
    } finally {
      setIsReplaying(false);
    }
  };

  if (!webhookId) return null;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-sm w-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Webhook Details</h2>
          <p className="text-xs font-mono text-gray-500 mt-0.5">{webhookId}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleReplay}
            disabled={isReplaying || isLoading}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isReplaying ? 'animate-spin' : ''}`} />
            {isReplaying ? 'Replaying...' : 'Replay'}
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : details ? (
          <div className="h-full flex flex-col xl:flex-row p-6 gap-6 bg-gray-50 overflow-y-auto xl:overflow-hidden">
            <div className="flex-1 h-[500px] xl:h-full min-w-[300px]">
               <JSONViewer title="Raw JSON Payload" data={details.raw_payload || details.body || details.payload || details} />
            </div>
            <div className="flex-1 h-[500px] xl:h-full min-w-[300px]">
               <JSONViewer title="Normalized JSON" data={details.normalized_payload || { message: "No normalized payload available" }} />
            </div>
          </div>
        ) : (
          <div className="flex justify-center items-center h-full text-gray-500 text-sm">
            No details available.
          </div>
        )}
      </div>
    </div>
  );
};

export default WebhookDetails;
