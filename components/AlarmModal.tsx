
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
  const [label, setLabel] = useState('');
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
      setLabel(editAlarm.label);
      setRepeatDays(editAlarm.repeatDays || []);
      setSpecificDates(editAlarm.specificDates || []);
      setUseRange(!!editAlarm.dateRange);
      setRangeFrom(editAlarm.dateRange?.from || '');
      setRangeTo(editAlarm.dateRange?.to || '');
      setSelectedSoundId(editAlarm.soundId || 'classic');
    } else {
      setTime('08:00');
      setLabel('');
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
    onSave({
      time,
      label: label || 'Sync Point',
      specificDates: !useRange ? specificDates : undefined,
      dateRange: useRange ? { from: rangeFrom, to: rangeTo } : undefined,
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
        <div className="p-10 overflow-y-auto space-y-10">
          <div className="flex justify-between items-center border-b border-slate-50 pb-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">Set Alarm</h2>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-900 text-3xl font-light">×</button>
          </div>

          <div className="text-center space-y-2">
            <label className="block text-[10px] font-bold text-amber-600 uppercase tracking-[0.3em]">Temporal Point</label>
            <input 
              type="time" 
              value={time} 
              onChange={(e) => setTime(e.target.value)}
              className="text-7xl font-light text-slate-900 bg-transparent focus:outline-none w-full text-center"
            />
          </div>

          <div className="space-y-8">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Alarm Label</label>
              <input 
                type="text" 
                placeholder="Synchronize at dawn..."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-0 py-2 bg-transparent border-b border-slate-100 text-xl font-light focus:border-amber-400 focus:outline-none transition-all placeholder:text-slate-200"
              />
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">RINGING SOUND</label>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] font-bold text-amber-600 hover:underline"
                >
                  Upload Custom
                </button>
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

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 text-center">Weekly Resonance</label>
              <div className="flex justify-between gap-2">
                {DAYS.map((day, idx) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(idx)}
                    className={`flex-grow py-3 rounded-xl text-[10px] font-bold border transition-all ${
                      repeatDays.includes(idx as DayOfWeek)
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md'
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
          <button onClick={onClose} className="flex-1 px-4 py-4 border border-slate-200 text-slate-400 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-all">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 px-4 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20">
            Confirm Alarm
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlarmModal;
