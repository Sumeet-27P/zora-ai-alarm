
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
  const [appIcon, setAppIcon] = useState<string | null>(localStorage.getItem('zora_icon'));
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [ringingAlarm, setRingingAlarm] = useState<Alarm | null>(null);
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
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const triggeredAlarmsRef = useRef<Set<string>>(new Set());

  const getAiInstance = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle EXPONENTIAL volume ramp for ringing alarm
  useEffect(() => {
    let rampInterval: number | undefined;
    if (ringingAlarm && alarmAudioRef.current) {
      const audio = alarmAudioRef.current;
      
      // Start at a reasonable low volume and multiply
      // If we're online, we start lower to prioritize AI.
      audio.volume = navigator.onLine ? 0.05 : 0.2;
      
      rampInterval = window.setInterval(() => {
        if (audio.volume < 1) {
          // Exponential growth: volume = current * 1.3
          // This ensures it becomes loud quickly if ignored.
          const nextVolume = audio.volume * 1.3;
          audio.volume = Math.min(1, nextVolume);
        }
      }, 3000); // Ramp up every 3 seconds
    }
    return () => {
      if (rampInterval) clearInterval(rampInterval);
    };
  }, [ringingAlarm]);

  // Fetch Weather using AI and Geolocation
  const fetchWeather = async () => {
    if (!navigator.onLine) return;
    setIsWeatherLoading(true);
    try {
      const geo = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      
      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Today is ${new Date().toDateString()}. Use Google Search to find current weather for latitude ${geo.coords.latitude}, longitude ${geo.coords.longitude}. 
        Return ONLY valid JSON with properties: temp (number in Celsius), condition (string), emoji (single character weather emoji), location (city name).`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              temp: { type: Type.NUMBER },
              condition: { type: Type.STRING },
              emoji: { type: Type.STRING },
              location: { type: Type.STRING }
            },
            required: ["temp", "condition", "emoji", "location"]
          }
        }
      });

      const weatherData = JSON.parse(response.text);
      setWeather(weatherData);
    } catch (error) {
      console.error("Failed to fetch weather:", error);
    } finally {
      setIsWeatherLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
  }, []);

  const handleQuickAdd = async (text: string) => {
    if (!navigator.onLine) {
      alert("Quick Add requires an internet connection for AI processing.");
      return;
    }
    setIsAiProcessing(text.length > 0);
    try {
      const ai = getAiInstance();
      const today = new Date().toISOString().split('T')[0];
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Today's date is ${today}. User wants to add an event: "${text}". 
        Extract: time (HH:mm format), label (brief), specific date (YYYY-MM-DD). 
        Return ONLY valid JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              label: { type: Type.STRING },
              date: { type: Type.STRING }
            },
            required: ["time", "label", "date"]
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
        isAiEnabled: true
      };
      setAlarms(prev => [...prev, newAlarm]);
      setSelectedDate(result.date);
      const d = new Date(result.date);
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    } catch (error) {
      console.error("AI Quick Add failed", error);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const playImmediateAiGreeting = async (alarm: Alarm) => {
    try {
      const ai = getAiInstance();
      const todayKey = formatDateKey(new Date());
      const todaysEvents = alarms
        .filter(a => isAlarmOnDate(a, todayKey))
        .map(a => `${a.label} at ${formatTimeDisplay(a.time, use24Hour)}`)
        .join(", ");

      const greetingResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate a detailed, extremely cheerful, and energetic morning greeting to wake the user up right now! 
        Primary Reason: "${alarm.label}". 
        Day's Schedule: ${todaysEvents || "A fresh empty canvas!"}. 
        Weather: ${weather?.condition || "unknown skies"} at ${weather?.temp || "20"}°C.
        
        Requirements:
        1. Start with an immediate, radiant "Good morning! It's time to rise!"
        2. Specifically mention: "${alarm.label}".
        3. Give a cheerful summary of the rest of the day: ${todaysEvents}.
        4. Tone: Helpful, sun-like personal assistant.
        5. Length: 3-4 sentences.`,
        config: { thinkingConfig: { thinkingBudget: 0 } }
      });

      const textToSpeak = greetingResponse.text || `Rise and shine! It's time for ${alarm.label}!`;
      
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: textToSpeak }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
        
        // Stop any currently playing AI
        if (currentAiSourceRef.current) {
          currentAiSourceRef.current.stop();
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
        currentAiSourceRef.current = source;
        
        // If AI starts playing, we lower the background alarm sound temporarily
        if (alarmAudioRef.current) {
          alarmAudioRef.current.volume = 0.1;
        }
      }
    } catch (error) {
      console.error("Immediate AI Greeting failed", error);
      // Fallback: If AI fails, make sure the normal alarm is audible
      if (alarmAudioRef.current) {
        alarmAudioRef.current.volume = 0.8;
      }
    }
  };

  const handleDismissAlarm = () => {
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
      alarmAudioRef.current.loop = false;
    }
    
    // Stop AI audio immediately upon dismissal
    if (currentAiSourceRef.current) {
      currentAiSourceRef.current.stop();
      currentAiSourceRef.current = null;
    }

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

      const triggered = alarms.find(a => {
        if (!a.isEnabled || a.time !== currentTimeStr) return false;
        return isAlarmOnDate(a, todayKey);
      });

      if (triggered && !triggeredAlarmsRef.current.has(secondKey) && now.getSeconds() === 0 && !ringingAlarm) {
        triggeredAlarmsRef.current.add(secondKey);
        
        const allSounds = [...DEFAULT_SOUNDS, ...getStoredCustomSounds()];
        const sound = allSounds.find(s => s.id === triggered.soundId) || DEFAULT_SOUNDS[0];
        
        if (alarmAudioRef.current) {
          alarmAudioRef.current.src = sound.url;
          alarmAudioRef.current.loop = true;
          // Set initial volume based on connection
          alarmAudioRef.current.volume = navigator.onLine ? 0.05 : 0.8;
          // Explicit load and play
          alarmAudioRef.current.load();
          alarmAudioRef.current.play().catch(e => {
            console.error("Alarm audio play blocked by browser. User interaction required.", e);
          });
        }

        if (navigator.onLine) {
          // ONLINE: Greet immediately when ringing starts
          playImmediateAiGreeting(triggered);
        }
        
        setRingingAlarm(triggered);
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
      {/* Hidden audio element for the ringing sound */}
      <audio ref={alarmAudioRef} preload="auto" />
      
      {ringingAlarm && (
        <RingingAlarmOverlay 
          alarm={ringingAlarm} 
          onDismiss={handleDismissAlarm} 
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="px-4 md:px-8 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100 flex flex-col z-30 shrink-0 gap-4">
          <div className="flex flex-col md:flex-row items-center justify-between w-full gap-6">
            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-3">
                {appIcon ? (
                  <img src={appIcon} alt="Zora Icon" className="w-10 h-10 rounded-xl shadow-sm border border-slate-100" />
                ) : (
                  <button 
                    onClick={async () => {
                      if (!navigator.onLine) return;
                      setIsGeneratingIcon(true);
                      try {
                        const ai = getAiInstance();
                        const response = await ai.models.generateContent({
                          model: 'gemini-2.5-flash-image',
                          contents: { parts: [{ text: "Minimalist app icon for Zora. A golden sunrise circle with a digital frequency wave inside." }] }
                        });
                        const imgPart = response.candidates[0].content.parts.find(p => p.inlineData);
                        if (imgPart?.inlineData) {
                          const url = `data:image/png;base64,${imgPart.inlineData.data}`;
                          setAppIcon(url);
                          localStorage.setItem('zora_icon', url);
                        }
                      } finally { setIsGeneratingIcon(false); }
                    }} 
                    disabled={isGeneratingIcon}
                    className="w-10 h-10 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center hover:bg-slate-100 transition-all text-[8px] font-bold text-slate-400"
                  >
                    {isGeneratingIcon ? "..." : "ICON"}
                  </button>
                )}
                <div>
                  <div className="flex items-baseline gap-3">
                    <h1 className="text-2xl zora-header font-bold">ZORA</h1>
                    <span className="text-xl font-medium text-slate-300 tracking-tighter tabular-nums">
                      {nowDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
                    </span>
                  </div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">{timeZone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                  {isWeatherLoading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></div>
                  ) : weather ? (
                    <div className="flex items-center gap-2" title={`${weather.condition} in ${weather.location}`}>
                      <span className="text-lg leading-none">{weather.emoji}</span>
                      <span className="text-xs font-bold text-slate-700">{weather.temp}°C</span>
                    </div>
                  ) : (
                    <button onClick={fetchWeather} className="text-[9px] font-bold text-slate-400 uppercase">{navigator.onLine ? 'Load Weather' : 'Offline'}</button>
                  )}
                </div>
              </div>
            </div>

            <QuickAddInput onAdd={handleQuickAdd} isLoading={isAiProcessing} />
          </div>
          
          <div className="flex bg-white/80 rounded-full px-3 py-1.5 items-center justify-between md:justify-center gap-4 text-xs font-semibold border border-slate-200 shadow-sm w-full md:w-auto self-center">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="hover:text-amber-600 p-1">Prev</button>
            <span className="text-slate-900 flex-1 md:w-48 text-center uppercase tracking-widest text-[10px] md:text-xs font-bold">{monthName} {year}</span>
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
              const dayAlarms = alarms.filter(a => isAlarmOnDate(a, dateKey));
              const hasAlarms = dayAlarms.some(a => a.isEnabled);
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
                  {isToday && <span className="block w-1 h-1 bg-amber-500 rounded-full mt-0.5"></span>}
                  
                  <div className="mt-auto flex flex-col gap-1">
                    {dayAlarms.slice(0, 2).map(a => (
                      <div key={a.id} className="hidden md:block text-[8px] font-bold truncate bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {a.time} {a.label}
                      </div>
                    ))}
                    {hasAlarms && (
                      <div className="md:hidden flex justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm animate-pulse"></div>
                      </div>
                    )}
                  </div>
                  
                  {isSelected && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingAlarm(null); setIsModalOpen(true); }}
                      className="absolute bottom-2 right-2 md:top-3 md:right-3 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-slate-900 text-white rounded-full shadow-lg text-xs md:text-xl transition-transform hover:scale-110 active:scale-95"
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

      <div className="h-[25vh] md:h-auto min-h-[180px] bg-white/95 backdrop-blur-3xl border-t border-slate-100 flex flex-col overflow-hidden shadow-[0_-15px_50px_rgba(0,0,0,0.08)] z-40 shrink-0">
        <div className="px-6 md:px-10 py-4 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] md:text-[11px] font-bold tracking-[0.2em] uppercase text-slate-500">Alarms</h2>
            <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">{selectedDate}</span>
          </div>
          <button 
            onClick={() => { setEditingAlarm(null); setIsModalOpen(true); }}
            className="text-[9px] md:text-[10px] font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all uppercase tracking-widest shadow-lg shadow-slate-900/20"
          >
            New Alarm
          </button>
        </div>
        
        <div className="flex-grow overflow-x-auto flex items-center px-6 md:px-10 gap-4 md:gap-8 py-6 overscroll-x-contain scrollbar-hide">
          {filteredAlarms.length === 0 ? (
            <div className="w-full flex flex-col items-center opacity-30 text-center py-4">
              <p className="text-[10px] font-bold tracking-widest uppercase">The horizon is clear</p>
              <p className="text-[9px] mt-1">No active alarms for this cycle</p>
            </div>
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
