# Codebase Guide

A GIS operations dashboard for Transworld's fibre network: an ArcGIS map with
live ONT alarm state, spatial and attribute filtering, an attribute table, and
an admin panel for users and permissions.

Read this file first when you come back to the project. It covers where things
live, who owns which piece of state, and where to go for a given change.

---

## 1. Running it

```bash
npm install
npm run dev      # vite dev server
npm run build    # production bundle into dist/
```

Backend endpoints are **not** baked into the bundle. `index.html` loads
`public/config.js` as a plain script, which sets `window.RUNTIME_CONFIG`;
`src/shared/config/runtimeConfig.js` reads it. To point a deployed build at a
different environment, edit `public/config.js` — no rebuild.

| key            | what it serves                                    |
| -------------- | ------------------------------------------------- |
| `API`          | GeoServer / feature services                      |
| `AUTHENTICATE` | login, session, user administration               |
| `Realtime`     | socket.io server and `symbology-config.json`      |

---

## 2. Entry points and boot order

```
index.html
  └── #boot                     dark screen + spinner, painted before any JS
  └── public/config.js          window.RUNTIME_CONFIG
  └── src/main.jsx              calcite + ArcGIS CSS, defineCustomElements, mount
        └── app/AppProviders.jsx    the whole context stack (see §4)
              └── app/App.jsx       routes
                    ├── /login      features/auth/LoginPage.jsx
                    └── app/ProtectedRoute.jsx
                          ├── /dashboard  features/dashboard/DashboardPage.jsx
                          └── /admin      features/admin/AdminPage.jsx
```

`main.jsx` only wires React to the DOM. Routing is `app/App.jsx`, the route
table is `app/routes.jsx`, and every provider is `app/AppProviders.jsx`.

**The `#boot` screen matters.** The bundle is large — ArcGIS and Calcite
between them — so there is a real gap between the browser painting the document
and React's first render. `index.html` paints the background and a spinner in
plain CSS so that gap shows the logo instead of a black screen, and React clears
it for free: `createRoot()` empties `#root` when it commits. If you add
anything to `index.html`, keep it out of `#root` or React will drop it.

`ProtectedRoute` handles *route-level* access: wait for the session check,
bounce anonymous users to `/login`, keep admins on `/admin`. *Feature-level*
access inside the dashboard is `features/auth/FeatureGuard.jsx`.

---

## 3. Folder hierarchy

```
src/
├── main.jsx                       entry point
├── index.css                      theme tokens, calcite overrides, global rules
├── app/                           shell: routing and providers
│   ├── App.jsx                    route table
│   ├── AppProviders.jsx           every context, in dependency order
│   ├── ProtectedRoute.jsx         route-level auth gate
│   └── routes.jsx                 protected route list
├── features/
│   ├── auth/                      who the user is and what they may see
│   ├── dashboard/                 the map screen's shell and layout
│   ├── map/                       the ArcGIS map: view, layers, widgets, state
│   ├── filters/                   filter widgets + the active-filter indicator
│   ├── featureTable/              the attribute table under the map
│   ├── sidebars/                  the left and right shell panels
│   ├── realtime/                  socket feeds (ONT alarms, vehicles)
│   └── admin/                     user / role / permission administration
├── shared/
│   ├── config/runtimeConfig.js    backend endpoints
│   └── constants/                 fault codes, table column definitions
└── assets/images/                 map symbols, logos, basemap thumbnails
```

The rule: **a file lives under the feature that owns it.** If you are changing
filtering, everything is in `features/filters/`. The old tree grouped by screen
position (`components/left`, `components/bottom`) and by ArcGIS concept
(`map_items/layer_style`, `map_items/widgets`), so one change meant five
folders.

**Everything above is reachable from `main.jsx`.** The old trees --
`components/`, `map_items/`, `pages/`, `routes/`, `context/`, `permissions/`,
`constants/`, `Realtime/` -- were duplicates of what is now under `features/`
and have been deleted: 94 files, roughly half the source. They were not merely
sitting there, either. `featureRegistry.js` uses
`import.meta.glob("/src/**/*.{jsx,js}", { eager: true })`, so every one of them
was imported and executed at boot. Recover any of them from git history if you
ever need one.

