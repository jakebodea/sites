/** Header and footer links. Every page here must also be listed in `src/lib/routes.ts`. */
import type { Link } from "./types.ts";

/** Home-page sections use `/#id` so they work from every page; the root `scroll-behavior` animates them. */
export const primaryNav: readonly Link[] = [
  { href: "/#work", label: "Services" },
  { href: "/#process", label: "Process" },
  { href: "/#faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

export const footerNav: readonly Link[] = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Start a project" },
  { href: "/privacy", label: "Privacy" },
];
