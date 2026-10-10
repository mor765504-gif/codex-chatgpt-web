/**
 * Optional, turn-scoped image artifact capture for Codex Web GPT.
 *
 * This module neither sends ChatGPT prompts nor changes authentication / rate controls.
 * It accepts a locator already bound to the current assistant response, then attempts to
 * persist completed, readable image elements from that response only. It does not claim
 * to support every ChatGPT image renderer or cross-origin asset URL.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Locator } from "playwright-core";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const TASK_ID = /^[A-Za-z0-9_-]{6,128}$/;

export interface ChatGptImageOutputOptions {
  /** Local directory. Keep outside repository and other public locations. */
  outputDir: string;
  maxImages?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface ChatGptImagePayload {
  base64: string;
  width: number;
  height: number;
}

export interface ChatGptImageArtifact {
  path: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  turnId: string;
}

function optionsOf(value: ChatGptImageOutputOptions): Required<ChatGptImageOutputOptions> {
  if (!value.outputDir || typeof value.outputDir !== "string") throw new Error("image_output_invalid_directory");
  const maxImages = value.maxImages ?? 4;
  const minWidth = value.minWidth ?? 512;
  const minHeight = value.minHeight ?? 512;
  if (!Number.isSafeInteger(maxImages) || maxImages < 1 || maxImages > 8) throw new Error("image_output_invalid_count");
  if (!Number.isSafeInteger(minWidth) || minWidth < 1 || minWidth > 8192) throw new Error("image_output_invalid_width");
  if (!Number.isSafeInteger(minHeight) || minHeight < 1 || minHeight > 8192) throw new Error("image_output_invalid_height");
  return { outputDir: resolve(value.outputDir), maxImages, minWidth, minHeight };
}

