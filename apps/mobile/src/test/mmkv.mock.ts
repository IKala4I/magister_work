/**
 * In-memory stand-in for react-native-mmkv 3.x (native module — unavailable under jest).
 * Wired via the jest moduleNameMapper; covers exactly the API surface the app uses.
 */
type Value = string | number | boolean;

export class MMKV {
  private store = new Map<string, Value>();

  // Signature-compatible with the real constructor; the id is irrelevant in-memory.
  constructor(config?: { id?: string }) {
    void config;
  }

  set(key: string, value: Value): void {
    this.store.set(key, value);
  }

  getString(key: string): string | undefined {
    const v = this.store.get(key);
    return typeof v === 'string' ? v : undefined;
  }

  getNumber(key: string): number | undefined {
    const v = this.store.get(key);
    return typeof v === 'number' ? v : undefined;
  }

  getBoolean(key: string): boolean | undefined {
    const v = this.store.get(key);
    return typeof v === 'boolean' ? v : undefined;
  }

  contains(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  getAllKeys(): string[] {
    return [...this.store.keys()];
  }

  clearAll(): void {
    this.store.clear();
  }
}
