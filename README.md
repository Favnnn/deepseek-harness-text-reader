# dsh-text-reader

A floating read-aloud icon for the DeepSeek Harness web GUI: select any text — an icon appears next to the cursor; one click speaks the selection aloud. After the speech ends (fully played, or stopped by a click) the icon stays: one more click re-reads the same text, or a fresh selection if you made one; clicking it while nothing is selected dismisses the icon. The **Plugins** page carries the enable switch, the **audio output mode** (browser / Windows + chosen device / Windows helper process), the voice picker, the speed, a Test button, and the plugin's own **UI language** switch (Авто / EN / RU — auto follows the harness locale).

Версия плагина: **2.0.0** (dsh v0.2.0-rc.2).

> **Languages / Языки:** English first, the Russian original follows after the divider.

---

## Installation

Requirements: DeepSeek Harness **v0.2.0-rc.2** with at least one `pnpm dsh web` run on this PC (so `%DSH_HOME%\profiles\web\` exists; by default `%DSH_HOME%` = `C:\<user>\.dsh`). Windows PowerShell 5.1+ ships with Windows.

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Or just double-click `install.bat` — it runs the same script and keeps the window open.

The plugin installs as a **profile bundle** — the only supported way in rc.2. The script (run from the plugin folder):

1. Syntax-checks `host.mjs` and `client.js` (`node --check`): a broken file never reaches the profile.
2. Vendors the config-schema library into `deps\` (from the harness checkout) so the bundle is self-contained.
3. Cleans up pre-rc.2 leftovers (a legacy `file://` row in the profile patch, a legacy copy under `%DSH_HOME%\plugins`) — idempotent, usually no-ops.
4. Packs the folder into the profile's **`.artifacts`** folder (`%DSH_HOME%\profiles\web\.artifacts`) — from a staging copy without archives, so nothing can nest inside the tarball — and runs the harness CLI from its checkout: `pnpm dsh plugin --profile web add <that tarball>`. The manifest is pointed at the `.artifacts` path.
5. Keeps the packed `.tgz` — the manifest references it by `file:` path, and any bundle install resolves every profile dependency, so a deleted artifact would break other plugins' installs. Only **stale versions** of this package are cleaned up (pointwise, in `.artifacts` and in the master folder). The profile also keeps its **own copy** of the package at `%DSH_HOME%\profiles\web\node_modules\dsh-text-reader\`.

Re-running is safe and idempotent: the copy is refreshed, no duplicates appear. The runtime **never reads** the master folder after installation — you may rename, move, or copy it to another PC. If you changed files in the master folder, run `install.ps1` again to refresh the profile copy.

**After any install: restart `pnpm dsh web` and reload the page (F5).** The client module registry is built at server start, and the Plugins page reads the bundle list at mount.

Your settings survive: they live in the profile's patch layer (row `text-reader` in the composed config, edited live from the Plugins page). Re-installs and restarts keep them; the row's values are carried over the rc.1 → rc.2 settings migration by `cordis.patch.yml`.

## Uninstalling

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

Or double-click `uninstall.bat` — when run from an installed copy it first moves itself to `%TEMP%`, so the plugin folder can delete cleanly.

The script:

1. Runs the harness CLI from its checkout: `pnpm dsh plugin --profile web remove dsh-text-reader` (removes the bundle row and the profile copy).
2. Cleans up pre-rc.2 leftovers: the legacy managed row in the profile patch, the legacy copy under `%DSH_HOME%\plugins`, a legacy `text-reader` section in `settings.yaml`.

The master folder is left untouched. Restart `pnpm dsh web` afterwards.

## Moving to another PC

1. Copy the whole `dsh-text-reader` folder to the other PC at any path (for example `C:\Tools\dsh-text-reader`).
2. That PC needs the harness (rc.2) installed and `pnpm dsh web` run at least once.
3. Run `powershell -ExecutionPolicy Bypass -File C:\Tools\dsh-text-reader\install.ps1`.
4. Restart `pnpm dsh web`, reload the page — the icon is live. The speech voices come from the target OS/browser.

## How it works

- **host.mjs** — the host half. Exports the schemastery `Config` schema (`enabled`, `voice`, `rate`, `output`, `device`, `language`; every field `.volatile()`): the settings service publishes it under the row id `text-reader`, the Plugins page generates its form from it, and writes go live without reloading the fiber. Also declares `inject: ['webServer']` and mounts the `/text-reader/*` routes for **system speech**: `/voices` lists Windows voices, `/devices` lists Windows output devices, `/speak.wav?txt=<base64>&voice=<base64>&rate=<n>` synthesizes a WAV through a helper PowerShell process (System.Speech, SAPI COM fallback) with a temp-file cache, `/play?…&device=<n>` synthesizes (reusing the cache) and renders the WAV through the chosen device, `/speak` speaks from the process directly, `/stop` kills the helpers. Browsers cannot pick an output device for speechSynthesis (and may hide the device list entirely), so the helper process owns the audio instead — routable per device or per application. schemastery loads through a guarded cascade (bare specifier, then the vendored `deps/schemastery.cjs`); a missing copy only costs the Plugins-page form. A failed route registration degrades only system speech; the server boots normally either way.
- **client.js** — the browser bundle in ModuleLoader format, `React.createElement` only, externals: react (no harness UI primitives — the card ships its own switch, so a harness change can never blank the Plugins page). It registers `shell.overlay` (the floating icon) and **`plugins.bundle.config`** (the Plugins-page settings editor; the dispatch `key` is the package name `dsh-text-reader`, and the card renders either the `summary` one-liner or the full editor depending on the dispatched `view`) plus the `en`/`ru` dictionaries. The settings state comes from `ctx.configForms.get('text-reader')` — one shared reactive form per row (`{status, value, writable, set}`), which the floating icon also reads live. The icon tracks document `mouseup` (non-empty selection → show next to the cursor; `mousedown` elsewhere, scroll, resize, Escape → hide). Browser mode speaks via `window.speechSynthesis` in sentence-sized chunks (Chromium hangs local Windows voices on one long utterance) with stuck-queue recovery; host modes call the routes above. For the "auto" voice `ru-RU`/`en-US` (or the Russian/English Windows voice) is picked by text content. The whole activation and every slot registration are guarded: a crash degrades the reader, never the page.
- **Storage**: rc.2 keeps settings in the profile's own config store — the row `text-reader` (`name: dsh-text-reader`) carries the values, the Plugins page edits them live, and the bundle's `cordis.patch.yml` holds the defaults shipped with the package.

## Files

| File | Role |
|---|---|
| `package.json` | manifest: `dsh.bundle.patch` → `cordis.patch.yml`, `dsh.client.platform: web`, export `./client` → `client.js` |
| `cordis.patch.yml` | the bundle overlay: inserts the `text-reader` row (package `dsh-text-reader`) with default config values |
| `host.mjs` | host half: the exported `Config` schema + the `/text-reader/*` system-speech routes |
| `client.js` | browser bundle: selection watch, floating icon, speech, Plugins-page editor |
| `deps/` | vendored schemastery (CJS) + cosmokit, provisioned by install.ps1 |
| `install.ps1` | one-run installation (pack + the official `dsh plugin add`, legacy cleanup) |
| `uninstall.ps1` | one-run removal (official `dsh plugin remove` + legacy cleanup) |
| `install.bat` / `uninstall.bat` | double-click wrappers for the two scripts |
| `README.md` | this file; copied into the profile copy |

## Troubleshooting

- **The icon is missing after installation.** Restart `pnpm dsh web`, then F5 (both are required after an install — the client registry is built at server start). Check: `http://127.0.0.1:3080/plugins/??dsh-text-reader/client.js` must be served (not 404).
- **No sound.** Pick the output mode on the Plugins page first: **Browser** plays through the browser's engine (the Windows OneCore speech path ignores per-app routing and uses the system default output); **Windows + device** synthesizes on the host and the helper process renders each WAV through the exact Windows output device picked in the card; **Windows process** speaks from the helper process on the system default — a Stream Deck-style per-app router can then map `powershell.exe` wherever you like (the app appears in the router while it is speaking). Also make sure the tab is not muted by autoplay policy, and press the ▶ Test button in the card. If the host routes are unreachable (stale server), the card silently falls back to browser speech.
- **I changed client.js / host.mjs in the master folder, nothing changed.** Run `install.ps1` again (the runtime reads the profile copy, not the master), restart `pnpm dsh web`, and refresh the page.
- **`pnpm pack` / `dsh plugin add` fails with ENOENT on some `*.tgz`.** The profile manifest references every installed bundle's packed tarball by `file:` path, and any install resolves all of them; a missing artifact (deleted by an older install scheme) breaks the resolution. Repair: run `pnpm pack --pack-destination .` in that plugin's master folder (`C:\Deepseek-Harness\<that-plugin>`, the folder is only read) so the tarball appears exactly at the referenced path — that plugin's own next `install.ps1` run then migrates it to `.artifacts` (official remove+add). This script packs into `.artifacts` and keeps the current artifact, so it never creates such a dangling reference itself.

---

# Русский (оригинал)

Плавающий значок озвучки для web GUI DeepSeek Harness: выделите любой текст — рядом с курсором появится значок, одно нажатие произнесёт выделенное вслух. После окончания озвучки (дочитал или остановили кликом) значок остаётся: повторное нажатие прочитает тот же текст заново (или свежее выделение, если вы его сделали); клик по значку при пустом выделении его прячет. На странице **Plugins** живут переключатель, **способ вывода звука** (браузер / Windows + устройство / процесс Windows), выбор голоса, скорость, кнопка «Проба» и собственный переключатель **языка интерфейса** (Авто / EN / RU — «Авто» следует языку harness).

Версия плагина: **2.0.0** (dsh v0.2.0-rc.2).

## Установка

Требуется: DeepSeek Harness **v0.2.0-rc.2** и хотя бы один запуск `pnpm dsh web` на этом ПК (чтобы существовал `%DSH_HOME%\profiles\web\`; по умолчанию `%DSH_HOME%` = `C:\<пользователь>\.dsh`).

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Или просто дважды кликните `install.bat` — он делает то же самое и не закрывает окно.

Плагин ставится как **бандл профиля** — единственный поддерживаемый способ в rc.2. Скрипт (запускаемый из папки плагина):

1. Проверяет синтаксис `host.mjs` и `client.js` (`node --check`): битый файл не попадёт в профиль.
2. Вендорит библиотеку конфиг-схем в `deps\` (из чекаута харнесса) — бандл самодостаточен.
3. Убирает следы до-rc.2 установок (легаси-строку `file://` в патче профиля, легаси-копию в `%DSH_HOME%\plugins`) — идемпотентно, обычно пусто.
4. Упаковывает папку в **`.artifacts`** профиля (`%DSH_HOME%\profiles\web\.artifacts`) — из staging-копии без архивов, так что ничего не вкладывается внутрь tarball — и запускает CLI харнесса из его чекаута: `pnpm dsh plugin --profile web add <этот tarball>`. Манифест получает ссылку на путь в `.artifacts`.
5. **Сохраняет** упакованный `.tgz`: манифест ссылается на него `file:`-путём, и установка любого бандла резолвит все зависимости профиля — удалённый артефакт ломал бы чужие установки. Чистятся только **устаревшие версии** этого пакета (точечно, в `.artifacts` и в мастер-папке). В профиле также остаётся **своя копия** пакета: `%DSH_HOME%\profiles\web\node_modules\dsh-text-reader\`.

Повторный запуск безопасен и идемпотентен: копия обновляется, дублей не появляется. Рантайм **не читает** мастер-папку после установки — её можно перенести или скопировать на другой ПК. Изменили файлы в мастер-папке — запустите `install.ps1` заново.

**После любой установки: перезапустите `pnpm dsh web` и обновите страницу (F5).** Реестр клиентских модулей строится при старте сервера, а страница Plugins читает список бандлов при монтировании.

Настройки переживают переустановку: они живут в патч-слое профиля (строка `text-reader` в композиции, правится живьём со страницы Plugins). Переустановки и перезапуски их сохраняют; значения строки проведены через миграцию настроек rc.1 → rc.2 в `cordis.patch.yml`.

## Удаление

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

Или двойной клик `uninstall.bat` — при запуске из установленной копии он сначала копирует скрипт в `%TEMP%`, чтобы папка плагина удалилась чисто.

Скрипт:

1. Запускает CLI харнесса из чекаута: `pnpm dsh plugin --profile web remove dsh-text-reader` (убирает строку бандла и копию из профиля).
2. Подчищает следы до-rc.2 установок: легаси-строку в патче профиля, легаси-копию в `%DSH_HOME%\plugins`, легаси-раздел `text-reader` в `settings.yaml`.

Мастер-папку не трогает. После удаления перезапустите `pnpm dsh web`.

## Перенос на другой ПК

1. Скопируйте всю папку `dsh-text-reader` на другой ПК в любой путь — флешкой, архивом, по сети.
2. На том ПК должен быть установлен harness (rc.2) и хотя бы раз запущен `pnpm dsh web`.
3. Запустите `powershell -ExecutionPolicy Bypass -File C:\Tools\dsh-text-reader\install.ps1`.
4. Перезапустите `pnpm dsh web`, обновите страницу — значок заработает. Голоса берутся из целевой ОС/браузера.

## Как это устроено

- **host.mjs** — host-половина. Экспортирует schemastery-схему `Config` (`enabled`, `voice`, `rate`, `output`, `device`, `language`; каждое поле `.volatile()`): сервис настроек публикует её под id строки `text-reader`, страница Plugins генерирует из неё форму, записи применяются живьём без перезагрузки фибры. Также объявляет `inject: ['webServer']` и навешивает маршруты `/text-reader/*` для **системного голоса**: `/voices` — голоса Windows, `/devices` — устройства вывода, `/speak.wav` — синтез WAV процессом-помощником PowerShell (System.Speech, запасной вариант — COM SAPI) с кэшем, `/play?...&device=N` — синтез (из кэша) и воспроизведение на выбранное устройство, `/speak` — озвучка из процесса, `/stop` — заглушить. Браузер не умеет выбирать устройство для speechSynthesis (и может вовсе скрывать список устройств), поэтому звуком владеет процесс-помощник — выбор устройства или маршрутизация по приложению. schemastery грузится каскадом с защитой (базовое имя, затем вендоренный `deps/schemastery.cjs`); отсутствие копии стоит только формы на странице Plugins. Сбой регистрации маршрутов деградирует только системную озвучку — сервер стартует в любом случае.
- **client.js** — клиентский бандл в формате ModuleLoader, только `React.createElement`, внешние модули: react (без UI-примитивов харнесса — карточка несёт свой переключатель, поэтому изменения харнесса не могут обнулить страницу Plugins). Регистрирует `shell.overlay` (плавающий значок) и **`plugins.bundle.config`** (редактор настроек на странице Plugins; dispatch-ключ — имя пакета `dsh-text-reader`, карточка рисует либо однострочник `summary`, либо полный редактор в зависимости от присланных props) плюс словари `en`/`ru`. Состояние настроек приходит из `ctx.configForms.get('text-reader')` — одна общая реактивная форма на строку (`{status, value, writable, set}`), её же живьём читает плавающий значок. Значок следит за `mouseup` в документе (непустое выделение — появиться у курсора; клик мимо, прокрутка, изменение размера окна, Escape — исчезнуть). В браузере говорит через `window.speechSynthesis` кусками по границам предложений (Chromium вешает локальные голоса Windows на длинной фразе) со страховкой от залипшей очереди; в системных режимах обращается к маршрутам хоста. Для голоса «авто» язык (и голос Windows) подбирается по тексту. Активация и каждая регистрация слота обёрнуты в защиту: сбой деградирует ридер, но не страницу.
- **Хранилище**: в rc.2 настройки живут в собственном хранилище профиля — строка `text-reader` (`name: dsh-text-reader`) несёт значения, страница Plugins правит их живьём, а `cordis.patch.yml` бандла держит поставляемые значения по умолчанию.

## Устранение неполадок

- **Значок не появился после установки.** Перезапустите `pnpm dsh web`, затем F5 (после установки нужны оба шага — реестр клиентов строится при старте сервера). Проверка: `http://127.0.0.1:3080/plugins/??dsh-text-reader/client.js` должен отдаваться (не 404).
- **Нет звука.** Сначала выберите способ на странице Plugins: **Браузер** — голосом браузера (речь OneCore не подчиняется маршрутизации «по приложениям» и идёт на системное устройство по умолчанию); **Windows + устройство** — хост синтезирует WAV, и процесс-помощник выводит его ровно на выбранное в карточке устройство вывода Windows; **Процесс Windows** — говорит процесс-помощник на устройство по умолчанию, а маршрутизатор «по приложениям» (например, плагин Stream Deck) может увести `powershell.exe` куда угодно (приложение появляется в маршрутизаторе на время речи). Также проверьте, что вкладка не заглушена политикой autoplay, и нажмите «▶ Проба» в карточке. Если маршруты хоста недоступны (сервер не перезапущен), карточка молча откатится на браузерную озвучку.
- **Изменил файлы в мастер-папке, ничего не поменялось.** Запустите `install.ps1` заново (рантайм читает копию профиля, не мастер), перезапустите `pnpm dsh web` и обновите страницу.
- **`pnpm pack` / `dsh plugin add` падает с ENOENT на каком-то `*.tgz`.** Манифест профиля ссылается на tarball каждого установленного бандла `file:`-путём, и любая установка резолвит их все; отсутствующий артефакт (удалённый старой схемой установки) ломает резолвинг. Лечение: выполните `pnpm pack --pack-destination .` в мастер-папке того плагина (`C:\Deepseek-Harness\<тот-плагин>`, папка только читается), чтобы tarball появился ровно по указанному пути — его собственный следующий `install.ps1` переведёт артефакт в `.artifacts` (официальный remove+add). Этот скрипт пакует в `.artifacts` и хранит текущий артефакт, так что сам таких висячих ссылок не создаёт.
