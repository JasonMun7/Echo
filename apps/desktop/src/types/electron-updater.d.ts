/** Ambient declaration for electron-updater (main process). Resolves type-check when moduleResolution is "bundler". */
declare module "electron-updater" {
  export interface UpdateInfo {
    version?: string;
  }

  export const autoUpdater: {
    on(event: "update-available", listener: () => void): void;
    on(
      event: "update-downloaded",
      listener: (event: unknown, info: UpdateInfo) => void
    ): void;
    checkForUpdates(): Promise<unknown>;
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  };
}
