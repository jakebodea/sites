/** Shapes of the copy in `src/content`, one per section component. */
export interface Link {
  readonly href: string;
  readonly label: string;
}

/** Icons the example site can draw; keep in step with `example-site.astro`. */
export const EXAMPLE_ICONS = [
  "fish",
  "wrench",
  "flower",
  "croissant",
  "scissors",
] as const;
export type ExampleIcon = (typeof EXAMPLE_ICONS)[number];

/** One made-up business the hero's example site can switch to. */
export interface ExampleBusiness {
  readonly kind: string;
  readonly name: string;
  readonly headline: string;
  readonly body: string;
  readonly cta: string;
  /** OKLCH hue of the business's brand colour. */
  readonly hue: number;
  readonly icon: ExampleIcon;
}

/** The hero's editable demo site: default copy plus brand swatches. */
export interface HeroExample {
  /** Kept for content authors; the live editor no longer shows a business picker. */
  readonly prompt: string;
  readonly businesses: readonly ExampleBusiness[];
}

export interface Hero {
  readonly headline: string;
  readonly example?: HeroExample;
  readonly subheadline?: string;
  readonly primary?: Link;
  readonly secondary?: Link;
}

export interface Pillar {
  readonly title: string;
  readonly body: string;
}

/** The three promises under the hero, each with its own small illustration. */
export interface Pillars {
  readonly speed: Pillar;
  readonly editing: Pillar;
  readonly analytics: Pillar;
}

export interface ListItem {
  readonly title: string;
  readonly body: string;
}

/** Services (a two-by-two grid) and process (a timeline) share this shape. */
export interface ListSection {
  readonly headline: string;
  readonly intro?: string;
  readonly items: readonly ListItem[];
}

export interface FaqSection {
  readonly headline: string;
  readonly items: readonly {
    readonly question: string;
    readonly answer: string;
  }[];
}

export interface CallToAction {
  readonly headline: string;
  readonly body?: string;
  readonly link?: Link;
}

/** A page of plain prose: paragraphs, with optional subheadings. */
export type Prose = readonly (
  | { readonly heading: string }
  | { readonly paragraph: string }
)[];
