import { render } from '@react-email/render';
import type { ReactElement } from 'react';

/** Always produce both parts: HTML for clients, text for accessibility and spam scoring. */
export async function renderEmail(element: ReactElement) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
