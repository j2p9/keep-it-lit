// localStorage with a namespace and no throwing (private mode, quota, disabled storage).
const PREFIX = 'kil:';

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function readString(key, fallback = null) {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}
