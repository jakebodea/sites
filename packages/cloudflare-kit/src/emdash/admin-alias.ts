/**
 * `/_admin` is the address we hand to owners and clients. EmDash hardcodes its
 * admin under `/_emdash/admin`, so the alias redirects there rather than
 * serving the admin itself; deep links and query strings carry over.
 */
export const ADMIN_ALIAS = "/_admin";
export const EMDASH_ADMIN = "/_emdash/admin";

export const adminAliasTarget = (url: URL): URL => {
  const rest = url.pathname.slice(ADMIN_ALIAS.length).replace(/^\/+/u, "");
  const target = new URL(
    rest === "" ? EMDASH_ADMIN : `${EMDASH_ADMIN}/${rest}`,
    url.origin
  );
  target.search = url.search;
  return target;
};
