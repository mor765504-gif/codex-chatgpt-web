import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createContext, runInContext } from "node:vm";
import { captureChatGptAssistantImages, completedImageTurn, imageMimeFromBytes, persistChatGptImagePayloads } from "../src/adapters/chatgpt-web/image-output";

// 1x1 PNG fixture from test bytes only; declared dimensions are synthetic because the
// persistence API only authenticates payload format, not content dimensions.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5LdlcAAAAASUVORK5CYII=", "base64");
const pngPayload = { base64: png.toString("base64"), width: 1672, height: 941 };

function temporary(): {dir:string; cleanup:()=>void} {
  const dir = mkdtempSync(join(tmpdir(), "asli-image-bridge-"));
  return {dir, cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}

test("valid image-only turn needs completion and a finished image", () => {
  assert.equal(completedImageTurn({responsePresent:true,running:false,completionActionVisible:true,imageOutputReady:true}),true);
  assert.equal(completedImageTurn({responsePresent:true,running:true,completionActionVisible:true,imageOutputReady:true}),false);
  assert.equal(completedImageTurn({responsePresent:true,running:false,completionActionVisible:true,imageOutputReady:false}),false);
  assert.equal(completedImageTurn({responsePresent:false,running:false,completionActionVisible:true,imageOutputReady:true}),false);
});

test("persists and validates one artifact and an atomic manifest", () => {
  const t=temporary();
  try {
    const arts=persistChatGptImagePayloads("asli-F0553-0001",[pngPayload],{outputDir:t.dir});
    assert.equal(arts.length,1);
    assert.equal(arts[0].width,1672);
    assert.ok(arts[0].path.endsWith(".png"));
    assert.deepEqual(readFileSync(arts[0].path),png);
    assert.equal(readdirSync(t.dir).length,2);
    assert.equal(JSON.parse(readFileSync(join(t.dir,"asli-F0553-0001.images.json"),"utf8")).artifacts[0].sha256,arts[0].sha256);
    assert.deepEqual(persistChatGptImagePayloads("asli-F0553-0001",[pngPayload],{outputDir:t.dir}),arts);
  } finally {t.cleanup();}
});

test("rejects empty, invalid and small payloads without claiming success", () => {
  const t=temporary();
  try {
    assert.throws(()=>persistChatGptImagePayloads("asli-F0553-0001",[],{outputDir:t.dir}),/image_output_missing/);
    assert.throws(()=>persistChatGptImagePayloads("asli-F0553-0001",[{...pngPayload,width:128}],{outputDir:t.dir}),/image_output_too_small/);
    assert.throws(()=>persistChatGptImagePayloads("asli-F0553-0001",[{...pngPayload,base64:Buffer.from("not a png image".repeat(5)).toString("base64")}],{outputDir:t.dir}),/image_output_invalid_payload_magic/);
    assert.throws(()=>persistChatGptImagePayloads("../../evil",[pngPayload],{outputDir:t.dir}),/image_output_invalid_turn_id/);
    assert.deepEqual(readdirSync(t.dir),[]);
  } finally {t.cleanup();}
});

test("replays are idempotent and distinct bytes refuse overwrite", () => {
  const t=temporary();
  try {
    persistChatGptImagePayloads("asli-F0553-0001",[pngPayload],{outputDir:t.dir});
    const changed = Buffer.from(png); changed[changed.length-8] ^= 1;
    assert.throws(()=>persistChatGptImagePayloads("asli-F0553-0001",[{...pngPayload,base64:changed.toString("base64")}],{outputDir:t.dir}),/image_output_replay_conflict/);
  } finally {t.cleanup();}
});

test("recognizes PNG magic",()=>assert.equal(imageMimeFromBytes(png),"image/png"));

// Execute production page callbacks against a DOM, stubbing only resource delivery.
// All sizes are synthetic; this proves capture wiring, not live image generation/QC.
function imageTurn(html: string, fetchFails = false) {
  const { createWindow } = require("@mixmark-io/domino") as {createWindow(html:string):{document:Document}};
  const window = createWindow(`<article id="old" data-message-author-role="assistant"><img></article><article id="current">${html}</article>`);
  const root = window.document.getElementById("current")!;
  const list = root.querySelectorAll("img");
  Object.defineProperty(Object.getPrototypeOf(list), Symbol.iterator, {
    configurable: true, value: Array.prototype[Symbol.iterator],
  });
  for (const [index, img] of Array.from(list).entries()) {
    Object.defineProperties(img, {
      complete: { value: !img.hasAttribute("data-loading") },
      naturalWidth: { value: Number(img.getAttribute("width") || 1672) },
      naturalHeight: { value: Number(img.getAttribute("height") || 941) },
      currentSrc: { value: img.getAttribute("data-source") || `https://private.example.test/image-${index}?secret=never-log` },
    });
  }
  const context = createContext({
    document: window.document, getComputedStyle: (el: HTMLElement) => el.style,
    fetch: async () => { if (fetchFails) throw new Error("private-url-never-log"); return {ok:true, blob:async()=>({size:png.length})}; },
    FileReader: class {
      result = `data:image/png;base64,${png.toString("base64")}`;
      onload?: () => void;
      readAsDataURL() { this.onload?.(); }
    },
  });
  return {
    evaluate: async (callback: Function, selection: unknown) =>
      JSON.parse(JSON.stringify(await runInContext(`(${callback.toString()})`, context)(root, selection))),
  } as never;
}

test("observed failure UI without image is provider failure before any file write", async () => {
  const t = temporary();
  try {
    await assert.rejects(captureChatGptAssistantImages(imageTurn('<div data-message-author-role="assistant"><div role="status">Image generation failed</div><div class="markdown">The tool treated this as edit.</div></div>'), "asli-F0489-0001", {outputDir:t.dir}), (error: any) => {
      assert.equal(error.code, "image_output_provider_failed");
      assert.equal(error.observation.failureUiVisible, true);
      assert.equal(error.observation.candidateCount, 0);
      assert.equal(error.observation.readyCount, 0);
      assert.ok(!error.message.includes("treated this as edit"));
      return true;
    });
    assert.deepEqual(readdirSync(t.dir), []);
  } finally { t.cleanup(); }
});

test("completed text without image is distinct from failure UI; model quotes are not UI", async () => {
  const t = temporary();
  try {
    for (const html of [
      '<div data-message-author-role="assistant"><div class="markdown">Image generation failed</div></div>',
      '<div data-user-message-bubble><div role="status">Image generation failed</div></div><div data-message-author-role="assistant">No image.</div>',
      '<div data-message-author-role="assistant"><div role="status" hidden>Image generation failed</div>No image.</div>',
    ]) {
      await assert.rejects(captureChatGptAssistantImages(imageTurn(html), "asli-F0489-0002", {outputDir:t.dir}), (error: any) => {
        assert.equal(error.code, "image_output_completed_without_image");
        assert.equal(error.observation.failureUiVisible, false);
        return true;
      });
    }
    assert.deepEqual(readdirSync(t.dir), []);
  } finally { t.cleanup(); }
});

test("captures current generated gallery output while ignoring submitted and quoted old images", async () => {
  const t = temporary();
  try {
    const artifacts = await captureChatGptAssistantImages(imageTurn('<div data-user-message-bubble><img width="2048" height="2048"></div><div data-message-author-role="assistant"><div class="markdown"><img width="2048" height="2048"></div><div data-testid="generated-image-gallery"><img></div></div>'), "asli-F0489-0003", {outputDir:t.dir});
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0]!.width, 1672);
    assert.deepEqual(readFileSync(artifacts[0]!.path), png);
  } finally { t.cleanup(); }
});

