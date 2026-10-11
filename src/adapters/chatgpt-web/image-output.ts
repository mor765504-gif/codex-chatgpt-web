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
  /** Explicit UI preparation intent; not a claimed backend image-tool parameter. */
  operation?: "new" | "edit";
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

export interface ChatGptImageObservation {
  assistantImageCount: number;
  galleryImageCount: number;
  excludedReferenceCount: number;
  candidateCount: number;
  readyCount: number;
  failureUiVisible: boolean;
  /** Bounded metadata only; no URLs, text, pixels, or configuration. */
  images: { complete: boolean; width: number; height: number }[];
}

export class ChatGptImageOutputError extends Error {
  constructor(
    readonly code: "image_output_provider_failed" | "image_output_completed_without_image" | "image_output_capture_failed",
    readonly observation: ChatGptImageObservation,
    readonly detail?: string,
  ) {
    super(`${code}: ${JSON.stringify({ ...observation, ...(detail ? { detail } : {}) })}`);
    this.name = "ChatGptImageOutputError";
  }
}

function optionsOf(value: ChatGptImageOutputOptions): Required<Omit<ChatGptImageOutputOptions, "operation">> {
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

/** Self-contained page callback, shared by readiness and terminal capture. */
async function readAssistantImageState(element: Element, selection: {
  minWidth: number; minHeight: number; maxImages: number; maxBytes: number; capture: boolean;
}): Promise<{ observation: ChatGptImageObservation; payloads: ChatGptImagePayload[]; captureError?: string }> {
    const assistant = '[data-conversation-role="assistant"], [data-message-author-role="assistant"]';
    const gallery = '[data-testid="generated-image-gallery"], [data-testid="generated-image-preview"]';
    const user = '[data-conversation-role="user"], [data-message-author-role="user"], [data-user-message-bubble]';
    const markdown = '.markdown, [data-markdown-text-style="assistant-message"]';
    const visible = (node: Element): boolean => {
      if (!node.isConnected) return false;
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (parent.hasAttribute("hidden") || style.display === "none"
          || style.visibility === "hidden" || style.opacity === "0") return false;
      }
      return true;
    };
    const all = Array.from(element.querySelectorAll<HTMLImageElement>("img"));
    const inputSources = new Set(all.filter(img => !!img.closest(user))
      .map(img => img.currentSrc || img.src).filter(Boolean));
    const isReference = (img: HTMLImageElement): boolean => !!img.closest(user)
      || inputSources.has(img.currentSrc || img.src)
      || !!img.closest("blockquote, pre, code")
      // Ordinary Markdown images can quote existing sources. Explicit generated widgets
      // remain eligible even when their renderer is nested within Markdown.
      || (!!img.closest(markdown) && !img.closest(gallery));
    const candidates = all.filter(img => !isReference(img)
      && !!(img.closest(assistant) || img.closest(gallery)) && visible(img));
    const ready = candidates.filter(img => img.complete && img.naturalWidth >= selection.minWidth
      && img.naturalHeight >= selection.minHeight)
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
    // Only the observed exact UI label outside model/user prose is evidence of tool failure.
    // This does not infer a backend mode or trust the assistant's explanation of that mode.
    const failureUiVisible = Array.from(element.querySelectorAll<HTMLElement>("*"))
      .some(node => !node.closest(`${user}, ${markdown}, blockquote, pre, code, script, style`)
        && visible(node) && (node.getAttribute("aria-label")
          || Array.from(node.childNodes).filter(child => child.nodeType === 3).map(child => child.textContent || "").join(""))
          .replace(/\s+/g, " ").trim() === "Image generation failed");
    const observation: ChatGptImageObservation = {
      assistantImageCount: all.filter(img => !!img.closest(assistant) && !img.closest(user)).length,
      galleryImageCount: all.filter(img => !!img.closest(gallery) && !img.closest(user)).length,
      excludedReferenceCount: all.filter(isReference).length,
      candidateCount: candidates.length, readyCount: ready.length, failureUiVisible,
      images: candidates.slice(0, 8).map(img => ({complete:img.complete, width:img.naturalWidth, height:img.naturalHeight})),
    };
    const results: ChatGptImagePayload[] = [];
    if (!selection.capture) return { observation, payloads: results };
    for (const candidate of ready.slice(0, selection.maxImages)) {
      const src = candidate.currentSrc || candidate.src;
      if (!/^(blob:|data:image\/|https:\/\/)/.test(src)) continue;
      let imageResponse: Response;
      try {
        imageResponse = await fetch(src, { credentials: "same-origin" });
      } catch {
        return { observation, payloads: [], captureError: "image_output_not_readable_by_page" };
      }
      if (!imageResponse.ok) return { observation, payloads: [], captureError: "image_output_fetch_failed" };
      try {
      const blob = await imageResponse.blob();
      if (blob.size > selection.maxBytes) return { observation, payloads: [], captureError: "image_output_too_large" };
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
      } catch {
        return { observation, payloads: [], captureError: "image_output_blob_read_failed" };
      }
    }
    return { observation, payloads: results };
}

function imageSelection(output: ChatGptImageOutputOptions, capture: boolean) {
  const cfg = optionsOf(output);
  return { minWidth: cfg.minWidth, minHeight: cfg.minHeight, maxImages: cfg.maxImages, maxBytes: MAX_IMAGE_BYTES, capture };
}

export async function inspectChatGptAssistantImages(
  responseTurn: Locator, output: ChatGptImageOutputOptions,
): Promise<ChatGptImageObservation> {
  return (await responseTurn.evaluate(readAssistantImageState, imageSelection(output, false), { timeout: 2_000 })).observation;
}

/** Bound current turn only. Classify before persistence; never retry or bypass page access. */
export async function captureChatGptAssistantImages(
  responseTurn: Locator,
  turnId: string,
  output: ChatGptImageOutputOptions,
): Promise<ChatGptImageArtifact[]> {
  const cfg = optionsOf(output);
  const { observation, payloads, captureError } = await responseTurn.evaluate(readAssistantImageState, imageSelection(cfg, true));
  if (captureError || payloads.length === 0) {
    const code = observation.failureUiVisible ? "image_output_provider_failed"
      : observation.candidateCount > 0 ? "image_output_capture_failed" : "image_output_completed_without_image";
    throw new ChatGptImageOutputError(code, observation, captureError);
  }
  // Persistence/replay errors retain their own codes; they are not provider failures.
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
