export interface TyrPayTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<unknown>;
}

export type BuyerTool = TyrPayTool;
