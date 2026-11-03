import type { GeminiContent, GeminiRequestBody } from "./types.js";
export declare const SENTINEL_SIGNATURE = "skip_thought_signature_validator";
/**
 * Checks whether a given request targets an Anthropic Claude model.
 */
export declare function isClaudeTarget(urlStr?: string, bodyObj?: GeminiRequestBody): boolean;
/**
 * Cleans illegal thought signatures from tool-call parts in Gemini contents.
 * Returns true if any parts were modified.
 */
export declare function cleanClaudeContents(contents?: GeminiContent[]): boolean;
/**
 * Wraps a fetch function to intercept and sanitize outgoing Claude requests on Antigravity/Gemini wire protocol.
 */
export declare function wrapFetchWithCleaner(originalFetch?: typeof globalThis.fetch): typeof globalThis.fetch;
//# sourceMappingURL=cleaner.d.ts.map