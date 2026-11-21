/** Platform detection used by the install UI. Pure, so it is testable without a browser. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/u.test(userAgent)) {
    return true;
  }
  // iPadOS 13+ reports itself as a Mac but has a touch screen.
  return /Macintosh/u.test(userAgent) && maxTouchPoints > 1;
}

/** Already running as an installed app? `iosStandalone` is Safari's `navigator.standalone`. */
export function isInstalledDisplay(
  displayModeStandalone: boolean,
  iosStandalone?: boolean,
): boolean {
  return displayModeStandalone || iosStandalone === true;
}
