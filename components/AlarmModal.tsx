
import React, { useState, useEffect, useRef } from 'react';
import { Alarm, DayOfWeek, SoundAsset } from '../types';
import { DEFAULT_SOUNDS, getStoredCustomSounds, saveCustomSoundMetadata } from '../utils/soundManager';

interface AlarmModalProps {
  isOpen: boolean;
  use24Hour: boolean;
  onClose: () => void;
  onSave: (alarm: Omit<Alarm, 'id'>) => void;
  initialDate?: string;
  editAlarm?: Alarm | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AlarmModal: React.FC<AlarmModalProps> = ({ isOpen, use24Hour, onClose, onSave, initialDate, editAlarm }) => {
  const [time, setTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'alarm' | 'event'>('alarm');
  const [repeatDays, setRepeatDays] = useState<DayOfWeek[]>([]);
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [useRange, setUseRange] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [selectedSoundId, setSelectedSoundId] = useState('classic');
  const [customSounds, setCustomSounds] = useState<SoundAsset[]>([]);
  
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomSounds(getStoredCustomSounds());
    if (editAlarm) {
      setTime(editAlarm.time);
      setEndTime(editAlarm.endTime || '09:00');
      setLabel(editAlarm.label);
      setDescription(editAlarm.description || '');
      setType(editAlarm.type || 'alarm');
      setRepeatDays(editAlarm.repeatDays || []);
      setSpecificDates(editAlarm.specificDates || []);
      setUseRange(!!editAlarm.dateRange);
      setRangeFrom(editAlarm.dateRange?.from || '');
      setRangeTo(editAlarm.dateRange?.to || '');
      setSelectedSoundId(editAlarm.soundId || 'classic');
    } else {
      setTime('08:00');
      setEndTime('09:00');
      setLabel('');
      setDescription('');
      setType('alarm');
      setRepeatDays([]);
      setSpecificDates(initialDate ? [initialDate] : []);
      setUseRange(false);
      setRangeFrom(initialDate || '');
      setRangeTo('');
      setSelectedSoundId('classic');
    }
  }, [editAlarm, initialDate, isOpen]);

  if (!isOpen) return null;

  const allSounds = [...DEFAULT_SOUNDS, ...customSounds];

  const toggleDay = (day: number) => {
    setRepeatDays(prev => 
      prev.includes(day as DayOfWeek) ? prev.filter(d => d !== day) : [...prev, day as DayOfWeek]
    );
  };

  const addSpecificDate = (date: string) => {
    if (date && !specificDates.includes(date)) {
      setSpecificDates([...specificDates, date]);
    }
  };

  const removeSpecificDate = (date: string) => {
    setSpecificDates(specificDates.filter(d => d !== date));
  };

