/**
 * What the assistant is told. The system prompt carries the house rules every
 * site shares (drafts only, no invented facts, the copy style the markup checks
 * enforce); presets are one-click prompts for a single entry.
 */
import type { AssistantPreset } from "../options.ts";

export const systemPrompt = (siteName: string): string =>
  [
    `You are the website assistant for ${siteName}. The people you help run the business; they are not technical, so explain what you did in plain, friendly words.`,
    "You change the website only through the tools you are given. Your edits are saved as drafts: nothing goes live until the person reviews it and selects Publish, so say that in your answer.",
    "Before changing an entry, read it with content_get (you need its _rev), and check the collection or section type with the schema tools when unsure which fields exist. In content_update, send only the fields you change, and send a field with sections (type blocks) as the complete array with every section's _type and _key kept.",
    "Keep the site's existing voice. Never invent facts: no new phone numbers, prices, dates, licenses, awards, or claims the page does not already make. If you need a fact you do not have, ask for it instead.",
    "Write copy without em dashes or en dashes; use commas, periods, or colons. Do not add small all-caps labels above headings.",
    "Finish with a short summary: which entries you changed (by title), what changed, and that the drafts are ready to review. If you changed nothing, say why.",
  ].join("\n\n");

export interface EntryRef {
  readonly collection: string;
  readonly id: string;
  readonly locale: string | null;
}

const describeEntry = (entry: EntryRef): string => {
  const locale = entry.locale === null ? "" : ` (locale ${entry.locale})`;
  return `the "${entry.collection}" entry with id ${entry.id}${locale}`;
};

export const PRESET_LABELS: Record<AssistantPreset, string> = {
  "alt-text": "Describe the photos",
  polish: "Polish the wording",
  seo: "Suggest search details",
  translate: "Translate",
};

export const presetPrompt = (
  preset: AssistantPreset,
  entry: EntryRef,
  locales: readonly string[]
): string => {
  const target = describeEntry(entry);
  switch (preset) {
    case "polish": {
      return `Polish the wording of ${target}: fix spelling and grammar, tighten long sentences, and make headings clear. Keep every fact, link, and the overall length about the same. Save it as a draft.`;
    }
    case "seo": {
      return `Suggest search engine details for ${target}: an SEO title under 60 characters and a description between 120 and 155 characters, both drawn only from what the entry already says. Do not save anything: search details go live as soon as they are saved, so reply with the two suggestions and tell the person to paste them into the page's search (SEO) panel and review them.`;
    }
    case "alt-text": {
      return `Find the photos in ${target} (image values have an "id" and an "alt") whose alt text is missing, generic, or just a file name. For each one, call describe_photo with its id and write a short, factual alt text under 125 characters. The page reads alt text from the entry itself, so set "alt" on each image value in the entry with content_update (keep every other property of the image value); that saves a draft. Report how many photos you described.`;
    }
    case "translate": {
      const others = locales.filter((locale) => locale !== entry.locale);
      return `Translate ${target} into ${others.join(" and ")}. Use content_translations to find an existing translation; update it if it exists, otherwise create one with content_create using translationOf and the locale. Translate every text field and keep links, photos, and section structure unchanged. Save as drafts.`;
    }
    default: {
      return preset satisfies never;
    }
  }
};

export const freeformPrompt = (request: string, entry?: EntryRef): string =>
  entry === undefined
    ? request
    : `${request}\n\n(The person is looking at ${describeEntry(entry)}. Assume the request is about this entry unless it says otherwise.)`;
