
import { SoundAsset } from '../types';

export const DEFAULT_SOUNDS: SoundAsset[] = [
  { id: 'classic', name: 'Classic Beep', url: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg', isCustom: false },
  { id: 'mellow', name: 'Mellow Chime', url: 'https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg', isCustom: false },
  { id: 'morning', name: 'Morning Dew', url: 'https://actions.google.com/sounds/v1/alarms/alarm_clock_ringing.ogg', isCustom: false },
  { id: 'zen', name: 'Zen Bowl', url: 'https://actions.google.com/sounds/v1/alarms/spaceship_alarm.ogg', isCustom: false },
];

export const getStoredCustomSounds = (): SoundAsset[] => {
  const saved = localStorage.getItem('harusync_custom_sounds');
  return saved ? JSON.parse(saved) : [];
};

export const saveCustomSoundMetadata = (sound: SoundAsset) => {
  const current = getStoredCustomSounds();
  localStorage.setItem('harusync_custom_sounds', JSON.stringify([...current, sound]));
};
