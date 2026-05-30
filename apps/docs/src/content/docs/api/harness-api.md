---
title: Harness API
description: Reference initialized harnesses, sessions, operations, results, and workspace access.
---

A harness is the initialized agent environment returned by `ctx.init(agent)` inside a workflow. It exposes sessions for agent operations and workspace methods for application-controlled filesystem or shell work.

For task-oriented guidance, see [Workflows](/docs/guide/workflows/). For workspace selection and durability, see [Sandboxes](/docs/guide/sandboxes/). For event correlation and model-turn inspection, see [Observability](/docs/guide/observability/).

## Imports

```ts
import {
  ResultUnavailableError,
  type CallHandle,
  type FileStat,
  type FlueFs,
  type FlueHarness,
  type FlueSession,
  type FlueSessions,
  type PromptImage,
  type PromptModel,
  type PromptOptions,
  type PromptResponse,
  type PromptResultResponse,
  type PromptUsage,
  type ShellOptions,
  type ShellResult,
  type SkillOptions,
  type SkillReference,
  type TaskOptions,
  type ThinkingLevel,
  type ToolDefinition,
} from '@flue/runtime';
```

## `FlueHarness`

`ctx.init(agent)` returns `Promise<FlueHarness>`. A harness represents one initialized use of a created agent and its configured sandbox inside a workflow invocation.

```ts
interface FlueHarness {
  readonly name: string;
  session(name?: string): Promise<FlueSession>;
  readonly sessions: FlueSessions;
  shell(command: string, options?: ShellOptions): CallHandle<ShellResult>;
  readonly fs: FlueFs;
}
```

| Member | Meaning |
| --- | --- |
| `name` | Harness name. The default initialized harness is named `"default"` unless `init(...)` receives another name. |
| `session(name?)` | Gets or creates a named session; omitting `name` selects the `"default"` session. |
| `sessions` | Explicit session create, get, and delete methods. |
| `fs` | Reads and writes files inside the configured sandbox outside session conversation history. |
| `shell(...)` | Runs a command inside the configured sandbox outside session conversation history. |

The sandbox and working directory are configured on `createAgent(...)`, not on the harness. See [Agents](/docs/guide/building-agents/) and [Sandboxes](/docs/guide/sandboxes/).

## Sessions

A session holds ordered conversation state for agent operations.

```ts
import * as v from 'valibot';

interface FlueSessions {
  get(name?: string): Promise<FlueSession>;
  create(name?: string): Promise<FlueSession>;
  delete(name?: string): Promise<void>;
}

interface FlueSession {
  readonly name: string;

  prompt<S extends v.GenericSchema>(
    text: string,
    options: PromptOptions<S> & { result: S },
  ): CallHandle<PromptResultResponse<v.InferOutput<S>>>;
  prompt(text: string, options?: PromptOptions): CallHandle<PromptResponse>;

  skill<S extends v.GenericSchema>(
    skill: SkillReference | string,
    options: SkillOptions<S> & { result: S },
  ): CallHandle<PromptResultResponse<v.InferOutput<S>>>;
  skill(skill: SkillReference | string, options?: SkillOptions): CallHandle<PromptResponse>;

  task<S extends v.GenericSchema>(
    text: string,
    options: TaskOptions<S> & { result: S },
  ): CallHandle<PromptResultResponse<v.InferOutput<S>>>;
  task(text: string, options?: TaskOptions): CallHandle<PromptResponse>;

  shell(command: string, options?: ShellOptions): CallHandle<ShellResult>;
  readonly fs: FlueFs;
  compact(): Promise<void>;
  delete(): Promise<void>;
}
```

The deprecated `schema` structured-result overloads are omitted above; use `result` in new code.

A session runs one active `prompt`, `skill`, `task`, `shell`, or explicit `compact` operation at a time. Use separate named sessions when independent branches need to run concurrently.

## `session.prompt(...)`

Use `session.prompt(...)` to perform an agent operation with a text instruction. Without a structured-result schema, it resolves to `PromptResponse`:

```ts
const response = await session.prompt('Summarize document.md.');
return response.text;
```

```ts
interface PromptResponse {
  text: string;
  usage: PromptUsage;
  model: PromptModel;
}

interface PromptModel {
  provider: string;
  id: string;
}
```

| Field | Meaning |
| --- | --- |
| `text` | Assistant text returned by the operation. |
| `usage` | Aggregated token and cost usage for model work performed in this operation. |
| `model` | Provider and model selected for the operation's primary model call. |

`usage` is aggregated for the operation, not necessarily one model request. Tool use, structured-result retries, or automatic compaction can cause one operation to include multiple model turns. See [Observability](/docs/guide/observability/) when you need per-turn detail.

### Structured results

Pass a Valibot schema as `result` when application code requires validated data rather than freeform text. The resolved value is available as `response.data` and is typed from the schema output.