`shared/` is deliberately small. Put something there only when two features
genuinely both need it.

---

## 4. State: where it lives, who writes it, who reads it

All providers mount in `app/AppProviders.jsx`, above the router, so state
survives navigating to `/admin` and back.

```
BrowserRouter
└── AuthProvider              features/auth/AuthContext.jsx
    └── MapProvider           features/map/state/MapProvider.jsx
        └── SidebarLayoutProvider   features/dashboard/SidebarLayoutContext.jsx
            └── ActiveFiltersProvider  features/filters/ActiveFiltersContext.jsx
```

### The map session — `features/map/state/`

`MapProvider.jsx` composes six contexts, each its own file named for what it
holds. Every one is headed by a comment naming its writers and readers.

| File | Hook | Holds | Written by | Read by |
| --- | --- | --- | --- | --- |
| `MapViewContext.jsx` | `useMapView` | the ArcGIS `MapView` + `Map` | `map/MapCanvas.jsx` only | nearly everything map-touching |
| `LayersContext.jsx` | `useLayers` | operational layers by id, `customerLayerView` | `map/layers/styles/*`, `useCustomerLayerLoading` | filter widgets, layer list, `RegionStats` |
| `AlarmStatsContext.jsx` | `useStats` | per-region alarm counts | `realtime/OntStatusFeed.jsx`, `dashboard/TopBar.jsx` | `sidebars/left/*` |
| `SelectionContext.jsx` | `useSelection` | the selection **stack** + parcel + highlight handle | `map/interactions/GlobalClickHandler.jsx`, detail panels | `sidebars/right/RightSidebar.jsx` |
| `FeatureTableDataContext.jsx` | `useFeatureTableData` | the attribute table's tabs | filter widgets, `SelectionWidget`, `FeatureTable` | `FeatureTable`, `DashboardPage` |
| `RightPanelContext.jsx` | `useRightPanel` | is the right sidebar open | `RightSidebar` | `map/widgets/CoordinateWidget.jsx` |

`useArcGIS()` in `MapProvider.jsx` returns all six merged. It is convenient but
re-renders on **any** of them changing — prefer the specific hook in anything
that renders often or renders a lot.

Selection is a *stack*, not one feature: clicking a customer inside a DC popup
pushes a second entry rather than replacing the first, which is what gives the
right sidebar its trail of drill-in tabs.

### Auth — `features/auth/AuthContext.jsx`

Holds `user` (with `permissions.features`, `.regions`, `.layers`),
`isAuthReady`, `hasPermission`, `login`, `logout`. Session re-checks every 10
minutes; idle logout after 20.

`usePermittedRegions.js` derives the sorted region list; `LeftSidebar` and
`ActiveUsers` both use it so they cannot disagree about the set.

### Panel layout — `features/dashboard/SidebarLayoutContext.jsx`

Owns three things:

1. **dock vs overlay** — under 1600px the panels float *over* the map instead
   of shrinking it, so the map never resizes (and the camera never jumps)
   when a panel opens.
2. **which panel is open**, and the one-shot close requests that make the two
   sides mutually exclusive — except the right sidebar's **Details** tab,
   which stays open because it holds the feature the user just clicked.
3. **the measured insets.** An overlay panel covers part of the centre column,
   so the attribute table and the ArcGIS UI corners step aside by
   `--app-panel-inset-start` / `--app-panel-inset-end`. Those are **measured
   off the panel's real box** with a `ResizeObserver`, not derived from the
   open flag — a sidebar that renders nothing (no permissions, data not in
   yet) would otherwise leave the table permanently indented.

### Active filters — `features/filters/ActiveFiltersContext.jsx`

Each filter widget *publishes* what it has applied via `usePublishFilter`, and
`ActiveFiltersBar` renders it over the map. Two rules matter:

- widgets publish the values captured **at apply time**, not their live inputs
  — changing a dropdown without pressing Apply doesn't change the map;
- each entry carries the widget's own `clear` handler, so clearing from the bar
  runs exactly what its Clear button runs.

---

## 5. Data flow, end to end

**Sign-in →** `LoginPage` posts to `AUTHENTICATE`; `AuthContext` stores the
user; `App` routes to `/dashboard`.

