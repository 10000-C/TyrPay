# Model API Field Survey

Last updated: 2026-05-07

## Purpose

This document summarizes the official request and response conventions for major
model vendors and cloud vendors that expose text-generation or chat-generation
APIs. The focus is narrow:

1. Which endpoint family is relevant for FulfillPay-style proof collection
2. How to identify the invoked `model`
3. How to identify `usage`
4. Where to find stream termination markers such as `finish_reason`,
   `stop_reason`, or equivalent

This document uses vendor official documentation only. If an official page does
not clearly specify a behavior, that ambiguity is preserved here instead of
being filled in from community examples.

## Scope

For comparability, this document focuses on chat or text generation endpoints
that are closest to the OpenAI-style `chat/completions` pattern.

- For OpenAI, this document focuses on `Chat Completions`, because several
  other vendors expose compatible schemas. OpenAI also has the `Responses API`,
  whose non-streaming response also contains top-level `usage`.
- For AWS, this document focuses on native Bedrock `Converse` and
  `ConverseStream`.
- For Azure, this document focuses on Azure OpenAI chat completions.

## Implementation Summary

For Phase 1 non-streaming proofs, the easiest normalization target is:

```json
{
  "request": {
    "model": "<request model parameter>"
  },
  "response": {
    "model": "<top-level response model field when present>",
    "usage": {
      "prompt_tokens": 0,
      "completion_tokens": 0,
      "total_tokens": 0
    },
    "finish_reason": "<vendor-specific stop marker>"
  }
}
```

For Phase 2 streaming proofs, the most important distinction is whether the
vendor documents:

- `model` on every chunk or event
- `usage` on the final chunk only, on cumulative delta events, or in stream
  metadata
- a deterministic end marker such as `data: [DONE]`, `message_stop`, or stream
  metadata

## At-a-Glance Matrix

| Vendor | Primary endpoint | Non-stream `model` | Non-stream `usage` | Stream carrier | Stream `model` | Stream `usage` | Stream end marker |
|---|---|---|---|---|---|---|---|
| OpenAI | `/chat/completions` | Top-level `model` | Top-level `usage` | SSE | Chunk top-level `model` | Final usage chunk when `stream_options.include_usage=true`; other chunks `usage=null` | `data: [DONE]` |
| Anthropic | `/v1/messages` | Top-level `model` | Top-level `usage` | SSE events | `message_start.message.model` | `message_start.message.usage`, then cumulative `message_delta.usage` | `message_stop` |
| Azure OpenAI | Chat completions | Top-level `model` | Top-level `usage` | SSE | Chunk top-level `model` | Final usage chunk when `include_usage=true`; other chunks `usage=null` | `data: [DONE]` |
| AWS Bedrock | `/model/{modelId}/converse` | Request URI `modelId`; routed model may appear in trace | Top-level `usage` | Event stream | Request URI `modelId`; routed model may appear in metadata trace | `metadata.usage` | Stream metadata and message stop event |
| DeepSeek | `/chat/completions` | Top-level `model` | Top-level `usage` | SSE | Chunk top-level `model` | Final chunk before `[DONE]` when `stream_options.include_usage=true`; other chunks `usage=null` | `data: [DONE]` |
| MiniMax OpenAI-compatible | Text Chat OpenAI-compatible | Top-level `model` | Top-level `usage` | JSON or streaming mode per same schema | Official schema says streaming object type is `chat.completion.chunk`; `model` is part of response schema | Official schema includes `usage`, but the docs page does not explicitly state whether it appears only in the final chunk | Official page documents streaming support, but not a chunk-by-chunk termination example on the cited page |
| MiniMax Anthropic-compatible | Text Chat Anthropic-compatible | Top-level `model` | Top-level `usage` | Streaming via `stream=true` | Official page exposes `model` in request/response schema | Official page exposes `usage` in response schema, but does not provide a detailed final-event usage rule on the cited page | Vendor-specific stream behavior is not fully specified on the cited page |
| GLM / Zhipu | `/chat/completions` | Top-level `model` | Top-level `usage` | SSE | Chunk top-level `model` | Example shows `usage` on the final chunk | `data: [DONE]` |
| Alibaba Cloud Bailian / Qwen | `/compatible-mode/v1/chat/completions` | Top-level `model` | Top-level `usage` | SSE | Chunk top-level `model` | Final usage chunk when `stream_options.include_usage=true`; other chunks `usage=null` | `data: [DONE]` |
| Tencent Hunyuan native API | `ChatCompletions` | Response top-level `Model` | Response top-level `Usage` | SSE | Official page confirms SSE when `Stream=true`; exact event schema is not shown on the cited native page | Native page confirms stream support but does not expose event-level final `Usage` rule on the cited page | SSE stream; exact terminal event shape not shown on the cited native page |
| Tencent Hunyuan OpenAI-compatible | `/v1/chat/completions` | Top-level `model` | Top-level `usage` | SSE | OpenAI-compatible chunk top-level `model` | Final usage chunk when `stream_options.include_usage=true` | OpenAI-compatible stream termination |
| Volcengine Ark / Doubao Chat API | Chat API / OpenAI-compatible invocation | Request `model` or endpoint mapping | Official Chat API page exists; detailed response field rules are clearer via OpenAI-compatible docs | Streaming supported | OpenAI-compatible invocation examples use request `model` | Official pages in this survey do not clearly document final usage chunk semantics for Chat API itself | Streaming supported; exact event rule not explicit on the cited Chat API page |
| Volcengine Ark / Doubao Responses API | `/api/v3/responses` | Top-level `model` in request and response object family | Response object docs exist | Streaming response docs exist | Response API documents stream support | The cited root page does not expose a concise final `usage` rule in the retrieved lines | Streaming response documented |

