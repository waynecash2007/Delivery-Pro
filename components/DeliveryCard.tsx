
import React from 'react';
import { DeliveryPoint } from '../types';

interface DeliveryCardProps {
  point: DeliveryPoint;
  onComplete: (id: string) => void;
  onNavigate: (address: string) => void;
  onRemove: (id: string) => void;
}

export const DeliveryCard: React.FC<DeliveryCardProps> = ({ 
  point, 
  onComplete, 
  onNavigate,
  onRemove
}) => {
  const isCurrent = point.status === 'current';
  const isCompleted = point.status === 'completed';

  return (
    <div className="relative mb-6 last:mb-0">
      {/* Distance Label */}
      {point.distanceToPrev && (
        <div className="absolute -top-4 left-6 flex items-center gap-2 z-10">
          <div className="w-0.5 h-3 bg-blue-300 rounded-full"></div>
          <span className="text-[10px] font-black text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full border border-blue-200 backdrop-blur-md">
            {point.distanceToPrev}
          </span>
        </div>
      )}

      <div className={`group relative flex flex-col p-5 rounded-3xl border transition-all duration-300 ${
        isCurrent ? 'bg-white border-blue-500 shadow-xl shadow-blue-50 ring-4 ring-blue-500/5' : 
        isCompleted ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-100 hover:border-slate-300'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm transition-all ${
              isCurrent ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 
              isCompleted ? 'bg-slate-300 text-white' : 'bg-slate-100 text-slate-400'
            }`}>
              {isCompleted ? <i className="fas fa-check text-xs"></i> : point.order + 1}
            </div>
            <div className="pr-4">
              <h3 className={`font-black text-lg leading-tight tracking-tight ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                {point.address}
              </h3>
              <div className="flex gap-2 items-center mt-2">
                {isCurrent && (
                  <span className="text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg uppercase tracking-wider animate-pulse">
                    首個目的地
                  </span>
                )}
                {!isCompleted && !isCurrent && <span className="text-[9px] text-slate-400 font-bold uppercase">等候配送</span>}
              </div>
            </div>
          </div>
          {!isCompleted && (
            <button 
              onClick={() => onRemove(point.id)}
              className="text-slate-200 hover:text-red-500 p-1.5 transition-colors"
            >
              <i className="fas fa-trash-can text-sm"></i>
            </button>
          )}
        </div>

        {isCurrent && !isCompleted && (
          <div className="mt-6 flex gap-3">
            <button 
              onClick={() => onNavigate(point.address)}
              className="flex-[1.5] bg-slate-900 text-white py-4.5 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl shadow-slate-200"
            >
              <i className="fas fa-location-arrow text-blue-400"></i>
              導航至此處
            </button>
            <button 
              onClick={() => onComplete(point.id)}
              className="flex-1 bg-green-500 text-white py-4.5 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl shadow-green-50"
            >
              <i className="fas fa-check"></i>
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
