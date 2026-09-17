# 11-clerk-auth

Read AGENTS.md first and follow it strictly.

Study the existing dashboard shell, the Settings Account card and all five screens, then add real Clerk authentication with admin-only access by following the Clerk documentation pasted below.

Keep the existing UI, layout and navigation intact. Do not change any screen design. If any screen needs a structural change to accommodate auth, ask me before implementing.

## What to implement

**Sign-in route.** A single `app/sign-in/[[...sign-in]]/page.tsx` using Clerk's prebuilt `<SignIn />` component, centered on a `page` background. There is **no sign-up route** — this is an internal tool and operators are provisioned in the Clerk Dashboard. Do not add a sign-up link, a create-account flow, or a self-serve invite.

**Provider.** Wrap the root layout in `<ClerkProvider>`. Style the Clerk component through its appearance API to match the design system — `primary` for the submit button with a white label, `card` surfaces, `border` borders, `text` and `muted` type colors, Inter, 8px radii, no shadows.

**Middleware.** Add `clerkMiddleware()` with `createRouteMatcher` treating everything except `/sign-in` and static assets as protected. Unauthenticated requests to any dashboard route redirect to `/sign-in`.

**Role gate.** Per the Clerk docs below, roles live in `publicMetadata` and must be surfaced on the session token. Configure the session token claim, add the `types/globals.d.ts` role declaration, and gate access to the `(dashboard)` route group so only a user whose role is `admin` can reach any dashboard page. A signed-in non-admin sees a `Not authorised` page with a sign-out action, not a redirect loop and not a dashboard shell.

Clerk's own middleware reference states that middleware is not the best place to protect routes and that access should be protected as close to the resource as possible. So implement **both** layers: middleware for the unauthenticated redirect, and a server-side role check inside the `(dashboard)` layout for authorisation. Do not rely on middleware alone.

**Sidebar footer.** Add a signed-in operator block at the bottom of the existing sidebar — avatar, name, and a `Sign out` action — using Clerk's `<UserButton />` or `useUser` plus `signOut`. It must sit flush at the bottom of the full-height sidebar without disturbing the four nav items above it. Nothing else in the sidebar changes.

**Settings Account card.** Replace the values currently read from `data/settings-defaults.ts` with the real session user: name, primary email address, and the role from session claims rendered in the existing role pill. `Change password` links to Clerk's account management. Remove only the account fields from `data/settings-defaults.ts` — every other default on that screen stays as-is.

**Server helper.** Add `lib/auth.ts` exporting a `requireAdmin()` function for use in Server Components, Server Actions and Route Handlers. It reads the session, throws or redirects when the caller is not an admin, and returns the Clerk user id. Every Server Action added in later prompts will call it first.

## Constraints

- Publishable key in the browser, secret key server-side only. Never expose `CLERK_SECRET_KEY`.
- Do not cache a token in a module-level variable. Token retrieval always goes through Clerk's `getToken`.
- Do not build custom auth, a custom session cookie, or a password form of your own.
- Do not add the Clerk role-management admin tool from the docs below — operators are managed in the Clerk Dashboard and the Settings Team card is display-only until a later prompt.
- Do not create any Supabase client in this prompt. The Supabase `accessToken` wiring is the next prompt's job.
- Do not touch the Books, Book editor, Chapter editor, Dashboard, Uploads or Bulk import screens beyond what the sidebar footer and the Account card require.
- Add the required environment variables to `.env.example` with placeholder values and no real keys.

## States

- **Unauthenticated** — redirected to `/sign-in` from any dashboard route.
- **Authenticating** — Clerk's own loading state; do not build a custom one.
- **Signed in as admin** — full dashboard access, sidebar footer shows the operator.
- **Signed in as non-admin** — `Not authorised` page with a short heading, one muted line, and a `Sign out` action.
- **Signed out** — returns to `/sign-in`.

## Verification

Confirm that a signed-in user without `admin` in `publicMetadata` cannot reach `/`, `/books`, `/uploads` or `/settings`, and that removing the middleware while leaving the layout check in place still blocks them. That second test proves the authorisation boundary is not middleware-dependent.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

---

# Expo Quickstart

**Example Repository**

