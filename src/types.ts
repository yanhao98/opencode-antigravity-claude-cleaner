export interface GeminiFunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface GeminiFunctionResponse {
  id?: string;
  name?: string;
  response?: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  signature?: string;
  thought_signature?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  [key: string]: unknown;
}

export interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
  [key: string]: unknown;
}

export interface GeminiRequestBody {
  contents?: GeminiContent[];
  request?: {
    contents?: GeminiContent[];
    [key: string]: unknown;
  };
  model?: string;
  generationConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenCodeModelEditor {
  list(providerID: string): Array<{ id: string; package?: string; [key: string]: unknown }>;
  update(providerID: string, modelID: string, callback: (target: { package?: string; [key: string]: unknown }) => void): void;
}

export interface OpenCodePluginContext {
  model?: {
    transform(callback: (editor: OpenCodeModelEditor) => void): Promise<unknown>;
  };
  aisdk?: {
    hook(
      kind: "sdk",
      handler: (event: {
        package: string;
        model: { id: string; providerID: string };
        options: Record<string, unknown> & { fetch?: typeof globalThis.fetch };
        sdk?: unknown;
      }) => Promise<void>,
      options?: { providerID?: string }
    ): Promise<unknown>;
  };
  [key: string]: unknown;
}
