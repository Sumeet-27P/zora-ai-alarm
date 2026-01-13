
import React from 'react';
import { Alarm } from '../types';
import { formatTimeDisplay } from '../utils/dateUtils';

interface AlarmItemProps {
  alarm: Alarm;
  use24Hour: boolean;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onEdit: (alarm: Alarm) => void;
}

const AlarmItem: React.FC<AlarmItemProps> = ({ alarm, use24Hour, onDelete, onToggle, onEdit }) => {
  const getScheduleLabel = () => {
    if (alarm.repeatDays?.length === 7) return 'Daily Synchronization';
    if (alarm.dateRange) return `Range: ${alarm.dateRange.from} to ${alarm.dateRange.to}`;
    if (alarm.specificDates?.length) return `${alarm.specificDates.length} Selected Dates`;
    return 'One-time Point';
  };

  return (
    <div className={`p-5 bg-white border rounded-2xl transition-all duration-300 ${!alarm.isEnabled ? 'opacity-50 grayscale' : 'border-slate-100 shadow-sm hover:shadow-md hover:border-amber-200'} flex items-center justify-between gap-4 group relative overflow-hidden`}>
      <div onClick={() => onEdit(alarm)} className="cursor-pointer overflow-hidden flex-grow z-10">
        <div className="text-3xl font-light tracking-tight text-slate-900 mb-1">{formatTimeDisplay(alarm.time, use24Hour)}</div>
        <div className="text-[10px] font-bold text-amber-600 truncate uppercase tracking-widest">{alarm.label}</div>
        <div className="text-[9px] text-slate-400 mt-1 uppercase font-semibold">{getScheduleLabel()}</div>
      </div>
      
      <div className="flex flex-col items-center gap-4 z-10">
        <button 
          onClick={() => onToggle(alarm.id)}
          className={`w-12 h-6 rounded-full transition-all relative border ${alarm.isEnabled ? 'bg-amber-500 border-amber-600' : 'bg-slate-200 border-slate-300'}`}
        >
          <div className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-all ${alarm.isEnabled ? 'left-[calc(100%-20px)]' : 'left-0.5'}`}></div>
        </button>
        <button 
          onClick={() => onDelete(alarm.id)}
          className="text-slate-300 hover:text-red-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  );
};

export default AlarmItem;
