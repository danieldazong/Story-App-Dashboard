declare module "mammoth" {
  export type ExtractRawTextResult = {
    value: string;
    messages: { type: string; message: string }[];
  };

  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ExtractRawTextResult>;
}
