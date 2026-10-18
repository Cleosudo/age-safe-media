# Android testing guide

Tested target: **Android 10+** phone and the Android emulator, using Expo SDK 58.

## 0. Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 20 LTS or newer |
| Android Studio (emulator) | Hedgehog+ with one AVD installed |
| Backend | running on the same machine |

```bash
cd mock-api && PORT=8010 ./run.sh
cd mobile  && npm install
```

## 1. Run the app

### A. Expo Go on a physical phone

```bash
cd mobile
npx expo start
```

Scan the QR code with **Expo Go** (Android scans inside the app). Phone and Mac
must be on the same Wi-Fi.

### B. Android emulator

```bash
cd mobile
npx expo start --android        # or press "a" in the terminal UI
```

The emulator reaches the host machine at **`10.0.2.2`**, which `src/services/api.ts`
already uses as its fallback, so no configuration is required when the backend runs
on port `8010`.

If you prefer the emulator to use `localhost`, forward the port instead:

```bash
adb reverse tcp:8010 tcp:8010
EXPO_PUBLIC_API_URL=http://localhost:8010 npx expo start -c
```

### C. Development build

```bash
cd mobile
npx expo run:android            # builds and installs on the emulator/device
```

## 2. API URL resolution

1. `EXPO_PUBLIC_API_URL` (explicit).
2. Metro host with the API port substituted — works for Expo Go on a real phone.
3. `10.0.2.2` on Android (emulator loopback), `127.0.0.1` elsewhere.

Physical-device example:

```bash
ipconfig getifaddr en0          # 192.168.1.24
cd mobile
printf 'EXPO_PUBLIC_API_URL=http://192.168.1.24:8010\n' > .env
npx expo start -c
```

### Cleartext HTTP

Expo Go allows cleartext HTTP in development. For a **development build** talking to
a plain-HTTP backend, add to `app.json`:

```json
"android": {
  "usesCleartextTraffic": true
}
```

Remove it (and use HTTPS) for release builds.

## 3. Demo credentials

`parent@demo.sg` / `demo1234` (pre-filled) opens the seeded family with Amelia (7)
and Jun Hao (11). Any other e-mail creates a fresh parent and starts the first-run
child-profile flow.

## 4. Manual test script

Same flow as iOS, plus Android-specific checks:

1. Sign in → chat opens with the welcome bubble.
2. Ask “Show me books about volcanoes” → cards with explanations.
3. **Back button (hardware/gesture)** from the child editor, profile chooser and
   preferences sheet returns to the previous screen without leaving the app.
4. Open the preferences sheet, rotate the device to landscape and back — no layout
   breakage; content stays reachable.
5. Keyboard: the composer rises with the keyboard and the tab bar hides
   (`tabBarHideOnKeyboard`).
6. Long-press / copy text in a recommendation summary works (native `TextInput`
   behaviour is not blocked by the layout).
7. Open an **Open Library** link → Chrome Custom Tab opens.
8. Kill the app from recents and reopen → session and active child persist.
9. Set display size / font scale to *Large* in Android settings → text does not
   overlap buttons (layout uses flex and wrapping, not fixed heights).

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank screen in the emulator | Metro may still be bundling — wait for “Bundled …” in the terminal; press `r` to reload. |
| API unreachable from emulator | Confirm the backend is on port `8010`; otherwise use `adb reverse` as shown above. |
| API unreachable from phone | Same Wi-Fi, firewall, and `EXPO_PUBLIC_API_URL` set to the LAN IP. |
| `Network request failed` only on Android | If you built a dev client, ensure `usesCleartextTraffic` is set for HTTP. |
| Emoji render as boxes | Some emulators ship limited emoji fonts; test on a physical device for final screenshots. |
| Gradle build fails after adding packages | `cd android && ./gradlew clean` (dev build only) then rebuild. |
