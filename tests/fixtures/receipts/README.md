# Receipt fixtures

Drop your own receipt images (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) in this
folder, then register them in `tests/fixtures/receipts.ts` so the
`parse-image` integration test (GATE #2) can exercise the Vision parser.

Example entry in `receipts.ts`:

```ts
{
  filename: 'my-receipt-01.png',
  label: 'Local market receipt',
  expected: { merchant: 'Local Market', amount: 42.50 },
},
```

Images over 5MB must be resized — the Anthropic Vision API rejects them.

The `RECEIPT_FIXTURES` array ships empty so the repo does not leak personal
purchase data. The test suite skips the receipt accuracy gate when the array
is empty.
