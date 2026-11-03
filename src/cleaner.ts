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
export function cleanClaudeContents(contents?: GeminiContent[]): boolean {
  if (!Array.isArray(contents)) return false;
  let modified = false;

  for (const turn of contents) {
    if (!turn || typeof turn !== "object" || !Array.isArray(turn.parts)) continue;

    const filteredParts: GeminiPart[] = [];

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
