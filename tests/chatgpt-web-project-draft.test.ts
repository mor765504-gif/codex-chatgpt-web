import { afterAll, expect, test } from "bun:test";
import { createDocument } from "@mixmark-io/domino";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ChatGptBrowserWorker, CHATGPT_COMPOSER_DOCUMENT_END_KEY, CHATGPT_COMPOSER_SELECT_ALL_KEY, type BrowserTurn } from "../src/adapters/chatgpt-web/browser-worker";
import { CHATGPT_WEB_MODEL_ID, resolveChatGptWebModelMode } from "../src/adapters/chatgpt-web/model";

const diagnostics = mkdtempSync(join(tmpdir(), "composer-draft-test-"));
afterAll(() => rmSync(diagnostics, { recursive: true, force: true }));
const projectUrl = "https://chatgpt.com/g/g-p-draft-fixture/project";
const capabilities = { localToolsEnabled: true, solAvailable: true, extraHighAvailable: true, proAvailable: true };
const prototype = ChatGptBrowserWorker.prototype as any;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// A DOM-backed editor with native action receipts. fill intentionally does not reset a
// persisted draft, reproducing the Saved Chats/Lexical failure rather than masking it.
function fixture(options: { text?: string; attachments?: number; inputFiles?: number; stuckText?: boolean; stuckAttachment?: boolean; project?: string | null; saved?: boolean } = {}) {
  const document = createDocument('<form><div id="prompt-textarea" contenteditable="true"></div></form>');
  const element = document.getElementById("prompt-textarea")!;
  const form = document.querySelector("form")!;
  element.textContent = options.text ?? "";
  for (let index = 0; index < (options.attachments ?? 0); index += 1) {
    const tile = document.createElement("div");
    tile.setAttribute("role", "group");
    tile.setAttribute("aria-label", `old-${index}.png`);
    form.appendChild(tile);
  }
  const actions: string[] = [];
  let inputFiles = options.inputFiles ?? 0;
  if (inputFiles) {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    Object.defineProperty(input, "files", { get: () => ({ length: inputFiles }) });
    form.appendChild(input);
  }
  let selected = false;
  let selectedAll = false;
  const removals: any = {
    filter: () => removals,
    count: async () => form.querySelectorAll('[role="group"]').length,
    first: () => ({ click: async () => {
      actions.push("remove");
      if (!options.stuckAttachment) form.querySelector('[role="group"]')?.remove();
    } }),
  };
  const composer = {
    evaluate: async (fn: any, argument: any) => fn(element, argument),
    focus: async () => {},
    fill: async () => { actions.push("fill"); },
    press: async (key: string) => {
      actions.push(key);
      if (key === CHATGPT_COMPOSER_SELECT_ALL_KEY) selectedAll = true;
      if (key === "Backspace" && selectedAll && !options.stuckText) {
        element.textContent = "";
        selected = false;
      }
    },
    locator: () => ({ getByRole: () => removals, locator: () => ({
      count: async () => 1,
      nth: () => ({ setInputFiles: async () => { actions.push("reset-files"); inputFiles = 0; } }),
    }) }),
  };
  const absent: any = { filter: () => absent, last: () => absent, isVisible: async () => false };
  const page = Object.assign(new EventEmitter(), {
    url: () => options.project ?? (options.project === null ? "https://chatgpt.com/" : projectUrl),
    isClosed: () => false,
    evaluate: async () => ({}),
    locator: (selector: string) => selector === "body" ? { press: async () => {} } : absent,
  });
  const worker = Object.assign(Object.create(prototype), {
    config: { appName: "Codex Native2", useSavedChats: options.saved ?? true,
      ...(options.project === null ? {} : { chatgptProjectUrl: options.project ?? projectUrl }),
      browserDiagnosticsPath: diagnostics },
    activeComposer: async () => composer,
    connectorIsSelected: async () => selected,
    selectConnector: async () => { selected = true; actions.push("connector"); return composer; },
    insertPromptText: async (_page: unknown, text: string) => {
      actions.push("insert");
      element.appendChild(document.createTextNode(text));
    },
  });
  const sent: string[] = [];
  const observing = deferred();
  const finish = deferred();
  const finalObservation = new Error("fixture stopped at response observation");
  Object.assign(worker, {
    runStage: async (_trace: string, _stage: string, _budget: number, action: any) => action(new AbortController().signal),
    prepareChatSurface: async () => { actions.push("navigate"); },
    selectModelAndEffort: async () => resolveChatGptWebModelMode(CHATGPT_WEB_MODEL_ID, "high", capabilities),
    captureSubmissionBaseline: async (_page: unknown, text: string) => ({ submittedText: text }),
    attachFiles: async () => {},
    sendAttachedPrompt: async (_page: unknown, baseline: { submittedText: string }) => {
      const text = await worker.attachedPromptText(page);
      expect(text).toBe(baseline.submittedText);
      expect(form.querySelectorAll('[role="group"]')).toHaveLength(0);
      sent.push(text);
      element.textContent = "";
      selected = false;
      return "user_turn";
    },
    waitForNewAssistantTurn: async () => {
      observing.resolve();
      await finish.promise;
      throw finalObservation;
    },
  });
  const run = (text: string, signal?: AbortSignal, multipart = false) => worker.runBrowserTurn({
    traceId: `composer_draft_${text.replace(/\W/g, "")}`, modelId: CHATGPT_WEB_MODEL_ID, reasoning: "high",
    capabilities, abortSignal: signal, onTextDelta: () => {},
    prepare: async () => ({ text, images: [],
      ...(multipart ? { multipart: { parts: ['{"part":1}', '{"part":2}'], commit: text } } : {}),
      release: () => {} }),
  } satisfies BrowserTurn, undefined, page).catch((error: unknown) => error);
  return { worker, page, element, actions, sent, run, observing, finish, finalObservation };
}

