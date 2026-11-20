# Live activities

English · [简体中文](README.md)

A DeepSeek Harness (DSH) plugin modelled on iOS Live Activities: an agent creates a floating status card for long-running work. The card floats above the DSH window, stays visible after the reply ends, and shows phase, progress and an expected-finish countdown.

## Install

A DSH plugin is installed as a "bundle", and this repository is one:

```sh
git clone https://github.com/Tippye/dsh-live-activity.git
```

Then open **Plugins** in DSH, choose **Add plugin** and select the cloned directory, then enable `@local/dsh-live-activity`. Its dependency (`zod`) resolves during installation, so no manual `npm install` is needed. No configuration afterwards.

Disabling or uninstalling the bundle keeps the stored card records in your profile; re-enabling shows them again.

## Why the card lives inside the app

iOS hosts Live Activities: the card keeps rendering after the app is backgrounded or suspended. DSH Desktop is an Electron app, but Host plugins run inside a `dsh-desktop-host` child process launched with `ELECTRON_RUN_AS_NODE=1`. There `require('electron')` fails, `process.type` is undefined, and the IPC the child can send to the main process covers only `quit-inspection`, `update-tasks`, `platform-session` and `plugin-operation` — there is no window-creation request. A plugin therefore cannot create a native always-on-top window.

So the card renders inside the DSH window, in the `shell.overlay` slot: the frame-wide floating layer above every column and outside their scroll containers. It reads as a floating window pinned to the app, and it survives switching sessions.

Turning it into a real desktop-level window would need either `documentPictureInPicture.requestWindow()` from the client half (requires a user gesture, lifetime tied to the page) or a Host `ctx.subprocess` helper running a Swift/SwiftUI `NSPanel`. Neither ships in this version.

## Mapped to ActivityKit

| ActivityKit | This plugin |
|---|---|
| `ActivityAttributes` (immutable) | `attributes`: `title`, `subtitle`, `symbol`, `accent` |
| `ContentState` (updatable) | `state`: `phase`, `detail`, `progress`, `etaEpochSeconds`; `update` merges partially |
| `Activity.request` | `live_activity` with `action: "create"` |
| `activity.update` | `action: "update"` |
| `activity.end` + `dismissalPolicy` | `action: "end"` + `dismissalPolicy` |
| `staleDate` / `isStale` | `staleAfterSeconds`; past it the card turns "needs refresh" and goes amber |
| `Text(timerInterval:)` countdown | `etaEpochSeconds` ticks down locally in the browser, no repeated updates needed |
| 8 hour limit, up to 4 hours retained after end | The same limits and retention window |
| `Activity.activities` (recover after restart) | Records live in the profile's storageDomain, so cards survive a DSH restart |

## Use

Once enabled, nothing to configure. Ask the agent to do something that takes a while and it opens a card on its own:

- "Build and deploy the web bundle; show progress with a live activity card the whole time."
- "Run the full test suite, it should take about 12 minutes — update the card as it goes."
- "Deploy to staging, and end the card when it's done."

Cards appear in the window's top-right corner (`top: 72px; right: 20px`) by default. Drag a card's header to move the whole stack; focus a header and use the arrow keys for the same (`Shift` + arrows for 4 px steps). Position and collapsed state persist in local storage. Click the × on a card to remove it, or the chevron at the bottom to collapse the stack into a pill. More than 3 cards collapse to "N more". If the card route fails 3 polls in a row, a dismissible "Live activities are unavailable" notice appears once, instead of every card reporting its own error.

## Agent API

`live_activity` is the only entry point and shares one store with the floating cards:

```json
{"action":"create","title":"Deploy web","subtitle":"prod","phase":"Building","progress":0.2,"etaEpochSeconds":1763650000,"staleAfterSeconds":300,"symbol":"build"}
```

```json
{"action":"update","id":"<id>","phase":"Uploading artifacts","progress":0.75}
```

```json
{"action":"end","id":"<id>","phase":"Released","dismissalPolicy":{"afterSeconds":120}}
```

```json
{"action":"list","status":"active"}
```

- `create` requires `title` and `phase`. `symbol` is one of `task`/`run`/`build`/`deploy`/`download`/`search`/`sync`/`alert`; `accent` is one of `brand`/`success`/`warn`/`error`/`idle`.
- In `update`/`end`, `phase`, `detail`, `progress` and `etaEpochSeconds` merge partially: omit to keep, pass `null` to clear.
- `dismissalPolicy`: `"default"` keeps the final state for 10 minutes, `"immediate"` removes it at once, `{"afterSeconds":n}` keeps it for a custom 1–14400 seconds.
- At most 8 cards are active at once; end an old one first.

## Where things are

- `index.js` — tool registration, the read-only `/api/dsh-live-activity` route (the page may only list/get/dismiss), the system prompt section, and a 15 second expiry sweep.
- `model.js` — validation, state merging, lifecycle derivation (`stale`, `expiresAt`, `dismissAt`) and the store.
- `client.js` — the floating card stack in `shell.overlay`: 2 second polling, 1 second local countdown.
- Records live in the profile's `dsh_live_activity` domain; a corrupt record is backed up and skipped instead of failing the whole plugin load.

## Known limits

- Cards are visible only while the DSH window is on screen; minimising it hides them. This is not a system desktop widget.
- Only the agent writes card content; the UI cannot edit phase or progress, only remove a card.
- Polling is 2 seconds, so an agent update reaches the card within about 2 seconds. The countdown does not depend on polling.
- A card must be created by the agent through the tool; there is no manual "new card" control in the UI.

## Privacy

Card content stays in your local profile storage and is never sent to a third-party service. The only traffic between the page and the Host is a same-origin `POST /api/dsh-live-activity`, restricted to `list`, `get` and `dismiss`; only the agent can write.

## Development

```sh
npm test          # state machine and lifecycle assertions for model.js
```

After a change: reload Host code from the **Plugins** panel, and refresh the window once after editing `client.js`.

## License

[MIT](LICENSE) © 2026 Tippye