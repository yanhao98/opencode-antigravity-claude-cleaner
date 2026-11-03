import { isClaudeTarget, cleanClaudeContents, wrapFetchWithCleaner, SENTINEL_SIGNATURE } from "./cleaner.js";
import type { OpenCodePluginContext } from "./types.js";
export { isClaudeTarget, cleanClaudeContents, wrapFetchWithCleaner, SENTINEL_SIGNATURE };
/**
 * Standard OpenCode V2 Plugin definition
 */
export declare const AntigravityClaudeCleanerPlugin: {
    id: string;
    name: string;
    version: string;
    setup(ctx: OpenCodePluginContext): Promise<() => void>;
};
export default AntigravityClaudeCleanerPlugin;
//# sourceMappingURL=index.d.ts.map