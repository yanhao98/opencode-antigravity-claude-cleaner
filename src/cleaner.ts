import type { GeminiContent, GeminiPart, GeminiRequestBody } from "./types.js";

export const SENTINEL_SIGNATURE = "skip_thought_signature_validator";
export const MIN_SIGNATURE_LENGTH = 50;

/**
 * Checks whether a given request targets an Anthropic Claude model.
 */
export function isClaudeTarget(urlStr?: string, bodyObj?: GeminiRequestBody): boolean {
  const urlLower = (urlStr || "").toLowerCase();
  if (urlLower.includes("claude-") || urlLower.includes("claude_")) {
    return true;
  }
  const model = (bodyObj?.model || "").toLowerCase();
  return model.includes("claude-") || model.includes("claude_");
}

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
export function cleanClaudeContents(contents?: GeminiContent[]): boolean {
  if (!Array.isArray(contents)) return false;
  let modified = false;

  for (const turn of contents) {
    if (!turn || typeof turn !== "object" || !Array.isArray(turn.parts)) continue;

    const filteredParts: GeminiPart[] = [];
    const seenFunctionResponses = new Map<string, GeminiPart>();

    for (const part of turn.parts) {
      if (!part || typeof part !== "object") continue;

      // 1. Tool-call / functionCall parts
      if (part.functionCall) {
        if (
          part.thoughtSignature === SENTINEL_SIGNATURE ||
          part.signature === SENTINEL_SIGNATURE ||
          part.thought_signature === SENTINEL_SIGNATURE
        ) {
          delete part.thoughtSignature;
          delete part.signature;
          delete part.thought_signature;
          modified = true;
        }

        if (part.thought !== undefined) {
          delete part.thought;
          modified = true;
        }

        filteredParts.push(part);
        continue;
      }

      // 2. Thinking / reasoning parts
      if (part.thought === true || part.type === "thinking" || part.type === "reasoning") {
        const sig = part.thoughtSignature || part.signature || part.thought_signature;

        // If the signature is missing or is the fake bypass sentinel,
        // it cannot be verified by Vertex AI Anthropic. Drop it to prevent "Field required".
        if (!sig || typeof sig !== "string" || sig.length < MIN_SIGNATURE_LENGTH || sig === SENTINEL_SIGNATURE) {
          modified = true;
          continue; // Strip unsigned thinking block!
        }
      }

      // 3. Tool-result / functionResponse parts: merge duplicates sharing the same toolCallId
      //
      // Trigger: When OpenCode executes a shell tool producing stdout and a non-zero exit code,
      // OpenCode stores multiple content blocks. @ai-sdk/google's appendLegacyToolResultParts emits
      // separate functionResponse parts sharing the exact same toolCallId:
      //
      // Before (Fails Vertex AI Anthropic 1:1 validation with HTTP 400):
      //   parts: [
      //     { functionResponse: { id: "toolu_1", response: { content: "stdout..." } } },
      //     { functionResponse: { id: "toolu_1", response: { content: "Exited with code 1" } } }
      //   ]
      //
      // After (Sanitized, single 1:1 part with concatenated content):
      //   parts: [
      //     { functionResponse: { id: "toolu_1", response: { content: "stdout...\nExited with code 1" } } }
      //   ]
      if (part.functionResponse) {
        const id = part.functionResponse.id;
        if (id && typeof id === "string") {
          const existing = seenFunctionResponses.get(id);
          if (existing && existing.functionResponse) {
            const targetResp = (existing.functionResponse.response = existing.functionResponse.response || {});
            const incomingResp = part.functionResponse.response || {};

            const prevContent = targetResp.content ?? targetResp.output ?? targetResp.result ?? "";
            const nextContent = incomingResp.content ?? incomingResp.output ?? incomingResp.result ?? "";

            const prevStr = typeof prevContent === "string" ? prevContent : JSON.stringify(prevContent);
            const nextStr = typeof nextContent === "string" ? nextContent : JSON.stringify(nextContent);

            if (prevStr && nextStr) {
              targetResp.content = `${prevStr}\n${nextStr}`;
            } else {
              targetResp.content = prevStr || nextStr;
            }

            if ("output" in targetResp && "content" in targetResp && targetResp.output !== targetResp.content) {
              delete targetResp.output;
            }
            if ("result" in targetResp && "content" in targetResp && targetResp.result !== targetResp.content) {
              delete targetResp.result;
            }

            if (incomingResp.error && !targetResp.error) {
              targetResp.error = incomingResp.error;
            }

            modified = true;
            continue; // Skip pushing this duplicate part!
          } else {
            seenFunctionResponses.set(id, part);
          }
        }
      }

      filteredParts.push(part);
    }

    if (filteredParts.length !== turn.parts.length) {
      turn.parts = filteredParts;
      modified = true;
    }
  }

  return modified;
}

/**
 * Wraps a fetch function to intercept and sanitize outgoing Claude requests on Antigravity/Gemini wire protocol.
 */
export function wrapFetchWithCleaner(originalFetch?: typeof globalThis.fetch): typeof globalThis.fetch {
  const sendFetch = originalFetch || globalThis.fetch;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request)?.url || "";

      // Intercept generateContent requests or direct Claude URLs
      if (
        urlStr.includes(":streamGenerateContent") ||
        urlStr.includes(":generateContent") ||
        isClaudeTarget(urlStr)
      ) {
        let bodyText = init?.body;

        if (!bodyText && typeof Request !== "undefined" && input instanceof Request) {
          try {
            bodyText = await input.clone().text();
          } catch {
            // Passthrough if body is unreadable
          }
        }

        if (typeof bodyText === "string") {
          try {
            const body = JSON.parse(bodyText) as GeminiRequestBody;
            if (isClaudeTarget(urlStr, body)) {
              const contents = body.contents || body.request?.contents;
              const changed = cleanClaudeContents(contents);

              if (changed) {
                const newInit: RequestInit = {
                  ...init,
                  body: JSON.stringify(body),
                };
                return await sendFetch(input, newInit);
              }
            }
          } catch {
            // Passthrough on JSON parse errors
          }
        }
      }
    } catch {
      // Protect against unhandled exceptions in the interceptor
    }

    return await sendFetch(input, init);
  };
}
