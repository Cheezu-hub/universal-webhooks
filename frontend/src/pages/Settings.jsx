import React from 'react';

const Settings = () => {
  return (
    <div className="p-8">
      <div className="md:flex md:items-center md:justify-between mb-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Settings
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Configure your webhook adapter settings.
          </p>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
        <p className="text-gray-500 text-sm">Settings panel coming soon...</p>
      </div>
    </div>
  );
};

export default Settings;
