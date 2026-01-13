
export const getDaysInMonth = (year: number, month: number): Date[] => {
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export const getCalendarGrid = (viewDate: Date): Date[] => {
  const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  
  const startDay = startOfMonth.getDay();
  const days: Date[] = [];

  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), -i));
  }

  for (let i = 1; i <= endOfMonth.getDate(); i++) {
    days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
  }

  const remainingCells = 42 - days.length;
  for (let i = 1; i <= remainingCells; i++) {
    days.push(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, i));
  }

  return days;
};

export const formatDateKey = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const formatTimeDisplay = (time: string, use24Hour: boolean = false): string => {
  const [hour, min] = time.split(':');
  if (use24Hour) return `${hour}:${min}`;
  
  const h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${min} ${ampm}`;
};
