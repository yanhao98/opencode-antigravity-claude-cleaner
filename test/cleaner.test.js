import test from "node:test";
import assert from "node:assert/strict";
import { cleanClaudeContents, isClaudeTarget, wrapFetchWithCleaner, SENTINEL_SIGNATURE } from "../dist/cleaner.js";
import plugin from "../dist/index.js";

test("isClaudeTarget detection", () => {
  assert.equal(isClaudeTarget("https://api.example.com/models/claude-opus-5-5:streamGenerateContent"), true);
  assert.equal(isClaudeTarget("https://api.example.com/models/claude_sonnet_4_6:generateContent"), true);
  assert.equal(isClaudeTarget("https://api.example.com/models/gemini-3.8-flash:streamGenerateContent"), false);
  assert.equal(isClaudeTarget(undefined, { model: "claude-opus-5-5" }), true);
  assert.equal(isClaudeTarget(undefined, { model: "gemini-3.8-flash" }), false);
});

test("cleanClaudeContents strips sentinel from tool-call parts while preserving real thinking signature", () => {
  const contents = [
    {
      role: "user",
      parts: [{ text: "pwd" }]
    },
    {
      role: "model",
      parts: [
        {
          functionCall: { id: "call_1", name: "shell", args: { command: "pwd" } },
          thoughtSignature: SENTINEL_SIGNATURE
        }
      ]
    },
    {
      role: "user",
      parts: [{ functionResponse: { id: "call_1", name: "shell", response: { output: "/home/devel" } } }]
    },
    {
      role: "model",
      parts: [
        {
          text: "I should inspect git status...",
          thought: true,
          thoughtSignature: "REAL_VALID_HMAC_SIGNATURE_Q0FR..."
        },
        {
          functionCall: { id: "call_2", name: "shell", args: { command: "git status" } },
          thoughtSignature: SENTINEL_SIGNATURE,
          thought: true
        }
      ]
    }
  ];

  const modified = cleanClaudeContents(contents);
  assert.equal(modified, true);

  // Turn 1 functionCall: sentinel must be stripped
  assert.equal(contents[1].parts[0].thoughtSignature, undefined);
  assert.equal(contents[1].parts[0].signature, undefined);

  // Turn 3 Part 0: real thinking signature must be preserved!
  assert.equal(contents[3].parts[0].thoughtSignature, "REAL_VALID_HMAC_SIGNATURE_Q0FR...");
  assert.equal(contents[3].parts[0].thought, true);

  // Turn 3 Part 1: sentinel and thought boolean on functionCall must be stripped
  assert.equal(contents[3].parts[1].thoughtSignature, undefined);
  assert.equal(contents[3].parts[1].thought, undefined);
});

test("wrapFetchWithCleaner intercepts and cleans outgoing Claude requests", async () => {
  let capturedBody = null;
  const mockFetch = async (input, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const interceptedFetch = wrapFetchWithCleaner(mockFetch);

  const payload = {
    contents: [
      {
        role: "model",
        parts: [
          {
            functionCall: { name: "shell", args: { command: "ls" } },
            thoughtSignature: SENTINEL_SIGNATURE
          }
        ]
      }
    ]
  };

  const url = "https://Direct-Bifrost.oo1.dev/genai_passthrough/v1beta/models/claude-opus-5-5:streamGenerateContent?alt=sse";
  const resp = await interceptedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  assert.equal(resp.status, 200);
  assert.notEqual(capturedBody, null);
  assert.equal(capturedBody.contents[0].parts[0].thoughtSignature, undefined);
});

test("plugin export shape and teardown", async () => {
  assert.equal(plugin.id, "opencode-antigravity-claude-cleaner");
  assert.equal(typeof plugin.setup, "function");

  const teardown = await plugin.setup({});
  assert.equal(typeof teardown, "function");
  teardown();
});
