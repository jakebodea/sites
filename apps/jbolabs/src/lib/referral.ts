/**
 * Referral links: partners send people to any page with `?ref=<name>` (for
 * example `/?ref=Alex%20Rivera`). The name is remembered for the visit and
 * prefills the intake form's "Referred by" field, which the visitor can edit.
 * Browser-only and storage-optional: private windows simply skip the memory.
 */
const STORAGE_KEY = "referrer";
const PARAM = "ref";
const MAX_LENGTH = 120;

const clean = (value: string | null): string | undefined => {
  const name = value
    ?.replaceAll(/[-_+]+/gu, " ")
    .trim()
    .slice(0, MAX_LENGTH);
  return name === undefined || name === "" ? undefined : name;
};

/** Saves `?ref=` from the current URL, if present. Called on every page load. */
export const rememberReferrer = (url: URL): void => {
  const name = clean(url.searchParams.get(PARAM));
  if (name === undefined) {
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Storage can be blocked; the form still reads the parameter on its own page.
  }
};

/** The referrer from this page's URL, else from earlier in the visit. */
export const currentReferrer = (url: URL): string | undefined => {
  const fromUrl = clean(url.searchParams.get(PARAM));
  if (fromUrl !== undefined) {
    return fromUrl;
  }
  try {
    return clean(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
};
