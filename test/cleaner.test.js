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

test("cleanClaudeContents strips sentinel from tool-call and drops unsigned thinking parts", () => {
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
        // Valid signed thinking: MUST KEEP
        {
          text: "Thinking with valid signature...",
          thought: true,
          thoughtSignature: "REAL_VALID_HMAC_SIGNATURE_Q0FRU2xRUUtFZ2dURUFJWUFqZ0JRZ2..."
        },
        // Unsigned thinking (signature lost across turns): MUST DROP to prevent 'Field required'
        {
          text: "Thinking without signature...",
          thought: true
        },
        // Function call: MUST STRIP sentinel
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

  // Turn 3 Part 0: real valid thinking signature must be preserved!
  assert.equal(contents[3].parts[0].thoughtSignature, "REAL_VALID_HMAC_SIGNATURE_Q0FRU2xRUUtFZ2dURUFJWUFqZ0JRZ2...");

  // Turn 3 Part 1: unsigned thinking part was dropped!
  // So the functionCall is now at index 1
  assert.equal(contents[3].parts[1].functionCall.name, "shell");
  assert.equal(contents[3].parts[1].thoughtSignature, undefined);
  assert.equal(contents[3].parts[1].thought, undefined);
  assert.equal(contents[3].parts.length, 2);
});

test("cleanClaudeContents merges duplicate functionResponse parts with identical ID into one", () => {
  const contents = [
    {
      role: "model",
      parts: [
        {
          functionCall: {
            id: "toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y",
            name: "shell",
            args: { command: "grep something" }
          }
        }
      ]
    },
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y",
            name: "shell",
            response: {
              name: "shell",
              content: "stepNo: integer().notNull()"
            }
          }
        },
        {
          functionResponse: {
            id: "toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y",
            name: "shell",
            response: {
              name: "shell",
              content: "Exited with code 1"
            }
          }
        }
      ]
    }
  ];

  const modified = cleanClaudeContents(contents);
  assert.equal(modified, true);

  // Turn 1 should now have only 1 merged functionResponse part
  assert.equal(contents[1].parts.length, 1);
  const mergedResp = contents[1].parts[0].functionResponse;
  assert.equal(mergedResp.id, "toolu_vrtx_01PgKxrhDKH9f6bmmTdsGT2y");
  assert.equal(mergedResp.name, "shell");
  assert.equal(mergedResp.response.content, "stepNo: integer().notNull()\nExited with code 1");
});

test("cleanClaudeContents preserves distinct functionResponse parts with different IDs", () => {
  const contents = [
    {
      role: "model",
      parts: [
        { functionCall: { id: "call_read_1", name: "read", args: { path: "a.ts" } } },
        { functionCall: { id: "call_shell_2", name: "shell", args: { command: "ls" } } }
      ]
    },
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "call_read_1",
            name: "read",
            response: { content: "content of a.ts" }
          }
        },
        {
          functionResponse: {
            id: "call_shell_2",
            name: "shell",
            response: { content: "file1.txt\nfile2.txt" }
          }
        }
      ]
    }
  ];

  const modified = cleanClaudeContents(contents);
  assert.equal(modified, false);
  assert.equal(contents[1].parts.length, 2);
  assert.equal(contents[1].parts[0].functionResponse.id, "call_read_1");
  assert.equal(contents[1].parts[1].functionResponse.id, "call_shell_2");
});

test("plugin export shape and teardown", async () => {
  assert.equal(plugin.id, "opencode-antigravity-claude-cleaner");
  assert.equal(typeof plugin.setup, "function");

  const teardown = await plugin.setup({});
  assert.equal(typeof teardown, "function");
  teardown();
});
