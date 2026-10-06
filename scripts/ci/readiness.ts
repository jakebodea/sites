import { setTimeout } from "node:timers/promises";

const defaults = { attempts: 30, intervalMs: 5000, timeoutMs: 5000 };

export const waitForDeployment = async (
  origin: string,
  options = defaults
): Promise<void> => {
  let detail = "no response";
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      const response = await fetch(origin, {
        method: "HEAD",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (response.status === 200) {
        return;
      }
      detail = `HTTP ${response.status}`;
    } catch (error) {
      detail = String(error);
    }
    if (attempt + 1 < options.attempts) {
      await setTimeout(options.intervalMs);
    }
  }
  throw new Error(`${origin}: deployment did not become reachable: ${detail}`);
};
