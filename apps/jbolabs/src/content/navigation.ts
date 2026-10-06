/** Header and footer links. Every page here must also be listed in `src/lib/routes.ts`. */
import type { Link } from "./types.ts";

export const primaryNav: readonly Link[] = [{ href: "/about", label: "About" }];

export const footerNav: readonly Link[] = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Start a project" },
  { href: "/privacy", label: "Privacy" },
];
