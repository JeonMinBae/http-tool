import { IconButton } from "./common/Button";
import { Icon } from "./common/icons";
import { openCookieManager } from "./cookies/CookieManager";
import { EnvironmentSelect } from "./vars/EnvironmentSelect";

export function TopBar() {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
      <span className="font-semibold">HTTP Tool</span>
      <div className="flex-1" />
      <EnvironmentSelect />
      <IconButton title="Cookies" onClick={() => openCookieManager()}>
        <Icon name="cookie" />
      </IconButton>
    </div>
  );
}
