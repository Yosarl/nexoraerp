export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => string;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getPrinters?: () => Promise<Array<{ name: string; isDefault?: boolean; displayName?: string }>>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
