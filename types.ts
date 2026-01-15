
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SoundAsset {
  id: string;
  name: string;
  url: string;
  isCustom: boolean;
}

export interface Alarm {
  id: string;
  time: string; // HH:mm format (Start Time)
  endTime?: string; // HH:mm format (End Time for events)
  label: string;
  description?: string;
  specificDates?: string[]; // Array of YYYY-MM-DD
  dateRange?: {
    from: string;
    to: string;
  };
  repeatDays?: DayOfWeek[]; // [0-6] for weekly repeats
  isEnabled: boolean;
  soundId: string;
  isAiEnabled?: boolean;
  type?: 'alarm' | 'event';
}

export interface DayData {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  alarms: Alarm[];
}
