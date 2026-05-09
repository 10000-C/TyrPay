import type { BuyerSdk } from "@fulfillpay/buyer-sdk";
import { createBuyerTools, type BuyerTool } from "@fulfillpay/buyer-skill";
import type { ClaudeTool, OpenAITool } from "./types.js";

/**
 * BuyerKit wraps BuyerSdk into a set of LLM-callable tools.
 *
 * Usage (Claude API):
 *   const kit = new BuyerKit(sdk);
 *   const response = await anthropic.messages.create({ tools: kit.tools, ... });
 *   const result = await kit.execute(toolUseBlock.name, toolUseBlock.input);
 *
 * Usage (OpenAI API):
 *   const kit = new BuyerKit(sdk);
 *   const response = await openai.chat.completions.create({ tools: kit.toOpenAIFormat(), ... });
 *   const result = await kit.execute(toolCall.function.name, JSON.parse(toolCall.function.arguments));
 */
export class BuyerKit {
  private readonly _tools: BuyerTool[];

  constructor(sdk: BuyerSdk) {
    this._tools = createBuyerTools(sdk);
  }

  /** Tool definitions in Claude API format — pass directly to the `tools` field. */
  get tools(): ClaudeTool[] {
    return this._tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));
  }

  /** Tool definitions in OpenAI function-calling format — pass directly to the `tools` field. */
  toOpenAIFormat(): OpenAITool[] {
    return this._tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema
      }
    }));
  }

  /**
   * Execute a tool by name with the given input.
   * Call this when the LLM returns a tool_use / function_call block.
   */
  async execute(name: string, input: unknown): Promise<unknown> {
    const tool = this._tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `Unknown buyer tool: "${name}". Available: ${this._tools.map((t) => t.name).join(", ")}`
      );
    }
    return tool.execute(input);
  }

  /** Names of all registered tools. */
  get toolNames(): string[] {
    return this._tools.map((t) => t.name);
  }
}
