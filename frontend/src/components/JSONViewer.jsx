import React from 'react';

const JSONViewer = ({ data, title }) => {
  if (!data) return null;

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl border border-gray-800 shadow-xl overflow-hidden">
      {title && (
        <div className="flex px-4 py-2 bg-[#2d2d2d] border-b border-gray-700 items-center">
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</span>
        </div>
      )}
      <div className="p-4 overflow-auto flex-1 text-sm text-gray-300 font-mono leading-relaxed">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
};

export default JSONViewer;
