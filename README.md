# ContextSwitch

A canvas-based context management app for macOS, built with Electron. ContextSwitch lets you organise related resources — websites, applications, files, and notes — into named workspaces called contexts. Each context has its own infinite canvas where objects can be freely positioned, grouped, and linked.

---

## Features

- **Multiple contexts** — top-level workspaces shown as tabs; drag to reorder, double-click to rename
- **Six object types** — Website, Application, File/Folder, Sub-Context, Line, Ellipse
- **Infinite canvas** — pan, zoom, drag and resize any object freely
- **Sub-contexts** — nest contexts inside one another with full breadcrumb navigation
- **Lines and Ellipses** — connect or group objects; endpoints can be anchored to objects so they follow when moved
- **Notes** — plain text or HTML+CSS overlays pinned to the canvas or anchored to specific objects; supports reusable templates
- **Archive system** — hide objects or entire contexts without deleting them; restore individually or in bulk
- **Chrome extension** — add any web page (with a screenshot) to a context directly from the browser

---

## Architecture

### State

All application state lives in a single JSON file at `~/Library/Application Support/ContextSwitch/state.json`. The schema is versioned (`"version": 1`) and the entire file is read on launch and written on every change. There is no database.

### Process model

The app follows the standard Electron two-process model:

- **Main process** (`main.js`) — manages the BrowserWindow, handles IPC from the renderer, reads and writes state to disk, serves the local HTTP server for the Chrome extension, and resolves OS-level operations (launching apps, opening files, capturing app icons).
- **Renderer process** (`renderer/`) — a plain ES-module web app with no framework. State is held in a central `store.js` that notifies subscribers on every change, triggering a full re-render. No virtual DOM or reactive library is used.
- **Preload script** (`preload.js`) — exposes a tightly scoped `window.api` object to the renderer via `contextBridge`, keeping Node.js APIs out of the renderer context.

### Canvas rendering

The canvas uses two overlapping layers inside a viewport div:

- A **world div** containing all object elements, transformed with `transform: translate(offsetX, offsetY) scale(scale)` at `transform-origin: 0 0`. This layer handles HTML objects (tiles, frames, sub-context boxes).
- An **SVG element** in viewport space for Lines and Ellipses, which are drawn directly in screen coordinates by converting world positions on each render.

Pan and zoom are stored as `{ scale, offsetX, offsetY }` in each canvas's viewport and persisted to disk.

### Chrome extension / HTTP server

The main process runs a local HTTP server (default port 27182) for its entire lifetime. The Chrome extension connects to it to fetch the list of available contexts and to POST new website objects. The server sets `Access-Control-Allow-Private-Network: true` to satisfy Chrome's Private Network Access policy, which blocks localhost requests from extensions that do not receive this header.

When the extension adds a page, the main process writes the updated state to disk and sends a `state-updated-externally` IPC event so the renderer can reload without the user needing to restart.

### Tooltips

Tooltip CSS pseudo-elements (`::after`) are clipped by the `overflow: hidden` present on the tab bar, nav bar, and canvas viewport containers. Instead, a single `<div id="app-tooltip">` is appended directly to `<body>` and positioned with `position: fixed` coordinates calculated in `tooltip.js`. Any element with a `data-tooltip` attribute is picked up automatically via event delegation.

---

## Project structure

```
ContextSwitch/
├── main.js              # Main process — window, IPC, HTTP server, file I/O
├── preload.js           # contextBridge API surface
├── renderer/
│   ├── app.js           # Entry point — wires store, renders all regions
│   ├── store.js         # Central state store with observer pattern
│   ├── tooltip.js       # Global floating tooltip handler
│   ├── components/
│   │   ├── tab-bar.js
│   │   ├── nav-bar.js
│   │   ├── canvas-view.js
│   │   ├── palette.js
│   │   ├── archive-view.js
│   │   ├── settings.js
│   │   ├── context-menu.js
│   │   └── dialogs.js
│   └── styles/
│       ├── app.css
│       ├── tabs.css
│       ├── navbar.css
│       ├── canvas.css
│       ├── objects.css
│       ├── notes.css
│       ├── palette.css
│       ├── archive.css
│       ├── settings.css
│       ├── dialogs.css
│       └── context-menu.css
├── extension/           # Chrome extension (loaded separately — see below)
│   ├── manifest.json
│   ├── background.js
│   ├── popup.html / popup.js
│   └── options.html / options.js
├── scripts/
│   └── create-icons.js  # Generates PNG icons without external dependencies
├── package.json
├── .gitignore
├── INITIAL_PROMPT.txt   # Original build specification
└── REFINEMENTS.txt      # Post-build fixes and additions
```

---

## Running in development

```bash
npm install
npm start
```

This opens the app directly from source via Electron. Changes to renderer files take effect on the next app restart (there is no hot reload).

---

## Building a distributable

electron-builder is used to produce a self-contained `.app` bundle and a `.dmg` disk image.

**Build command**

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build
```

`CSC_IDENTITY_AUTO_DISCOVERY=false` skips Apple code-signing, which requires a paid Apple Developer account. The app runs without it on the machine it was built on; distributing to other Macs may trigger a Gatekeeper warning that the user must dismiss in System Settings → Privacy & Security.

**Output**

```
dist/
  mac-arm64/
    ContextSwitch.app          # Always produced
  ContextSwitch-1.0.0-arm64.dmg  # Produced if the DMG step succeeds
```

> **Note:** `hdiutil` (used internally to create the DMG) occasionally throws a `Resource temporarily unavailable` error. This is an intermittent macOS issue — retrying the build command usually resolves it. The `.app` bundle is always produced regardless.

**Installing the built app**

```bash
cp -r dist/mac-arm64/ContextSwitch.app /Applications/
mdimport /Applications/ContextSwitch.app   # re-index for Spotlight
```

---

## Chrome extension

The extension is not bundled with the `.dmg` and must be loaded separately.

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder from this repository
4. The extension icon will appear in the toolbar

The extension communicates with the running ContextSwitch app on `http://127.0.0.1:27182` by default. If you change the port in the app's settings (⚙ button), update it to match in the extension's options page.
