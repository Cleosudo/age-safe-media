# iOS testing guide

Tested target: **iPhone (iOS 16+)** and the iOS Simulator, using Expo SDK 58.

## 0. Prerequisites

| Tool | Version |
| --- | --- |
| macOS | 14+ |
| Xcode + Command Line Tools | 15+ (Simulator only needs Xcode installed once) |
| Node.js | 20 LTS or newer |
| Backend | running, see below |

```bash
cd mock-api && ./run.sh           # http://0.0.0.0:8000 (dev mock from this repo)
cd mobile  && npm install
```

> The mobile `.env` example assumes port **8010**. Either run the API with
> `PORT=8010 ./run.sh` or set `EXPO_PUBLIC_API_PORT=8000`.

## 1. Choose how to run the app

### A. Expo Go (fastest)

```bash
cd mobile
npx expo start
```

Press `i` to open the iOS Simulator, or scan the QR code with the Camera app on a
physical iPhone (both devices on the same Wi-Fi).

Expo Go supports everything used here (Firebase JS SDK, AsyncStorage, SVG). A
development build is only needed if you later add native Firebase modules
(`@react-native-firebase/*`) or other custom native code.

### B. Development build (optional)

```bash
cd mobile
npx expo run:ios            # requires Xcode, builds and installs on the simulator
npx expo run:ios --device   # physical device (Apple developer team required)
```

## 2. Point the app at the backend

**The iOS Simulator can use `localhost`.** A physical iPhone cannot — `localhost`
is the phone itself.

The app resolves the API URL in this order (`src/services/api.ts`):

1. `EXPO_PUBLIC_API_URL` — explicit, always wins.
2. The Metro host (`Constants.expoConfig.hostUri`, e.g. `192.168.1.24:8081`) with
   the port swapped for `EXPO_PUBLIC_API_PORT` (default `8010`). This is why Expo Go
   works on a real phone with no configuration.
3. `http://127.0.0.1:8010` as a last resort.

To set it explicitly:

```bash
# find your Mac's LAN address
ipconfig getifaddr en0        # e.g. 192.168.1.24

cd mobile
cat > .env <<'EOF'
EXPO_PUBLIC_API_URL=http://192.168.1.24:8010
EOF
npx expo start -c            # -c clears the bundler cache so .env is re-read
```

Checklist if the phone cannot reach the API:

- Mac and iPhone on the same Wi-Fi (not a guest network with client isolation).
- Backend bound to `0.0.0.0`, not `127.0.0.1`.
- macOS firewall allows incoming connections for `python`/`uvicorn`.
- Settings → **Settings → About** in the app shows the exact base URL in use.

### App Transport Security

Expo Go permits cleartext HTTP for local development. For a **development build**
that talks to `http://192.168.x.x:8010`, add to `app.json` before building:

```json
"ios": {
  "infoPlist": {
    "NSAppTransportSecurity": { "NSAllowsLocalNetworking": true }
  }
}
```

Use HTTPS in production and remove the exception.

## 3. Demo credentials

With `DEV_AUTH=true` (default) and no Firebase configuration:

| Field | Value |
| --- | --- |
| E-mail | `parent@demo.sg` (pre-filled) |
| Password | `demo1234` (any 6+ characters) |

This account opens **Mei Ling Tan** with two child profiles, Amelia (7) and
Jun Hao (11), plus seeded activity for the dashboard.

To use a brand-new parent, type any other e-mail — you will be taken through the
first-run child-profile flow.

## 4. Manual test script

1. **Sign in** → chat opens with the welcome bubble and quick replies.
2. **Ask** “Show me books about volcanoes” → 5 cards with explanations appear.
3. **Preferences** (sliders icon) → set *Titles only*, count 2, sort *Newest* →
   ask again → the next answer returns 2 title-only cards, newest first.
4. **Save** a card (heart) → open the **Saved** tab → it is listed; remove it.
5. **Thumbs up** a card → **Insights** thumbs-up ratio changes.
6. **Insights** → switch Daily / Weekly / Monthly; switch child with the switcher.
7. **Settings → child row** → block *Scary scenes*, save → ask about a scary topic
   and confirm those items no longer appear.
8. **Settings → Manage** → add a child, edit, then delete it.
9. **Switch child profile** (people icon) → pick the other child → the chat,
   saved list and dashboard all follow the active profile.
10. Open an **NLB Singapore** link → Safari opens the catalogue search; return with
    the app still on the same screen.
11. Kill and reopen the app → the session, active child and chat transcript persist.

### Safe-area checks (iOS specific)

- The header must sit below the notch/Dynamic Island (no overlap).
- The composer must sit above the home indicator, and rise with the keyboard.
- On iPad the content is centred with a max width of 720 pt.

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Cannot reach the API at …” | Backend not running, wrong `EXPO_PUBLIC_API_URL`, or firewall. Settings shows the URL in use. |
| Sign-in works but the chat is empty | Backend returned no history — send a message; check the backend log. |
| Expo Go shows a red screen after changing `.env` | Restart with `npx expo start -c`. |
| Fonts/emoji look different on device | Expected — system emoji rendering differs per OS version. |
| Keyboard covers the composer | Make sure you are on the tabs screen (the tab bar hides on keyboard) and `expo start` was restarted after pulling changes. |
