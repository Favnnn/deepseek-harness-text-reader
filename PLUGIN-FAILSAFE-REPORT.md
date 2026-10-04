# PLUGIN-FAILSAFE-REPORT — dsh-text-reader 2.0.0 (rc.2 port)

Scope: what breaks, what survives, and why. This port (1.4.8 → 2.0.0) moved the
plugin from the rc.1 file:// flow to the rc.2 profile-bundle flow following the
fully ported reference `dsh-agents-board` v1.25.5. Fail-safe semantics were
preserved and re-shaped to the new API.

## The rc.1 → rc.2 API break, item by item

| rc.1 (1.4.8) | rc.2 (2.0.0) | What would have broken |
|---|---|---|
| `settings.installSection` + hand-rolled `{uid, refs}` schema node | exported schemastery `Config`, all fields `.volatile()` | section silently absent; `installSection` is gone |
| row `name: file://…/boot.mjs` | row `name: dsh-text-reader` (package), `id: text-reader` load-bearing | double registration of the same package breaks the client-module scanner |
| `settings.plugin.item` slot | `plugins.bundle.config` slot, dispatch `key` = package name | settings card never renders |
| client inject `settingsScope` (`.bind({namespace})`) | client inject `configForms` (`.get('text-reader')`) | settings state never resolves |
| `dsh.client.inject: ['…ui-settings-plugins']` | `['…locale', '…ui-settings']` | old client plugin absent from rc.2 client |
| `%DSH_HOME%\plugins\<name>` copy, patch-watcher hot mount | profile `node_modules\<name>` copy, restart + F5 after install | stale bytes served; mysterious "changes don't apply" |
| settings in `settings.yaml` | row config in the profile store (bundle `cordis.patch.yml` carries defaults) | uninstall-time removal of a section that no longer exists |

## Fail-safe layers (kept through the port)

1. **Guarded schemastery load** (host.mjs): `createRequire` cascade — bare
   `@deepseek-ai/schemastery`, then the vendored `./deps/schemastery.cjs`
   (+ vendored cosmokit for Node's require(esm)); both wrapped, `export let
   Config = undefined` when both fail. Loss: Plugins-page form only. The
   reader still runs with the row config and defaults. Fully synchronous —
   no top-level await (rc.2 loader requirement).
2. **Guarded route registration** (host.mjs `apply`): `ctx.effect(() =>
   ctx.webServer.register(...))` inside try/catch, `console.error` on failure.
   Loss: system speech only; browser speech keeps working; server boots.
   The web server itself is a declared hard dependency (`export const inject =
   ['webServer']`) — property access in `apply` is then guaranteed legal.
3. **Guarded client activation** (client.js `apply`): every step
   (`locale.register`, `configForms.get`, every slot registration) runs through
   `safeRegister` — a try/catch that logs `text-reader: <step> skipped (…)` and
   lets the rest proceed. A `configForms.get` returning nothing stops only the
   form consumers (card + icon read the fallback face); the other slots still
   mount. Loss: the reader degrades; the page never does.
4. **`safeSlot` mount containment** (client.js): `ctx.slots.inject(key, () =>
   safeRegister(() => ctx.slots.register({...}, Component), step))` — a maker
   throw is contained at mount time (rc.2 mounts lazily per dispatch).
5. **No harness UI primitives** (client.js): the card ships its own
   `LocalSwitch` and inline SVG icons; `react` is the only external. A harness
   build that drops or renames a primitive cannot blank the Plugins page.
6. **Non-throwing config reads** (host.mjs `readValue`/`readerSnapshot`,
   client.js `normalizeSettings`): volatile refs and plain values both read;
   corrupt values normalize to defaults.
7. **Install-time pre-flight** (install.ps1): `node --check host.mjs
   client.js` gates the install — a syntactically broken file never reaches
   the profile copy, so a bad edit cannot fail the server start.
8. **Artifact lifetime** (install.ps1): the packed `.tgz` lands in the
   profile's `.artifacts` folder (packed from a staging copy without
   archives, so nothing nests inside) and is KEPT after the successful add —
   the manifest references it by `file:` path, and any bundle install
   resolves every profile dependency, so a deleted current artifact breaks
   other bundles' installs (even their remove). Only stale versions of this
   package are cleaned, pointwise, in `.artifacts` and in the master folder;
   uninstall.ps1 cleans its own artifacts only after a successful
   `dsh plugin remove`. A manifest reference to a missing artifact (left by
   an older scheme) is cleared first via the official `dsh plugin remove`,
   after mirroring live row values into the bundle patch.

## Boot canary — why boot.mjs disappeared

In rc.1 the profile row pointed at `boot.mjs`, a tiny always-valid launcher
that guarded `import('./host.mjs')` — because a row entry that failed to
import aborted the whole server start. In rc.2 the row references the
**package** (`name: dsh-text-reader`), and the loader reads the exported
`Config` **statically** from the entry module — a dynamic-import launcher
cannot forward it. The equivalent containment now lives inside `host.mjs`
itself: import-time work is limited to the guarded schemastery cascade (no
other side effects), the installer syntax-checks both halves, and the runtime
activation steps are individually guarded. A broken host half in rc.2 fails
the bundle activation loudly (the harness logs it) without touching the
server's other fibers.

## Verified during this port

- `node --check` on both halves; Node import of `host.mjs` (Config schema
  materializes from the vendored copy; `readTextReaderState()` normalizes).
- Node simulation of the client bundle (stub `window.__ModuleLoader__`,
  stub react): locale + `configForms.get('text-reader')` wired, both slots
  registered (`shell.overlay`, `plugins.bundle.config#dsh-text-reader`),
  and a throwing card registration contained (one console line, FAB intact).
- `pnpm dsh --profile web --dump-config` shows the row with the user's
  migrated values (`voice: Microsoft Irina - Russian (Russia)`, `rate: 2`,
  `output: wav`, `device: ''`, `language: auto`).
- `dsh plugin --profile web add` succeeded; profile copy materialized in
  `profiles\web\node_modules\dsh-text-reader\` (runtime files + deps).
- Live page verification (server restart, F5, slot tree, served client.js):
  performed after delivery — see the final chat report for the result.
