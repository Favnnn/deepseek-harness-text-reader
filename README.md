# dsh-text-reader

A floating read-aloud icon for the DeepSeek Harness web GUI: select any text — an icon appears next to the cursor; one click speaks the selection aloud. After the speech ends (fully played, or stopped by a click) the icon stays: one more click re-reads the same text, or a fresh selection if you made one; clicking it while nothing is selected dismisses the icon. Settings → Plugins carries the enable switch, the **audio output mode** (browser / Windows + chosen device / Windows helper process), the voice picker, the speed, a Test button, and the plugin's own **UI language** switch (Авто / EN / RU — auto follows the harness locale).

Версия плагина: **1.4.8**.

> **Languages / Языки:** English first, the Russian original follows after the divider.

---

## Installation

Requirements: an installed DeepSeek Harness and at least one `pnpm dsh web` run on this PC (so `%DSH_HOME%\profiles\web\` exists; by default `%DSH_HOME%` = `C:\<user>\.dsh`). Windows PowerShell 5.1+ ships with Windows.

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Or just double-click `install.bat` — it runs the same script and keeps the window open.

The script (run from the plugin folder):

1. Copies the **whole folder** into `%DSH_HOME%\plugins\dsh-text-reader\`. That copy is the live plugin.
2. Adds a managed row to `%DSH_HOME%\profiles\web\cordis.patch.yml` (marked `# dsh-text-reader (managed by install.ps1)`), pointing at `…\plugins\dsh-text-reader\host.mjs`.
3. Rewrites `cordis.patch.yml` in the master folder — an informational copy of the installed row only.

Re-running is safe and idempotent: the copy and the row are refreshed, no duplicates appear. The harness **never reads** the master folder after installation — you may rename, move, or copy it to another PC. If you changed files in the master folder, run `install.ps1` again to refresh the installed copy.

The web profile watches its patch layer (`patchReload: live`), so the host half mounts without a restart. After installing, reload the page (F5). If the icon still does not appear, restart `pnpm dsh web` once — the client module registry is built at server start. From then on, the Settings → Plugins toggle works live, without any restart.

## Uninstalling

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

Or double-click `uninstall.bat` — when run from the installed copy it first moves itself to `%TEMP%`, so the plugin folder can delete cleanly.

The script works the same from the master folder and from the installed copy. It:

1. Removes the managed row from `%DSH_HOME%\profiles\web\cordis.patch.yml`.
2. Deletes the installed copy `%DSH_HOME%\plugins\dsh-text-reader\`.
3. Removes the `text-reader` section from `settings.yaml`.

The master folder is left untouched. Restart `pnpm dsh web` afterwards.

## Moving to another PC

1. Copy the whole `dsh-text-reader` folder to the other PC at any path (for example `C:\Tools\dsh-text-reader`).
2. That PC needs the harness installed and `pnpm dsh web` run at least once.
3. Run `powershell -ExecutionPolicy Bypass -File C:\Tools\dsh-text-reader\install.ps1`.
4. Reload the page — the icon is live. The speech voices come from the target OS/browser.

## How it works

- **boot.mjs** — the guarded launcher the profile row mounts. The harness boots fail-loud (one entry that fails to import or activate aborts the whole server start), so the row always points at this tiny always-valid stub; it loads `host.mjs` through guarded dynamic imports, and a corrupted host module only switches the reader off (reason in the server log) while the server starts normally.
- **host.mjs** — the host half (Node builtins only): registers the `text-reader` settings section (`enabled`, `voice`, `rate`, `output`, `device`, `language`) through the settings service, and mounts `/text-reader/*` routes on the web server for **system speech**: `/voices` lists Windows voices, `/devices` lists Windows output devices, `/speak.wav?txt=<base64>&voice=<base64>&rate=<n>` synthesizes a WAV through a helper PowerShell process (System.Speech, SAPI COM fallback) with a temp-file cache, `/play?…&device=<n>` synthesizes (reusing the cache) and renders the WAV through the chosen device, `/speak` speaks from the process directly, `/stop` kills the helpers. Browsers cannot pick an output device for speechSynthesis (and may hide the device list entirely), so the helper process owns the audio instead — routable per device or per application. Every registration is individually guarded: a failure degrades only that feature, and duplicate watcher re-runs are treated as success.
- **client.js** — the browser bundle in ModuleLoader format, `React.createElement` only, externals: react (no harness UI primitives — the card ships its own switch, so a harness change can never blank the Plugins tab). It registers `shell.overlay` (the floating icon) and `settings.plugin.item` (the settings card) plus the `en`/`ru` dictionaries. The icon tracks document `mouseup` (non-empty selection → show next to the cursor; `mousedown` elsewhere, scroll, resize, Escape → hide). Browser mode speaks via `window.speechSynthesis` in sentence-sized chunks (Chromium hangs local Windows voices on one long utterance) with stuck-queue recovery; host modes call the routes above. For the "auto" voice `ru-RU`/`en-US` (or the Russian/English Windows voice) is picked by text content. The whole activation and every slot registration are guarded: a crash degrades the reader, never the page.
- **Storage**: settings live in `%DSH_HOME%\settings.yaml` (section `text-reader`), so the on/off state survives restarts and applies live through the settings mirror.

## Files

| File | Role |
|---|---|
| `package.json` | manifest: name `dsh-text-reader`, `dsh.client.platform: web`, export `./client` → `client.js` |
| `boot.mjs` | guarded launcher mounted by the profile row; loads `host.mjs` defensively so a broken host half can never block the server start |
| `host.mjs` | host half: the settings section + the `/text-reader/*` system-speech routes |
| `client.js` | browser bundle: selection watch, floating icon, speech, settings card |
| `install.ps1` | one-run installation (copy into `%DSH_HOME%\plugins\` + the profile-patch row) |
| `uninstall.ps1` | one-run removal (the row + the installed copy + the settings section) |
| `install.bat` / `uninstall.bat` | double-click wrappers for the two scripts |
| `cordis.patch.yml` | informational copy of the installed row (rewritten by install.ps1) |
| `README.md` | this file; copied into the installed folder |

## Troubleshooting

- **The icon is missing after installation.** Reload the page (F5); if it stays missing, restart `pnpm dsh web` once. Check: `http://127.0.0.1:3080/plugins/dsh-text-reader/client.js` must be served (not 404).
- **No sound.** Pick the output mode in Settings → Plugins first: **Browser** plays through the browser's engine (the Windows OneCore speech path ignores per-app routing and uses the system default output); **Windows + device** synthesizes on the host and the helper process renders each WAV through the exact Windows output device picked in the card; **Windows process** speaks from the helper process on the system default — a Stream Deck-style per-app router can then map `powershell.exe` wherever you like (the app appears in the router while it is speaking). Also make sure the tab is not muted by autoplay policy, and press the ▶ Test button in the card. If the host routes are unreachable (stale server), the card silently falls back to browser speech.
- **I changed client.js / host.mjs in the master folder, nothing changed.** Run `install.ps1` again (the runtime does not read the master) and refresh the page.

---

# Русский (оригинал)

Плавающий значок озвучки для web GUI DeepSeek Harness: выделите любой текст — рядом с курсором появится значок, одно нажатие произнесёт выделенное вслух. После окончания озвучки (дочитал или остановили кликом) значок остаётся: повторное нажатие прочитает тот же текст заново (или свежее выделение, если вы его сделали); клик по значку при пустом выделении его прячет. В Settings → Plugins живут переключатель, **способ вывода звука** (браузер / Windows + устройство / процесс Windows), выбор голоса, скорость, кнопка «Проба» и собственный переключатель **языка интерфейса** (Авто / EN / RU — «Авто» следует языку harness).

## Установка

Требуется: установленный DeepSeek Harness и хотя бы один запуск `pnpm dsh web` на этом ПК (чтобы существовал `%DSH_HOME%\profiles\web\`; по умолчанию `%DSH_HOME%` = `C:\<пользователь>\.dsh`).

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Или просто дважды кликните `install.bat` — он делает то же самое и не закрывает окно.

Скрипт (запускаемый из папки плагина):

1. Копирует **всю папку** в `%DSH_HOME%\plugins\dsh-text-reader\`. Эта копия и есть живой плагин.
2. Добавляет управляемую строку в `%DSH_HOME%\profiles\web\cordis.patch.yml` (маркер `# dsh-text-reader (managed by install.ps1)`), указывающую на `…\plugins\dsh-text-reader\host.mjs`.
3. Переписывает `cordis.patch.yml` в мастер-папке — это только информационная копия установленного ряда.

Повторный запуск безопасен и идемпотентен. Папка-мастер после установки harness'ом **не читается** — её можно перенести или скопировать на другой ПК. Изменили файлы в мастер-папке — запустите `install.ps1` заново.

Web-профиль следит за своим патч-слоем (`patchReload: live`), поэтому host-половина подмонтируется без рестарта. После установки обновите страницу (F5). Если значок не появился — один раз перезапустите `pnpm dsh web` (реестр клиентских модулей строится при старте сервера). Дальше переключатель в Settings → Plugins работает живاً, без перезапусков.

## Удаление

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

Или двойной клик `uninstall.bat` — при запуске из установленной копии он сначала копирует скрипт в `%TEMP%`, чтобы папка плагина удалилась чисто.

Скрипт работает одинаково из мастер-папки и из установленной копии. Он:

1. Убирает управляемую строку из `%DSH_HOME%\profiles\web\cordis.patch.yml`.
2. Удаляет установленную копию `%DSH_HOME%\plugins\dsh-text-reader\`.
3. Убирает раздел `text-reader` из `settings.yaml`.

Мастер-папку не трогает. После удаления перезапустите `pnpm dsh web`.

## Перенос на другой ПК

1. Скопируйте всю папку `dsh-text-reader` на другой ПК в любой путь — флешкой, архивом, по сети.
2. На том ПК должен быть установлен harness и хотя бы раз запущен `pnpm dsh web`.
3. Запустите `powershell -ExecutionPolicy Bypass -File C:\Tools\dsh-text-reader\install.ps1`.
4. Обновите страницу — значок заработает. Голоса берутся из целевой ОС/браузера.

## Как это устроено

- **boot.mjs** — защищённый загрузчик, который монтирует строка профиля. Старт харнесса — fail-loud (одна строка, не сумевшая импортироваться или активироваться, срывает весь запуск сервера), поэтому строка всегда указывает на этот крошечный всегда-валидный стаб; он грузит `host.mjs` через защищённые динамические импорты, и повреждённый host-модуль лишь выключает ридер (причина — в логе сервера), не мешая серверу стартовать.
- **host.mjs** — host-половина (только встроенные модули Node): регистрирует секцию настроек `text-reader` (`enabled`, `voice`, `rate`, `output`, `device`, `language`) и навешивает на web-сервер маршруты `/text-reader/*` для **системного голоса**: `/voices` — голоса Windows, `/devices` — устройства вывода, `/speak.wav` — синтез WAV процессом-помощником PowerShell (System.Speech, запасной вариант — COM SAPI) с кэшем, `/play?...&device=N` — синтез (из кэша) и воспроизведение на выбранное устройство, `/speak` — озвучка из процесса, `/stop` — заглушить. Браузер не умеет выбирать устройство для speechSynthesis (и может вовсе скрывать список устройств), поэтому звуком владеет процесс-помощник — выбор устройства или маршрутизация по приложению. Каждая регистрация защищена отдельно: сбой деградирует только свою часть, а повторные прогоны вотчера считаются успехом.
- **client.js** — клиентский бандл в формате ModuleLoader, только `React.createElement`, внешние модули: react (без UI-примитивов харнесса — карточка несёт свой переключатель, поэтому изменения харнесса не могут обнулить вкладку Plugins). Регистрирует `shell.overlay` (плавающий значок) и `settings.plugin.item` (карточка настроек), плюс словари `en`/`ru`. Значок следит за `mouseup` в документе (непустое выделение — появиться у курсора; клик мимо, прокрутка, изменение размера окна, Escape — исчезнуть). В браузере говорит через `window.speechSynthesis` кусками по границам предложений (Chromium вешает локальные голоса Windows на длинной фразе) со страховкой от залипшей очереди; в системных режимах обращается к маршрутам хоста. Для голоса «авто» язык (и голос Windows) подбирается по тексту. Активация и каждая регистрация слота обёрнуты в защиту: сбой деградирует ридер, но не страницу.
- **Хранилище**: настройки — `%DSH_HOME%\settings.yaml` (раздел `text-reader`), поэтому состояние вкл/выкл переживает перезапуски и применяется живём через зеркало настроек.

## Устранение неполадок

- **Значок не появился после установки.** Обновите страницу (F5); не помогло — один раз перезапустите `pnpm dsh web`. Проверка: `http://127.0.0.1:3080/plugins/dsh-text-reader/client.js` должен отдаваться (не 404).
- **Нет звука.** Сначала выберите способ в Settings → Plugins: **Браузер** — голосом браузера (речь OneCore не подчиняется маршрутизации «по приложениям» и идёт на системное устройство по умолчанию); **Windows + устройство** — хост синтезирует WAV, и процесс-помощник выводит его ровно на выбранное в карточке устройство вывода Windows; **Процесс Windows** — говорит процесс-помощник на устройство по умолчанию, а маршрутизатор «по приложениям» (например, плагин Stream Deck) может увести `powershell.exe` куда угодно (приложение появляется в маршрутизаторе на время речи). Также проверьте, что вкладка не заглушена политикой autoplay, и нажмите «▶ Проба» в карточке. Если маршруты хоста недоступны (сервер не перезапущен), карточка молча откатится на браузерную озвучку.
- **Изменил файлы в мастер-папке, ничего не поменялось.** Запустите `install.ps1` заново (мастер рантаймом не читается) и обновите страницу.
