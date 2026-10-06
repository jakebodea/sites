import { describe, expect, it } from "vitest";

import { postHogMessage } from "./analytics.ts";

describe(postHogMessage, () => {
  it("joins the visitor's session when the browser sent its ids", () => {
    expect(
      postHogMessage(
        {
          distinctId: "visitor-1",
          event: "lead submitted",
          properties: { source_path: "/contact" },
          sessionId: "session-1",
        },
        "fallback"
      )
    ).toStrictEqual({
      distinctId: "visitor-1",
      event: "lead submitted",
      properties: {
        $process_person_profile: true,
        $session_id: "session-1",
        source_path: "/contact",
      },
    });
  });

  it("stays anonymous without a browser id", () => {
    const message = postHogMessage({ event: "lead submitted" }, "fallback");
    expect(message.distinctId).toBe("fallback");
    expect(message.properties.$process_person_profile).toBeFalsy();
  });
});
