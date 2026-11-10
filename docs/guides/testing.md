# Testing

| Command              | What it runs                     |
| -------------------- | -------------------------------- |
| `pnpm test`          | Unit tests (node)                |
| `pnpm test:browser`  | Component tests in real Chromium |
| `pnpm test:all`      | Both projects                    |
| `pnpm test:coverage` | Coverage report                  |

## Debugging browser tests

- Headed mode: `pnpm vitest --project browser --browser.headless=false`
- Filter: `pnpm vitest run --project browser button`
