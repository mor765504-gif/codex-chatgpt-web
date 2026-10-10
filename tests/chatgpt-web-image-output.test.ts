import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { completedImageTurn, imageMimeFromBytes, persistChatGptImagePayloads } from "../src/adapters/chatgpt-web/image-output";

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
