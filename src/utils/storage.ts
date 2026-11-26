import type {PetalThemeKey, WellnessSessionLog} from '../types/bloomi';

const LOGS_STORAGE_KEY = 'bloomi_wellness_logs_v1';
const THEME_STORAGE_KEY = 'bloomi_petal_theme_v1';

export function loadStoredLogs(): WellnessSessionLog[] {
  try {
    const raw = window.localStorage.getItem(LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is WellnessSessionLog =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        !item.id.startsWith('seed-') &&
        typeof item.time === 'string' &&
        typeof item.routine === 'string' &&
        typeof item.bpmBefore === 'number' &&
        typeof item.bpmAfter === 'number' &&
        typeof item.mood === 'string',
    );
  } catch {
    return [];
  }
}

export function saveStoredLogs(logs: WellnessSessionLog[]): void {
  try {
    window.localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function clearStoredLogs(): WellnessSessionLog[] {
  try {
    window.localStorage.removeItem(LOGS_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  return [];
}

export function loadStoredPetalTheme(): PetalThemeKey {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'blush' || raw === 'lavender' || raw === 'sage' || raw === 'pearl') {
      return raw;
    }
  } catch {
    // Ignore
  }
  return 'blush';
}

export function saveStoredPetalTheme(theme: PetalThemeKey): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore
  }
}
