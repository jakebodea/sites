/**
 * Home page copy. Edit freely: headlines set `*words in asterisks*` in the
 * italic serif accent, and every section can be removed by deleting it from
 * `src/pages/index.astro`.
 */
import type {
  CallToAction,
  FaqSection,
  Hero,
  Link,
  ListSection,
  Statement,
} from "./types.ts";

const startProject: Link = { href: "/contact", label: "Start a project" };

export const hero: Hero = {
  availability: "Taking on new projects",
  headline: "Websites and software, *made with care.*",
  primary: startProject,
  secondary: { href: "#process", label: "How I work" },
  subheadline:
    "JBO Labs is the independent studio of Jake Bodea. I design, build, and look after websites and web apps for small teams who want them done properly.",
};

export const services: ListSection = {
  headline: "One person, *start to finish.*",
  intro:
    "You work directly with the person building your project. No hand-offs, no account managers.",
  items: [
    {
      body: "Fast, accessible sites you can update easily, with search, analytics, and hosting taken care of.",
      title: "Marketing websites",
    },
    {
      body: "Customer portals, booking flows, dashboards, and the small internal tools that quietly remove busywork.",
      title: "Web apps and tools",
    },
    {
      body: "A second opinion on your stack, an audit of what you have, or a clear plan before you hire.",
      title: "Technical consulting",
    },
    {
      body: "Updates, monitoring, and backups, plus a real person to call when something needs to change.",
      title: "Care and hosting",
    },
  ],
  label: "What I do",
};

export const process: ListSection = {
  headline: "A simple, *unhurried* process.",
  items: [
    {
      body: "A short conversation about your goals, constraints, and whether I am the right fit.",
      title: "Intro call",
    },
    {
      body: "A clear scope, timeline, and fixed price, so you know the cost before work begins.",
      title: "Proposal",
    },
    {
      body: "Work happens in small, visible steps, with a live preview link you can check any time.",
      title: "Build",
    },
    {
      body: "We launch together, and I stay on hand for changes, questions, and support.",
      title: "Launch and care",
    },
  ],
  label: "How it works",
};

export const referred: Statement = {
  body: "If someone sent you my way, mention their name in the form. I like to thank the people who make introductions.",
  headline: "Most of my work comes from people I have *already worked with.*",
  label: "Referred here?",
  link: startProject,
};

export const faq: FaqSection = {
  headline: "Good to *know.*",
  items: [
    {
      answer:
        "Every project gets a fixed quote after the intro call, based on scope. The intake form asks for a rough budget so I can suggest what fits.",
      question: "What does a project cost?",
    },
    {
      answer:
        "Most websites take a few weeks from kickoff to launch. Larger apps are planned in phases, so something useful ships early.",
      question: "How long does it take?",
    },
    {
      answer:
        "Yes. I can set your site up so you can change text and photos yourself, or keep handling updates for you, whichever you prefer.",
      question: "Can I update the site myself?",
    },
    {
      answer:
        "Yes. I work with clients anywhere, over video calls and a shared preview link.",
      question: "Do you work remotely?",
    },
  ],
  label: "Questions",
};

export const closing: CallToAction = {
  body: "Tell me a little about it. I read every message and reply personally.",
  headline: "Have something *in mind?*",
  link: startProject,
};