**Map start-up →** `DashboardPage` renders `MapCanvas`, which creates the
ArcGIS view and publishes it to `MapViewContext`. Only once `view` is non-null
does `MapCanvas` render `Layers`, `OntStatusFeed`, `VehicleTracking`,
`GlobalClickHandler` and the map widgets — so `if (!view) return;` is the
standard guard throughout.

**Layers →** each module under `map/layers/styles/` builds one layer and
registers it in `LayersContext` by id. Filter widgets find layers by that id.

**Alarms →** `OntStatusFeed` subscribes to the socket, updates the customer
layer, and publishes per-region counts to `AlarmStatsContext`, which drives the
left sidebar. Until it has run once those counts are `null` and `LeftSidebar`
renders **nothing at all** — that is why a cold start shows no left panel.

**Clicking the map →** `GlobalClickHandler` hit-tests, starts a selection in
`SelectionContext`; `RightSidebar` opens Details and renders the matching panel
from `sidebars/right/details/`. Those panels can `pushSelection` to drill in.

**Clicking a Low Optical Power row →** the row is a link, not just a map
highlight. It selects the fault (so `RegionStats` blooms those points) and
navigates the sidebar forward to `sidebars/left/LopDetailPanel.jsx`, which
breaks the same alarm down by its `lopdetail` cause. The two are steps of a
`calcite-flow`: the region tabs are its first item, the breakdown its second,
and calcite draws the back arrow. Which step is showing is React's to say --
the flow only auto-selects when no item claims to be selected -- so
`LeftSidebar` marks the tabs item `selected` exactly while nothing is drilled
into. Selecting a cause lists its customers and hands their ids back to
`RegionStats`, which narrows the highlight to them; `RegionStats` stays the
only writer of `featureEffect`. `LeftSidebar` owns which row is open, because
there is one `RegionStats` per region tab and all of them are mounted at once.
Locating a customer from the list re-queries the customer layer for the real
graphic and pushes it onto the selection stack, so the right sidebar opens on
it -- the map is never covered, which is the point of keeping this in the
panel instead of a window over the map.

**Filtering →** a widget queries, sets a `definitionExpression` or layer-view
filter, pushes rows into `FeatureTableDataContext`, and publishes a summary to
`ActiveFiltersContext`. The table appears; the filter bar appears over the map.

**The table →** `FeatureTable` renders a tab per visible entry. Clicking a tab
frames and outlines that tab's features; clicking a row zooms to and highlights
one. Tab outlines live on their own `GraphicsLayer` so a row click — which
clears `view.graphics` — doesn't wipe them.

### Props

Props are used for what is genuinely local; shared state comes from context.
The components that take props at all:

| Component | Props | Why |
| --- | --- | --- |
| `LeftSidebar`, `RightSidebar` | `hidden` | driven by `activeView` (see §8) |
| `RegionStats` | `region`, `selectedFault`, `setSelectedFault`, `onOpenLopDetails`, `lopCauseIds` | the parent's own tab state, plus the LOP drill-in the parent owns |
| `LopDetailPanel` | `region`, `variant`, `onClose`, `onCauseSelect` | which alarm row opened it |
| `sidebars/right/details/*` | `feature` | the entry being rendered |
| `SymbologyLayer` | `layerKey`, `defaultVisible` | which layer it configures |
| `FeatureGuard` | `featureKey`, `children`, `fallback` | what it gates |

---

## 6. Hooks and utilities

