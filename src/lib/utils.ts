// Date & time helpers (all days/labels are in Arabic, week starts Sunday=0)

export const WEEKDAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAY_AR_SHORT = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

export const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

// Returns "YYYY-MM-DD" in local time (no timezone shift)
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateInput(v: string): Date {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayValue(): string {
  return toDateInputValue(new Date());
}

export function formatArDate(v: string): string {
  const d = parseDateInput(v);
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatArDateLong(v: string): string {
  const d = parseDateInput(v);
  return `${WEEKDAY_AR[d.getDay()]}، ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

// "09:00:00" -> "09:00" (12h with ص/م)
export function formatTime12h(t: string): string {
  const [hStr, mStr] = t.split(':');
  let h = Number(hStr);
  const m = mStr ?? '00';
  const period = h < 12 ? 'ص' : 'م';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m} ${period}`;
}

export function minutesToTime(baseTime: string, minutes: number): string {
  const [h, m] = baseTime.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}:00`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function addMinutes(t: string, mins: number): string {
  return minutesToTime(t, mins);
}

export function weekdayOf(v: string): number {
  return parseDateInput(v).getDay();
}

// Build the slot list for a doctor on a given date string.
// Skips days the doctor is not available. Returns array of "HH:MM:SS".
export function buildSlotsForDoctor(
  doctor: { available_days: number[]; shift_start: string; shift_end: string; slot_minutes: number },
  dateValue: string,
  bookedTimes: string[] = [],
): string[] {
  const wd = weekdayOf(dateValue);
  if (!doctor.available_days.includes(wd)) return [];

  const start = timeToMinutes(doctor.shift_start);
  const end = timeToMinutes(doctor.shift_end);
  const step = Math.max(5, doctor.slot_minutes);
  const booked = new Set(bookedTimes.map((t) => t.slice(0, 8)));

  const slots: string[] = [];
  for (let t = start; t + 0 < end; t += step) {
    const hh = Math.floor(t / 60) % 24;
    const mm = t % 60;
    const val = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
    if (!booked.has(val.slice(0, 8))) slots.push(val);
  }
  return slots;
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}