## OpenAI

Official docs:

- Chat API reference: <https://developers.openai.com/api/reference/resources/chat>
- Responses API reference: <https://developers.openai.com/api/reference/resources/responses/methods/create>

### Non-streaming

Endpoint family:

- `POST /chat/completions`

Official request shape:

- Request includes a `model` parameter.

Official response shape:

- `ChatCompletion` includes top-level `model`
- `ChatCompletion` includes top-level `usage`
- `usage` is documented as `CompletionUsage` with fields including
  `completion_tokens`, `prompt_tokens`, and `total_tokens`

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: `choices[*].finish_reason`

### Streaming

Official streaming behavior:

- Streamed chunks are `ChatCompletionChunk`
- Each chunk includes top-level `model`
- If `stream_options.include_usage` is set to `true`, an additional chunk is
  streamed before `data: [DONE]`
- That additional chunk contains the total `usage`
- All other chunks may include `usage`, but with `null`
- If the stream is interrupted, the final usage chunk may never arrive

Extraction rule:

- Requested model: request body `model`
- Observed model: any chunk top-level `model`
- Usage: final usage chunk only
- End reason: final non-empty `choices[*].finish_reason`
- Hard end marker: `data: [DONE]`

### Notes

- OpenAI also has the `Responses API`. Its non-streaming response contains
  top-level `usage`, but for cross-vendor normalization the `Chat Completions`
  schema is easier to align with other providers.

## Anthropic

Official docs:

- Messages examples: <https://docs.anthropic.com/en/api/messages-examples>
- Streaming messages: <https://docs.anthropic.com/en/api/streaming>

### Non-streaming

Endpoint family:

- `POST /v1/messages`

Official request shape:

- Request includes `model`

Official response examples show:

- top-level `type: "message"`
- top-level `model`
- top-level `usage`
- top-level `stop_reason`
- top-level `stop_sequence`

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: response top-level `stop_reason`

### Streaming

Official streaming behavior:

- Streaming uses SSE with named events
- `message_start` contains a `Message` object with empty `content`
- `message_start.message.model` is present in examples
- `message_start.message.usage` is present in examples
- `message_delta.usage` is cumulative according to the docs
- Stream ends with `message_stop`

Extraction rule:

- Requested model: request body `model`
- Observed model: `message_start.message.model`
- Usage:
  - initial usage: `message_start.message.usage`
  - authoritative final cumulative usage: last `message_delta.usage`
- End reason: `message_delta.delta.stop_reason`
- Hard end marker: `message_stop`

### Notes

- Anthropic streaming is structurally better documented than most vendors for
  event-level parsing.
- `usage` is not a final dedicated chunk; it evolves through cumulative
  `message_delta` events.

## Azure OpenAI

Official docs:

