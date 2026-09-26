# focus-forest-mobile

The Focus Forest consumer app: React Native, Expo (SDK 57, Expo Router), TypeScript.

Product and design docs live in the workspace (`../docs/`). Agent and implementation rules: `AGENTS.md`.

## Setup

Requires Node.js 24 and npm 11.

```sh
npm install
npm start          # Expo dev server (i = iOS simulator, a = Android emulator)
```

Add packages with `npx expo install <pkg>` so versions match the Expo SDK.

## Scripts

| Script | Purpose |
|---|---|
| `npm start` / `ios` / `android` / `web` | Start the Expo dev server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Jest (`jest-expo`) |
| `npm run doctor` | `expo-doctor` project health check |
| `npm run check` | Typecheck, lint, format check, and tests |
