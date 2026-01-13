
import { GoogleGenAI } from "@google/genai";
import React, { useState, useEffect, useRef } from 'react';
import { Alarm } from './types';
import { getCalendarGrid, formatDateKey, formatTimeDisplay } from './utils/dateUtils';
import { DEFAULT_SOUNDS, getStoredCustomSounds } from './utils/soundManager';
import AlarmModal from './components/AlarmModal';
import AlarmItem from './components/AlarmItem';

const App: React.FC = () => {
  const [viewDate, setViewDate] = useState(new Date());
  const [appIcon, setAppIcon] = useState<string | null>(localStorage.getItem('zora_icon'));
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  const [alarms, setAlarms] = useState<Alarm[]>(() => {
    const saved = localStorage.getItem('zora_alarms');
    return saved ? JSON.parse(saved) : [];
  });
  const [use24Hour, setUse24Hour] = useState<boolean>(() => {
    return localStorage.getItem('zora_24hr') === 'true';
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(formatDateKey(new Date()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const generateIcon = async () => {
    setIsGeneratingIcon(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: "Minimalist app icon for 'Zora: Rise & Shine'. Modern style, sunrise orange and deep blue gradients. Stylized sun integrated with a digital sync symbol (circular arrows). High-quality, clean lines, white background, centered vector aesthetic." }]
        },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const url = `data:image/png;base64,${part.inlineData.data}`;
          setAppIcon(url);
          localStorage.setItem('zora_icon', url);
          break;
        }
      }
    } catch (error) {
      console.error("Icon generation failed", error);
    } finally {
      setIsGeneratingIcon(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('zora_alarms', JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    localStorage.setItem('zora_24hr', use24Hour.toString());
  }, [use24Hour]);

  const isAlarmOnDate = (a: Alarm, dateKey: string) => {
    const d = new Date(dateKey);
    const dayOfWeek = d.getDay();
    if (a.specificDates?.includes(dateKey)) return true;
    if (a.dateRange && dateKey >= a.dateRange.from && dateKey <= a.dateRange.to) return true;
    if (a.repeatDays?.includes(dayOfWeek as any)) return true;
    return false;
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const todayKey = formatDateKey(now);

      const triggered = alarms.find(a => {
        if (!a.isEnabled || a.time !== currentTimeStr) return false;
        return isAlarmOnDate(a, todayKey);
      });

      if (triggered && now.getSeconds() === 0) {
        const allSounds = [...DEFAULT_SOUNDS, ...getStoredCustomSounds()];
        const sound = allSounds.find(s => s.id === triggered.soundId) || DEFAULT_SOUNDS[0];
        
        if (alarmAudioRef.current) {
          alarmAudioRef.current.src = sound.url;
          alarmAudioRef.current.play().catch(e => console.warn("Autoplay blocked", e));
        }

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`Zora: ${triggered.label}`, { body: `Synchronized: ${formatTimeDisplay(triggered.time, use24Hour)}` });
        } else {
           alert(`☀️ ZORA AWAKENING: ${triggered.label} (${formatTimeDisplay(triggered.time, use24Hour)})`);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [alarms, use24Hour]);

  const calendarGrid = getCalendarGrid(viewDate);
  const monthName = viewDate.toLocaleString('default', { month: 'long' });
  const year = viewDate.getFullYear();

  const filteredAlarms = selectedDate 
    ? alarms.filter(a => isAlarmOnDate(a, selectedDate))
    : alarms;

  return (
    <div className="h-screen flex flex-col overflow-hidden text-slate-800 bg-white">
      <audio ref={alarmAudioRef} />
      
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="px-4 md:px-8 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100 flex flex-col md:flex-row items-center justify-between z-30 shrink-0 gap-4">
          <div className="flex items-center justify-between w-full md:w-auto gap-4">
            <div className="flex items-center gap-3">
              {appIcon ? (
                <img src={appIcon} alt="Zora Icon" className="w-10 h-10 rounded-xl shadow-sm border border-slate-100" />
              ) : (
                <button 
                  onClick={generateIcon} 
                  disabled={isGeneratingIcon}
                  className="w-10 h-10 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center hover:bg-slate-100 transition-all text-[8px] font-bold text-slate-400 text-center leading-tight"
                >
                  {isGeneratingIcon ? "..." : "GEN ICON"}
                </button>
              )}
              <div>
                <h1 className="text-2xl md:text-3xl zora-header font-bold">ZORA</h1>
                <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">{timeZone}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button 
                onClick={() => setUse24Hour(false)} 
                className={`px-2 py-1 text-[9px] font-bold rounded transition-all ${!use24Hour ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400'}`}
              >
                12H
              </button>
              <button 
                onClick={() => setUse24Hour(true)} 
                className={`px-2 py-1 text-[9px] font-bold rounded transition-all ${use24Hour ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400'}`}
              >
                24H
              </button>
            </div>
          </div>
          
          <div className="flex bg-white/80 rounded-full px-3 py-1.5 items-center justify-between md:justify-center gap-4 text-xs font-semibold border border-slate-200 shadow-sm w-full md:w-auto">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="hover:text-amber-600 p-1">Prev</button>
            <span className="text-slate-900 flex-1 md:w-32 text-center uppercase tracking-widest text-[10px] md:text-xs">{monthName} {year}</span>
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="hover:text-amber-600 p-1">Next</button>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto p-4 md:p-8 scroll-smooth z-10 overscroll-contain">
          <div className="grid grid-cols-7 mb-4 sticky top-0 bg-white/50 backdrop-blur-sm z-20 py-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
              <div key={idx} className="text-center text-[9px] font-bold text-slate-400 tracking-[0.1em]">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 md:gap-4 pb-24">
            {calendarGrid.map((date, idx) => {
              const dateKey = formatDateKey(date);
              const isCurrentMonth = date.getMonth() === viewDate.getMonth();
              const isToday = formatDateKey(new Date()) === dateKey;
              const hasAlarms = alarms.some(a => a.isEnabled && isAlarmOnDate(a, dateKey));
              const isSelected = selectedDate === dateKey;

              return (
                <div 
                  key={idx} 
                  onClick={() => setSelectedDate(dateKey)}
                  className={`relative aspect-square md:aspect-auto md:min-h-[100px] rounded-lg md:rounded-xl transition-all duration-300 flex flex-col p-2 md:p-4 border ${!isCurrentMonth ? 'opacity-10 pointer-events-none' : 'hover:border-amber-200'} ${isSelected ? 'bg-white border-amber-400 shadow-lg ring-1 ring-amber-400 z-10' : 'bg-white/40 border-slate-100'}`}
                >
                  <span className={`text-sm md:text-lg font-light ${isToday ? 'font-bold text-amber-600 underline decoration-2 underline-offset-4' : isSelected ? 'text-amber-800' : 'text-slate-600'}`}>
                    {date.getDate()}
                  </span>
                  
                  {hasAlarms && (
                     <div className="mt-auto flex justify-center pb-0.5">
                        <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                     </div>
                  )}
                  
                  {isSelected && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingAlarm(null); setIsModalOpen(true); }}
                      className="absolute bottom-1 right-1 md:top-3 md:right-3 w-5 h-5 md:w-7 md:h-7 flex items-center justify-center bg-slate-900 text-white rounded-full shadow-lg text-xs md:text-lg"
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-[25vh] md:h-auto min-h-[160px] md:min-h-[220px] bg-white/90 backdrop-blur-3xl border-t border-slate-100 flex flex-col overflow-hidden shadow-[0_-10px_40px_rgba(0,0,0,0.06)] z-40 shrink-0">
        <div className="px-6 md:px-10 py-3 flex items-center justify-between border-b border-slate-50">
          <h2 className="text-[9px] md:text-[11px] font-bold tracking-[0.2em] uppercase text-slate-500">Sync Points</h2>
          <button 
            onClick={() => { setEditingAlarm(null); setIsModalOpen(true); }}
            className="text-[9px] md:text-[10px] font-bold px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-all uppercase tracking-widest shadow-md"
          >
            Add
          </button>
        </div>
        
        <div className="flex-grow overflow-x-auto flex items-center px-6 md:px-10 gap-4 md:gap-6 py-4 overscroll-x-contain scrollbar-hide">
          {filteredAlarms.length === 0 ? (
            <div className="w-full flex flex-col items-center opacity-30 text-center">
              <p className="text-[9px] font-bold tracking-widest uppercase">No sync points for this cycle</p>
            </div>
          ) : (
            filteredAlarms.sort((a,b) => a.time.localeCompare(b.time)).map(alarm => (
              <div key={alarm.id} className="flex-shrink-0 w-64 md:w-72">
                <AlarmItem 
                  alarm={alarm} 
                  use24Hour={use24Hour}
                  onDelete={(id) => setAlarms(prev => prev.filter(a => a.id !== id))} 
                  onToggle={(id) => setAlarms(prev => prev.map(a => a.id === id ? { ...a, isEnabled: !a.isEnabled } : a))}
                  onEdit={(a) => { setEditingAlarm(a); setIsModalOpen(true); }}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <AlarmModal 
        isOpen={isModalOpen} 
        use24Hour={use24Hour}
        onClose={() => setIsModalOpen(false)} 
        onSave={(a) => {
          if (editingAlarm) {
            setAlarms(prev => prev.map(curr => curr.id === editingAlarm.id ? { ...a, id: curr.id } : curr));
          } else {
            setAlarms(prev => [...prev, { ...a, id: Math.random().toString(36).substr(2, 9) }]);
          }
        }}
        initialDate={selectedDate || undefined}
        editAlarm={editingAlarm}
      />
    </div>
  );
};

export default App;