test("clears restored Project text with native keys before selecting a connector and filling", async () => {
  const ui = fixture({ text: "foreign restored draft" });
  await ui.worker.attachPrompt(ui.page, "own prompt", true);
  expect(await ui.worker.attachedPromptText(ui.page)).toBe("own prompt");
  expect(ui.actions).toEqual([CHATGPT_COMPOSER_SELECT_ALL_KEY, "Backspace", "connector", CHATGPT_COMPOSER_DOCUMENT_END_KEY, "insert"]);
});

test("Saved Chats without a Project clear restored text before selecting a connector and filling", async () => {
  const ui = fixture({ project: null, text: "foreign restored draft" });
  await ui.worker.attachPrompt(ui.page, "own prompt", true);
  expect(await ui.worker.attachedPromptText(ui.page)).toBe("own prompt");
  expect(ui.actions.indexOf("Backspace")).toBeLessThan(ui.actions.indexOf("connector"));
});

test("clears restored attachments, including an attachment-only draft, before inserting", async () => {
  const ui = fixture({ attachments: 2 });
  await ui.worker.attachPrompt(ui.page, "new request", true);
  expect(ui.actions.filter(action => action === "remove")).toHaveLength(2);
  expect(ui.actions.lastIndexOf("remove")).toBeLessThan(ui.actions.indexOf("insert"));
  expect(await ui.worker.attachedPromptText(ui.page)).toBe("new request");
});

test("resets a restored native file input before inserting even when it has no attachment tile", async () => {
  const ui = fixture({ inputFiles: 1 });
  await ui.worker.attachPrompt(ui.page, "new request", true);
  expect(ui.actions.indexOf("reset-files")).toBeGreaterThan(-1);
  expect(ui.actions.indexOf("reset-files")).toBeLessThan(ui.actions.indexOf("insert"));
  expect(await ui.worker.attachedPromptText(ui.page)).toBe("new request");
});