test("reference-only and hidden gallery images are never acknowledged as new output", async () => {
  const t = temporary();
  try {
    for (const html of [
      '<div data-user-message-bubble><div data-testid="generated-image-gallery"><img></div></div>',
      '<div data-user-message-bubble><img data-source="https://private.example.test/old"></div><div data-message-author-role="assistant"><div data-testid="generated-image-gallery"><img data-source="https://private.example.test/old"></div></div>',
      '<div data-message-author-role="assistant"><blockquote><img></blockquote><div class="markdown"><img></div></div>',
      '<div data-message-author-role="assistant" hidden><div data-testid="generated-image-gallery"><img></div></div>',
    ]) await assert.rejects(captureChatGptAssistantImages(imageTurn(html), "asli-F0489-0004", {outputDir:t.dir}), (error: any) => {
      assert.equal(error.code, "image_output_completed_without_image");
      assert.equal(error.observation.readyCount, 0);
      return true;
    });
    assert.deepEqual(readdirSync(t.dir), []);
  } finally { t.cleanup(); }
});

test("image present but loading or unreadable yields capture failure with safe dimensions", async () => {
  const t = temporary();
  try {
    for (const loading of [true, false]) {
      await assert.rejects(captureChatGptAssistantImages(imageTurn(`<div data-message-author-role="assistant"><div data-testid="generated-image-preview"><img ${loading ? 'data-loading' : ''}></div></div>`, !loading), "asli-F0489-0005", {outputDir:t.dir}), (error: any) => {
        assert.equal(error.code, "image_output_capture_failed");
        assert.deepEqual(error.observation.images, [{complete:!loading,width:1672,height:941}]);
        assert.equal(error.observation.candidateCount, 1);
        assert.equal(error.observation.readyCount, loading ? 0 : 1);
        assert.ok(!error.message.includes("private.example"));
        assert.ok(!error.message.includes("private-url"));
        return true;
      });
    }
    assert.deepEqual(readdirSync(t.dir), []);
  } finally { t.cleanup(); }
});
