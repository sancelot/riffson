// Clés du stockage local du navigateur. Les anciennes clés datent d'avant le nom « Riffson » :
// elles sont reprises une fois puis supprimées, pour ne perdre ni la progression ni l'historique.

export const PROFILE_STORAGE_KEY = 'riffson_user';
export const CHAT_STORAGE_KEY = 'riffson_chat_history';

const LEGACY_KEYS: Record<string, string> = {
  [PROFILE_STORAGE_KEY]: 'guitar_hero_user',
  [CHAT_STORAGE_KEY]: 'gibson_chat_history',
};

/** Lit une valeur, en migrant au passage celle stockée sous l'ancienne clé. */
export const readStorage = (key: string): string | null => {
  const value = localStorage.getItem(key);
  if (value !== null) return value;
  const legacyKey = LEGACY_KEYS[key];
  const legacy = legacyKey ? localStorage.getItem(legacyKey) : null;
  if (legacy !== null) {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
  }
  return legacy;
};

/** Supprime une valeur et son éventuelle version sous l'ancienne clé. */
export const removeStorage = (key: string) => {
  localStorage.removeItem(key);
  if (LEGACY_KEYS[key]) localStorage.removeItem(LEGACY_KEYS[key]);
};
