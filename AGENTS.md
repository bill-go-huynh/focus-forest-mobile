# focus-forest-mobile — Agent Instructions

The Focus Forest consumer app: **React Native + Expo + TypeScript**.

Workspace rules in `../AGENTS.md` also apply. These repo rules govern implementation details. They never override product behavior (`../focus_forest_product_features.md` plus the confirmed decisions listed in `../docs/README.md`). If a constraint here conflicts with product behavior, flag it. Shared docs live in `../docs/`. If this repo is checked out on its own without the workspace, ask for the docs before making product or design decisions.

## Read first

Before any UI work:
1. `../docs/00_PRODUCT_CONTEXT.md`
2. `../docs/01_DESIGN_SYSTEM.md`
3. `../docs/02_UX_PRINCIPLES.md`
4. `../docs/03_TREE_SYSTEM.md`
5. `../docs/04_ANIMATION_SYSTEM.md`
6. The relevant screen in `../docs/05_MOBILE_INFORMATION_ARCHITECTURE.md`
7. `../docs/11_ACCESSIBILITY.md`

For anything that reads or displays tree state or session results, also read `../docs/07_API_BOUNDARIES.md`.

## Responsibilities

- All consumer UI across the full product: onboarding, Home, timer, session completion, history, tree details, forest, insights, recap, profile, settings, achievements, collection, species and cosmetics, social (Together tab), Focus Together, challenges, events, Community Tree, leaderboards, seasonal content
- **Tree rendering and all animation**: the core renderer first, then the advanced renderer (`../docs/03_TREE_SYSTEM.md` §8)
- The local timer (accurate through backgrounding, lock, and restart) and the offline session queue
- Accessibility adaptations (text scaling, reduced motion, screen reader descriptions)

## Not responsible for

- Deciding product truth: whether a session counts, growth, stage, vitality, streaks, rest-day validity, goal completion, rewards, event and challenge progress, month boundaries. Never hardcode tunable values such as the session minimum or thresholds. **Display what the API returns.** Optimistic previews are allowed only as described in `07_API_BOUNDARIES.md` §4.

## Rules

- **Test first** (`../AGENTS.md` → Test-first development). Here that means Jest (`jest-expo`) with React Native Testing Library, in `__tests__/` folders or `*.test.ts(x)` files, never inside `src/app/` (every file there is a route). Priorities: timer accuracy (background, lock, kill and restart) with fake timers, the offline session queue (queueing, retry, no duplicates), rendering what the API returns (including unknown content identifiers and never-dead tree states), accessibility labels and roles, and reduced-motion behavior. Mock the API at the network boundary; never re-implement product rules in tests or code.
- **Tokens only.** No arbitrary colors, spacing, radii, font sizes, shadows, opacities, or durations. If a token is missing, add it to the theme **and** document it in `01_DESIGN_SYSTEM.md`. Tree and scene art uses species and asset palettes, not UI tokens.
- **Reuse components.** Build screens from the shared primitives. Extend with variants instead of making near-duplicates.
- **The tree is the hero.** On Home it is the focal point. It is never a thumbnail in a stats grid. No generic dashboards.
- **Animation restraint.** Calm, meaningful, interruptible, and reduced-motion-aware. No celebrations during focus. No confetti, pulsing, or shaking.
- **Never render a dead, wilted, or damaged tree.**
- **Accessibility is part of done:** 44pt targets, AA contrast, dynamic type up to 200%, labels, tree descriptions.
- **Both themes.** Every screen must work in light and dark mode.
- **Unknown content identifiers** (species, traits) from the API get a graceful fallback, never a crash.
- **Timer reliability beats everything.** Never lose a user's session.
- Follow the documented navigation: 4 tabs, with Together (the community hub) added in Phase 11, and Focus as a full-screen flow. Tabs and Together sections appear only with the phase that fills them.
- The core tree renderer uses authored fixed slots. Don't build a generalized anchor engine before Phase 8–9 (`../docs/03_TREE_SYSTEM.md` §8).
- **Build the current phase only** (`../docs/12_PRODUCT_IMPLEMENTATION_PLAN.md`). Later phases are planned scope, but don't implement them early. Structure code so they can be added without rewrites.

