/** "Chrome on Windows". Deliberately simple — it's a hint for recognising your own devices. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return 'Unknown device';
  }

  let browser = 'Browser';
  if (/Edg\//u.test(userAgent)) {
    browser = 'Edge';
  } else if (/OPR\//u.test(userAgent)) {
    browser = 'Opera';
  } else if (/Firefox\//u.test(userAgent)) {
    browser = 'Firefox';
  } else if (/Chrome\//u.test(userAgent)) {
    browser = 'Chrome';
  } else if (/Safari\//u.test(userAgent)) {
    browser = 'Safari';
  }

  let os = 'Unknown OS';
  if (/Windows/u.test(userAgent)) {
    os = 'Windows';
  } else if (/Android/u.test(userAgent)) {
    os = 'Android';
  } else if (/iPhone|iPad|iPod/u.test(userAgent)) {
    os = 'iOS';
  } else if (/Mac OS X/u.test(userAgent)) {
    os = 'macOS';
  } else if (/Linux/u.test(userAgent)) {
    os = 'Linux';
  }

  return `${browser} on ${os}`;
}
