import { mock } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import type { BrowserTurn } from "../../../src/adapters/chatgpt-web/browser-worker";

// Keep config loading, validation, scheduling and result serialization real.
// Only replace the external browser boundary in CLI subprocesses.
mock.module("../../../src/adapters/chatgpt-web/browser-worker", () => ({
  ChatGptBrowserWorker: {
    forProvider: () => {
      writeFileSync(process.env.PIPELINE_TEST_WORKER_CREATED!, "created");
      return {
        run: async (turn: BrowserTurn) => {
          appendFileSync(process.env.PIPELINE_TEST_TURNS!, JSON.stringify({
            traceId: turn.traceId,
            modelId: turn.modelId,
            reasoning: turn.reasoning,
          }) + "\n");
          if (turn.traceId.startsWith("fail_")) throw new Error("test browser failure");
          return "test browser result";
        },
      };
    },
  },
}));
