import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { command } from "./command.ts";

describe(command, () => {
  it("allows independent processes to overlap", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ci-command-"));
    const script = `
      await Bun.write(process.argv[1], "ready");
      const deadline = Date.now() + 3000;
      while (!(await Bun.file(process.argv[2]).exists())) {
        if (Date.now() > deadline) process.exit(1);
        await Bun.sleep(10);
      }
    `;
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");
    try {
      await expect(
        Promise.all([
          command("bun", ["-e", script, first, second], directory),
          command("bun", ["-e", script, second, first], directory),
        ])
      ).resolves.toStrictEqual([undefined, undefined]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("rejects failed and missing commands", async () => {
    await expect(
      command("bun", ["-e", "process.exit(3)"], process.cwd())
    ).rejects.toThrow("exited with 3");
    await expect(
      command("missing-ci-command", [], process.cwd())
    ).rejects.toThrow("ENOENT");
  });
});
