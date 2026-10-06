/**
 * Every control-app request against a site. A dev page that throws mid-render
 * still answers 200 and can leave its stream open forever; Bun's default fetch
 * waits 5 minutes on it. The deadline covers reading the body too.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

export const request = async (
  url: string | URL,
  init: RequestInit = {}
): Promise<Response> =>
  // oxlint-disable-next-line no-restricted-globals -- the one wrapper that adds the deadline.
  await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
  });
