/**
 * `describe_photo`: the one tool the assistant runs itself. It reads the image
 * bytes through the plugin's media access and asks the model to look at them,
 * so the main loop stays text-only and only alt-text jobs pay for vision.
 */
import { chat, toolDefinition } from "@tanstack/ai";
import type { AnyServerTool, AnyTextAdapter } from "@tanstack/ai";
import { Option, Schema } from "effect";

/** Larger images are skipped rather than sent; Workers AI caps request size. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export interface Photo {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

const decodeArgs = Schema.decodeUnknownOption(
  Schema.Struct({ id: Schema.String })
);

export type ReadPhoto = (mediaId: string) => Promise<Photo | null>;

const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

export const describePhotoTool = (
  readPhoto: ReadPhoto,
  adapter: AnyTextAdapter
): AnyServerTool =>
  toolDefinition({
    description:
      "Look at a photo from the media library and describe what it shows, for writing alt text.",
    inputSchema: {
      properties: { id: { description: "Media item ID", type: "string" } },
      required: ["id"],
      type: "object",
    },
    name: "describe_photo",
  }).server(async (raw) => {
    const id = Option.match(decodeArgs(raw), {
      onNone: () => "",
      onSome: (args) => args.id,
    });
    const photo = await readPhoto(id);
    if (photo === null) {
      return `No photo found with id ${id}.`;
    }
    if (photo.bytes.byteLength > MAX_PHOTO_BYTES) {
      return "This photo is too large to look at; skip it.";
    }
    const { text } = await chat({
      adapter,
      messages: [
        {
          content: [
            {
              content:
                "Describe this photo in one factual sentence for a website's alt text. Name what is visible (building type, room, work in progress). No opinions.",
              type: "text",
            },
            {
              source: {
                mimeType: photo.mimeType,
                type: "data",
                value: base64(photo.bytes),
              },
              type: "image",
            },
          ],
          role: "user",
        },
      ],
      // One factual sentence needs no deliberation; thinking is billed as output.
      reasoning: "low",
      stream: false,
    });
    return text.trim() || "No description.";
  });
