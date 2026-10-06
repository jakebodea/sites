/**
 * Headlines are plain strings in `src/content`; wrapping words in asterisks (`I build
 * *considered* websites`) sets them in the italic serif accent. A lone or
 * unmatched asterisk renders as typed.
 */
export interface Segment {
  readonly text: string;
  readonly emphasis: boolean;
}

const EMPHASIS = /\*(?<word>[^*\n]+)\*/gu;

export const emphasisSegments = (headline: string): Segment[] => {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of headline.matchAll(EMPHASIS)) {
    const word = match.groups?.word ?? "";
    if (match.index > cursor) {
      segments.push({
        emphasis: false,
        text: headline.slice(cursor, match.index),
      });
    }
    segments.push({ emphasis: true, text: word });
    cursor = match.index + match[0].length;
  }
  if (cursor < headline.length) {
    segments.push({ emphasis: false, text: headline.slice(cursor) });
  }
  return segments;
};