## Tooling

- Expo SDK 57, Expo Router (file-based routes in `src/app/`; keep non-route code outside it), TypeScript strict, npm.
- **Add packages with `npx expo install <pkg>`** so versions match the SDK. Dependency rules: `../AGENTS.md` → Dependencies and supply-chain security.
- Expo APIs change every SDK. Check the versioned docs (`https://docs.expo.dev/versions/v57.0.0/`) instead of relying on memory.
- `ios/` and `android/` are generated (Continuous Native Generation). Configure native behavior in `app.json` and config plugins, never by hand.
- **Theme** (`src/theme/`): read tokens with `useTheme()`. The theme follows the system color scheme. Values are provisional until Phase 0 (`themeValueStatus`), and `src/theme/__tests__/tokens.test.ts` checks AA contrast for every text/surface pair. A lint rule rejects hardcoded colors, spacing, radii, font sizes and weights, line heights, opacity, z-index, shadows, and durations outside `src/theme/`.
- **Accessibility** (`src/accessibility/`):
  - `useReducedMotion()` is true when the system **or** the in-app setting reduces motion. `AccessibilityProvider`'s `appReducedMotion` prop takes the in-app setting and is connected to the API preferences in M13.
  - `useFontScale()` tells layouts when text is at 200% or more, so they can adapt.
  - `touchTargetHitSlop()` and `MIN_TOUCH_TARGET` give every interactive element a hit area of at least 44×44.
  - `announce()` says every motion- or haptic-signaled outcome as text.
  - A lint rule rejects `allowFontScaling={false}` and `maxFontSizeMultiplier` below 2.
