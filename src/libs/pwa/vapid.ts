/** Converts the base64url VAPID public key into the bytes `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = `${base64Url}${padding}`.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.codePointAt(index) ?? 0;
  }
  return output;
}
