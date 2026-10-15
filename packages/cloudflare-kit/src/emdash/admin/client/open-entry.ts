/**
 * Which entry the editor has open, read from the admin URL
 * (`/_emdash/admin/content/<collection>/<id>`), so the assistant knows what
 * "this page" means. A new, unsaved entry has no id yet and does not count.
 */
import type { OpenEntry } from "../assistant/protocol.ts";

const ENTRY_PATH =
  /^\/_emdash\/admin\/content\/(?<collection>[^/]+)\/(?<id>[^/]+)\/?$/u;

export const openEntryFromPath = (pathname: string): OpenEntry | undefined => {
  const match = ENTRY_PATH.exec(pathname);
  if (match === null) {
    return undefined;
  }
  const { collection = "", id = "" } = match.groups ?? {};
  return id === "new"
    ? undefined
    : {
        collection: decodeURIComponent(collection),
        id: decodeURIComponent(id),
      };
};