| Where | What |
| --- | --- |
| `features/map/useCustomerLayerLoading.js` | waits for the customer layer view; also the only thing that sets `customerLayerView`. Called by `MapCanvas`. |
| `features/auth/usePermittedRegions.js` | the user's regions, sorted, shared between the two left-sidebar tabs |
| `features/auth/featureRegistry.js` | scans `src/**` at build time for exported `featureMeta` and builds the admin panel's toggle grid — so a gated tool declares its own key next to itself and no central list needs editing |
| `features/filters/ActiveFiltersContext.jsx` | `usePublishFilter` — how a filter widget announces itself |
| `features/map/symbology/buildRenderer.js` | turns a symbology config into an ArcGIS renderer — used by both the server-driven `SymbologyLayer` and the interactive `SymbologyWidget` |
| `features/map/symbology/classify.js` | natural breaks / equal interval / quantile, and distinct values; pure, no ArcGIS |
| `features/map/symbology/symbologyPalettes.js` | the colour schemes, with the validation results that justify them |
| `features/map/symbology/markerIcons.js` | the picture markers the widget can assign, curated so only these bundle |
| `features/map/widgets/outageAnalysis/diagnose.js` | groups alarms by OLT/PON and decides what broke; pure, no ArcGIS |
| `features/sidebars/left/useLopBreakdown.js` | one region's LOP customers, read from GeoServer on demand and grouped by `lopdetail`; feeds the drill-in window |
| `shared/constants/faultCodes.js` | alarm-state codes; use these, never the raw numbers |
| `shared/constants/lopDetail.js` | the `lopdetail` field: parsing the cause tag, the warning/minor split, and the grouping the breakdown renders |
| `shared/constants/tableColumns.js` | column definitions for the attribute table |

---

## 7. Where to go for a change

| I want to… | Go to |
| --- | --- |
| add or restyle a map layer | `features/map/layers/styles/`, then render it in `layers/Layers.jsx` |
| change what a map click does | `features/map/interactions/GlobalClickHandler.jsx` |
| tune the outage root-cause rules | `features/map/widgets/outageAnalysis/diagnose.js` — `THRESHOLDS` and `diagnosePort` |
| add a map widget (zoom-like control) | `features/map/widgets/`, mount it in `map/MapCanvas.jsx` |
| change the popup for a feature type | `features/sidebars/right/details/` |
| add a right-sidebar tab | `ACTIONS` in `sidebars/right/RightSidebar.jsx` + a `featureMeta` key |
| add or change a filter | `features/filters/widgets/`; publish via `usePublishFilter` |
| change how a layer is drawn, by hand | Symbology tab — `features/map/symbology/SymbologyWidget.jsx` |
| add a picture marker to the symbology picker | `features/map/symbology/markerIcons.js` |
| add a colour scheme or classification method | `symbologyPalettes.js` / `classify.js` in `features/map/symbology/` |
| change the attribute table | `features/featureTable/FeatureTable.jsx`; columns in `shared/constants/tableColumns.js` |
| change panel docking / overlay behaviour | `features/dashboard/SidebarLayoutContext.jsx` |
| change the page frame or table resize | `features/dashboard/DashboardPage.jsx` |
| change the header, search or fault dropdown | `features/dashboard/TopBar.jsx` |
| gate something on a permission | wrap in `FeatureGuard`, export `featureMeta` beside it |
| change login, session or idle timeout | `features/auth/AuthContext.jsx` |
| manage users, roles, permissions | `features/admin/AdminPage.jsx` |
| point at a different backend | `public/config.js` |
| change theme colours or calcite overrides | `src/index.css` |

---

## 8. Symbology: two paths to a renderer

A layer can get its renderer from either of two places, and it helps to know
which one you are looking at.

**Server-driven (the default).** `SymbologyLayer.jsx` fetches
`symbology-config.json` from the Realtime server and applies it on mount and on
every live reload. This is what each module in `layers/styles/` renders, and it
is why changing a layer's standing symbology needs no code change.

**Interactive.** `SymbologyWidget.jsx`, its own tab in the right sidebar, lets
the user draw a layer by any of its columns — Single Symbol, Unique Values,
Graduated Colors, Graduated Symbols — in ArcGIS Pro's vocabulary, with either
shape or picture markers (`markerIcons.js`). It applies live as you change
controls, and `Restore default symbology` puts back the renderer the layer had
before the widget first touched it.

**It applies nothing until you ask.** The widget mounts with the rest of the
sidebar at app start, so a default config that applied on mount would silently
replace whatever the layer's own style module had set — which is exactly what
it did at first, wiping the customer layer's alarm-state picture markers. The
`hasEdits` latch is what prevents that; changing which layer you are *looking
at* deliberately does not trip it.

Both produce the same config shape and hand it to the same `buildRenderer.js`,
so there is one renderer builder rather than two. What the widget builds is
exactly what could be written into `symbology-config.json` later.

