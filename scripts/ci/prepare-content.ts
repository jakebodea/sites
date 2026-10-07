import path from "node:path";

import { prepareProductionContent } from "@jakebodea/control-app/content";
import { resolveSite } from "@jakebodea/control-app/site";
import { Schema } from "effect";

const root = path.resolve(import.meta.dirname, "../..");
const index = process.argv.indexOf("--sites");
const sites = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Schema.String))
)(process.argv[index + 1] ?? "[]");
for (const name of sites) {
  const site = resolveSite(name, root);
  if (site.cms) {
    await prepareProductionContent(site, true);
  }
}
