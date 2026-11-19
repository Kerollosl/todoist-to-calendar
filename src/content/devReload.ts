// Dev builds only (`node scripts/build.mjs --dev`): when a newer dev build lands
// in dist/, reload the extension and this tab so the new code runs. Production
// builds compile this out (__TTC_DEV__ is false) and expose no stamp file.
import { send } from "../shared/messages";

export function startDevReload(): void {
  if (!__TTC_DEV__) return;
  const url = chrome.runtime.getURL("dev-build.txt");
  let reloading = false;
  window.setInterval(async () => {
    if (reloading) return;
    try {
      const stamp = (await (await fetch(url, { cache: "no-store" })).text()).trim();
      if (!stamp || stamp === __TTC_BUILD__) return;
      reloading = true;
      await send("dev/reload", {});
      window.setTimeout(() => location.reload(), 800);
    } catch {
      // dist/ is mid-rebuild or the extension is already reloading; try again next tick.
    }
  }, 1500);
}