Two consequences worth knowing:

- **Widget changes are session-only.** Nothing is persisted; a reload restores
  the server config. A live config reload while the widget's renderer is
  applied will also overwrite it.
- **Colours are constrained on purpose.** Categorical hues are assigned in a
  fixed, colour-blind-checked order and never cycled — past eight values the
  rest fold into "Other", because a repeated hue means two categories that
  cannot be told apart. Sequential ramps are single-hue and stop short of the
  darkest steps so no class disappears into dark imagery. The reasoning and the
  validator results are recorded in `symbologyPalettes.js`; read it before
  adding a scheme. There is deliberately no diverging scheme — see that file.

---

## 9. Outage root-cause analysis

`FspOutageAnalyzer.jsx` (Map Tools tab) answers "what broke", not "how many are
down" — the count is already in the table. The rules are in
`outageAnalysis/diagnose.js`, pure and separate from the widget so they can be
read and tuned without touching UI.

It groups every customer by OLT + PON port and, for each port, weighs four
signals: **how much of the port is down** (which is why the scan reads healthy
customers too — 18 of 20 and 18 of 400 are different events), **which alarm
dominates** (LOS vs power-off vs low optical power), **how close together the
alarms started**, and **how many DCs are involved**. Ports that are mostly down
are then rolled up per OLT first, so several ports failing on one OLT is
reported once as an OLT/uplink failure instead of as several fibre cuts that
don't exist.

Every verdict carries its evidence and a confidence, because these are
heuristics over telemetry. Thresholds live in one frozen `THRESHOLDS` object.

Selecting an incident highlights its customers, reveals and highlights the
parent DC on the real `dc_odb` layer, frames both, and opens **two** table
tabs — the affected customers and the DCs behind them.

Two schema notes it deliberately tolerates: the PON is `nce_fsp` on some feeds
and `frame`/`slot`/`port` on others (`ponOf`), and `fault_time` arrives as
epoch milliseconds from an ArcGIS date field but as an ISO string from GeoJSON
(`parseFaultTime`). The scan also intersects its `outFields` with the layer's
real fields — naming a missing field fails the entire query.

---

## 10. Known issues and dead ends

Real, pre-existing, and deliberately not "fixed" blind during the refactor.

- **`activeView` is permanently `"map"`.** `DashboardPage` still has the state
  and an `"analytics"` branch, but the switcher that set it was removed from
  `TopBar`. `features/analytics/` has since been **deleted** as unreachable; to
  bring it back, restore it from git history, add a switcher that calls
  `setActiveView`, and render it in the analytics branch.
- **`DcDetails.jsx` destructures `setSelectedFeatures` from `useSelection()`**,
  which does not and never did provide it. It is `undefined`, so the call site
  throws. The intended behaviour isn't recoverable from the code; flagged in a
  comment there.
- **`ChatWidget.jsx` has been deleted.** It was not mounted, it called
  `/ai/chat` at a hardcoded `172.29.100.28:2000` instead of through
  `runtimeConfig`, and that route was commented out in the backend. Reviving it
  means fixing all three.
- **`HeatmapToggle.jsx` has been deleted** — its block in `RightSidebar` was
  commented out, so it never rendered.
- The map fails **loudly** now: if the ArcGIS view never becomes ready (usually
  no network access to the Esri CDN or basemap services), `MapCanvas` shows the
  reason after 20s instead of a black rectangle. A basemap that fails on its own
  is logged only — the layers still work, so it isn't worth a panel over a
  working map.

---

## 11. Conventions

- **One component per file, named the same as the file.** No exceptions left.
- **Feature-local first.** Only promote to `shared/` when a second feature
  genuinely needs it.
- **Context for shared state, props for local state.** If a parent reads
  something from context purely to hand it to one child, the child should read
  it instead.
- **`.jsx` for any file containing JSX**, `.js` otherwise — Vite's `.js` loader
  does not parse JSX and fails with a confusing "invalid JS syntax" error.
- **Guard on `view`.** Anything touching the map starts with `if (!view) return;`.
- **Comments explain *why*,** and name the file on the other end of a
  relationship. Don't restate what the code says.