- [Native Components Quickstart](https://github.com/clerk/clerk-expo-quickstart/tree/main/NativeComponentQuickstart)
- [JS + Native Sign-in Quickstart](https://github.com/clerk/clerk-expo-quickstart/tree/main/JSWithNativeSignInQuickstart)
- [JS Only Quickstart](https://github.com/clerk/clerk-expo-quickstart/tree/main/JSOnlyQuickstart)

**Before you start**

- [Set up a Clerk application](https://clerk.com/docs/getting-started/quickstart/setup-clerk.md)

There are three approaches for adding authentication to your Expo app.

**For AI agents:** In an existing Expo app, run `npx clerk@latest init --framework expo` to install `@clerk/expo` and pull your keys into your project's env file (it won't scaffold screens or bootstrap a new app, so follow the steps below for the provider and UI). Install [Clerk's skills](https://clerk.com/docs/guides/ai/skills.md) with `npx skills add clerk/skills` — includes `clerk-expo`.

| Approach                  | Auth UI                      | Requires dev build              | Best for             |
| ------------------------- | ---------------------------- | ------------------------------- | -------------------- |
| **Hosted authentication** | In-app browser               | No (works in Expo Go)           | Fastest hosted setup |
| **Native components**     | Prebuilt native components   | Yes                             | Prebuilt native UI   |
| **Custom flow**           | Your React Native components | No; native sign-in requires one | Full control over UI |

Use the following tabs to choose your preferred approach:

**Hosted authentication**

[Hosted authentication](https://clerk.com/docs/expo/guides/account-portal/hosted-auth.md) opens Account Portal in a browser authentication session. Account Portal supports the sign-in and sign-up methods enabled for your Clerk application.

1. ## Enable Native API

   In the Clerk Dashboard, navigate to the [**Native applications**](https://dashboard.clerk.com/~/native-applications) page and enable the Native API. This is required to integrate Clerk in your native application or browser extension.

   > Enabling the Native API opens a public request pathway that bypasses browser-based CAPTCHA challenges. Learn more about [how the Native API affects bot protection](https://clerk.com/docs/guides/secure/bot-protection.md#native-api-and-captcha).

2. ## Create a new Expo app

   If you don't already have an Expo app, run the following commands to [create a new one](https://docs.expo.dev/tutorial/create-your-first-app/).

   ```npm
   npx create-expo-app@latest clerk-expo
   cd clerk-expo
   ```

3. ## Remove the starter routes

   The default Expo template includes starter routes that aren't used in this guide. Remove them:

   ```bash
   rm -f src/app/index.tsx src/app/explore.tsx
   ```

   This guide replaces the starter `src/app/_layout.tsx` file and creates the app routes in later steps.

   > If your Expo app uses a root `app` folder instead of `src/app`, use the same file paths without `src/`.

4. ## Install dependencies

   Install the Clerk Expo SDK, secure token storage, and the Expo packages required to open the hosted browser session:

   filename: terminal

   ```sh
   npx expo install @clerk/expo expo-secure-store expo-auth-session expo-crypto expo-web-browser
   ```

5. ## Set your Clerk API keys

   Add your Clerk Publishable Key to your `.env` file. This key can always be retrieved from the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard.
   1. In the Clerk Dashboard, navigate to the [**API keys**](https://dashboard.clerk.com/~/api-keys) page.
   2. In the **Quick Copy** section, copy your Clerk Publishable Key.
   3. Paste your key into your `.env` file.

   The final result should resemble the following:

   filename: .env

   ```env
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY={{pub_key}}
   ```

6. ## Verify `app.json` plugins

   Expo automatically adds the required config plugins to your `app.json` file when you install the packages. Verify that `@clerk/expo` and `expo-secure-store` appear in the `plugins` array:

   filename: app.json

   ```json
   {
     "expo": {
       "ios": {
         "bundleIdentifier": "com.example.myapp"
       },
       "android": {
         "package": "com.example.myapp"
       },
       "plugins": ["expo-secure-store", "@clerk/expo"]
     }
   }
   ```

   Hosted authentication derives its default callback from these identifiers. On Android, the Clerk config plugin also registers the matching intent filter. Add the app on the [**Native applications**](https://dashboard.clerk.com/~/native-applications) page before you create a production build: the iOS bundle identifier, and the Android **namespace** and **package name**.

7. ## Add `<ClerkProvider>` to your root layout

   The [<ClerkProvider>](https://clerk.com/docs/expo/reference/components/clerk-provider.md) component provides session and user context to Clerk's hooks and components. It's recommended to wrap your entire app at the entry point with `<ClerkProvider>` to make authentication globally accessible. See the [reference docs](https://clerk.com/docs/expo/reference/components/clerk-provider.md) for other configuration options.

   Add the component to your root layout and pass your Publishable Key and `tokenCache` from `@clerk/expo/token-cache` as props, as shown in the following example:

   filename: src/app/\_layout.tsx

   ```tsx
   import { ClerkProvider } from "@clerk/expo";
   import { tokenCache } from "@clerk/expo/token-cache";
   import { Slot } from "expo-router";

   const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

   if (!publishableKey) {
     throw new Error("Add your Clerk Publishable Key to the .env file");
   }

   export default function RootLayout() {
     return (
       <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
         <Slot />
       </ClerkProvider>
     );
   }
   ```

8. ## Add hosted authentication

   Create a `src/app/index.tsx` file. The following example opens Account Portal for sign-up. After authentication, the SDK updates `useAuth()` with the signed-in state.

   filename: src/app/index.tsx

   ```tsx
   import { useAuth } from "@clerk/expo";
   import { useHostedAuth } from "@clerk/expo/hosted-auth";
   import {
     ActivityIndicator,
     Button,
     StyleSheet,
     Text,
     View,
   } from "react-native";

   export default function MainScreen() {
     const { isLoaded, isSignedIn } = useAuth();
     const { startHostedAuth } = useHostedAuth();

     const handleSignUp = async () => {
       try {
         await startHostedAuth({ mode: "sign-up" });
       } catch (error) {
         // Handle the error in your app.
       }
     };

     if (!isLoaded) {
       return (
         <View style={styles.container}>
           <ActivityIndicator size="large" />
         </View>
       );
     }

     return (
       <View style={styles.container}>
         {isSignedIn ? (
           <Text>You're signed in</Text>
         ) : (
           <Button title="Sign up" onPress={handleSignUp} />
         )}
       </View>
     );
   }

   const styles = StyleSheet.create({
     container: {
       flex: 1,
       gap: 12,
       alignItems: "center",
       justifyContent: "center",
     },
   });
   ```

9. ## Run your project

   Start the app in Expo Go or create a development build:

   filename: terminal

   ```sh
   npx expo start

   # Or create a development build
   npx expo run:ios
   npx expo run:android
   ```

   Then use the terminal shortcuts to run the app on your preferred platform:
   - Press `i` to open the iOS simulator.
   - Press `a` to open the Android emulator.
   - Scan the QR code with Expo Go to run the app on a physical device.

10. ## Create your first user

    Once the app opens on your device or simulator:
    - Open the sign-up flow.
    - Enter your details and complete the authentication flow.
    - After signing up, your first user will be created and you'll be signed in.

**Native components**

> **Beta:** This feature is currently in beta. Functionality may change before general availability. If you run into any issues, please reach out to our [support team](https://clerk.com/contact/support).

This approach uses Clerk's [prebuilt native components](https://clerk.com/docs/expo/reference/native-components/overview.md) that render using SwiftUI on iOS and Jetpack Compose on Android. Choose it when you want authentication rendered with native components and can use a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

1. ## Enable Native API

   In the Clerk Dashboard, navigate to the [**Native applications**](https://dashboard.clerk.com/~/native-applications) page and enable the Native API. This is required to integrate Clerk in your native application or browser extension.

   > Enabling the Native API opens a public request pathway that bypasses browser-based CAPTCHA challenges. Learn more about [how the Native API affects bot protection](https://clerk.com/docs/guides/secure/bot-protection.md#native-api-and-captcha).

2. ## Create a new Expo app

   If you don't already have an Expo app, run the following commands to [create a new one](https://docs.expo.dev/tutorial/create-your-first-app/).

   ```npm
   npx create-expo-app@latest clerk-expo
   cd clerk-expo
   ```

3. ## Remove the starter routes

   The default Expo template includes starter routes that aren't used in this guide. Remove them:

   ```bash
   rm -f src/app/index.tsx src/app/explore.tsx
   ```

   This guide replaces the starter `src/app/_layout.tsx` file and creates the app routes in later steps.

   > If your Expo app uses a root `app` folder instead of `src/app`, use the same file paths without `src/`.

4. ## Install dependencies

   Install the required packages. Use `npx expo install` to ensure SDK-compatible versions.
   - The [Clerk Expo SDK](https://clerk.com/docs/expo/reference/overview.md) gives you access to prebuilt components, hooks, and helpers to make user authentication easier.
   - Clerk stores the active user's session token in memory by default. In Expo apps, the recommended way to store sensitive data, such as tokens, is by using `expo-secure-store` which encrypts the data before storing it.
   - `expo-dev-client` allows you to build and run your app in development mode.

   ```bash
   npx expo install @clerk/expo expo-secure-store expo-dev-client
   ```

5. ## Set your Clerk API keys

   Add your Clerk Publishable Key to your `.env` file. This key can always be retrieved from the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard.
   1. In the Clerk Dashboard, navigate to the [**API keys**](https://dashboard.clerk.com/~/api-keys) page.
   2. In the **Quick Copy** section, copy your Clerk Publishable Key.
   3. Paste your key into your `.env` file.

   The final result should resemble the following:

   filename: .env

   ```env
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY={{pub_key}}
   ```

6. ## Verify `app.json` plugins

   Expo automatically adds the required config plugins to your `app.json` file when you install the packages. Verify that `@clerk/expo` and `expo-secure-store` appear in the `plugins` array:

   filename: app.json

   ```json
   {
     "expo": {
       "plugins": ["expo-secure-store", "@clerk/expo"]
     }
   }
   ```

7. ## Add `<ClerkProvider>` to your root layout

   The [<ClerkProvider>](https://clerk.com/docs/expo/reference/components/clerk-provider.md) component provides session and user context to Clerk's hooks and components. It's recommended to wrap your entire app at the entry point with `<ClerkProvider>` to make authentication globally accessible. See the [reference docs](https://clerk.com/docs/expo/reference/components/clerk-provider.md) for other configuration options.

   Add the component to your root layout and pass your Publishable Key and `tokenCache` from `@clerk/expo/token-cache` as props, as shown in the following example:

   filename: src/app/\_layout.tsx

   ```tsx
   import { ClerkProvider } from "@clerk/expo";
   import { tokenCache } from "@clerk/expo/token-cache";
   import { Slot } from "expo-router";

   const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

   if (!publishableKey) {
     throw new Error("Add your Clerk Publishable Key to the .env file");
   }

   export default function RootLayout() {
     return (
       <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
         <Slot />
       </ClerkProvider>
     );
   }
   ```

8. ## Add authentication and home screen

   With [native components](https://clerk.com/docs/expo/reference/native-components/overview.md), you can build a complete app in a single file. The [<AuthView />](https://clerk.com/docs/expo/reference/native-components/auth-view.md) component handles all sign-in and sign-up flows, and [<UserButton />](https://clerk.com/docs/expo/reference/native-components/user-button.md) provides a profile avatar that opens the native user profile.

   Create a `src/app/index.tsx` file with the following code. If the user is signed in, it displays the `<UserButton />`. If they're not signed in, it displays a **Sign up** button that opens the `<AuthView />`.

   > When using native components, pass `{ treatPendingAsSignedOut: false }` to [useAuth()](https://clerk.com/docs/expo/reference/hooks/use-auth.md) so pending session tasks are not treated as signed out.

   > Keep the React Native `<Modal>` that contains `<AuthView />` mounted at the same level as your signed-in and signed-out content. Don't render the modal only inside signed-out content, because auth state can change before required session tasks are finished and unmount the modal too early.

   filename: src/app/index.tsx

   ```tsx
   import { useAuth } from "@clerk/expo";
   import { AuthView, UserButton } from "@clerk/expo/native";
   import { useState } from "react";
   import {
     View,
     StyleSheet,
     ActivityIndicator,
     Button,
     Modal,
   } from "react-native";

   export default function MainScreen() {
     const { isSignedIn, isLoaded } = useAuth({
       treatPendingAsSignedOut: false,
     });
     const [isAuthOpen, setIsAuthOpen] = useState(false);

     if (!isLoaded) {
       return (
         <View style={styles.centered}>
           <ActivityIndicator size="large" />
         </View>
       );
     }

     return (
       <View style={styles.container}>
         {isSignedIn ? (
           <UserButton />
         ) : (
           <Button title="Sign up" onPress={() => setIsAuthOpen(true)} />
         )}
         <Modal
           animationType="slide"
           visible={isAuthOpen}
           presentationStyle="pageSheet"
           onRequestClose={() => setIsAuthOpen(false)}
         >
           <AuthView onDismiss={() => setIsAuthOpen(false)} />
         </Modal>
       </View>
     );
   }

   const styles = StyleSheet.create({
     centered: {
       flex: 1,
       justifyContent: "center",
       alignItems: "center",
     },
     container: {
       flex: 1,
       justifyContent: "center",
       alignItems: "center",
     },
   });
   ```

9. ## Build and run

   This approach requires a [development build](https://docs.expo.dev/develop/development-builds/introduction/) because it uses native modules. It **cannot** run in Expo Go.

   filename: terminal

   ```bash
   # Using Expo CLI
   npx expo run:ios
   npx expo run:android

   # Using EAS Build
   eas build --platform ios
   eas build --platform android

   # Or using local prebuild
   npx expo prebuild && npx expo run:ios --device
   npx expo prebuild && npx expo run:android --device
   ```

   Then use the terminal shortcuts to run the app on your preferred platform:
   - Press `i` to open the iOS simulator.
   - Press `a` to open the Android emulator.
   - Scan the QR code with Expo Go to run the app on a physical device.

10. ## Create your first user

    Once the app opens on your device or simulator:
    - Open the sign-up flow.
    - Enter your details and complete the authentication flow.
    - After signing up, your first user will be created and you'll be signed in.

11. ## Configure social connections (optional)

    `<AuthView />` automatically shows sign-in buttons for any social connections enabled in your [Clerk Dashboard](https://dashboard.clerk.com/~/user-authentication/sso-connections). However, native OAuth requires additional credential setup — without it, the buttons will appear but fail with an error when tapped.

12. ### Sign in with Google

    Follow the steps in the [Sign in with Google](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google.md) guide to complete the following:
    1. [Enable Google as a social connection](https://dashboard.clerk.com/~/user-authentication/sso-connections) with **Use custom credentials** toggled on.
    2. Create OAuth 2.0 credentials in the [Google Cloud Console](https://console.cloud.google.com/) — you'll need an **iOS Client ID**, **Android Client ID**, and **Web Client ID**.
    3. Set the **Web Client ID** and **Client Secret** in the [Clerk Dashboard](https://dashboard.clerk.com/~/user-authentication/sso-connections).
    4. Add your iOS application to the [**Native Applications**](https://dashboard.clerk.com/~/native-applications) page in the Clerk Dashboard (Team ID + Bundle ID).
    5. Add your Android application to the [**Native Applications**](https://dashboard.clerk.com/~/native-applications) page in the Clerk Dashboard (package name).
    6. Add the Google Client IDs as environment variables in your `.env` file. Follow the `.env.example` in the [Sign in with Google](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google.md#configure-environment-variables) guide.
    7. Configure the `@clerk/expo` plugin with the iOS URL scheme in your `app.json`.

    > You do **not** need to install `expo-crypto` or use the `useSignInWithGoogle()` hook — `<AuthView />` handles the sign-in flow automatically.

13. ### Sign in with Apple

    Follow the steps in the [Sign in with Apple](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-apple.md) guide to complete the following:
    1. Add your iOS application to the [**Native Applications**](https://dashboard.clerk.com/~/native-applications) page in the Clerk Dashboard (Team ID + Bundle ID).
    2. [Enable Apple as a social connection](https://dashboard.clerk.com/~/user-authentication/sso-connections) in the Clerk Dashboard.

    > You do **not** need to install `expo-apple-authentication`, `expo-crypto`, or use the `useSignInWithApple()` hook — `<AuthView />` handles the sign-in flow automatically.

**Custom flow**

This approach uses Clerk's APIs with your own React Native components and **works in Expo Go — no dev build required.**

1. ## Enable Native API

   In the Clerk Dashboard, navigate to the [**Native applications**](https://dashboard.clerk.com/~/native-applications) page and enable the Native API. This is required to integrate Clerk in your native application or browser extension.

   > Enabling the Native API opens a public request pathway that bypasses browser-based CAPTCHA challenges. Learn more about [how the Native API affects bot protection](https://clerk.com/docs/guides/secure/bot-protection.md#native-api-and-captcha).

2. ## Create a new Expo app

   If you don't already have an Expo app, run the following commands to [create a new one](https://docs.expo.dev/tutorial/create-your-first-app/).

   ```npm
   npx create-expo-app@latest clerk-expo
   cd clerk-expo
   ```

3. ## Remove the starter routes

   The default Expo template includes starter routes that aren't used in this guide. Remove them:

   ```bash
   rm -f src/app/index.tsx src/app/explore.tsx
   ```

   This guide replaces the starter `src/app/_layout.tsx` file and creates the app routes in later steps.

   > If your Expo app uses a root `app` folder instead of `src/app`, use the same file paths without `src/`.

4. ## Install dependencies

   Install the required packages. Use `npx expo install` to ensure SDK-compatible versions.
   - The [Clerk Expo SDK](https://clerk.com/docs/expo/reference/overview.md) gives you access to prebuilt components, hooks, and helpers to make user authentication easier.
   - Clerk stores the active user's session token in memory by default. In Expo apps, the recommended way to store sensitive data, such as tokens, is by using `expo-secure-store` which encrypts the data before storing it.

   ```bash
   npx expo install @clerk/expo expo-secure-store
   ```

5. ## Set your Clerk API keys

   Add your Clerk Publishable Key to your `.env` file. This key can always be retrieved from the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard.
   1. In the Clerk Dashboard, navigate to the [**API keys**](https://dashboard.clerk.com/~/api-keys) page.
   2. In the **Quick Copy** section, copy your Clerk Publishable Key.
   3. Paste your key into your `.env` file.

   The final result should resemble the following:

   filename: .env

   ```env
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY={{pub_key}}
   ```

6. ## Add `<ClerkProvider>` to your root layout

   The [<ClerkProvider>](https://clerk.com/docs/expo/reference/components/clerk-provider.md) component provides session and user context to Clerk's hooks and components. It's recommended to wrap your entire app at the entry point with `<ClerkProvider>` to make authentication globally accessible. See the [reference docs](https://clerk.com/docs/expo/reference/components/clerk-provider.md) for other configuration options.

   Add the component to your root layout and pass your Publishable Key and `tokenCache` from `@clerk/expo/token-cache` as props, as shown in the following example:

   filename: src/app/\_layout.tsx

   ```tsx
   import { ClerkProvider } from "@clerk/expo";
   import { tokenCache } from "@clerk/expo/token-cache";
   import { Slot } from "expo-router";

   const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

   if (!publishableKey) {
     throw new Error("Add your Clerk Publishable Key to the .env file");
   }

   export default function RootLayout() {
     return (
       <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
         <Slot />
       </ClerkProvider>
     );
   }
   ```

7. ## Add a sign-up screen

   Create a `src/app/index.tsx` file. The following example uses the [useSignUp()](https://clerk.com/docs/expo/reference/hooks/use-sign-up.md) hook to build a basic email and password sign-up form. Clerk emails the user a verification code, so the screen shows a code field once the sign-up starts.

   filename: src/app/index.tsx

   ```tsx
   import { useAuth, useSignUp } from "@clerk/expo";
   import { useState } from "react";
   import { Button, StyleSheet, Text, TextInput, View } from "react-native";

   export default function MainScreen() {
     const { isLoaded, isSignedIn } = useAuth();
     const { signUp } = useSignUp();

     const [emailAddress, setEmailAddress] = useState("");
     const [password, setPassword] = useState("");
     const [code, setCode] = useState("");
     const [isVerifying, setIsVerifying] = useState(false);

     const handleSignUp = async () => {
       const { error } = await signUp.password({ emailAddress, password });
       if (error) {
         // Handle the error in your app.
         // See https://clerk.com/docs/guides/development/custom-flows/error-handling
         return;
       }

       const { error: sendError } = await signUp.verifications.sendEmailCode();
       if (sendError) {
         // Handle the error in your app.
         return;
       }

       setIsVerifying(true);
     };

     const handleVerify = async () => {
       const { error } = await signUp.verifications.verifyEmailCode({ code });
       if (error) {
         // Handle the error in your app.
         return;
       }

       const { error: finalizeError } = await signUp.finalize();
       if (finalizeError) {
         // Handle the error in your app.
       }
     };

     if (!isLoaded) {
       return null;
     }

     if (isSignedIn) {
       return (
         <View style={styles.container}>
           <Text>You're signed in</Text>
         </View>
       );
     }

     if (isVerifying) {
       return (
         <View style={styles.container}>
           <TextInput
             style={styles.input}
             value={code}
             placeholder="Enter your verification code"
             onChangeText={setCode}
             keyboardType="numeric"
           />
           <Button title="Verify" onPress={handleVerify} />
         </View>
       );
     }

     return (
       <View style={styles.container}>
         <TextInput
           style={styles.input}
           autoCapitalize="none"
           value={emailAddress}
           placeholder="Enter email"
           onChangeText={setEmailAddress}
           keyboardType="email-address"
         />
         <TextInput
           style={styles.input}
           value={password}
           placeholder="Enter password"
           secureTextEntry={true}
           onChangeText={setPassword}
         />
         <Button title="Sign up" onPress={handleSignUp} />
         {/* Required for sign-up flows on Expo web. Clerk skips the browser CAPTCHA on iOS and Android */}
         <View nativeID="clerk-captcha" />
       </View>
     );
   }

   const styles = StyleSheet.create({
     container: {
       flex: 1,
       padding: 20,
       gap: 12,
       justifyContent: "center",
     },
     input: {
       borderWidth: 1,
       borderColor: "#ccc",
       borderRadius: 8,
       padding: 12,
       fontSize: 16,
     },
   });
   ```

   When `verifyEmailCode()` completes the sign-up, `finalize()` converts it into an active session and updates `useAuth()` with the signed-in state.

8. ## Run your project

   Run your project with the following command:

   ```bash
   npx expo start
   ```

   Then use the terminal shortcuts to run the app on your preferred platform:
   - Press `i` to open the iOS simulator.
   - Press `a` to open the Android emulator.
   - Scan the QR code with Expo Go to run the app on a physical device.

9. ## Create your first user

   Once the app opens on your device or simulator:
   - Open the sign-up flow.
   - Enter your details and complete the authentication flow.
   - After signing up, your first user will be created and you'll be signed in.

For complete sign-up and sign-in flows with guided comments and error handling, see the [Build a custom email/password authentication flow](https://clerk.com/docs/guides/development/custom-flows/authentication/email-password.md) guide. To use other authentication methods, such as passwordless or OAuth, see the custom flow guides. To add native Sign in with Google or Sign in with Apple buttons, see the [Sign in with Google](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google.md) and [Sign in with Apple](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-apple.md) guides. These use native modules, so they require a [development build](https://docs.expo.dev/develop/development-builds/introduction/) and cannot run in Expo Go. The [Expo SDK reference](https://clerk.com/docs/expo/reference/overview.md) lists the hooks and helpers available when building custom flows.

## Enable OTA updates

Though not required, it is recommended to implement over-the-air (OTA) updates in your Expo app. This enables you to easily roll out Clerk's feature updates and security patches as they're released without having to resubmit your app to mobile marketplaces.

See the [`expo-updates`](https://docs.expo.dev/versions/latest/sdk/updates) library to learn how to get started.

## Next steps

Explore the most relevant next steps for your SDK using the following guides.

- [Prebuilt native components (Beta)](https://clerk.com/docs/expo/reference/native-components/overview.md): Learn how to quickly add authentication to your app using Clerk's prebuilt native UI for iOS and Android.
- [Build custom flows](https://clerk.com/docs/guides/development/custom-flows/overview.md): Learn how to build custom user interfaces entirely from scratch using the Clerk API.
- [Read user data](https://clerk.com/docs/expo/guides/users/reading.md): Learn how to use Clerk's hooks and helpers to read user data in your Expo app.
- [Deploy an Expo app to production](https://clerk.com/docs/guides/development/deployment/expo.md): Learn how to deploy your Expo app to production.
