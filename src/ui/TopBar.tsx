import { IconButton } from "./common/Button";
import { Icon } from "./common/icons";
import { openCookieManager } from "./cookies/CookieManager";
import { openCommandPalette } from "./search/CommandPalette";
import { openSettings } from "./settings/SettingsDialog";
import { isMac } from "./useShortcuts";
import { EnvironmentSelect } from "./vars/EnvironmentSelect";

export function TopBar() {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
      <span className="font-semibold">HTTP Tool</span>
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          className="flex w-80 items-center gap-2 rounded border border-line bg-elevated px-2 py-1 text-muted hover:text-fg"
          onClick={() => openCommandPalette()}
        >
          <Icon name="search" size={13} />
          <span className="flex-1 text-left">Search</span>
          <span className="mono text-[11px]">{isMac ? "⌘K" : "Ctrl+K"}</span>
        </button>
      </div>
      <EnvironmentSelect />
      <IconButton title="Cookies" onClick={() => openCookieManager()}>
        <Icon name="cookie" />
      </IconButton>
      <IconButton title="Settings" onClick={() => openSettings()}>
        <Icon name="settings" />
      </IconButton>
    </div>
  );
}
