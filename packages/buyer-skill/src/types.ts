export interface FulfillPayTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<unknown>;
}

export type BuyerTool = FulfillPayTool;
