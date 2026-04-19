import React from 'react';

const Progress = ({ percent, label }) => (
  <div className="w-full space-y-2">
    <div className="flex justify-between text-xs font-medium text-gray-600">
      <span>{label}</span>
      <span>{percent}%</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div 
        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
        style={{ width: `${percent}%` }}
      ></div>
    </div>
  </div>
);

export default Progress;