test.each([{ stuckText: true, text: "foreign draft" }, { stuckAttachment: true, attachments: 1 }])(
  "fails closed before any insert or send when restored draft cleanup fails (%j)", async options => {
    const ui = fixture(options);
    const result = await ui.run("must never send");
    expect(result).toMatchObject({ code: "composer_draft_cleanup_failed", retryable: false });
    expect((result as Error).message).toContain("not submitted");
    expect(ui.actions).not.toContain("insert");
    expect(ui.sent).toEqual([]);
  },
);

test.each([
  { name: "same Project URL aliases", firstProject: projectUrl, secondProject: projectUrl.replace(/\/project$/, "/") },
  { name: "Saved Chats without Projects", firstProject: null, secondProject: null },
  { name: "different Projects", firstProject: projectUrl, secondProject: "https://chatgpt.com/g/g-p-independent/project" },
  { name: "Project and non-Project Saved Chats", firstProject: projectUrl, secondProject: null },
])("$name serialize draft submission, discard a restored sibling draft, then observe concurrently", async ({ firstProject, secondProject }) => {
  const first = fixture({ project: firstProject });
  const second = fixture({ project: secondProject });
  // Both tabs use one persisted draft snapshot, which can lag the first tab's Send.
  // Navigation restores that snapshot, including after Send activation but before acceptance.
  let sharedDraft = "";
  const insert = first.worker.insertPromptText;
  first.worker.insertPromptText = async (...args: unknown[]) => {
    await insert.apply(first.worker, args);
    sharedDraft = first.element.textContent ?? "";
  };
  second.worker.prepareChatSurface = async () => {
    second.actions.push("navigate");
    second.element.textContent = sharedDraft;
  };
  const attached = deferred();
  const allowSend = deferred();
  const sendActivated = deferred();
  const allowAcceptance = deferred();
  const assert = first.worker.assertPromptAttached;
  first.worker.assertPromptAttached = async (...args: unknown[]) => {
    await assert.apply(first.worker, args);
    attached.resolve();
    await allowSend.promise;
  };
  const send = first.worker.sendAttachedPrompt;
  first.worker.sendAttachedPrompt = async (...args: unknown[]) => {
    const evidence = await send.apply(first.worker, args);
    sendActivated.resolve();
    await allowAcceptance.promise;
    return evidence;
  };
  const firstRun = first.run("first prompt");
  await attached.promise;
  const secondRun = second.run("second prompt");
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(second.actions).toEqual([]);
    allowSend.resolve();
    await sendActivated.promise;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(second.actions).toEqual([]);
    allowAcceptance.resolve();
    await Promise.all([first.observing.promise, second.observing.promise]);
    expect(first.sent).toEqual(["first prompt"]);
    expect(second.sent).toEqual(["second prompt"]);
    // Both generation waits are live while neither has completed.
  } finally {
    allowSend.resolve(); allowAcceptance.resolve(); first.finish.resolve(); second.finish.resolve();
    await Promise.all([firstRun, secondRun]);
  }
});

test("a cancelled Project waiter cannot let its successor overtake the draft owner", async () => {
  const first = fixture();
  const cancelled = fixture();
  const third = fixture();
  const attached = deferred();
  const allowSend = deferred();
  const assert = first.worker.assertPromptAttached;
  first.worker.assertPromptAttached = async (...args: unknown[]) => {
    await assert.apply(first.worker, args); attached.resolve(); await allowSend.promise;
  };
  const firstRun = first.run("owner");
  await attached.promise;
  const controller = new AbortController();
  const cancelledRun = cancelled.run("cancelled", controller.signal);
  await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  expect(await cancelledRun).toMatchObject({ name: "AbortError" });
  const thirdRun = third.run("successor");
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(third.actions).toEqual([]);
    allowSend.resolve();
    await third.observing.promise;
    expect(cancelled.sent).toEqual([]);
    expect(third.sent).toEqual(["successor"]);
  } finally {
    allowSend.resolve(); first.finish.resolve(); third.finish.resolve();
    await Promise.all([firstRun, thirdRun]);
  }
});

