import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { isClaudeTarget, cleanClaudeContents, wrapFetchWithCleaner, SENTINEL_SIGNATURE } from "./cleaner.js";
export { isClaudeTarget, cleanClaudeContents, wrapFetchWithCleaner, SENTINEL_SIGNATURE };
const require = createRequire(import.meta.url);
const SDK_PACKAGE = typeof import.meta.resolve === "function"
    ? import.meta.resolve("@ai-sdk/google")
    : pathToFileURL(require.resolve("@ai-sdk/google")).href;
const GOOGLE_PACKAGE = `aisdk:${SDK_PACKAGE}`;
const PROVIDER_ID = "google";
/**
 * Standard OpenCode V2 Plugin definition
 */
export const AntigravityClaudeCleanerPlugin = {
    id: "opencode-antigravity-claude-cleaner",
    name: "Claude Antigravity Signature Cleaner",
    version: "1.0.0",
    async setup(ctx) {
        const unregisterCallbacks = [];
        // 1. Hook global fetch as a universal fallback layer
        const originalGlobalFetch = globalThis.fetch;
        globalThis.fetch = wrapFetchWithCleaner(originalGlobalFetch);
        unregisterCallbacks.push(() => {
            globalThis.fetch = originalGlobalFetch;
        });
        // 2. OpenCode V2 official Model Transform
        // Transforms Claude models under the google provider to resolve through the external @ai-sdk/google
        // package (using OpenCode's aisdk: protocol), preventing OpenCode from falling back to its internal
        // hardcoded serializer that injects skip_thought_signature_validator.
        if (ctx?.model?.transform) {
            await ctx.model.transform((editor) => {
                const models = editor.list(PROVIDER_ID);
                for (const model of models) {
                    const id = String(model.id).toLowerCase();
                    if (id.includes("claude-") || id.includes("claude_")) {
                        editor.update(PROVIDER_ID, model.id, (target) => {
                            target.package = GOOGLE_PACKAGE;
                        });
                    }
                }
            });
        }
        // 3. OpenCode V2 AISDK Hook
        // Replaces the model's SDK instance with an intercepted createGoogleGenerativeAI instance
        if (ctx?.aisdk?.hook) {
            await ctx.aisdk.hook("sdk", async (event) => {
                if (event.package !== SDK_PACKAGE)
                    return;
                const modelId = String(event.model?.id || "").toLowerCase();
                if (!modelId.includes("claude-") && !modelId.includes("claude_"))
                    return;
                const scopedFetch = wrapFetchWithCleaner(event.options.fetch);
                event.sdk = createGoogleGenerativeAI({
                    ...event.options,
                    fetch: scopedFetch,
                });
            }, { providerID: PROVIDER_ID });
        }
        return () => {
            for (const cb of unregisterCallbacks) {
                try {
                    cb();
                }
                catch { }
            }
        };
    },
};
export default AntigravityClaudeCleanerPlugin;
//# sourceMappingURL=index.js.map