import { spawn } from "node:child_process";
import { once } from "node:events";

import { Schema } from "effect";

export const command = async (
  executable: string,
  args: readonly string[],
  cwd: string
) => {
  const child = spawn(executable, args, { cwd, stdio: "inherit" });
  const [status] = Schema.decodeUnknownSync(
    Schema.Tuple([Schema.NullOr(Schema.Number), Schema.NullOr(Schema.String)])
  )(await once(child, "close"));
  if (status !== 0) {
    throw new Error(`${executable} exited with ${status}`);
  }
};
