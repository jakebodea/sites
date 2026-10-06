/** Copy for the smaller pages: titles, intros, and body text. */
import type { CallToAction, Prose } from "./types.ts";

export const about = {
  closing: {
    headline: "Let's build something *good.*",
    link: { href: "/contact", label: "Start a project" },
  } satisfies CallToAction,
  description:
    "Jake Bodea runs JBO Labs, a one-person studio building websites, web apps, and internal tools for small businesses and founders.",
  intro:
    "A small studio with a simple idea: do fewer projects, and do them very well.",
  // Placeholder bio: Jake to replace with his own words.
  prose: [
    {
      paragraph:
        "Hi, I am Jake. I run JBO Labs, a one-person studio that builds websites and web software for small businesses, founders, and teams.",
    },
    {
      paragraph:
        "I care about the details most people never notice: pages that load instantly, forms that work on the first try, and sites that stay easy to change long after launch.",
    },
    {
      paragraph:
        "I work with a small number of clients at a time, so every project gets my full attention.",
    },
    { heading: "How I like to work" },
    {
      paragraph:
        "Plain language, fixed prices, and no surprises. You always know what is being built, what it costs, and when it will be done.",
    },
  ] satisfies Prose,
  title: "About",
};

export const contact = {
  description:
    "Tell Jake about your website, web app, or consulting project. A few details up front make the first conversation far more useful.",
  intro:
    "Tell me about what you are building. A few details now make our first conversation far more useful.",
  nextSteps: [
    "I read your note and reply within two business days.",
    "We have a short intro call to talk it through.",
    "You get a clear proposal with a fixed price.",
  ],
  title: "Start a project",
};

export const privacy = {
  description:
    "How the JBO Labs site handles cookieless analytics and the details you send through the intake form.",
  intro: "How this site handles analytics and the information you send.",
  prose: [
    {
      paragraph:
        "This site uses anonymous, cookieless analytics to understand which pages are useful. It does not set cookies, store identifiers in your browser, or build a profile of you.",
    },
    {
      paragraph:
        "When you send the intake form, I store what you enter (your name, email, company, website, project details, budget, timeline, and who referred you) so I can reply. I do not sell or share this information.",
    },
    {
      paragraph:
        "The form is protected by Cloudflare Turnstile, which checks that a person, not a bot, is submitting it.",
    },
    {
      paragraph:
        "To ask about or delete information you have sent, use the intake form and mention this page.",
    },
  ] satisfies Prose,
  title: "Privacy",
};
