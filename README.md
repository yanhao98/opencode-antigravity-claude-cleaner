# opencode-antigravity-claude-cleaner

An official standard OpenCode V2 plugin that resolves HTTP 400 (`messages.N.content.M: Invalid \`signature\` in \`thinking\` block`) when using Anthropic Claude models (such as `claude-opus-5-5` or `claude-sonnet-4-6`) through Google Cloud Code / Antigravity wire protocols.

---

## 📖 Background & Problems Solved

When invoking Claude models configured under the `google` provider in OpenCode (such as through Google Cloud Code / Antigravity wire protocols), two critical compatibility bugs lead to HTTP 400 session aborts:

---

### Problem 1: Synthetic Thought Signature Replay (`Invalid signature in thinking block`)

#### Root Cause
OpenCode's internal Google provider serializer enforces Gemini thought-signature bypass rules. When replaying a model turn containing a tool call (`functionCall`), it injects a synthetic sentinel:
```json
"thoughtSignature": "skip_thought_signature_validator"
```
While Google's native Gemini models accept this sentinel, Antigravity routes Claude requests downstream to **Google Cloud Vertex AI Anthropic**. Vertex AI cryptographically validates thinking signatures and rejects the synthetic sentinel with:
```json
400 · {"type":"error","error":{"type":"invalid_request_error","message":"messages.3.content.0: Invalid `signature` in `thinking` block"},"request_id":"req_vrtx_..."}
```
**Fix**: The plugin strips `skip_thought_signature_validator` from `functionCall` parts and removes un-signed historical thinking blocks while preserving valid provider signatures.

---

### Problem 2: Duplicate Tool Result IDs on Multi-Part Tool Output (`unexpected tool_use_id found in tool_result blocks`)

#### Root Cause
When a tool (e.g. bash/shell) produces multiple output chunks—such as stdout followed by a failure exit code (`"Exited with code 1"`):
1. OpenCode stores multiple content blocks under the tool result.
2. In `@ai-sdk/google`, model IDs not matching `/gemini-/i` (such as `claude-opus-5-5`) fail Gemini 3 feature checks (`supportsFunctionResponseParts = false`).
3. As a result, `@ai-sdk/google` runs its legacy loop (`appendLegacyToolResultParts`), creating a separate `functionResponse` part for each text chunk—**all stamped with the exact same `toolCallId`**.

#### ❌ Before (Failing 400 Outgoing Payload):
```json
{
  "role": "user",
  "parts": [
    {
      "functionResponse": {
        "id": "toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y",
        "name": "shell",
        "response": {
          "name": "shell",
          "content": "stepNo: integer().notNull()...
"
        }
      }
    },
    {
      "functionResponse": {
        "id": "toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y",
        "name": "shell",
        "response": {
          "name": "shell",
          "content": "Exited with code 1"
        }
      }
    }
  ]
}
```

When Google Antigravity converts this 1:1 into Anthropic Messages format, it sends two `tool_result` blocks with the identical `tool_use_id`. Anthropic strictly requires **every `tool_result` to correspond 1:1 to a `tool_use` in the previous message**, immediately rejecting with:
```json
400 · {"type":"error","error":{"type":"invalid_request_error","message":"messages.118.content.0: unexpected `tool_use_id` found in `tool_result` blocks: toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y. Each `tool_result` block must have a corresponding `tool_use` block in the previous message."},"request_id":"req_vrtx_..."}
```

#### ✅ After (Sanitized 200 Outgoing Payload):
The plugin intercepts the outbound request and merges all `functionResponse` parts sharing the same ID into a single consolidated response with concatenated content:
```json
{
  "role": "user",
  "parts": [
    {
      "functionResponse": {
        "id": "toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y",
        "name": "shell",
        "response": {
          "name": "shell",
          "content": "stepNo: integer().notNull()...
Exited with code 1"
        }
      }
    }
  ]
}
```

#### 💡 Why Merge Instead of Drop (Contrast with `opencode-antigravity-auth` / `LLM-API-Key-Proxy`):
Prior projects like `NoeFabris/opencode-antigravity-auth` (ported from `Mirrowel/LLM-API-Key-Proxy`'s `_fix_tool_response_grouping`) deduplicate tool responses by **dropping subsequent occurrences**:
```typescript
// NoeFabris / LLM-API-Key-Proxy:
if (respId && !collectedResponses.has(respId)) {
  collectedResponses.set(respId, resp); // Subsequent duplicates are dropped!
}
```
While dropping subsequent parts avoids the 400 error, it **silently discards** `Exited with code 1`, causing the LLM to falsely believe a failed shell command succeeded. `opencode-antigravity-claude-cleaner` merges the text content, preserving both the full command output and the non-zero exit code without violating Anthropic's 1:1 pairing rule.

---

## 🚀 How It Works

This plugin operates via OpenCode V2's official plugin extension system:

1. **Model Package Transform (`ctx.model.transform`)**:
   Targets Claude models under the `google` provider and routes them to standard `@ai-sdk/google` via OpenCode's `aisdk:` package protocol.
2. **AI SDK Hook (`ctx.aisdk.hook`)**:
   Injects an intercepted `createGoogleGenerativeAI` instance with a scoped sanitizer fetch.
3. **Outbound Request Sanitization**:
   Inspects outgoing Gemini-format payloads targeting Claude models. Strips `skip_thought_signature_validator` from `functionCall` parts while preserving legitimate thinking content and valid signatures.
4. **Universal Fallback**:
   Wraps `globalThis.fetch` to ensure protection across all execution contexts.

---

## 📦 Installation in OpenCode

Add the repository directly to your OpenCode configuration (e.g. `~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "github:yanhao98/opencode-antigravity-claude-cleaner"
  ]
}
```

Or install via OpenCode CLI:

```bash
opencode plugin add github:yanhao98/opencode-antigravity-claude-cleaner
```

---

## 🛠️ Development & Building

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run unit tests
npm test
```

---

## 🙏 Acknowledgements & Prior Art

- **[NoeFabris/opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)** — Special thanks to NoeFabris for pioneering the OpenCode V2 `ctx.model.transform` and `ctx.aisdk.hook` bridge architecture to intercept and hook into the provider transport layer.

---

## 📄 License

MIT
