// A tiny key/value abstraction so the shared code never has to know WHERE it is
// running. This is the storage half of the SHARED-vs-NATIVE seam:
//
//   * On web, React Native Web has no AsyncStorage-backed native module, so we use
//     the browser's localStorage (synchronous, wrapped in a Promise for one API).
//   * On native (Android / iOS), we use @react-native-async-storage/async-storage.
//
// Everything above this file (the API client, the install-id helper) talks to ONE
// async interface and stays 100% platform-agnostic. Only this file branches.
import { Platform } from "react-native";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Web implementation — backed by localStorage. Guarded so a non-browser web
// runtime (SSR / a bundler probe) can't throw; it degrades to an in-memory map.
function webStore(): KeyValueStore {
  const hasLocalStorage =
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined";

  if (hasLocalStorage) {
    const ls = (globalThis as unknown as { localStorage: Storage }).localStorage;
    return {
      async getItem(key) {
        try {
          return ls.getItem(key);
        } catch {
          return null;
        }
      },
      async setItem(key, value) {
        try {
          ls.setItem(key, value);
        } catch {
          /* storage full / disabled — best-effort, never throw */
        }
      },
      async removeItem(key) {
        try {
          ls.removeItem(key);
        } catch {
          /* best-effort, never throw */
        }
      },
    };
  }

  // Fallback: process-lifetime memory (keeps the app functional without persistence).
  const mem = new Map<string, string>();
  return {
    async getItem(key) {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItem(key, value) {
      mem.set(key, value);
    },
    async removeItem(key) {
      mem.delete(key);
    },
  };
}

// Native implementation — lazily require AsyncStorage so the web bundle never has
// to resolve the native module (react-native-web wouldn't provide it anyway).
function nativeStore(): KeyValueStore {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage =
    require("@react-native-async-storage/async-storage").default as {
      getItem(k: string): Promise<string | null>;
      setItem(k: string, v: string): Promise<void>;
      removeItem(k: string): Promise<void>;
    };
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  };
}

// Pick the implementation ONCE at module load based on the platform.
export const kv: KeyValueStore = Platform.OS === "web" ? webStore() : nativeStore();