- Azure OpenAI REST reference: <https://learn.microsoft.com/en-us/azure/foundry/openai/reference>

### Non-streaming

Endpoint family:

- Azure OpenAI chat completions

Official response shape:

- `createChatCompletionResponse` includes top-level `model`
- `createChatCompletionResponse` includes top-level `usage`
- `object` is `chat.completion`

Extraction rule:

- Requested model:
  - operationally, Azure commonly routes by deployment in the URL
  - the response still includes top-level `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: `choices[*].finish_reason`

### Streaming

Official streaming behavior:

- Streaming uses data-only SSE and ends with `data: [DONE]`
- `createChatCompletionStreamResponse` includes top-level `model`
- streamed `object` is `chat.completion.chunk`
- `chatCompletionStreamOptions.include_usage` adds a usage chunk before
  `data: [DONE]`
- that usage chunk has `choices` as an empty array
- other chunks include `usage` with `null`

Extraction rule:

- Requested model: request configuration or deployment mapping
- Observed model: chunk top-level `model`
- Usage: final usage chunk only when `include_usage=true`
- End reason: final non-empty `choices[*].finish_reason`
- Hard end marker: `data: [DONE]`

## AWS Bedrock

Official docs:

- Converse: <https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html>
- ConverseStream: <https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html>

### Non-streaming

Endpoint family:

- `POST /model/{modelId}/converse`

Official request shape:

- The invoked model is identified by URI parameter `modelId`

Official response shape:

- Top-level `usage`
- Top-level `stopReason`
- Top-level `metrics`
- Output text is nested under `output.message.content`

Model identification nuance:

- Bedrock does not present a generic top-level `model` field in the native
  `Converse` response
- The requested model is the URI parameter `modelId`
- If prompt routing is involved, the trace model path may include
  `trace.promptRouter.invokedModelId`

Extraction rule:

- Requested model: request URI `modelId`
- Observed model:
  - base case: request URI `modelId`
  - routed case: `trace.promptRouter.invokedModelId` when returned
- Usage: response top-level `usage`
- End reason: response top-level `stopReason`

### Streaming

Endpoint family:

- `POST /model/{modelId}/converse-stream`

Official stream shape:

- Bedrock uses an event stream, not OpenAI-style SSE
- The stream includes `messageStart`, `messageStop`, and `metadata` events
- `metadata.usage` contains token usage
- `metadata.trace.promptRouter.invokedModelId` may identify the actually routed
  model

Extraction rule:

- Requested model: request URI `modelId`
- Observed model:
  - base case: request URI `modelId`
  - routed case: `metadata.trace.promptRouter.invokedModelId`
- Usage: `metadata.usage`
- End reason: `messageStop` or stream metadata stop state

### Notes

- Bedrock native APIs are the main outlier in this survey because `model`
  is request-addressed rather than returned as a uniform top-level output field.

## DeepSeek

Official docs:

- Create Chat Completion: <https://api-docs.deepseek.com/api/create-chat-completion>

### Non-streaming

Endpoint family:

- `POST /chat/completions`

Official response shape:

- top-level `model`
- top-level `object: "chat.completion"`
- top-level `usage`

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: `choices[*].finish_reason`

### Streaming

Official streaming behavior:

- Stream chunks use `object: "chat.completion.chunk"`
- Chunk examples include top-level `model`
- `stream_options.include_usage` adds an additional usage chunk before
  `data: [DONE]`
- That chunk contains total `usage`
- Other chunks include `usage: null`

Extraction rule:

- Requested model: request body `model`
- Observed model: any chunk top-level `model`
- Usage: final usage chunk
- End reason: final chunk `choices[*].finish_reason`
- Hard end marker: `data: [DONE]`

## MiniMax

Official docs:

- OpenAI-compatible Text Chat: <https://platform.minimax.io/docs/api-reference/text-chat-openai>
- Anthropic-compatible Text Chat: <https://platform.minimax.io/docs/api-reference/text-chat-anthropic>

### OpenAI-compatible API

Endpoint family:

- Text Chat (Compatible OpenAI API)

Official response schema:

- top-level `model`
- top-level `usage`
- `object` is documented as:
  - `chat.completion` for non-streaming
  - `chat.completion.chunk` for streaming

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: `choices[*].finish_reason`

Streaming note:

- The cited official page documents the response schema and the streaming object
  type, but it does not explicitly state on that page whether `usage` appears
  only on the final chunk, on every chunk, or only after stream completion.
- For proof logic, do not assume OpenAI-identical final-chunk semantics unless
  MiniMax documents that behavior on the exact endpoint you integrate.

### Anthropic-compatible API

Endpoint family:

- Text Chat (Compatible Anthropic API)

Official request and response schema:

- Request includes `model`
- Request includes `stream`
- Response schema includes top-level `usage`
- Response schema includes top-level `stop_reason`

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: response top-level `stop_reason`

Streaming note:

- The cited official page shows `stream` support and the response schema, but it
  does not provide a full event-level rule equivalent to Anthropic's own
  `message_start` and `message_delta` documentation.

## GLM / Zhipu

Official docs:

- API introduction: <https://docs.bigmodel.cn/cn/api/introduction>
- Chat completions API reference: <https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8>
- Streaming guide: <https://docs.bigmodel.cn/cn/guide/capabilities/streaming>

### Non-streaming

Endpoint family:

- `POST /api/paas/v4/chat/completions`

Official response schema:

- top-level `model`
- top-level `usage`
- `usage` contains `prompt_tokens`, `completion_tokens`, and `total_tokens`

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: `choices[*].finish_reason`

### Streaming

Official streaming behavior:

- Request enables `stream=true`
- Stream examples show each chunk with top-level `model`
- Final chunk example shows:
  - `finish_reason: "stop"`
  - top-level `usage`
- Stream ends with `data: [DONE]`

Extraction rule:

- Requested model: request body `model`
- Observed model: any chunk top-level `model`
- Usage: final chunk top-level `usage`
- End reason: final chunk `choices[*].finish_reason`
- Hard end marker: `data: [DONE]`

## Alibaba Cloud Bailian / Qwen

Official docs:

- Qwen API reference entry: <https://help.aliyun.com/zh/model-studio/qwen-api-reference/>
- Streaming output: <https://help.aliyun.com/zh/model-studio/stream>
- Completions interface reference: <https://help.aliyun.com/zh/model-studio/completions>

### Non-streaming

Endpoint family:

- OpenAI-compatible `POST /compatible-mode/v1/chat/completions`

Official request shape:

- Request includes `model`

Official response shape:

- OpenAI-compatible response includes top-level `model`
- Response includes top-level `usage`

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model`
- Usage: response top-level `usage`
- End reason: `choices[*].finish_reason`

