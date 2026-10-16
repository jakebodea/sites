import { describe, expect, it } from "vitest";

import { conversationSession, withSessionAffinity } from "./affinity.ts";

/** env.AI is a platform binding: this fake records the options each run receives. */
const fakeBinding = () => {
  const options: (AiOptions | undefined)[] = [];
  const binding = {
    run: async (
      _model: string,
      _inputs: { readonly messages: readonly string[] },
      runOptions?: AiOptions
    ) => {
      options.push(runOptions);
      await Promise.resolve();
      return new Response("{}");
    },
  };
  return { binding, options };
};

describe(withSessionAffinity, () => {
  it("adds the conversation's affinity header and keeps the adapter's options", async () => {
    const fake = fakeBinding();
    const wrapped = withSessionAffinity(fake.binding, "user-1:msg-1");

    await wrapped.run(
      "@cf/zai-org/glm-5.3-flash",
      { messages: [] },
      {
        gateway: { id: "stage-assistant" },
        returnRawResponse: true,
      }
    );

    expect(fake.options).toStrictEqual([
      {
        extraHeaders: { "x-session-affinity": "user-1:msg-1" },
        gateway: { id: "stage-assistant" },
        returnRawResponse: true,
      },
    ]);
  });
});

describe(conversationSession, () => {
  it("names the editor and the conversation's first message", () => {
    expect(conversationSession("u1", "m1", "thread")).toBe("u1:m1");
    expect(conversationSession(undefined, undefined, "thread")).toBe(
      "editor:thread"
    );
  });
});
