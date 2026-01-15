import { GoogleGenAI, Type, Modality } from "@google/genai";
import React, { useState, useEffect, useRef } from 'react';
import { Alarm } from './types';
import { getCalendarGrid, formatDateKey, formatTimeDisplay } from './utils/dateUtils';
import { DEFAULT_SOUNDS, getStoredCustomSounds } from './utils/soundManager';
import AlarmModal from './components/AlarmModal';
import AlarmItem from './components/AlarmItem';
import QuickAddInput from './components/QuickAddInput';
import RingingAlarmOverlay from './components/RingingAlarmOverlay';

// Helper for Audio Decoding
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface WeatherInfo {
  temp: number;
  condition: string;
  emoji: string;
  location: string;
}

const App: React.FC = () => {
  const [viewDate, setViewDate] = useState(new Date());
  const [nowDate, setNowDate] = useState(new Date());
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState<Alarm | null>(null);
  const [eventNotification, setEventNotification] = useState<{label: string, time: string} | null>(null);
  const [alarms, setAlarms] = useState<Alarm[]>(() => {
    const saved = localStorage.getItem('zora_alarms');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [use24Hour] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(formatDateKey(new Date()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAiSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const triggeredItemsRef = useRef<Set<string>>(new Set());
  const vibrationIntervalRef = useRef<number | null>(null);
  const ringingAlarmRef = useRef<Alarm | null>(null);

  // Sync ref with state for safe access in async AI greeting function
  useEffect(() => {
    ringingAlarmRef.current = ringingAlarm;
  }, [ringingAlarm]);

  const getAiInstance = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 1000);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return () => clearInterval(timer);
  }, []);

  const fetchWeather = async () => {
    if (!navigator.onLine) return;
    try {
      const geo = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Today is ${new Date().toDateString()}. Geolocation: lat ${geo.coords.latitude}, lon ${geo.coords.longitude}. Find current weather details including temperature, specific conditions, and a brief 3-word outlook. Return JSON with: temp (number), condition, emoji, location.`,
        config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
      });
      setWeather(JSON.parse(response.text));
    } catch (error) {
      console.error("Failed to fetch weather:", error);
    }
  };

  useEffect(() => { fetchWeather(); }, []);

  const handleQuickAdd = async (text: string) => {
    if (!navigator.onLine) {
      alert("Quick Add requires an internet connection.");
      return;
    }
    setIsAiProcessing(true);
    try {
      const ai = getAiInstance();
      const today = new Date().toISOString().split('T')[0];
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Today is ${today}. User input: "${text}". 
        Extract: time (HH:mm), label (brief), date (YYYY-MM-DD), type ('alarm' or 'event'). 
        If user says "wake up", "ring", "alarm" -> alarm. 
        If user says "meeting", "class", "event", "session" -> event. 
        If unspecified, DEFAULT to 'alarm'. 
        Return ONLY valid JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              label: { type: Type.STRING },
              date: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['alarm', 'event'] }
            },
            required: ["time", "label", "date", "type"]
          }
        }
      });

      const result = JSON.parse(response.text);
      const newAlarm: Alarm = {
        id: Math.random().toString(36).substr(2, 9),
        time: result.time,
        label: result.label,
        specificDates: [result.date],
        isEnabled: true,
        soundId: 'classic',
        isAiEnabled: true,
        type: result.type
      };
      setAlarms(prev => [...prev, newAlarm]);
      setSelectedDate(result.date);
    } catch (error) {
      console.error("Quick Add failed", error);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const playEventChime = (label: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.1); 
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.6);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
      
      if ('vibrate' in navigator) navigator.vibrate(400);

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Zora Event: ${label}`, { body: `Scheduled for ${nowDate.toLocaleTimeString()}` });
      }
      setEventNotification({ label, time: nowDate.toLocaleTimeString() });
      setTimeout(() => setEventNotification(null), 5000);
    } catch (e) {
      console.error("Event chime failed:", e);
    }
  };

  const startAlarmVibration = () => {
    if ('vibrate' in navigator) {
      if (vibrationIntervalRef.current) clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = window.setInterval(() => {
        navigator.vibrate([400, 200, 400]);
      }, 1000);
      navigator.vibrate([400, 200, 400]);
    }
  };

  const stopVibration = () => {
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if ('vibrate' in navigator) navigator.vibrate(0);
  };

  const playAiGreeting = async (alarm: Alarm) => {
    try {
      const ai = getAiInstance();
      const todayKey = formatDateKey(new Date());
      const now = new Date();
      const hour = now.getHours();
      let timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

      const urgentEvents = alarms
        .filter(a => isAlarmOnDate(a, todayKey) && a.type === 'event')
        .map(a => `${a.label} at ${formatTimeDisplay(a.time, use24Hour)}`)
        .join(", ");
      
      const regularAlarms = alarms
        .filter(a => isAlarmOnDate(a, todayKey) && a.type !== 'event')
        .map(a => `${a.label} at ${formatTimeDisplay(a.time, use24Hour)}`)
        .join(", ");

      const greetingResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Act as Zora, a sophisticated and warm AI assistant. Generate a dynamic, context-aware ${timeOfDay} briefing for the user.
        Reason for waking/notification: "${alarm.label}".
        Current Weather in ${weather?.location || "your area"}: ${weather?.condition || "unknown"}, ${Math.round(weather?.temp || 20)}°C.
        Urgent Calendar Events (Prioritize these): ${urgentEvents || "No urgent meetings scheduled"}.
        Other Alarms: ${regularAlarms || "No other alarms"}.
        
        Guidelines:
        1. Start with a warm, personalized greeting suitable for ${timeOfDay}.
        2. Mention "${alarm.label}" immediately.
        3. Provide a detailed but concise weather forecast based on the condition "${weather?.condition}".
        4. Summarize the most urgent calendar events first.
        5. Close with a brief, intelligent motivational thought or tip for the day.
        6. Tone: Highly intelligent, encouraging, and radiant.
        7. Length: 5-6 sentences. NO MARKDOWN or special formatting. Just raw text.`,
      });

      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: greetingResponse.text || `Good ${timeOfDay}. It's time for ${alarm.label}.` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });

      const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        // Ensure the alarm is still active after the API request finishes
        if (!ringingAlarmRef.current || ringingAlarmRef.current.id !== alarm.id) return;

        if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        const ctx = audioContextRef.current;
        const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
        
        if (currentAiSourceRef.current) currentAiSourceRef.current.stop();
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
        currentAiSourceRef.current = source;
        
        // Duck the alarm sound while Zora is speaking
        if (alarmAudioRef.current) alarmAudioRef.current.volume = 0.15;
      }
    } catch (error) { console.error("Greeting Error:", error); }
  };

  const handleDismissAlarm = () => {
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
    }
    if (currentAiSourceRef.current) {
      currentAiSourceRef.current.stop();
      currentAiSourceRef.current = null;
    }
    stopVibration();
    setRingingAlarm(null);
  };

  useEffect(() => {
    localStorage.setItem('zora_alarms', JSON.stringify(alarms));
  }, [alarms]);

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
      const secondKey = `${todayKey}-${currentTimeStr}`;

      const triggered = alarms.find(a => a.isEnabled && a.time === currentTimeStr && isAlarmOnDate(a, todayKey));

      if (triggered && !triggeredItemsRef.current.has(secondKey) && now.getSeconds() === 0) {
        triggeredItemsRef.current.add(secondKey);
        
        if (triggered.type === 'event') {
          playEventChime(triggered.label);
        } else {
          if (!ringingAlarm) {
            const allSounds = [...DEFAULT_SOUNDS, ...getStoredCustomSounds()];
            const sound = allSounds.find(s => s.id === triggered.soundId) || DEFAULT_SOUNDS[0];
            if (alarmAudioRef.current) {
              alarmAudioRef.current.src = sound.url;
              alarmAudioRef.current.loop = true;
              alarmAudioRef.current.play().catch(console.error);
            }
            startAlarmVibration();
            setRingingAlarm(triggered);
            
            // Initiate AI Greeting immediately (0s trigger delay)
            if (navigator.onLine) {
              playAiGreeting(triggered);
            }
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [alarms, ringingAlarm, weather]);

  const calendarGrid = getCalendarGrid(viewDate);
  const monthName = viewDate.toLocaleString('default', { month: 'long' });
  const year = viewDate.getFullYear();
  const filteredAlarms = selectedDate ? alarms.filter(a => isAlarmOnDate(a, selectedDate)) : alarms;

  return (
    <div className="h-screen flex flex-col overflow-hidden text-slate-800 bg-white">
      <audio ref={alarmAudioRef} preload="auto" />
      {ringingAlarm && <RingingAlarmOverlay alarm={ringingAlarm} onDismiss={handleDismissAlarm} />}
      
      {eventNotification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[150] bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top duration-500">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-bold">!</div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Event Started</div>
            <div className="text-sm font-bold">{eventNotification.label}</div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="px-4 md:px-8 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100 flex flex-col z-30 shrink-0 gap-4">
          <div className="flex flex-col md:flex-row items-center justify-between w-full gap-6">
            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#D4AF37] flex items-center justify-center font-bold">Z</div>
                <div>
                  <div className="flex items-baseline gap-3">
                    <h1 className="text-2xl zora-header font-bold">ZORA</h1>
                    <span className="text-xl font-medium text-slate-300 tabular-nums">
                      {nowDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                </div>
              </div>
              {weather && (
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
                  <span className="text-lg">{weather.emoji}</span>
                  <span className="text-xs font-bold text-slate-700">{Math.round(weather.temp)}°C</span>
                </div>
              )}
            </div>
            <QuickAddInput onAdd={handleQuickAdd} isLoading={isAiProcessing} />
          </div>
          
          <div className="flex bg-white/80 rounded-full px-3 py-1.5 items-center justify-center gap-4 text-xs font-semibold border border-slate-200 shadow-sm w-full md:w-auto self-center">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="hover:text-amber-600 p-1">Prev</button>
            <span className="text-slate-900 w-32 md:w-48 text-center uppercase tracking-widest text-[10px] md:text-xs font-bold">{monthName} {year}</span>
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="hover:text-amber-600 p-1">Next</button>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto p-4 md:p-8 z-10 overscroll-contain">
          <div className="grid grid-cols-7 mb-4 sticky top-0 bg-white/50 backdrop-blur-sm z-20 py-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
              <div key={idx} className="text-center text-[9px] font-bold text-slate-400 tracking-[0.1em] uppercase">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 md:gap-4 pb-24">
            {calendarGrid.map((date, idx) => {
              const dateKey = formatDateKey(date);
              const isCurrentMonth = date.getMonth() === viewDate.getMonth();
              const isToday = formatDateKey(new Date()) === dateKey;
              const dayAlarms = alarms.filter(a => isAlarmOnDate(a, dateKey));
              const isSelected = selectedDate === dateKey;

              return (
                <div 
                  key={idx} 
                  onClick={() => setSelectedDate(dateKey)}
                  className={`relative aspect-square md:aspect-auto md:min-h-[110px] rounded-lg md:rounded-2xl transition-all duration-300 flex flex-col p-2 md:p-4 border ${!isCurrentMonth ? 'opacity-10 pointer-events-none' : 'hover:border-amber-200'} ${isSelected ? 'bg-white border-amber-400 shadow-xl ring-2 ring-amber-400/20 z-10' : 'bg-white/40 border-slate-100'}`}
                >
                  <span className={`text-sm md:text-lg font-light ${isToday ? 'font-black text-amber-600' : isSelected ? 'text-amber-800' : 'text-slate-600'}`}>
                    {date.getDate()}
                  </span>
                  <div className="mt-auto flex flex-col gap-1">
                    {dayAlarms.slice(0, 2).map(a => (
                      <div key={a.id} className={`hidden md:block text-[8px] font-bold truncate px-1.5 py-0.5 rounded ${a.type === 'event' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                        {a.time} {a.label}
                      </div>
                    ))}
                    {dayAlarms.length > 0 && <div className="md:hidden flex justify-center"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div></div>}
                  </div>
                  {isSelected && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingAlarm(null); setIsModalOpen(true); }}
                      className="absolute bottom-2 right-2 md:top-3 md:right-3 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-slate-900 text-white rounded-full shadow-lg text-xs md:text-xl hover:scale-110"
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

      <div className="h-[25vh] md:h-auto min-h-[180px] bg-white border-t border-slate-100 flex flex-col overflow-hidden z-40 shrink-0">
        <div className="px-6 md:px-10 py-4 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] md:text-[11px] font-bold tracking-[0.2em] uppercase text-slate-500">Agenda</h2>
            <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{selectedDate}</span>
          </div>
          <button onClick={() => { setEditingAlarm(null); setIsModalOpen(true); }} className="text-[9px] font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 uppercase tracking-widest shadow-lg shadow-slate-900/20">ADD ITEM</button>
        </div>
        
        <div className="flex-grow overflow-x-auto flex items-center px-6 md:px-10 gap-4 md:gap-8 py-6">
          {filteredAlarms.length === 0 ? (
            <div className="w-full text-center opacity-30 text-[10px] font-bold uppercase tracking-widest">Nothing scheduled</div>
          ) : (
            filteredAlarms.sort((a,b) => a.time.localeCompare(b.time)).map(alarm => (
              <div key={alarm.id} className="flex-shrink-0 w-64 md:w-80">
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