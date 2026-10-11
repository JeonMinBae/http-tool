import { create } from "zustand";
import { appDataApi } from "../ipc";
import { DEFAULT_SETTINGS, type GlobalSettings } from "../core/model";

interface SettingsState {
  settings: GlobalSettings;
  load(): Promise<void>;
  update(patch: Partial<GlobalSettings>): Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  async load() {
    const saved = await appDataApi.read<Partial<GlobalSettings>>("settings");
    set({ settings: { ...DEFAULT_SETTINGS, ...saved, proxy: { ...DEFAULT_SETTINGS.proxy, ...saved?.proxy } } });
  },
  async update(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await appDataApi.write("settings", settings);
  },
}));
