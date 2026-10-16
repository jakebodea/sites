---
name: meta-description
description: Write or review a page's search description (meta description) and SEO title. Load for the SEO preset or whenever someone asks how a page should appear in Google results.
license: MIT
metadata:
  source: kostja94/marketing-skills@meta-description 2.0.0 (MIT), adapted for the website assistant
---

# Search description and title

The description is a candidate for the snippet under the page's link in search results, not a guarantee of what Google shows. The assistant cannot save search details (they go live as soon as they are saved), so reply with suggestions for the person to paste into the page's SEO panel.

## Inputs

Read the page with content_get first. Use only facts the page itself states. Look at a sibling or two (content_list in the same collection) so the description does not read like theirs.

## Rules

- Write an accurate, useful summary or pitch for the specific page.
- Lead with information that distinguishes this page from sibling pages.
- Use query-relevant language naturally, without a keyword list.
- Length is a warning, not a hard gate. Google has no fixed meta-description length limit and truncates snippets as needed for the device and result context.
- A description may exceed traditional character guidance when it remains concise and useful. Flag descriptions too short to explain value or too long because of filler, repetition, or boilerplate.
- Use a CTA only when it suits the page task. Do not force marketing CTAs into legal, documentation, status, or informational pages.
- Include price, author, date, availability, or compatibility only when present and current on the page.
- Apply the **Swap Test**: if a description can move unchanged to a sibling page, it is not specific enough.
- Localize from the target market's query language and intent; do not translate and truncate.
- Google primarily creates snippets from page content and may show different text for different queries. Ensure the H2/body can substantiate the description's promise.
- Do not claim a fixed CTR, ranking, or traffic increase. A meta description is not a direct ranking control.

## Output

- Recommended description and a non-binding length warning when useful.
- Brief rationale tied to intent and page-specific facts.
- Body-coverage warning if the page cannot substantiate the proposed description.
- Sibling duplication or cannibalization warning when applicable; do not restructure pages.

## Title

- Under 60 characters, the page's subject first, then the business name when it fits.
- No keyword lists, no all caps.
