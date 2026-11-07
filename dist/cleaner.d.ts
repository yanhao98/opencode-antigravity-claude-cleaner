import type { GeminiContent, GeminiRequestBody } from "./types.js";
export declare const SENTINEL_SIGNATURE = "skip_thought_signature_validator";
export declare const MIN_SIGNATURE_LENGTH = 50;
/**
 * Checks whether a given request targets an Anthropic Claude model.
 */
export declare function isClaudeTarget(urlStr?: string, bodyObj?: GeminiRequestBody): boolean;
/**
 * Cleans illegal thought signatures, un-signed historical thinking parts,
 * and duplicate functionResponse parts from Gemini contents for Claude models.
 *
 * Rules:
 * 1. functionCall parts must not carry thought signatures (strips skip_thought_signature_validator).
 * 2. Historical thinking parts (thought: true) that lack valid provider HMAC signatures
 *    (e.g. lost across sessions or stripped by OpenCode storage) MUST be dropped,
 *    because Vertex AI Anthropic strictly validates thinking signatures and rejects
 *    unsigned thinking blocks with "messages.N.content.M.thinking.signature: Field required".
 * 3. functionResponse parts sharing the same non-empty ID within a turn must be merged into one.
 *    When a tool returns multiple output chunks (e.g. stdout + "Exited with code 1"),
 *    @ai-sdk/google's fallback path (appendLegacyToolResultParts) pushes multiple functionResponse
 *    blocks with the same toolCallId. Vertex AI Anthropic enforces strict 1:1 pairing between
 *    tool_use and tool_result, rejecting duplicate tool_use_ids with:
 *    "unexpected `tool_use_id` found in `tool_result` blocks: ... Each `tool_result` block must have a corresponding `tool_use` block in the previous message."
 */
export declare function cleanClaudeContents(contents?: GeminiContent[]): boolean;
/**
 * Wraps a fetch function to intercept and sanitize outgoing Claude requests on Antigravity/Gemini wire protocol.
 */
export declare function wrapFetchWithCleaner(originalFetch?: typeof globalThis.fetch): typeof globalThis.fetch;
//# sourceMappingURL=cleaner.d.ts.map