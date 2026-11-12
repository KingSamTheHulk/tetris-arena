# Contributing to Tetris Arena

Thanks for taking the time to contribute. This project is small and dependency-free, so getting started is quick.

## Ways to help

- Report bugs or rough edges via [GitHub Issues](https://github.com/<your-username>/tetris-arena/issues).
- Suggest gameplay, balance, or UX improvements.
- Improve the AI heuristic or add tests.
- Fix typos or clarify the documentation.

Before opening a large pull request, please open an issue to discuss the change so we can agree on the approach.

## Development setup

Requirements: **Node.js 18+** (tested on Node 26). There are no third-party dependencies and no build step.

```bash
git clone https://github.com/<your-username>/tetris-arena.git
cd tetris-arena
npm run dev        # starts the server with --watch on http://127.0.0.1:3000
```

Run the test suite before and after your change:

```bash
npm test
```

## Project layout

| Path | What lives here |
| --- | --- |
| `public/engine.js` | Pure game rules and the AI search — keep this DOM-free and Node-testable. |
| `public/game.js` | Browser-only code: canvas rendering, input, match lifecycle, API calls. |
| `public/index.html` / `styles.css` | Markup and styling. |
| `server.js` | HTTP routing and static file serving. |
| `lib/store.js` | Persistent ratings and match history. |
| `test/engine.test.js` | `node:test` unit tests for the engine. |

## Coding guidelines

- **Match the existing style.** Two-space indentation, double quotes, semicolons, trailing commas in multi-line literals. No comments unless they explain *why*, not *what*.
- **Keep `engine.js` pure.** It must not touch `window`, `document`, or `fetch` — that is what makes it testable in Node and reusable on both boards.
- **No new dependencies** without prior discussion. The zero-dependency design is intentional.
- **Add tests** for engine logic changes. Tests live in `test/` and run with `npm test`.
- **Do not commit runtime data.** `data/scores.json` is gitignored on purpose.
- **Preserve the match API.** Rating changes are ±5 and the server is the source of truth. If you change a payload shape, update the README's API section.

## Commit messages

Use short, imperative subject lines, optionally with a scope:

```
engine: fix lock delay reset on rotate
game: add pause key
docs: clarify AI heuristic weights
```

Keep the subject under ~72 characters. Explain *why* in the body when it is not obvious.

## Pull requests

1. Fork the repo and create a topic branch (`fix/lock-delay`, `feat/pause`).
2. Make the change, keeping the diff focused.
3. Run `npm test` and confirm everything passes.
4. Open the PR with a clear description: what changed, why, and how you verified it. Link any related issues.
5. Be responsive to review comments — small follow-up commits are fine; there is no need to force-push.

## Code of conduct

Be respectful and constructive. Harassment, personal attacks, and dismissive behavior are not welcome. Assume good intent and keep discussions focused on the work.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

---

Tetris is a registered trademark of The Tetris Company. This project is an independent fan implementation for educational purposes and is not affiliated with or endorsed by The Tetris Company.