  const handlePreviewSound = (url: string) => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.src = url;
      audioPreviewRef.current.play().catch(console.error);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newSound: SoundAsset = {
          id: `custom_${Date.now()}`,
          name: file.name.substring(0, 15),
          url: dataUrl,
          isCustom: true
        };
        setCustomSounds(prev => [...prev, newSound]);
        saveCustomSoundMetadata(newSound);
        setSelectedSoundId(newSound.id);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    // For events, we strictly use rangeFrom and rangeTo if they are set
    const finalUseRange = type === 'event' || useRange;
    onSave({
      time,
      endTime: type === 'event' ? endTime : undefined,
      label: label || (type === 'alarm' ? 'New Alarm' : 'Untitled Event'),
      description: type === 'event' ? description : undefined,
      type,
      specificDates: !finalUseRange ? specificDates : undefined,
      dateRange: finalUseRange ? { from: rangeFrom || initialDate || '', to: rangeTo || rangeFrom || initialDate || '' } : undefined,
      repeatDays: repeatDays.length > 0 ? repeatDays : undefined,
      isEnabled: true,
      soundId: selectedSoundId
    });
    if (audioPreviewRef.current) audioPreviewRef.current.pause();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-md p-4">
      <audio ref={audioPreviewRef} />
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <button 
            onClick={() => setType('alarm')}
            className={`flex-1 py-4 text-[10px] font-bold tracking-widest uppercase transition-all ${type === 'alarm' ? 'bg-white text-amber-600 border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            SET ALARM
          </button>
          <button 
            onClick={() => setType('event')}
            className={`flex-1 py-4 text-[10px] font-bold tracking-widest uppercase transition-all ${type === 'event' ? 'bg-white text-blue-600 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            EVENT
          </button>
        </div>

        <div className="p-10 overflow-y-auto space-y-10">
          <div className="text-center space-y-2">
            <label className={`block text-[10px] font-bold uppercase tracking-[0.3em] ${type === 'alarm' ? 'text-amber-600' : 'text-blue-600'}`}>
              {type === 'event' ? 'EVENT TIME RANGE' : 'TIME'}
            </label>
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center gap-8 w-full">
                <div className="flex flex-col items-center flex-1">
                  {type === 'event' && <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Start</span>}
                  <input 
                    type="time" 
                    value={time} 
                    onChange={(e) => setTime(e.target.value)}
                    className={`${type === 'event' ? 'text-4xl' : 'text-7xl'} font-light text-slate-900 bg-transparent focus:outline-none text-center`}
                  />
                  {type === 'event' && (
                    <input 
                      type="date" 
                      value={rangeFrom} 
                      onChange={e => setRangeFrom(e.target.value)}
                      className="mt-2 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md focus:outline-none border border-slate-200"
                    />
                  )}
                </div>

                {type === 'event' && (
                  <>
                    <div className="text-2xl text-slate-200 self-center">—</div>
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">End</span>
                      <input 
                        type="time" 
                        value={endTime} 
                        onChange={(e) => setEndTime(e.target.value)}
                        className="text-4xl font-light text-slate-900 bg-transparent focus:outline-none text-center"
                      />
                      <input 
                        type="date" 
                        value={rangeTo} 
                        onChange={e => setRangeTo(e.target.value)}
                        className="mt-2 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md focus:outline-none border border-slate-200"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">
                {type === 'alarm' ? 'Alarm Label' : 'Event Title'}
              </label>
              <input 
                type="text" 
                placeholder={type === 'alarm' ? "Wake up at..." : "Work session..."}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className={`w-full px-0 py-2 bg-transparent border-b border-slate-100 text-xl font-light focus:outline-none transition-all placeholder:text-slate-200 ${type === 'alarm' ? 'focus:border-amber-400' : 'focus:border-blue-400'}`}
              />
            </div>

            {type === 'event' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Description</label>
                <textarea 
                  placeholder="Notes for this event..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-light focus:border-blue-400 focus:outline-none transition-all min-h-[100px] resize-none"
                />
              </div>
            )}

            {type === 'alarm' && (
              <div className="bg-slate-50 p-6 rounded-2xl space-y-6">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">ALARM SOUND</label>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold text-amber-600 hover:underline">Upload Custom</button>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="audio/*" />
                </div>
                <div className="grid grid-cols-2 gap-3 max-h-32 overflow-y-auto pr-1">
                  {allSounds.map(sound => (
                    <button 
                      key={sound.id}
                      onClick={() => setSelectedSoundId(sound.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-[11px] transition-all ${selectedSoundId === sound.id ? 'bg-white border-amber-400 shadow-sm text-slate-900' : 'bg-transparent border-slate-100 text-slate-400'}`}
                    >
                      <span className="truncate pr-2">{sound.name}</span>
                      <div onClick={(e) => { e.stopPropagation(); handlePreviewSound(sound.url); }} className="p-1 hover:text-amber-500">▶</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Occurrence Section (Simplified for Alarms, hidden for Events as it's at the top) */}
            {type === 'alarm' && (
              <div className="bg-slate-50 p-6 rounded-2xl space-y-6">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Occurrence</label>
                  <div className="flex bg-white rounded-lg p-1 border border-slate-100">
                    <button onClick={() => setUseRange(false)} className={`px-3 py-1 text-[9px] font-bold rounded ${!useRange ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Dates</button>
                    <button onClick={() => setUseRange(true)} className={`px-3 py-1 text-[9px] font-bold rounded ${useRange ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Range</button>
                  </div>
                </div>

                {useRange ? (
                  <div className="grid grid-cols-2 gap-4">
                    <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="bg-white border border-slate-100 p-2 rounded-lg text-xs" />
                    <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="bg-white border border-slate-100 p-2 rounded-lg text-xs" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input type="date" onChange={e => addSpecificDate(e.target.value)} className="w-full bg-white border border-slate-100 p-2 rounded-lg text-xs" />
                    <div className="flex flex-wrap gap-2">
                      {specificDates.map(d => (
                        <span key={d} className="bg-white text-slate-600 text-[10px] px-2 py-1 rounded-md border border-slate-100 flex items-center gap-2">
                          {d} <button onClick={() => removeSpecificDate(d)} className="text-red-400 hover:text-red-600">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 text-center">Repeat Cycle</label>
              <div className="flex justify-between gap-2">
                {DAYS.map((day, idx) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(idx)}
                    className={`flex-grow py-3 rounded-xl text-[10px] font-bold border transition-all ${
                      repeatDays.includes(idx as DayOfWeek)
                        ? (type === 'alarm' ? 'bg-amber-500 text-white border-amber-500 shadow-md' : 'bg-blue-500 text-white border-blue-500 shadow-md')
                        : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    {day.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-10 flex gap-4 bg-slate-50/50">
          <button onClick={onClose} className="flex-1 px-4 py-4 border border-slate-200 text-slate-400 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-all">Cancel</button>
          <button onClick={handleSave} className={`flex-1 px-4 py-4 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-xl transition-all ${type === 'alarm' ? 'bg-slate-900 shadow-slate-900/20' : 'bg-blue-600 shadow-blue-600/20'}`}>Confirm {type === 'alarm' ? 'Alarm' : 'Event'}</button>
        </div>
      </div>
    </div>
  );
};

export default AlarmModal;
