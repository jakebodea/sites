/** Shapes of the copy in `src/content`, one per section component. */
export interface Link {
  readonly href: string;
  readonly label: string;
}

export interface Hero {
  /** Shown with a green dot; leave out to hide. */
  readonly availability?: string;
  readonly headline: string;
  readonly subheadline?: string;
  readonly primary?: Link;
  readonly secondary?: Link;
}

export interface ListItem {
  readonly title: string;
  readonly body: string;
}

/** Services (a two-column list) and process (numbered steps) share this shape. */
export interface ListSection {
  readonly label?: string;
  readonly headline: string;
  readonly intro?: string;
  readonly items: readonly ListItem[];
}

export interface Statement {
  readonly label?: string;
  readonly headline: string;
  readonly body?: string;
  readonly link?: Link;
}

export interface FaqSection {
  readonly label?: string;
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
