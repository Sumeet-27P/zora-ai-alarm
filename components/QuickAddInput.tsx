
import React, { useState, useEffect, useRef } from 'react';

interface QuickAddInputProps {
  onAdd: (text: string) => Promise<void>;
  isLoading: boolean;
}

const QuickAddInput: React.FC<QuickAddInputProps> = ({ onAdd, isLoading }) => {
  const [value, setValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setValue(transcript);
        // Optionally auto-submit:
        // onAdd(transcript).then(() => setValue(''));
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    await onAdd(value);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-xl group">
      <button 
        type="button"
        onClick={toggleListening}
        className={`absolute inset-y-0 left-4 flex items-center justify-center transition-all ${isListening ? 'text-red-500 scale-125' : 'text-slate-400 hover:text-amber-500'}`}
        title={isListening ? "Listening..." : "Voice Command"}
      >
        <svg className={`w-5 h-5 ${isLoading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        {isListening && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </button>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isLoading}
        placeholder={isLoading ? "Zora is processing..." : "Tell Zora: 'Swim next Monday at 7am'"}
        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder:text-slate-400 text-slate-700"
      />
      {isLoading && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1">
          <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      )}
    </form>
  );
};

export default QuickAddInput;
