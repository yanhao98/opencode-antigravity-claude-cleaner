export const SENTINEL_SIGNATURE = "skip_thought_signature_validator";
/**
 * Checks whether a given request targets an Anthropic Claude model.
 */
export function isClaudeTarget(urlStr, bodyObj) {
    const urlLower = (urlStr || "").toLowerCase();
    if (urlLower.includes("claude-") || urlLower.includes("claude_")) {
        return true;
    }
    const model = (bodyObj?.model || "").toLowerCase();
    return model.includes("claude-") || model.includes("claude_");
}
/**
 * Cleans illegal thought signatures from tool-call parts in Gemini contents.
 * Returns true if any parts were modified.
 */
export function cleanClaudeContents(contents) {
    if (!Array.isArray(contents))
        return false;
    let modified = false;
    for (const turn of contents) {
        if (!turn || typeof turn !== "object" || !Array.isArray(turn.parts))
            continue;
        for (const part of turn.parts) {
            if (!part || typeof part !== "object")
                continue;
            // When encountering a functionCall (tool-call):
            if (part.functionCall) {
                // 1. Strip the synthetic sentinel injected by Google serializer
                if (part.thoughtSignature === SENTINEL_SIGNATURE ||
                    part.signature === SENTINEL_SIGNATURE ||
                    part.thought_signature === SENTINEL_SIGNATURE) {
                    delete part.thoughtSignature;
                    delete part.signature;
                    delete part.thought_signature;
                    modified = true;
                }
                // 2. Claude tool_use blocks must not carry thinking block markers
                if (part.thought !== undefined) {
                    delete part.thought;
                    modified = true;
                }
            }
        }
    }
    return modified;
}
/**
 * Wraps a fetch function to intercept and sanitize outgoing Claude requests on Antigravity/Gemini wire protocol.
 */
export function wrapFetchWithCleaner(originalFetch) {
    const sendFetch = originalFetch || globalThis.fetch;
    return async (input, init) => {
        try {
            const urlStr = typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input?.url || "";
            // Intercept generateContent requests or direct Claude URLs
            if (urlStr.includes(":streamGenerateContent") ||
                urlStr.includes(":generateContent") ||
                isClaudeTarget(urlStr)) {
                let bodyText = init?.body;
                if (!bodyText && typeof Request !== "undefined" && input instanceof Request) {
                    try {
                        bodyText = await input.clone().text();
                    }
                    catch {
                        // Passthrough if body is unreadable
                    }
                }
                if (typeof bodyText === "string" && bodyText.includes(SENTINEL_SIGNATURE)) {
                    try {
                        const body = JSON.parse(bodyText);
                        if (isClaudeTarget(urlStr, body)) {
                            const contents = body.contents || body.request?.contents;
                            const changed = cleanClaudeContents(contents);
                            if (changed) {
                                const newInit = {
                                    ...init,
                                    body: JSON.stringify(body),
                                };
                                return await sendFetch(input, newInit);
                            }
                        }
                    }
                    catch {
                        // Passthrough on JSON parse errors
                    }
                }
            }
        }
        catch {
            // Protect against unhandled exceptions in the interceptor
        }
        return await sendFetch(input, init);
    };
}
//# sourceMappingURL=cleaner.js.map