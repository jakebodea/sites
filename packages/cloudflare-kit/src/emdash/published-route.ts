import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getMenu, getMenus, getSiteSettings } from "emdash";
import type { MenuItem } from "emdash";
import { getDb } from "emdash/runtime";
import type { SeedMenuItem } from "emdash/seed";

import { ownershipDenied } from "./owner-policy.ts";
import {
  authorizedContentRequest,
  contentPolicy,
  exportPublished,
  PublishedContentError,
} from "./published-content.ts";
import { decodeContentBindings } from "./published-env.ts";

const menuItem = (item: MenuItem): SeedMenuItem => {
  const output: SeedMenuItem = {
    children: item.children.map(menuItem),
    label: item.label,
    type: "custom",
    url: item.url,
  };
  if (item.target === "_blank" || item.target === "_self") {
    output.target = item.target;
  }
  if (item.titleAttr !== undefined) {
    output.titleAttr = item.titleAttr;
  }
  if (item.cssClasses !== undefined) {
    output.cssClasses = item.cssClasses;
  }
  return output;
};
const handleRequest: APIRoute = async function handleRequest({ request }) {
  const bindings = decodeContentBindings(env);
  if (!authorizedContentRequest(request, bindings, "export")) {
    return ownershipDenied(
      "Published export is unavailable or unauthorized",
      401
    );
  }
  if (new URL(request.url).search !== "") {
    return ownershipDenied(
      "Export has no client-selectable source, destination or site",
      400
    );
  }
  try {
    const site = bindings.CMS_OWNER_SITE;
    if (site !== "access-electric" && site !== "ms-custom-homes") {
      return ownershipDenied("Site has no public content policy", 409);
    }
    const policy = contentPolicy(site);
    const allowed = new Set(policy.menus);
    const [summaries, settings] = await Promise.all([
      getMenus(),
      getSiteSettings(),
    ]);
    const resolved = await Promise.all(
      summaries.flatMap((summary) =>
        allowed.has(summary.name)
          ? [getMenu(summary.name, { locale: summary.locale })]
          : []
      )
    );
    const menus = resolved.flatMap((menu) =>
      menu === null
        ? []
        : [
            {
              items: menu.items.map(menuItem),
              label: menu.label,
              locale: menu.locale,
              name: menu.name,
            },
          ]
    );
    return Response.json(
      await exportPublished(await getDb(), site, {
        menus,
        settings,
      }),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return ownershipDenied(
      error instanceof PublishedContentError
        ? error.message
        : "Published content export failed; inspect source policy and public media",
      409
    );
  }
};

export const GET = handleRequest;
