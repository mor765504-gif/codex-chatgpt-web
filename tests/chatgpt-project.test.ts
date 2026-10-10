import { expect, test } from "bun:test";
import { parseConfig, defaultConfig, AppConfig } from "../src/config";
import { chatGptNewChatUrl, assertNewChatPage } from "../src/chatgpt-session";

test("config validation of chatgptProjectUrl", () => {
  const path = "config.json";
  const validConfig = defaultConfig();
  
  // valid cases
  expect(parseConfig({ ...validConfig, chatgptProjectUrl: "https://chatgpt.com/g/g-p-123" }, path).chatgptProjectUrl)
    .toBe("https://chatgpt.com/g/g-p-123");
  expect(parseConfig({ ...validConfig, chatgptProjectUrl: "https://chatgpt.com/g/g-p-abc-def/project" }, path).chatgptProjectUrl)
    .toBe("https://chatgpt.com/g/g-p-abc-def/project");
  expect(parseConfig({ ...validConfig, chatgptProjectUrl: "https://chatgpt.com/g/g-p-xyz/project/" }, path).chatgptProjectUrl)
    .toBe("https://chatgpt.com/g/g-p-xyz/project/");
  expect(parseConfig(validConfig, path).chatgptProjectUrl).toBeUndefined();

  // invalid origin
  expect(() => parseConfig({ ...validConfig, chatgptProjectUrl: "https://example.com/g/g-p-123" }, path))
    .toThrow("Invalid chatgptProjectUrl");
  // invalid path
  expect(() => parseConfig({ ...validConfig, chatgptProjectUrl: "https://chatgpt.com/g/g-123" }, path))
    .toThrow("Invalid chatgptProjectUrl");
  expect(() => parseConfig({ ...validConfig, chatgptProjectUrl: "https://chatgpt.com/g/g-p-123/other" }, path))
    .toThrow("Invalid chatgptProjectUrl");
  // query/hash
  expect(() => parseConfig({ ...validConfig, chatgptProjectUrl: "https://chatgpt.com/g/g-p-123?foo=bar" }, path))
    .toThrow("Invalid chatgptProjectUrl");
  expect(() => parseConfig({ ...validConfig, chatgptProjectUrl: "https://chatgpt.com/g/g-p-123#hash" }, path))
    .toThrow("Invalid chatgptProjectUrl");
});

test("chatGptNewChatUrl cases", () => {
  expect(chatGptNewChatUrl(true, "https://chatgpt.com/g/g-p-123")).toBe("https://chatgpt.com/g/g-p-123");
  expect(chatGptNewChatUrl(false, "https://chatgpt.com/g/g-p-123")).toBe("https://chatgpt.com/?temporary-chat=true");
  expect(chatGptNewChatUrl(true)).toBe("https://chatgpt.com/");
  expect(chatGptNewChatUrl(false)).toBe("https://chatgpt.com/?temporary-chat=true");
});

test("assertNewChatPage accept/reject cases with projectUrl", async () => {
  const mockPage = (url: string) => ({ url: () => url } as any);
  
  // Accept cases for useSavedChats = true, projectUrl set
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/g/g-p-123"), true, "https://chatgpt.com/g/g-p-123")).resolves.toBeUndefined();
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/g/g-p-123/project"), true, "https://chatgpt.com/g/g-p-123/project")).resolves.toBeUndefined();
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/g/g-p-123/c/chat-id"), true, "https://chatgpt.com/g/g-p-123")).resolves.toBeUndefined(); // same prefix

  // Reject cases for useSavedChats = true, projectUrl set
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/"), true, "https://chatgpt.com/g/g-p-123")).rejects.toThrow("ChatGPT left the requested new Project surface");
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/g/g-p-123?temporary-chat=true"), true, "https://chatgpt.com/g/g-p-123")).rejects.toThrow("ChatGPT left the requested new Project surface");
  
  // Existing behavior unchanged without projectUrl
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/"), true)).resolves.toBeUndefined();
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/?temporary-chat=true"), false)).resolves.toBeUndefined();
  await expect(assertNewChatPage(mockPage("https://chatgpt.com/?temporary-chat=true"), true)).rejects.toThrow("ChatGPT left the requested new saved Chat surface");
});
