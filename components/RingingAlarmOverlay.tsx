
import React, { useState, useEffect, useRef } from 'react';
import { Alarm } from '../types';

interface RingingAlarmOverlayProps {
  alarm: Alarm;
  onDismiss: () => void;
}

const RingingAlarmOverlay: React.FC<RingingAlarmOverlayProps> = ({ alarm, onDismiss }) => {
  const [sliderPos, setSliderPos] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left - 40; // 40 is half handle width approx
      const max = rect.width - 80;
      const val = Math.max(0, Math.min(x, max));
      setSliderPos(val);
      
      if (val >= max * 0.9) {
        onDismiss();
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left - 40;
      const max = rect.width - 80;
      const val = Math.max(0, Math.min(x, max));
      setSliderPos(val);
      
      if (val >= max * 0.9) {
        onDismiss();
      }
    }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onDismiss();
    }
    lastTapRef.current = now;
  };

  useEffect(() => {
    const up = () => {
      setIsDragging(false);
      setSliderPos(0);
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900 flex flex-col items-center justify-between py-20 px-10 animate-in fade-in duration-500">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-500/40 via-transparent to-transparent animate-pulse"></div>
      </div>

      <div className="text-center z-10 space-y-4">
        <div className="text-[10px] font-bold text-amber-500 uppercase tracking-[0.4em] mb-2 animate-bounce">Cycle Synchronization Active</div>
        <h2 className="text-6xl font-black text-white tracking-tighter tabular-nums mb-2">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </h2>
        <p className="text-2xl font-light text-slate-400 uppercase tracking-widest">{alarm.label}</p>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-12 z-10">
        {/* Double Tap Area */}
        <button 
          onClick={handleDoubleTap}
          className="group relative w-32 h-32 rounded-full border-2 border-white/10 flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
        >
          <div className="absolute inset-0 rounded-full border border-white/20 animate-ping"></div>
          <div className="text-[9px] font-black text-white/40 uppercase tracking-widest text-center leading-tight">
            Double Tap<br/>to Sync
          </div>
        </button>

        {/* Swipe Slider */}
        <div 
          ref={containerRef}
          className="relative w-full h-20 bg-white/5 rounded-full border border-white/10 flex items-center px-2 overflow-hidden"
          onTouchMove={handleTouchMove}
          onMouseMove={handleMouseMove}
        >
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: 1 - sliderPos / 200 }}
          >
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] ml-12">Swipe to Dismiss</span>
          </div>

          <div 
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            style={{ transform: `translateX(${sliderPos}px)` }}
            className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center shadow-xl shadow-amber-500/20 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-amber-500/40"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RingingAlarmOverlay;