### Streaming

Official streaming behavior:

- Stream output uses `chat.completion.chunk`
- Stream chunk examples include top-level `model`
- Intermediate chunks contain `usage: null`
- Final content chunk contains `finish_reason: "stop"`
- If `stream_options.include_usage=true`, the final usage chunk contains
  top-level `usage`
- Stream ends with `data: [DONE]`

Extraction rule:

- Requested model: request body `model`
- Observed model: any chunk top-level `model`
- Usage: final usage chunk only
- End reason: final content chunk `choices[*].finish_reason`
- Hard end marker: `data: [DONE]`

## Tencent Hunyuan

Official docs:

- Native API overview: <https://cloud.tencent.com/document/product/1729/101848>
- Native `ChatCompletions`: <https://cloud.tencent.com/document/api/1729/105701>
- OpenAI-compatible examples: <https://cloud.tencent.com/document/product/1729/111007>

### Native API

Endpoint family:

- TencentCloud API `ChatCompletions`

Official request shape:

- Request includes `Model`
- Request includes `Stream`

Official response shape:

- Native response examples include top-level `Model`
- Native response examples include top-level `Usage`
- Native documentation states that when `Stream=true`, the protocol is SSE

Extraction rule:

- Requested model: request body `Model`
- Observed model: response top-level `Model`
- Usage: response top-level `Usage`
- End reason: vendor-specific native response fields on the final response body

Streaming note:

- The cited native page clearly states SSE is used when `Stream=true`
- The cited native page does not provide a concise event-by-event final usage
  rule in the retrieved content
- For deterministic final usage chunk behavior, the OpenAI-compatible interface
  is better specified

### OpenAI-compatible API

Endpoint family:

- `POST https://api.hunyuan.cloud.tencent.com/v1/chat/completions`