test("cleanup failure releases the Project lock for a subsequent task", async () => {
  const broken = fixture({ text: "cannot clear", stuckText: true });
  expect(await broken.run("blocked")).toMatchObject({ code: "composer_draft_cleanup_failed" });
  const next = fixture();
  const run = next.run("next task");
  try { await next.observing.promise; expect(next.sent).toEqual(["next task"]); }
  finally { next.finish.resolve(); await run; }
});

test("Temporary Chat can submit while a Saved Chat holds its draft lock", async () => {
  const first = fixture();
  const independent = fixture({ saved: false });
  const attached = deferred();
  const allowSend = deferred();
  const assert = first.worker.assertPromptAttached;
  first.worker.assertPromptAttached = async (...args: unknown[]) => {
    await assert.apply(first.worker, args); attached.resolve(); await allowSend.promise;
  };
  const firstRun = first.run("owner");
  await attached.promise;
  const otherRun = independent.run("independent");
  try {
    await independent.observing.promise;
    expect(first.sent).toEqual([]);
    expect(independent.sent).toEqual(["independent"]);
  } finally {
    allowSend.resolve(); first.finish.resolve(); independent.finish.resolve();
    await Promise.all([firstRun, otherRun]);
  }
});

test("multipart Project submissions release during acknowledgement and reacquire for the final Send", async () => {
  const multipart = fixture();
  const sibling = fixture();
  const acknowledging = deferred();
  const allowAcknowledgement = deferred();
  let observed = 0;
  multipart.worker.waitForNewAssistantTurn = async () => {
    if (++observed === 1) return { identity: "part-1" };
    multipart.observing.resolve(); await multipart.finish.promise; throw multipart.finalObservation;
  };
  multipart.worker.waitForMultipartAcknowledgement = async () => {
    acknowledging.resolve(); await allowAcknowledgement.promise; return { identity: "part-1" };
  };
  const multipartRun = multipart.run("final task", undefined, true);
  await acknowledging.promise;
  const siblingRun = sibling.run("sibling task");
  try {
    await sibling.observing.promise;
    expect(multipart.sent).toHaveLength(1);
    allowAcknowledgement.resolve();
    await multipart.observing.promise;
    expect(multipart.sent).toHaveLength(2);
    expect(sibling.sent).toEqual(["sibling task"]);
  } finally {
    allowAcknowledgement.resolve(); multipart.finish.resolve(); sibling.finish.resolve();
    await Promise.all([multipartRun, siblingRun]);
  }
});

test.each([projectUrl, null])("Temporary Chats preserve their attachment path (project=%s)", async project => {
  const ui = fixture({ saved: false, project });
  ui.worker.ensureEmptyComposer = async () => { throw new Error("unexpected Saved Chat cleanup"); };
  await ui.worker.attachPrompt(ui.page, "temporary prompt", true);
  expect(ui.actions).not.toContain("Backspace");
  expect(await ui.worker.attachedPromptText(ui.page)).toBe("temporary prompt");
});

test.skipIf(!process.env.CHATGPT_DOM_TEST_BROWSER)("native Project cleanup resets text and attachment UI in Chromium", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHATGPT_DOM_TEST_BROWSER, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<form><div id="prompt-textarea" contenteditable="true">restored browser draft</div><div role="group" aria-label="old.png"><button aria-label="Remove file" onclick="this.parentElement.remove()">×</button></div></form>');
    const worker = Object.assign(Object.create(prototype), { config: { appName: "Codex Native2", useSavedChats: true, chatgptProjectUrl: projectUrl } });
    await worker.attachPrompt(page, "own browser prompt\nsecond line", false);
    expect(await worker.attachedPromptText(page)).toBe("own browser prompt\nsecond line");
    expect(await page.getByRole("group").count()).toBe(0);
  } finally { await browser.close(); }
}, 15_000);
