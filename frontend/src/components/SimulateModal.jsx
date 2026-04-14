import React, { useState } from 'react';
import { simulateWebhook } from '../services/api';
import toast from 'react-hot-toast';

const SimulateModal = ({ isOpen, onClose, onSimulateSuccess }) => {
  const [isDeploying, setIsDeploying] = useState(false);

  if (!isOpen) return null;

  const handleSimulate = async (provider) => {
    setIsDeploying(true);
    try {
      await simulateWebhook(provider);
      toast.success(`${provider} webhook mock scheduled!`);
      onSimulateSuccess();
      onClose();
    } catch (error) {
      toast.error('Simulation failed.');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        
        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-gray-900 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-sm sm:w-full sm:p-6 border border-gray-800">
          <div>
            <div className="mt-3 text-center sm:mt-5">
              <h3 className="text-lg leading-6 font-medium text-white" id="modal-title">
                Simulate Webhook
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-400">
                  Fire a mock webhook to test the normalization engine instantly.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 sm:mt-6 space-y-3">
            <button
              onClick={() => handleSimulate('stripe')}
              disabled={isDeploying}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#635BFF] hover:bg-[#4b45cf] text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#635BFF] sm:text-sm transition-colors"
            >
              Payment Succeeded (Stripe)
            </button>
            <button
              onClick={() => handleSimulate('github')}
              disabled={isDeploying}
              className="w-full inline-flex justify-center rounded-md border border-gray-700 shadow-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 text-base font-medium text-white hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:text-sm transition-colors"
            >
              Push Event (GitHub)
            </button>
            <button
              onClick={onClose}
              className="mt-4 w-full inline-flex justify-center rounded-md border border-gray-700 shadow-sm px-4 py-2 bg-transparent text-base font-medium text-gray-300 hover:text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulateModal;
