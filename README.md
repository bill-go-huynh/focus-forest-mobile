# focus-forest-mobile

The Focus Forest consumer app: React Native, Expo (SDK 57, Expo Router), TypeScript.

Product and design docs live in the workspace (`../docs/`). Agent and implementation rules: `AGENTS.md`.

## Setup

Requires Node.js 24 and npm 11. Android also needs Android Studio (SDK, an emulator) and JDK 17 with `ANDROID_HOME` set.

```sh
cp .env.example .env   # EXPO_PUBLIC_API_URL: http://10.0.2.2:3000 on the Android emulator, your LAN IP on a phone
npm install
npx expo run:android   # builds the dev client (creates android/), installs it, starts Metro
```

After the first build, `npm start` is enough until a native part changes (a new native package, `app.json`, or `modules/`). `android/` is generated: delete it and rebuild instead of editing it.

- The app is a development build, not Expo Go: it carries a local native module (`modules/focus-ongoing-notification`, the live focus countdown) and Google sign-in.
- `google-services.json` (Firebase project `focus-99b6b`, for Android push) is git-ignored. Download it again from the Firebase console → Project settings → Android app `com.billhuynh.focusforest` and put it in this folder. EAS builds read it from the `GOOGLE_SERVICES_JSON` file variable instead.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is the API's `GOOGLE_CLIENT_IDS` (the Web OAuth client). Each signing key (debug, EAS preview) needs its SHA-1 added as an Android OAuth client in Google Cloud.
- Add packages with `npx expo install <pkg>` so versions match the Expo SDK.

### Shareable APK (EAS)

The EAS project is `@bill-huynh/focus-forest`. Variables come from the EAS `preview` environment, not `.env`:

```sh
npx eas-cli@latest login
npx eas-cli@latest env:list --environment preview   # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, GOOGLE_SERVICES_JSON
npx eas-cli@latest build -p android --profile preview
```

Push needs the FCM V1 service-account key uploaded to Expo (`eas credentials` → Android). It is a secret and never goes in the repo.

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
