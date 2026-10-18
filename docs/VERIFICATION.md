# Verification log

Everything below was executed in this workspace against the running stack
(the dev mock from `mock-api/` on `127.0.0.1:8010`, Expo web on `localhost:8081`).
The mock exists only to exercise the frontends — it is not part of the deliverable.

## 1. Backend integration tests

```
$ cd mock-api && .venv/bin/python -m pytest tests -q
31 passed, 1 warning in 0.39s
```

Covered: health/auth, account upsert, child CRUD + ownership isolation, validation,
chat recommendations, safety block, preference handling (count / titles-only /
newest), history metadata, favourites round-trip, feedback persistence, all three
report ranges, admin redirect + API protection, catalogue CRUD (JSON and HTML form),
model activation, retraining queue, concurrent first requests.

## 2. Live API smoke checks

```
GET  /healthz                        200  {"status":"ok","auth_mode":"dev"}
GET  /account/me                     200  parent@demo.sg, 2 children, model rec-v1.2.0
POST /chat                          200  5 recommendations, explanations present
POST /chat (unsafe prompt)          200  safety.blocked = true, 0 recommendations
GET  /reports/activity?range=weekly 200  8 buckets, 25 active days
GET  /admin/api/stats               200  parents/children/catalogue counters
```

## 3. Admin Web Portal (Playwright, Chromium)

| Check | Result |
| --- | --- |
| `/admin` without cookie → `303 /admin/login?next=/admin` | ✅ |
| Wrong password shows “not recognised” | ✅ |
| Login sets cookie → dashboard `200` | ✅ |
| Templates render from `admin-portal/templates` (not a copy) | ✅ |
| Catalogue / users / models / item form render `200` | ✅ |
| Create + edit + delete item through HTML forms | ✅ (see pytest) |
| Activate model version + queue retraining | ✅ |
| Responsive layout at 390 px (drawer nav, stacked cards) | ✅ screenshot `16-admin-mobile.png` |

## 4. Mobile app (Playwright, iPhone viewport 390×844, Expo web build)

`node tools/ui-verify.mjs` → **10/10 checks passed**

| Check | Result |
| --- | --- |
| Login screen renders | ✅ |
| Sign-in navigates to chat | ✅ |
| Sending a message returns recommendation cards | ✅ (6 cards) |
| Heart saves the item, toast confirms | ✅ |
| Saved tab lists the favourite | ✅ |
| Insights shows totals for the period | ✅ |
| Settings shows API base URL + child profiles | ✅ |
| Child editor opens with parental restrictions | ✅ |
| Output preferences sheet opens | ✅ |
| No console errors during the whole run | ✅ |

Additional manual flow: first-run onboarding with a brand-new account
(`firsttimer@example.com`) → “Add your first child” → create → chat opens with the
welcome bubble and quick replies, no console errors.

## 5. Regressions found and fixed during verification

| Issue | Fix |
| --- | --- |
| Two parallel first requests inserted the same parent → `500` (SQLite UNIQUE) | tolerant upsert + regression test (`test_concurrent_first_requests_do_not_race`) |
| Nested `<button>` on the settings row (invalid HTML, React warning) | row split into a navigation pressable + separate action area |
| Quick-reply chips stretched to full height | `flexShrink: 0` + `maxHeight` on the horizontal scroller |
| Tab bar labels clipped | explicit bar height including the safe-area inset, label `flexShrink: 0` |
| Chart labels overlapped | label thinning + short labels, “peak” caption moved out of the plot |
| History reload lost recommendation cards | recommendation metadata stored in message `meta`; client re-hydrates from `/catalogue?ids=` |
| Demo favourites empty on the dashboard | seeded `favourites` rows alongside favourite events |

## 6. Not verified here (needs hardware / real project)

* iOS Simulator / physical iPhone run (no simulator available in this environment).
* Android emulator / physical device run.
* Real Firebase project sign-in (no credentials configured; demo mode exercised instead).
* Real ML model behind `/chat` (deterministic reference implementation exercised).
