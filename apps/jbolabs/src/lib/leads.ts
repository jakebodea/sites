import { LeadNotSaved, LeadStore } from "@jakebodea/cloudflare-kit/server";
import type { Lead } from "@jakebodea/cloudflare-kit/server";
import { env } from "cloudflare:workers";
import { Effect, Layer } from "effect";

import { answerTo } from "./intake.ts";

/**
 * Leads live in one D1 table (this site has no CMS). The notification email
 * is the inbox; the table is the record that survives a lost email, read with
 * a D1 query and included in the daily prod backup. Created on first write,
 * so a fresh stage needs no migration step.
 */
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  website TEXT,
  referrer TEXT,
  services TEXT,
  budget TEXT,
  timeline TEXT,
  message TEXT NOT NULL,
  source_path TEXT NOT NULL
)`;

const INSERT = `INSERT INTO leads
  (id, created_at, name, email, company, website, referrer, services, budget, timeline, message, source_path)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Input is validated by `IntakeForm` before it gets here. */
export const LeadStoreD1 = Layer.succeed(LeadStore, {
  save: (lead: Lead) =>
    Effect.tryPromise({
      catch: (cause) => new LeadNotSaved({ cause }),
      try: async () => {
        const id = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare(CREATE_TABLE),
          env.DB.prepare(INSERT).bind(
            id,
            new Date().toISOString(),
            lead.name,
            lead.email,
            lead.company ?? null,
            answerTo(lead.answers, "website"),
            lead.referrer ?? null,
            answerTo(lead.answers, "services"),
            answerTo(lead.answers, "budget"),
            answerTo(lead.answers, "timeline"),
            lead.message,
            lead.sourcePath
          ),
        ]);
        return { id };
      },
    }).pipe(Effect.withSpan("LeadStore.save")),
});
