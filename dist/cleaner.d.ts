import type { GeminiContent, GeminiRequestBody } from "./types.js";
export declare const SENTINEL_SIGNATURE = "skip_thought_signature_validator";
export declare const MIN_SIGNATURE_LENGTH = 50;
/**
 * Checks whether a given request targets an Anthropic Claude model.
 */
export declare function isClaudeTarget(urlStr?: string, bodyObj?: GeminiRequestBody): boolean;
/**
 * Cleans illegal thought signatures and un-signed historical thinking parts
 * from Gemini contents for Claude models.
 *
 * Rules:
 * 1. functionCall parts must not carry thought signatures (strips skip_thought_signature_validator).
 * 2. Historical thinking parts (thought: true) that lack valid provider HMAC signatures
 *    (e.g. lost across sessions or stripped by OpenCode storage) MUST be dropped,
 *    because Vertex AI Anthropic strictly validates thinking signatures and rejects
 *    unsigned thinking blocks with "messages.N.content.M.thinking.signature: Field required".
 */
export declare function cleanClaudeContents(contents?: GeminiContent[]): boolean;
/**
 * Wraps a fetch function to intercept and sanitize outgoing Claude requests on Antigravity/Gemini wire protocol.
 */
export declare function wrapFetchWithCleaner(originalFetch?: typeof globalThis.fetch): typeof globalThis.fetch;
//# sourceMappingURL=cleaner.d.ts.map