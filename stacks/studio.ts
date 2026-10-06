/**
 * The studio domain every site sends mail from: the jbolabs.com zone, its
 * registrar settings, the `mail.` sending subdomain, and inbound forwarding
 * for the addresses the sites commit (`alerts@`, `hello@`).
 *
 *   ALCHEMY_PROFILE=admin bun alchemy deploy stacks/studio.ts --stage shared
 *
 * The domain itself was bought once with `cf registrar registrations create`;
 * Alchemy cannot register domains. Needs `FORWARD_TO` (your real inbox) in the
 * main checkout's `.env`. Cloudflare emails it a verification link on the
 * first deploy, and forwarding starts once it is clicked.
 */
import { fileURLToPath } from "node:url";

import { siteSecrets } from "@jakebodea/cloudflare-kit/infra";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Config, Effect } from "effect";

import { studio } from "./config.ts";

const FORWARDED = [studio.alertInbox, `hello@${studio.domain}`] as const;

export default Alchemy.Stack(
  "studio",
  {
    providers: Cloudflare.providers(),
    secrets: siteSecrets(fileURLToPath(new URL("..", import.meta.url))),
    state: Cloudflare.state(),
  },
  Effect.gen(function* studioDomain() {
    yield* Cloudflare.Registrar.Domain("Registration", {
      autoRenew: true,
      domainName: studio.domain,
      locked: true,
      privacy: true,
    });
    const zone = yield* Cloudflare.Zone.Zone("Zone", {
      name: studio.domain,
    }).pipe(RemovalPolicy.retain());
    const sending = yield* Cloudflare.Email.SendingSubdomain("Sending", {
      name: studio.sendingSubdomain,
      zoneId: zone.zoneId,
    });
    yield* Cloudflare.Email.Routing("Routing", { zone: studio.domain });
    const inbox = yield* Config.String("FORWARD_TO");
    yield* Cloudflare.Email.Address("Inbox", { email: inbox });
    for (const address of FORWARDED) {
      yield* Cloudflare.Email.Rule(`Forward-${address.split("@")[0]}`, {
        actions: [{ type: "forward", value: [inbox] }],
        matchers: [{ field: "to", type: "literal", value: address }],
        zone: studio.domain,
      });
    }
    return {
      nameServers: zone.nameServers,
      sendingEnabled: sending.enabled,
    };
  })
);
