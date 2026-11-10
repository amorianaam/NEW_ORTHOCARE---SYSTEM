import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, X, UploadCloud, Eye, Trash2, CheckCircle, Minimize2, Maximize2,
  Check, LayoutGrid, List, Plus, Film, Image as ImageIcon, Edit, Radiation,
  Calendar, Activity, CheckSquare, AlertCircle, ExternalLink
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getSocket } from '../../utils/socket';
import { getServerBaseUrl } from '../../utils/apiConfig';
// ── Shared Result Preview Modal ──────────────────────────────────────
const SharedResultPreviewModal = ({ file, onClose }) => {
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  if (!file) return null;

  const previewUrl = file.previewUrl || (file.url ? (file.url.startsWith('http') || file.url.startsWith('blob:') || file.url.startsWith('data:') ? file.url : `${getServerBaseUrl()}${file.url.startsWith('/') ? file.url : `/${file.url}`}`) : null) || file.base64;

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300" dir="rtl">
      <div className={`bg-white rounded-3xl shadow-luxury flex flex-col overflow-hidden transition-all duration-300 ${isPreviewMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-4xl h-[80vh]'}`}>
        <div className="flex justify-between items-center p-4 border-b bg-slate-50 flex-shrink-0">
          <h3 className="font-black text-slate-800">عرض المرفق: {file.name}</h3>
          <div className="flex items-center gap-2">
            {previewUrl && (
              <a 
                href={previewUrl} 
                target="_blank" 
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors text-xs font-bold flex items-center gap-1.5"
              >
                <ExternalLink size={14} /> فتح في نافذة مستقلة
              </a>
            )}
            <button onClick={() => setIsPreviewMaximized(!isPreviewMaximized)} className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-800 hover:text-white transition-colors">
              {isPreviewMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            <button onClick={onClose} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden p-4 relative">
          {!(file.previewUrl || file.base64) ? (
            <div className="text-center text-slate-500 font-bold p-8">جاري التحميل أو الملف غير متاح للمعاينة.</div>
          ) : (file.type === "application/pdf" || (file.base64 && file.base64.startsWith("data:application/pdf"))) ? (
            <iframe
              src={file.previewUrl || file.base64}
              className="w-full h-full rounded-xl border border-slate-200 bg-white shadow-inner"
              title="Document Preview"
            />
          ) : (
            <div className="w-full h-full overflow-auto flex items-center justify-center custom-scrollbar">
              <img
                src={file.previewUrl || file.base64}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-md"
                alt="Medical Result"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default SharedResultPreviewModal;