```ts
import { ResultUnavailableError } from '@flue/runtime';
import * as v from 'valibot';

try {
  const response = await session.prompt('Classify this ticket.', {
    result: v.object({
      priority: v.picklist(['low', 'medium', 'high']),
      summary: v.string(),
    }),
  });

  return response.data;
} catch (error) {
  if (error instanceof ResultUnavailableError) {
    return { priority: 'medium', summary: error.reason };
  }
  throw error;
}
```

```ts
interface PromptResultResponse<T> {
  data: T;
  usage: PromptUsage;
  model: PromptModel;
}
```

The agent completes a structured-result operation by submitting data that validates against the schema. If it reports that it cannot produce a valid result, or it fails to complete a valid result within the allowed attempts, the operation throws `ResultUnavailableError`.

| `ResultUnavailableError` field | Meaning |
| --- | --- |
| `reason` | Reason supplied when the agent could not provide the required result. |
| `assistantText` | Available assistant text from the response preceding the error. |

Use `result` and `response.data` in new code. The `schema` option and former `response.result` field are deprecated compatibility names.

### `PromptOptions`

All prompt options apply only to that operation.

| Option | Type | Meaning |
| --- | --- | --- |
| `result` | Valibot schema | Require validated structured data and resolve with `response.data`. |
| `tools` | `ToolDefinition[]` | Add model-callable tools for this operation. |
| `model` | `string` | Override the created agent's selected model for this operation. |
| `thinkingLevel` | `ThinkingLevel` | Override the requested reasoning effort for this operation. |
| `images` | `PromptImage[]` | Attach inline images to the operation's initial user message. |
| `signal` | `AbortSignal` | Abort the operation when the supplied signal aborts. |
| `schema` | Valibot schema | Deprecated alias for `result`. |

Operation-level `model` and `thinkingLevel` overrides take precedence over configured agent or profile defaults. See [Models & Providers](/docs/guide/models/) for model configuration and [Tools](/docs/guide/tools/) for capability scoping.

### Image input

`PromptImage` attaches base64 image content to a prompt, skill, or task operation. The selected model must support image input.

```ts
const response = await session.prompt('Read this receipt.', {
  images: [{ type: 'image', data: pngBase64, mimeType: 'image/png' }],
});
```

```ts
type PromptImage = {
  type: 'image';
  data: string;
  mimeType: string;
};
```

## Other session operations

`skill(...)` and `task(...)` support the same text or structured response shapes as `prompt(...)`: pass `result` to receive validated `response.data`, or omit it to receive `response.text`.

| Operation | Purpose | Operation-specific options |
| --- | --- | --- |
| `session.skill(skill, options?)` | Activate a registered or imported skill. | `args` supplies skill arguments. |
| `session.task(text, options?)` | Delegate work into a child session. | `agent` selects a declared profile; `cwd` selects the child's working directory. |
| `session.shell(command, options?)` | Run a command recorded in session conversation state. | `env` and `cwd` configure the command invocation. |

`skill(...)` and `task(...)` can also receive `result`, `tools`, `model`, `thinkingLevel`, `images`, and `signal`. See [Skills](/docs/guide/skills/) and [Subagents](/docs/guide/subagents/) for how to use those capabilities.

## Cancellation and `CallHandle<T>`

Operations return an awaitable `CallHandle<T>`. Await it directly in ordinary code, or retain the handle to cancel in-flight work.

```ts
const handle = session.prompt('Write a migration plan.');
const timer = setTimeout(() => handle.abort('deadline exceeded'), 5_000);

try {
  return (await handle).text;
} finally {
  clearTimeout(timer);
}
```

```ts
interface CallHandle<T> extends PromiseLike<T> {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}
```

You can alternatively provide `options.signal`, such as `AbortSignal.timeout(10_000)`. Aborting rejects the awaited operation with an `AbortError` (`DOMException`). Whether an in-flight remote tool or sandbox command stops immediately depends on whether its underlying implementation observes abort signals.

## Filesystem and shell access

`harness.fs` and `session.fs` expose the same `FlueFs` workspace methods. These file operations happen outside conversation history; if an agent should act on a staged file, instruct it to read that file in a later operation.

```ts
interface FlueFs {
  readFile(path: string): Promise<string>;
  readFileBuffer(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  stat(path: string): Promise<FileStat>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}
```

Relative filesystem paths resolve against the created agent's configured `cwd`. `harness.shell(...)` also runs outside conversation history, while `session.shell(...)` records its command exchange so later operations in that session can reason from it.

## Compaction and deletion

| Method | Meaning |
| --- | --- |
| `session.compact()` | Trigger conversation compaction immediately; resolves without work when there is nothing to compact. |
| `session.delete()` | Delete this session's stored conversation state. |
| `harness.sessions.delete(name?)` | Delete stored conversation state for the named session. |

`session.compact()` cannot run while another operation is active on that session. Compaction activity and cost are observable through Flue events; see [Observability](/docs/guide/observability/).
