declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  interface ParseOptions {
    /**
     * Maximum number of pages to parse
     */
    max?: number;

    /**
     * Normalization of rendered text
     */
    normalizeWhitespace?: boolean;

    /**
     * Disable combining page items
     */
    disableCombineTextItems?: boolean;
  }

  function parse(dataBuffer: Buffer, options?: ParseOptions): Promise<PDFData>;

  export = parse;
}
