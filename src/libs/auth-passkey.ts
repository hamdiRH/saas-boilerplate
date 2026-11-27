interface Input {
  appUrl: string;
  appName: string;
  rpId?: string | undefined;
  rpName?: string | undefined;
}

export function buildPasskeyConfig({ appUrl, appName, rpId, rpName }: Input) {
  const url = new URL(appUrl);
  return {
    // "localhost" is a valid rpID and works over plain http in browsers
    rpID: rpId ?? url.hostname,
    rpName: rpName ?? appName,
    origin: url.origin,
  };
}