Official request shape:

- Request includes `model`

Official streaming behavior:

- Tencent explicitly states that when streaming and
  `stream_options.include_usage=true`, `usage` is returned in the final data
  block
- The interface is documented as OpenAI-compatible

Extraction rule:

- Requested model: request body `model`
- Observed model: response top-level `model` or stream chunk top-level `model`
- Usage:
  - non-streaming: response top-level `usage`
  - streaming: final usage chunk only when `stream_options.include_usage=true`
- End reason: `choices[*].finish_reason`
- Hard end marker: OpenAI-compatible stream termination semantics

## Volcengine Ark / Doubao

Official docs:

- Chat API: <https://www.volcengine.com/docs/82379/1494384?redirect=1&lang=zh>
- Responses API: <https://www.volcengine.com/docs/82379/1585135?lang=zh>
- OpenAI SDK compatibility: <https://www.volcengine.com/docs/82379/1330626>
- SDK install page mentioning OpenAI compatibility:
  <https://www.volcengine.com/docs/82379/1319847>

### Chat API

Endpoint family:

- Ark Chat API
- OpenAI-compatible invocation is officially supported by Ark

Official request shape:

- OpenAI-compatible examples use `model`
- Ark documentation states its model invocation API is compatible with OpenAI
  API protocol and can use OpenAI community SDKs

Extraction rule:

- Requested model: request body `model` in OpenAI-compatible invocation
- Observed model:
  - preferred: response top-level `model` when using OpenAI-compatible response
  - otherwise: endpoint or deployment mapping inside Ark platform conventions
- Usage:
  - preferred: response top-level `usage` when using OpenAI-compatible response
  - otherwise: follow the exact Chat API response object used by the integrated
    SDK
- End reason: `choices[*].finish_reason` in OpenAI-compatible response

Streaming note:

- The cited Chat API page clearly exists and documents streaming support
- The retrieved official lines do not expose a concise final-chunk `usage`
  contract equivalent to OpenAI, DeepSeek, or Qwen
- If Ark is invoked strictly through OpenAI-compatible response shapes, use the
  compatible response object as the proof extraction target

### Responses API

Endpoint family:

- `POST /api/v3/responses`

Official request shape:

- Official examples use request body `model`
- Official examples use `stream: true` for streaming responses

Official response documentation:

- The Responses API root page documents:
  - creating model responses
  - the response object
  - streaming responses

Extraction rule:

- Requested model: request body `model`
- Observed model: response object fields from the documented response object
- Usage: response object `usage` when present in the exact response object
  variant you integrate
- End reason: response object terminal status or final stream event fields

Streaming note:

- The cited retrieved root page confirms dedicated "The response object" and
  "流式响应" sections
- The retrieved lines are not detailed enough to claim a final usage chunk rule
  comparable to OpenAI-compatible chat completions
- For production proof extraction, use the exact Responses API object shape from
  the integrated endpoint and lock test vectors to that shape

## Recommendations for FulfillPay

### Phase 1: non-streaming proof target

Preferred field extraction priority:

1. Request body `model`
2. Response top-level `model` when available
3. Response top-level `usage`
4. Vendor stop marker:
   - OpenAI, Azure, DeepSeek, GLM, MiniMax OpenAI-compatible:
     `choices[*].finish_reason`
   - Anthropic, MiniMax Anthropic-compatible:
     `stop_reason`
   - AWS Bedrock:
     `stopReason`

### Phase 2: streaming proof target

Vendors with clearly documented final usage behavior:

- OpenAI
- Azure OpenAI
- DeepSeek
- GLM
- Alibaba Cloud Bailian / Qwen
- Tencent Hunyuan OpenAI-compatible

Vendor with cumulative event usage:

- Anthropic

Vendor with metadata-stream usage:

- AWS Bedrock

Vendor whose cited official docs are not explicit enough on final usage chunk
timing:

- MiniMax
- Tencent Hunyuan native API
- Volcengine Ark Chat API
- Volcengine Ark Responses API

### Adapter design implication

A cross-vendor adapter should not assume a single stream pattern. At minimum, it
should support these categories:

1. Final usage chunk before `data: [DONE]`
2. Cumulative usage in event deltas
3. Usage in stream metadata
