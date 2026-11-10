import React from 'react';
import { Search } from 'lucide-react';

const SearchInput = ({ value, onChange, placeholder = "بحث...", className = "" }) => {
  return (
    <div className={`relative ${className}`}>
      <Search 
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" 
        size={16} 
      />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-11 pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl transition-all outline-none text-sm font-semibold text-slate-800"
      />
    </div>
  );
};

export default SearchInput;