export function imageMimeFromBytes(data: Uint8Array): ChatGptImageArtifact["mimeType"] {
  if (data.length >= 24 && data[0] === 137 && data[1] === 80 && data[2] === 78
    && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) {
    return "image/png";
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9) {
    return "image/jpeg";
  }
  if (data.length >= 16 && Buffer.from(data.subarray(0, 4)).toString("ascii") === "RIFF"
    && Buffer.from(data.subarray(8, 12)).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  throw new Error("image_output_invalid_payload_magic");
}

/** Persist first, then acknowledge the job. Replays with identical bytes are idempotent. */
export function persistChatGptImagePayloads(
  turnId: string,
  sourcePayloads: ChatGptImagePayload[],
  output: ChatGptImageOutputOptions,
): ChatGptImageArtifact[] {
  if (!TASK_ID.test(turnId)) throw new Error("image_output_invalid_turn_id");
  const cfg = optionsOf(output);
  if (sourcePayloads.length < 1) throw new Error("image_output_missing");
  if (sourcePayloads.length > cfg.maxImages) throw new Error("image_output_too_many");
  const unique = new Set<string>();
  const prepared = sourcePayloads.map((payload, index) => {
    if (!Number.isSafeInteger(payload.width) || !Number.isSafeInteger(payload.height)
      || payload.width < cfg.minWidth || payload.height < cfg.minHeight) {
      throw new Error("image_output_too_small");
    }
    if (typeof payload.base64 !== "string" || payload.base64.length === 0
      || payload.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.base64)) {
      throw new Error("image_output_invalid_base64");
    }
    const bytes = Buffer.from(payload.base64, "base64");
    if (bytes.length < 32 || bytes.length > MAX_IMAGE_BYTES) throw new Error("image_output_invalid_size");
    const mimeType = imageMimeFromBytes(bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (unique.has(sha256)) throw new Error("image_output_duplicate_payload");
    unique.add(sha256);
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "webp";
    const path = join(cfg.outputDir, `${turnId}-${String(index + 1).padStart(2, "0")}.${ext}`);
    return { path, sha256, width: payload.width, height: payload.height,
      bytes: bytes.length, mimeType, turnId, buffer: bytes };
  });
  mkdirSync(cfg.outputDir, { recursive: true, mode: 0o700 });
  const manifestPath = join(cfg.outputDir, `${turnId}.images.json`);
  const artifacts: ChatGptImageArtifact[] = [];
  for (const artifact of prepared) {
    const { buffer, ...publicFields } = artifact;
    if (existsSync(artifact.path)) {
      const existingSha = createHash("sha256").update(readFileSync(artifact.path)).digest("hex");
      if (existingSha !== artifact.sha256) throw new Error("image_output_replay_conflict");
    } else {
      const tmp = `${artifact.path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(tmp, buffer, { flag: "wx", mode: 0o600 });
        renameSync(tmp, artifact.path);
      } finally {
        rmSync(tmp, { force: true });
      }
    }
    artifacts.push(publicFields);
  }
  const manifest = JSON.stringify({ schemaVersion: 1, turnId, artifacts }, null, 2) + "\n";
  if (existsSync(manifestPath)) {
    if (readFileSync(manifestPath, "utf8") !== manifest) throw new Error("image_output_manifest_conflict");
  } else {
    const tmp = `${manifestPath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(tmp, manifest, { flag: "wx", mode: 0o600 });
      renameSync(tmp, manifestPath);
    } finally { rmSync(tmp, { force: true }); }
  }
  return artifacts;
}

/**
 * The response locator must already be tied to the accepted assistant turn identity.
 * Only fetches image resources ordinarily readable in that page origin. On inaccessible
 * CDN URLs, fails explicitly instead of circumventing browser restrictions.
 */
export async function captureChatGptAssistantImages(
  responseTurn: Locator,
  turnId: string,
  output: ChatGptImageOutputOptions,
): Promise<ChatGptImageArtifact[]> {
  const cfg = optionsOf(output);
  const payloads = await responseTurn.evaluate(async (element, selection) => {
    const candidates = [...element.querySelectorAll<HTMLImageElement>("img")]
      // A turn-key group can contain BOTH the submitted user image and assistant output.
      // Never mistake the reference image for a freshly generated assistant image.
      .filter(img => (
        (img.closest('[data-conversation-role="assistant"], [data-message-author-role="assistant"]')
          || img.closest('[data-testid="generated-image-gallery"], [data-testid="generated-image-preview"]'))
        && !img.closest('[data-conversation-role="user"], [data-message-author-role="user"], [data-user-message-bubble]')
        && img.complete && img.naturalWidth >= selection.minWidth
        && img.naturalHeight >= selection.minHeight && img.isConnected
      ))
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
      .slice(0, selection.maxImages);
    const results: ChatGptImagePayload[] = [];
    for (const candidate of candidates) {
      const src = candidate.currentSrc || candidate.src;
      if (!/^(blob:|data:image\/|https:\/\/)/.test(src)) continue;
      let imageResponse: Response;
      try {
        imageResponse = await fetch(src, { credentials: "same-origin" });
      } catch {
        throw new Error("image_output_not_readable_by_page");
      }
      if (!imageResponse.ok) throw new Error("image_output_fetch_failed");
      const blob = await imageResponse.blob();
      if (blob.size > selection.maxBytes) throw new Error("image_output_too_large");
      const base64 = await new Promise<string>((resolveBase64, rejectBase64) => {
        const reader = new FileReader();
        reader.onerror = () => rejectBase64(new Error("image_output_blob_read_failed"));
        reader.onload = () => {
          const encoded = String(reader.result || "");
          const split = encoded.indexOf(",");
          if (split < 0) rejectBase64(new Error("image_output_blob_encoding_failed"));
          else resolveBase64(encoded.slice(split + 1));
        };
        reader.readAsDataURL(blob);
      });
      results.push({ base64, width: candidate.naturalWidth, height: candidate.naturalHeight });
    }
    return results;
  }, { minWidth: cfg.minWidth, minHeight: cfg.minHeight, maxImages: cfg.maxImages, maxBytes: MAX_IMAGE_BYTES });
  return persistChatGptImagePayloads(turnId, payloads, cfg);
}

/** Image-only ChatGPT turns may legitimately have zero text. Opt-in is per browser turn. */
export function completedImageTurn(state: {
  responsePresent: boolean;
  running: boolean;
  completionActionVisible: boolean;
  imageOutputReady: boolean;
}): boolean {
  return state.responsePresent && !state.running
    && state.completionActionVisible && state.imageOutputReady;
}
