export interface ReceiptFixture {
  /** Filename in tests/fixtures/receipts/ (e.g., "plaza-vea-01.jpg") */
  filename: string;
  /** Short description for test output */
  label: string;
  expected: {
    merchant: string;
    amount: number;
    currency?: string;
  };
}

export const RECEIPT_FIXTURES: ReceiptFixture[] = [
  {
    filename: 'metro-01.png',
    label: 'Metro supermarket receipt #1',
    expected: { merchant: 'Metro', amount: 26.50 },
  },
  {
    filename: 'metro-02.png',
    label: 'Metro supermarket receipt #2',
    expected: { merchant: 'Metro', amount: 244.55 },
  },
  {
    filename: 'plaza-vea-01.png',
    label: 'Plaza Vea supermarket receipt #1',
    expected: { merchant: 'Plaza Vea', amount: 113.18 },
  },
  {
    filename: 'plaza-vea-02.png',
    label: 'Plaza Vea supermarket receipt #2',
    expected: { merchant: 'Plaza Vea', amount: 99.20 },
  },
  {
    filename: 'wong-01.jpeg',
    label: 'Wong supermarket receipt #1',
    expected: { merchant: 'Wong', amount: 161.92 },
  },
  {
    filename: 'wong-02.jpeg',
    label: 'Wong supermarket receipt #2',
    expected: { merchant: 'Wong', amount: 157.76 },
  },
  {
    filename: 'wong-03.jpeg',
    label: 'Wong supermarket receipt #3',
    expected: { merchant: 'Wong', amount: 62.03 },
  },
  {
    filename: 'wong-04.png',
    label: 'Wong supermarket receipt #4',
    expected: { merchant: 'Wong', amount: 78.81 },
  },
  {
    filename: 'wong-05.png',
    label: 'Wong supermarket receipt #5',
    expected: { merchant: 'Wong', amount: 81.33 },
  },
  {
    filename: 'wong-06.png',
    label: 'Wong supermarket receipt #6',
    expected: { merchant: 'Wong', amount: 109.64 },
  },
  {
    filename: 'grifo-el-salvador-01.png',
    label: 'Grifo el Salvador gas station receipt',
    expected: { merchant: 'Grifo el Salvador', amount: 110.86 },
  },
];
