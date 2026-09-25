/** Versionsinformation som bakas in vid bygget (se `define` i vite.config.ts). */
export interface BuildInfo {
  /** Från package.json. */
  version: string;
  /** Kort commit-SHA, eller "dev" utanför git. */
  commit: string;
  /** ISO-tidpunkt för bygget. */
  buildTime: string;
}

export const BUILD_INFO: BuildInfo = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  buildTime: __APP_BUILD_TIME__,
};

const dateTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });

/** "12 sep. 2026 14:03", eller texten som den är om den inte går att tolka. */
export function formatBuildTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : dateTime.format(ms);
}

/** Kort rad för sidfoten: "Viktresan 0.1.0 (abc1234)". */
export function versionLine(info: BuildInfo = BUILD_INFO): string {
  return `Viktresan ${info.version} (${info.commit})`;
}
