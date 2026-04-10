/** Ambient declaration for electron-updater (main process). Resolves type-check when moduleResolution is "bundler". */
declare module "electron-updater" {
  export interface UpdateFileInfo {
    url?: string;
  }

  export interface UpdateInfo {
    version?: string;
    files?: UpdateFileInfo[];
  }

  export interface ProgressInfo {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  }

  export interface Logger {
    info(message?: unknown, ...args: unknown[]): void;
    warn(message?: unknown, ...args: unknown[]): void;
    error(message?: unknown, ...args: unknown[]): void;
    debug(message?: unknown, ...args: unknown[]): void;
  }

  export interface AppUpdater {
    logger: Logger | null;
    autoDownload: boolean;
    setFeedURL(options: {
      provider: string;
      owner: string;
      repo: string;
    }): void;
    on(event: "update-available", listener: (info: UpdateInfo) => void): AppUpdater;
    on(
      event: "update-downloaded",
      listener: (event: unknown, info: UpdateInfo) => void,
    ): AppUpdater;
    on(event: "download-progress", listener: (info: ProgressInfo) => void): AppUpdater;
    on(event: "error", listener: (err: Error) => void): AppUpdater;
    downloadUpdate(): Promise<string[]>;
    checkForUpdates(): Promise<unknown>;
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  }

  export const autoUpdater: AppUpdater;
}
