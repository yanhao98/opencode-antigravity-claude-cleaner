# opencode-antigravity-claude-cleaner

An official standard OpenCode V2 plugin that resolves HTTP 400 (`messages.N.content.M: Invalid \`signature\` in \`thinking\` block`) when using Anthropic Claude models (such as `claude-opus-5-5` or `claude-sonnet-4-6`) through Google Cloud Code / Antigravity wire protocols.

---

## 📖 Background & Problem

When invoking Claude models configured under the `google` provider in OpenCode:
1. **Round 1 (Initial tool call)** executes successfully.
2. **Round 2 (Tool response replay)** fails with:
   ```json
   400 · {"type":"error","error":{"type":"invalid_request_error","message":"messages.3.content.0: Invalid `signature` in `thinking` block"},"request_id":"req_vrtx_..."}
   ```

### Root Cause
OpenCode's internal Google provider serializer enforces Gemini 2.5/3.0 thought-signature validation bypass rules. When replaying a model turn containing a `tool-call` (`functionCall`), it hardcodes a synthetic sentinel:
```json
"thoughtSignature": "skip_thought_signature_validator"
```
While Google's native Gemini models accept this sentinel, Google Cloud Code PA routes Claude requests downstream to **Google Cloud Vertex AI Anthropic**. Vertex AI validates thinking signatures cryptographically and rejects the synthetic sentinel with HTTP 400.

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
npm run build

# Run unit tests
npm test
```

---

## 📄 License

MIT
