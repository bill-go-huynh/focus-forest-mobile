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

Push notifications need an EAS project: set `expo.extra.eas.projectId` (as `eas init` does) and a development build. Without it, turning a notification on still asks for the permission, but no device is registered and nothing arrives; Settings still saves every choice. Push does not work in Expo Go on Android.

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
| `npm run release:audit` | Fails while any placeholder art remains (the public-release gate) |
