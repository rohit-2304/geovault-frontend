import React from 'react';
import { UploadCloud } from 'lucide-react';

const Dropzone = ({ onFileSelect, selectedFile }) => (
  <div 
    className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
      selectedFile ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
    }`}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault();
      onFileSelect(e.dataTransfer.files[0]);
    }}
  >
    <input 
      type="file" 
      id="fileInput" 
      className="hidden" 
      onChange={(e) => onFileSelect(e.target.files[0])} 
    />
    <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
      <UploadCloud size={48} className="text-gray-400 mb-2" />
      <p className="text-gray-600 font-medium">
        {selectedFile ? selectedFile.name : "Drag & Drop or Click to Upload"}
      </p>
      <p className="text-xs text-gray-400 mt-1">Files are encrypted locally. No server storage.</p>
    </label>
  </div>
);

export default Dropzone;