- **Components** (`src/components/`): `Button` (`variant` is `primary`, `secondary`, or `tertiary`), `IconButton` (requires `accessibilityLabel`; the icon is drawn through `icon({ color, size })`), and `DestructiveButton` (only `onRequestConfirm`, never `onPress`: the destructive action runs only after a confirmation step). `Card` (static, or tappable with a required `accessibilityLabel`), `ListRow` (`title`, `subtitle`, `meta`, `leading` icon; either `onPress` or a trailing `action`, never both), and `Chip` (`label` is always required, `selected`, optional `topicColor` from `topic.1`–`topic.12` and `icon`). `Input` (`label`, `value`, `onChangeText`, `helper`, `error`, `disabled`, `multiline`, common `TextInput` settings, and a `ref` with `focus()`/`blur()`, ready for a form library `Controller`). `Sheet`, `Modal`, and `Confirmation` share `Overlay` (internal): the parent owns `visible`, each takes `onRequestClose` or `onCancel`, and `returnFocusRef` (every button forwards `ref`) returns screen-reader focus to the opener. `ProgressRing` (`progress` 0–100, clamped; `label` and `valueText` are required and always shown; `tone` is `forest` or `accent`, never red; drawn with `react-native-svg`). State components: `EmptyState` (`illustration`, one-sentence `message`, at most one `action`), `ErrorState` (`message`, `reassurance`, `onRetry`, `retryLabel`), and `Skeleton` / `SkeletonGroup`. Spot illustrations (`src/components/illustrations.tsx`) are placeholders until Phase 0 art. State copy is checked by `assertCalmCopy`. Navigation: `src/app/(tabs)/` holds the four tabs in the order set by `src/navigation/tabs.ts`, drawn by `TabBar`; Settings is `src/app/(tabs)/profile/settings.tsx` (depth 2). `Screen` wraps every screen (heading, gutter, scroll). Route tests use `appRoutes` (`src/test-utils/routes.ts`) with `renderRouter`, and `route-structure.test.ts` enforces the tab list and the three-level depth limit. API layer (`src/api/`): `createApi` wires `createHttp` (JSON, timeout, error kinds), `SessionStore` (tokens in memory, persisted by `secureTokenStore` in expo-secure-store; single-flight refresh), `createApiClient` (Bearer header, proactive refresh, one refresh and one retry on 401, clears the session when renewal fails), and `createAuth` (`signUp`, `signIn`, `restoreSession`, `signOut`, on the A3 endpoints). `ApiProvider` supplies it with the TanStack Query client (`createQueryClient`: retries only network and 5xx errors) and drops the query cache on sign-out; read it with `useApi()` and `useSession()`. Errors carry a `kind`: `network`, `unauthenticated`, `http`, `invalid-response`, `configuration`. Never log tokens; lint blocks AsyncStorage in `src/api/`. The base URL comes from `EXPO_PUBLIC_API_URL` (`.env.example`). Auth (`src/auth/`, routes `src/app/(auth)/`): the root layout restores the session once at launch, shows a plain `launch-screen` while the status is `unknown`, then uses `Stack.Protected` to show `(tabs)` only when signed in and `(auth)` otherwise. `useSignUp` creates the account, then sends one `PATCH /me/profile` with the display name and `getDeviceTimeZone()`; `AuthFlowProvider` keeps the auth screens up until that finishes, and `retryProfile` repeats only the profile step. Form errors go through `describeAuthError`, which shows only known API messages. Profile (`src/profile/`, routes `src/app/(tabs)/profile/index.tsx` and `edit.tsx`): `useProfile` (GET `/me/profile`) and `useUpdateProfile` (PATCH, updates the cache); `profileFormSchema` mirrors A4 (a set name cannot be cleared; bio up to 160, blank clears it); `profileChanges` sends only changed fields; `Avatar` draws initials (`initialsOf`) or a seed. Preferences (`src/preferences/`, route `src/app/(tabs)/profile/settings.tsx`): `usePreferences` (GET `/me/preferences`) and `useUpdatePreferences` (PATCH one change at a time: optimistic, serial via a mutation scope, only the last answer replaces the cache, failed saves restore just their fields). `AppearanceProviders` feeds the theme (`ThemeProvider preference`) and `reducedMotion` (`AccessibilityProvider appReducedMotion`) app-wide; the root layout keeps the launch screen on top until a signed-in user's preferences arrive (one failed read stops the wait). Notification categories appear only once their phase exists (`visibleNotificationCategories`, `CURRENT_PHASE`); Phase 1 shows none. `SwitchRow` is the on/off setting primitive. Route tests render with `renderApp` (`src/test-utils/render-app.ts`: `renderRouter`, then real timers, since `renderRouter` leaves fake timers on) and start signed in with `src/test-utils/secure-store-mock.ts`. Tappable primitives share `PressableSurface` (internal). Tests with overlays use `mockControlledTiming` (`src/test-utils/animation.ts`) and `createNodeMock` for focus checks. Test components with `renderWithProviders` (`src/test-utils/render.tsx`).
- `npm run check` runs typecheck, lint, format check, and tests. `npm run doctor` runs `expo-doctor`.

## Current state

Expo Router root layout with the TanStack Query, theme, accessibility, and safe-area providers, and the four-tab shell (Home, Forest, Insights, Profile → Settings) showing designed empty states. Modules M1 (design tokens and theme), M2 (accessibility foundation), M3 (buttons), M4 (card, list row, chip), M5 (input), M6 (sheet, modal, confirmation), M7 (progress ring), M8 (empty, skeleton, and error states), M9 (four-tab navigation), M10 (API client and secure token storage), M11 (sign up, sign in, restore session), M12 (profile and edit profile), and M13 (settings and preferences) are done. Next is X1 (Phase 1 acceptance). The next step is Phase 1 in `../docs/12_PRODUCT_IMPLEMENTATION_PLAN.md`.
