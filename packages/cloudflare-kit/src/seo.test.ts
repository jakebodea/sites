import { describe, expect, it } from "vitest";

import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  breadcrumbJsonLd,
  documentTitle,
  metaDescription,
} from "./seo.ts";

const CONTEXT =
  "Electrical construction by Access Electric in Southern California.";

describe(documentTitle, () => {
  it("keeps the site suffix when it fits", () => {
    expect(documentTitle("Contact", "Access Electric")).toBe(
      "Contact | Access Electric"
    );
  });

  it("drops the suffix for long page names", () => {
    const page = "ArtCenter College of Design Hyundai and Kia Innovation Lab";
    expect(documentTitle(page, "Access Electric")).toBe(page);
  });
});

describe(metaDescription, () => {
  it("passes a description that fits through, whitespace collapsed", () => {
    const text =
      "A new  three-story\nscience building with lab power and fire alarm.";
    expect(metaDescription(text, CONTEXT)).toBe(
      "A new three-story science building with lab power and fire alarm."
    );
  });

  it("falls back to the context when empty", () => {
    expect(metaDescription(null, CONTEXT)).toBe(CONTEXT);
  });

  it("extends a short description with the context", () => {
    expect(metaDescription("Caltech Linde Hall renovation", CONTEXT)).toBe(
      `Caltech Linde Hall renovation. ${CONTEXT}`
    );
  });

  it("keeps whole sentences when trimming", () => {
    const first =
      "Full electrical for a 90,000 square foot community center with a gym.";
    const text = `${first} ${"Second sentence that is deliberately long so that it overflows the remaining description budget. ".repeat(2)}`;
    expect(metaDescription(text, CONTEXT)).toBe(first);
  });

  it("cuts at a word with an ellipsis when no sentence fits", () => {
    const text = "word ".repeat(80);
    const result = metaDescription(text, CONTEXT);
    expect(result.endsWith("word…")).toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(DESCRIPTION_MAX + 1);
    expect(result.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
  });
});

describe(breadcrumbJsonLd, () => {
  it("numbers absolute items from 1", () => {
    expect(
      breadcrumbJsonLd(
        [
          { label: "Portfolio", path: "/portfolio" },
          { label: "K-12", path: "/portfolio/k-12-schools" },
        ],
        "https://accesselectric.com"
      )
    ).toStrictEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: "https://accesselectric.com/portfolio",
          name: "Portfolio",
          position: 1,
        },
        {
          "@type": "ListItem",
          item: "https://accesselectric.com/portfolio/k-12-schools",
          name: "K-12",
          position: 2,
        },
      ],
    });
  });
});
