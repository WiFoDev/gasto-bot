export interface ReceiptFixture {
  /** Filename in tests/fixtures/receipts/ (e.g., "plaza-vea-01.jpg") */
  filename: string;
  /** Short description for test output */
  label: string;
  expected: {
    merchant: string;
    amount: number;
    currency?: string;
    /** Expected category slug — only set for receipts with an obvious category */
    category_slug?: string;
  };
}

// To run the receipt parse accuracy test (GATE #2), drop your own receipt
// images into tests/fixtures/receipts/ and register them here. See
// tests/fixtures/receipts/README.md for details.
export const RECEIPT_FIXTURES: ReceiptFixture[] = [];
