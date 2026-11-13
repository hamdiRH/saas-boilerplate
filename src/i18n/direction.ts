const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export function getDirection(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
