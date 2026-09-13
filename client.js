window.__ModuleLoader__.load({
	id: "dsh-text-reader",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region stylesheet
		const css = ".trd-fab{position:fixed;z-index:95;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;box-sizing:border-box;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-secondary);box-shadow:var(--dsw-elevation-prominent);cursor:pointer;pointer-events:auto;user-select:none;touch-action:none}.trd-fab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-l2)}.trd-fabSpeaking{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-label-primary) 14%,var(--dsw-specific-menu))}.trd-fab svg{flex:none}.trd-settings{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:12px;border:1px solid var(--dsw-alias-border-l3);border-radius:12px}.trd-settingsText{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}.trd-settingsTitle{margin:0;font-size:13px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary)}.trd-settingsDesc{margin:0;font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.trd-settingsControls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}.trd-fieldRow{display:flex;align-items:center;gap:8px}.trd-fieldLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.trd-select{max-width:240px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px;padding:2px 6px;outline:0}.trd-select:disabled{cursor:default;opacity:.5}.trd-segmented{display:inline-flex;align-items:stretch;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-fill-l2);padding:2px;gap:2px}.trd-segment{border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px;padding:0 8px;cursor:pointer;white-space:nowrap}.trd-segment:hover{color:var(--dsw-alias-label-secondary)}.trd-segmentActive{background:var(--dsw-specific-menu);color:var(--dsw-alias-label-primary)}.trd-segment:disabled{cursor:default;opacity:.5}";
		const tagId = "dsh-text-reader/text-reader.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-text-reader";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** English dictionary — the fallback terminus of every locale chain. */
		const en = {
			"fab.speak": "Read the selection aloud",
			"fab.stop": "Stop reading",
			"settings.title": "Text reader",
			"settings.description": "A floating icon appears next to the cursor after you select text; clicking it speaks the selection aloud.",
			"settings.switch": "Show the floating read-aloud icon",
			"settings.voice": "Voice",
			"settings.voiceAuto": "Auto (by text language)",
			"settings.rate": "Speed",
			"settings.output": "Audio via",
			"settings.outputBrowser": "Browser",
			"settings.outputWav": "Windows + device",
			"settings.outputProcess": "Windows process",
			"settings.device": "Output device",
			"settings.deviceDefault": "System default",
			"settings.test": "Test"
		};
		/** Russian dictionary, key-identical to the English source of truth. */
		const ru = {
			"fab.speak": "Озвучить выделенное",
			"fab.stop": "Остановить озвучивание",
			"settings.title": "Озвучивание текста",
			"settings.description": "После выделения текста рядом с курсором появляется значок; по нажатию выделенное произносится вслух.",
			"settings.switch": "Показывать плавающий значок озвучки",
			"settings.voice": "Голос",
			"settings.voiceAuto": "Авто (по языку текста)",
			"settings.rate": "Скорость",
			"settings.output": "Озвучивание через",
			"settings.outputBrowser": "Браузер",
			"settings.outputWav": "Windows + устройство",
			"settings.outputProcess": "Процесс Windows",
			"settings.device": "Устройство вывода",
			"settings.deviceDefault": "Системное по умолчанию",
			"settings.test": "Проба"
		};
		//#endregion
		//#region lib/types/client/model.js
		const { Switch } = primitives;
		/** Identity selector for snapshot-store hooks. */
		function identity(value) {
			return value;
		}
		/** Treat a loading/unavailable scope as the composition default (enabled). */
		function isEnabled(reader) {
			return reader.status === "ready" ? (reader.value ? reader.value.enabled !== false : true) : true;
		}
		/** Defensive normalization of the client-side mirror (a hand-edited yaml stays survivable). */
		function normalizeSettings(value) {
			const enabled = !(value && value.enabled === false);
			const voice = value && typeof value.voice === "string" && value.voice.length > 0 ? value.voice : "auto";
			const raw = value ? value.rate : undefined;
			const numeric = typeof raw === "string" ? Number(raw) : raw;
			let rate = typeof numeric === "number" && Number.isFinite(numeric) ? numeric : 1;
			if (rate < 0.5) rate = 0.5;
			if (rate > 4) rate = 4;
			const outputs = ["browser", "wav", "process"];
			const output = value && typeof value.output === "string" && outputs.indexOf(value.output) >= 0 ? value.output : "browser";
			const device = value && typeof value.device === "string" ? value.device : "";
			return { enabled, voice, rate, output, device };
		}
		/** The page speechSynthesis interface, or null when the browser lacks it. */
		function synth() {
			try {
				return window.speechSynthesis || null;
			} catch {
				return null;
			}
		}
		/** Currently enumerable voices (Chromium fills them asynchronously). */
		function listVoices() {
			const s = synth();
			if (!s) return [];
			try {
				return Array.from(s.getVoices() || []);
			} catch {
				return [];
			}
		}
		/** Cyrillic presence heuristic driving the auto voice/language choice. */
		function hasCyrillic(text) {
			return /[\u0400-\u04FF]/.test(text);
		}
		/** Split for the engine: Chromium stalls one long utterance on local
		 * Windows voices (speaking=true forever, no sound); queued sentence-sized
		 * chunks speak reliably. */
		function chunkSpeechText(text, size) {
			const limit = typeof size === "number" && size > 40 ? size : 100;
			const chunks = [];
			let rest = String(text).replace(/\s+/g, " ").trim();
			let guard = 0;
			while (rest.length > limit && guard < 60) {
				guard += 1;
				const head = rest.slice(0, limit);
				let cut = -1;
				for (let i = head.length - 1; i > Math.floor(limit / 2.5); i -= 1) {
					const ch = head[i];
					if (ch === "." || ch === "!" || ch === "?" || ch === "…" || ch === ";" || ch === ":") {
						cut = i + 1;
						break;
					}
				}
				if (cut === -1) {
					const sp = head.lastIndexOf(" ");
					cut = sp > Math.floor(limit / 4) ? sp : limit;
				}
				const piece = rest.slice(0, cut).trim();
				if (piece.length > 0) chunks.push(piece);
				rest = rest.slice(cut).trim();
			}
			if (rest.length > 0) chunks.push(rest);
			return chunks;
		}
		/** The seat locale chain, with the built-in English map as its terminus. */
		function resolveT(seatT) {
			if (typeof seatT === "function") return seatT;
			return (key) => (en[key] !== undefined ? en[key] : key);
		}
		/** Utterance length cap: huge selections used to fail silently in some engines. */
		const MAX_CHARS = 5000;
		/** Strong reference to the in-flight utterance. The speech engine holds
		 * utterances weakly, so without this Chromium may GC a long read mid-way
		 * (its documented behavior, not a bug of this plugin). */
		let activeUtterance = null;
		/**
		 * Speak through the host's Windows voices. "process" lets the helper
		 * application play (OS per-app routers map it freely); "wav" renders
		 * the whole selection as one WAV and plays it straight through the
		 * Windows output device picked in the card. One POST request carries
		 * the full text in its body: the host synthesizes a single utterance,
		 * so there is no gap between chunks and no per-chunk process start.
		 * @returns {{ cancel: () => void }} a cancellable controller.
		 */
		function speakHost(text, settings, onDone) {
			const controller = { cancelled: false };
			const done = (error) => {
				if (controller.cancelled) return;
				controller.cancelled = true;
				onDone(error || null);
			};
			const stopHelper = () => {
				try {
					fetch("/text-reader/stop", { keepalive: true }).catch(() => {});
				} catch {
					/* offline */
				}
			};
			const isProcess = settings.output === "process";
			const payload = {
				txt: text,
				voice: settings.voice === "auto" ? "" : settings.voice,
				rate: settings.rate
			};
			if (!isProcess) payload.device = settings.device;
			fetch(isProcess ? "/text-reader/speak" : "/text-reader/play", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			}).then((response) => {
				if (!response.ok) throw new Error("tts " + response.status);
				return response.text();
			}).then(() => done(null), (error) => done(error));
			controller.cancel = () => {
				controller.cancelled = true;
				stopHelper();
			};
			return controller;
		}
		/** Windows output devices offered by the host (the browser's own
		 * enumerateDevices may return nothing under media policy). */
		function fetchHostDevices() {
			return fetch("/text-reader/devices").then((response) => {
				if (!response.ok) throw new Error("devices " + response.status);
				return response.json();
			}).then((list) => (Array.isArray(list) ? list : []), () => []);
		}
		/** Windows voice names served by the host (cached once fetched). */
		let systemVoicesCache = null;
		function fetchSystemVoices() {
			if (systemVoicesCache !== null) return Promise.resolve(systemVoicesCache);
			return fetch("/text-reader/voices").then((response) => {
				if (!response.ok) throw new Error("voices " + response.status);
				return response.json();
			}).then((list) => {
				systemVoicesCache = Array.isArray(list) ? list : [];
				return systemVoicesCache;
			}, () => []);
		}
		//#endregion
		//#region lib/types/client/icons.js
		function SpeakerIcon() {
			return react.createElement("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true"
			},
				react.createElement("path", { d: "M8.5 3.5 5.2 6H2v4h3.2l3.3 2.5v-9Z", stroke: "currentColor", strokeWidth: "1.3", strokeLinejoin: "round" }),
				react.createElement("path", { d: "M10.9 5.7a3.3 3.3 0 0 1 0 4.6", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" }),
				react.createElement("path", { d: "M12.7 3.5a6.3 6.3 0 0 1 0 9", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" })
			);
		}
		function StopIcon() {
			return react.createElement("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 16 16",
				"aria-hidden": "true"
			},
				react.createElement("rect", { x: 4.5, y: 4.5, width: 7, height: 7, rx: 1.5, fill: "currentColor" })
			);
		}
		//#endregion
		//#region lib/types/client/overlay.js
		/**
		 * The floating read-aloud icon. Mounted once into `shell.overlay`; it
		 * tracks document mouse/keyboard events itself and renders the button
		 * only while a fresh selection exists. Hooks stay unconditional; the
		 * disabled state just gates the render and cancels any ongoing speech.
		 */
		function ReaderFab(props) {
			const reader = props.useReader(identity);
			const t = resolveT(props.t);
			const enabled = isEnabled(reader);
			const [anchor, setAnchor] = react.useState(null);
			const [speaking, setSpeaking] = react.useState(false);
			const speakSeq = react.useRef(0);
			const checkTimer = react.useRef(0);
			const stallWatch = react.useRef(0);
			const lastEventAt = react.useRef(0);
			const gotEvent = react.useRef(false);
			const hostCtrl = react.useRef(null);

			// A disable (or unmount) must silence the engine and retract the icon.
			react.useEffect(() => {
				if (enabled) return undefined;
				stopSpeaking();
				setAnchor(null);
				return undefined;
			}, [enabled]);
			react.useEffect(() => () => stopSpeaking(), []);

			// Document-level selection watch: mouseup reveals the icon over a
			// non-empty selection, mousedown/scroll/Escape retract it.
			react.useEffect(() => {
				if (!enabled) return undefined;
				function selectedText() {
					try {
						return String(window.getSelection() || "").trim();
					} catch {
						return "";
					}
				}
				function scheduleCheck(x, y) {
					if (checkTimer.current) clearTimeout(checkTimer.current);
					// Let the browser finalize the selection node first.
					checkTimer.current = setTimeout(() => {
						checkTimer.current = 0;
						const text = selectedText();
						if (text.length < 2) {
							setAnchor(null);
							return;
						}
						setAnchor({ x, y, text: text.slice(0, MAX_CHARS) });
					}, 0);
				}
				function onFabSeat(target) {
					return Boolean(target && typeof target.closest === "function" && target.closest(".trd-fab") !== null);
				}
				function onMouseUp(event) {
					if (event.button !== 0) return;
					if (onFabSeat(event.target)) return;
					scheduleCheck(event.clientX, event.clientY);
				}
				function onMouseDown(event) {
					if (onFabSeat(event.target)) return;
					setAnchor(null);
				}
				function onKeyDown(event) {
					if (event.key === "Escape") setAnchor(null);
				}
				function onScrollOrResize() {
					setAnchor(null);
				}
				document.addEventListener("mouseup", onMouseUp);
				document.addEventListener("mousedown", onMouseDown);
				document.addEventListener("keydown", onKeyDown);
				window.addEventListener("scroll", onScrollOrResize, true);
				window.addEventListener("resize", onScrollOrResize);
				return () => {
					document.removeEventListener("mouseup", onMouseUp);
					document.removeEventListener("mousedown", onMouseDown);
					document.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("scroll", onScrollOrResize, true);
					window.removeEventListener("resize", onScrollOrResize);
					if (checkTimer.current) {
						clearTimeout(checkTimer.current);
						checkTimer.current = 0;
					}
				};
			}, [enabled]);

			function stopSpeaking() {
				speakSeq.current += 1;
				if (stallWatch.current) {
					clearInterval(stallWatch.current);
					stallWatch.current = 0;
				}
				if (hostCtrl.current !== null) {
					const controller = hostCtrl.current;
					hostCtrl.current = null;
					try {
						controller.cancel();
					} catch {
						/* gone */
					}
				}
				const s = synth();
				if (s) s.cancel();
				activeUtterance = null;
				setSpeaking(false);
			}
			/** Page speechSynthesis path (browser output mode). */
			function speakBrowser(text, settings) {
				const s = synth();
				if (!s) {
					setAnchor(null);
					return;
				}
				const busy = s.speaking === true || s.pending === true || s.paused === true;
				const seq = speakSeq.current + 1;
				speakSeq.current = seq;
				lastEventAt.current = Date.now();
				const finish = () => {
					if (speakSeq.current !== seq) return;
					if (stallWatch.current) {
						clearInterval(stallWatch.current);
						stallWatch.current = 0;
					}
					try {
						s.cancel();
					} catch {
					}
					activeUtterance = null;
					setSpeaking(false);
					setAnchor(null);
				};
				const makeUtterance = (chunk, last) => {
					let u;
					try {
						u = new SpeechSynthesisUtterance(chunk);
					} catch {
						return null;
					}
					let chosen = null;
					if (settings.voice !== "auto") {
						chosen = listVoices().find((voice) => voice.name === settings.voice) || null;
					}
					if (chosen) {
						u.voice = chosen;
						if (chosen.lang) u.lang = chosen.lang;
					} else {
						u.lang = hasCyrillic(chunk) ? "ru-RU" : "en-US";
					}
					u.rate = settings.rate;
					u.onstart = () => {
						gotEvent.current = true;
						lastEventAt.current = Date.now();
					};
					u.onboundary = () => {
						gotEvent.current = true;
						lastEventAt.current = Date.now();
					};
					u.onend = () => {
						lastEventAt.current = Date.now();
						if (last) finish();
					};
					u.onerror = (e) => {
						// 'interrupted'/'canceled' accompany stops and queue
						// flushes; anything else is a genuine failure.
						const code = e && e.error;
						if (code === "interrupted" || code === "canceled") {
							if (last) finish();
							return;
						}
						finish();
					};
					return u;
				};
				const begin = (attempt) => {
					if (speakSeq.current !== seq) return;
					const chunks = chunkSpeechText(text);
					if (chunks.length === 0) {
						finish();
						return;
					}
					const queue = [];
					for (let i = 0; i < chunks.length; i += 1) {
						const u = makeUtterance(chunks[i], i === chunks.length - 1);
						if (!u) {
							finish();
							return;
						}
						queue.push(u);
					}
					// Hold the utterances by strong reference until the engine settles.
					activeUtterance = queue;
					lastEventAt.current = Date.now();
					gotEvent.current = false;
					try {
						s.resume();
						for (let i = 0; i < queue.length; i += 1) s.speak(queue[i]);
					} catch {
						finish();
						return;
					}
					setSpeaking(true);
					// Stuck-queue recovery: Chromium sometimes accepts speech and
					// never starts it (queue frozen by an earlier hang or a lost
					// resume). If not a single event landed in 2s, flush the
					// engine and requeue once from a clean state.
					setTimeout(() => {
						if (speakSeq.current !== seq || attempt > 0) return;
						if (gotEvent.current) return;
						try {
							s.cancel();
						} catch {
						}
						setTimeout(() => {
							try {
								s.resume();
							} catch {
							}
							begin(1);
						}, 150);
					}, 2000);
					// Stall sentinel: drop-race retries while the queue is idle,
					// and settles when the engine claims to speak but nothing
					// moved for 30s (the long-utterance hang signature).
					if (stallWatch.current) clearInterval(stallWatch.current);
					stallWatch.current = setInterval(() => {
						if (speakSeq.current !== seq) {
							clearInterval(stallWatch.current);
							stallWatch.current = 0;
							return;
						}
						const alive = s.speaking === true || s.pending === true;
						const quiet = Date.now() - lastEventAt.current;
						if (alive) {
							if (quiet >= 30000) finish();
							return;
						}
						if (quiet < 1200) return;
						if (attempt < 1) {
							begin(attempt + 1);
							return;
						}
						finish();
					}, 5000);
				};
				if (busy) {
					// Drain a foreign leftover first: speak in the same tick as
					// cancel() is the classic Chromium silent-drop race.
					try {
						s.cancel();
					} catch {
					}
					setTimeout(() => {
						try {
							s.resume();
						} catch {
						}
						begin(0);
					}, 90);
				} else {
					begin(0);
				}
			}
			/** Host path: Windows voices, routable per device or per process.
			 * A dead host route falls back once to the browser engine. */
			function speakWithHost(text, settings) {
				const seq = speakSeq.current + 1;
				speakSeq.current = seq;
				setSpeaking(true);
				hostCtrl.current = speakHost(text, settings, (error) => {
					if (speakSeq.current !== seq) return;
					hostCtrl.current = null;
					setSpeaking(false);
					if (error !== null) speakBrowser(text, settings);
					else setAnchor(null);
				});
			}
			function onClick() {
				// The stop gesture follows our own flag: an engine left speaking
				// or pending by other page code must not poison every subsequent
				// click into a silent stop.
				if (speaking) {
					stopSpeaking();
					setAnchor(null);
					return;
				}
				if (anchor === null) return;
				const settings = normalizeSettings(reader.value);
				const text = anchor.text;
				if (settings.output === "browser") speakBrowser(text, settings);
				else speakWithHost(text, settings);
			}

			if (!enabled || anchor === null) return null;
			// Anchor the icon just below-right of the cursor, clamped to the viewport.
			const left = Math.max(8, Math.min(anchor.x + 14, window.innerWidth - 44));
			const top = anchor.y + 10 + 34 > window.innerHeight ? Math.max(8, anchor.y - 44) : anchor.y + 10;
			return react.createElement("button", {
				type: "button",
				className: speaking ? "trd-fab trd-fabSpeaking" : "trd-fab",
				title: speaking ? t("fab.stop") : t("fab.speak"),
				"aria-label": speaking ? t("fab.stop") : t("fab.speak"),
				style: { left: left + "px", top: top + "px" },
				// Keep the text selection alive under the click.
				onMouseDown: (event) => event.preventDefault(),
				onClick: onClick
			}, speaking ? react.createElement(StopIcon) : react.createElement(SpeakerIcon));
		}
		//#endregion
		//#region lib/types/client/settings-card.js
		const RATES = [0.75, 1, 1.25, 1.5, 2, 3, 4];
		/** Settings → Plugins card: enable switch, audio path, voice, speed. */
		function ReaderSettingsCard(props) {
			const reader = props.useReader(identity);
			const [voices, setVoices] = react.useState(listVoices);
			const settings = normalizeSettings(reader.value);
			const hostMode = settings.output !== "browser";
			const [systemVoices, setSystemVoices] = react.useState([]);
			const [devices, setDevices] = react.useState([]);
			const testCtrl = react.useRef(null);
			react.useEffect(() => {
				const s = synth();
				if (!s) return undefined;
				const refresh = () => setVoices(listVoices());
				const wired = typeof s.addEventListener === "function";
				if (wired) s.addEventListener("voiceschanged", refresh);
				else s.onvoiceschanged = refresh;
				refresh();
				return () => {
					if (wired) s.removeEventListener("voiceschanged", refresh);
					else s.onvoiceschanged = null;
				};
			}, []);
			// The host routes answer only while the web server runs the new
			// host half; refetch whenever the card switches to a host mode.
			react.useEffect(() => {
				if (!hostMode) return undefined;
				let alive = true;
				fetchSystemVoices().then((list) => {
					if (alive) setSystemVoices(list);
				});
				fetchHostDevices().then((list) => {
					if (alive) setDevices(list);
				});
				return () => {
					alive = false;
					if (testCtrl.current !== null) {
						try {
							testCtrl.current.cancel();
						} catch {
							/* gone */
						}
						testCtrl.current = null;
					}
				};
			}, [hostMode]);
			if (reader.status !== "ready") return null;
			const t = resolveT(props.t);
			const disabled = reader.writable !== true;
			const runTest = () => {
				if (testCtrl.current !== null) {
					try {
						testCtrl.current.cancel();
					} catch {
						/* gone */
					}
				}
				testCtrl.current = speakHost(t("settings.test") + ": 1, 2, 3.", settings, () => {
					testCtrl.current = null;
				});
			};
			const shownVoices = hostMode
				? [{ name: "", culture: "" }].concat(systemVoices)
				: [{ name: "auto", lang: "" }].concat(voices);
			return react.createElement("div", { className: "trd-settings" },
				react.createElement("div", { className: "trd-settingsText" },
					react.createElement("h3", { className: "trd-settingsTitle" }, t("settings.title")),
					react.createElement("p", { className: "trd-settingsDesc" }, t("settings.description"))
				),
				react.createElement("div", { className: "trd-settingsControls" },
					react.createElement("div", { className: "trd-fieldRow" },
						react.createElement("span", { className: "trd-fieldLabel" }, t("settings.output")),
						react.createElement("div", { className: "trd-segmented", role: "group", "aria-label": t("settings.output") },
							["browser", "wav", "process"].map((mode) => react.createElement("button", {
								key: mode,
								type: "button",
								className: mode === settings.output ? "trd-segment trd-segmentActive" : "trd-segment",
								disabled: disabled,
								"aria-pressed": mode === settings.output,
								onClick: () => props.actions.setOutput(mode)
							}, t("settings.output" + (mode === "browser" ? "Browser" : mode === "wav" ? "Wav" : "Process"))))
						)
					),
					hostMode && settings.output === "wav" ? react.createElement("div", { className: "trd-fieldRow" },
						react.createElement("span", { className: "trd-fieldLabel" }, t("settings.device")),
						react.createElement("select", {
							className: "trd-select",
							value: settings.device,
							disabled: disabled,
							title: t("settings.device"),
							onChange: (event) => props.actions.setDevice(event.target.value)
						},
							react.createElement("option", { value: "" }, t("settings.deviceDefault")),
							devices.map((device) => react.createElement("option", {
								key: device.id,
								value: device.id
							}, device.name)),
							devices.length === 0 ? react.createElement("option", { value: settings.device, disabled: true }, "—") : null
						)
					) : null,
					react.createElement("div", { className: "trd-fieldRow" },
						react.createElement("span", { className: "trd-fieldLabel" }, t("settings.voice")),
						react.createElement("select", {
							className: "trd-select",
							value: hostMode ? (shownVoices.some((v) => v.name === settings.voice) ? settings.voice : "") : settings.voice,
							disabled: disabled,
							title: t("settings.voice"),
							onChange: (event) => props.actions.setVoice(hostMode ? (event.target.value === "" ? "auto" : event.target.value) : event.target.value)
						},
							react.createElement("option", { value: hostMode ? "" : "auto" }, t("settings.voiceAuto")),
							(hostMode ? systemVoices : voices).map((voice) => react.createElement("option", {
								key: voice.name + "|" + (voice.culture || voice.lang || ""),
								value: voice.name
							}, voice.name + (voice.culture ? " · " + voice.culture : voice.lang ? " · " + voice.lang : "")))
						)
					),
					react.createElement("div", { className: "trd-fieldRow" },
						react.createElement("span", { className: "trd-fieldLabel" }, t("settings.rate")),
						react.createElement("div", { className: "trd-segmented", role: "group", "aria-label": t("settings.rate") },
							RATES.map((rate) => react.createElement("button", {
								key: rate,
								type: "button",
								className: rate === settings.rate ? "trd-segment trd-segmentActive" : "trd-segment",
								disabled: disabled,
								"aria-pressed": rate === settings.rate,
								onClick: () => props.actions.setRate(rate)
							}, (rate === 1 ? "1" : rate.toFixed(2).replace(/0$/, "")) + "×"))
						)
					),
					hostMode ? react.createElement("div", { className: "trd-fieldRow" },
						react.createElement("div", { className: "trd-segmented", role: "group", "aria-label": t("settings.test") },
							react.createElement("button", {
								type: "button",
								className: "trd-segment",
								title: t("settings.test"),
								onClick: runTest
							}, "▶ " + t("settings.test"))
						)
					) : null,
					react.createElement(Switch, {
						checked: settings.enabled,
						label: t("settings.switch"),
						disabled: disabled,
						onChange: (next) => props.actions.setEnabled(next)
					})
				)
			);
		}
		//#endregion
		//#region lib/types/client/index.js
		const NS = "text-reader";
		const inject = ["slots", "locale", "settingsScope"];
		/**
		 * Client plugin body: dictionaries, the settings scope, and two slot
		 * registrations sharing one inject face (scope + actions).
		 * @param {object} ctx - client plugin context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { en, ru }), "text-reader: dictionaries");
			const scope = ctx.settingsScope.bind({ namespace: NS });
			const actions = {
				setEnabled: (next) => {
					void scope.set("enabled", next);
				},
				setVoice: (next) => {
					void scope.set("voice", next);
				},
				setRate: (next) => {
					void scope.set("rate", next);
				},
				setOutput: (next) => {
					void scope.set("output", next);
				},
				setDevice: (next) => {
					void scope.set("device", next);
				}
			};
			const face = () => ({
				hooks: { reader: scope },
				actions
			});
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "text-reader-fab",
				order: 45,
				locale: NS,
				inject: face
			}, ReaderFab));
			// The slot ledger sorts entries by priority ascending (ties keep
			// registration order); every shipped card stays on the default 0,
			// so priority 1 pins this card to the bottom, deterministically.
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: NS,
				order: 1000,
				priority: 1,
				locale: NS,
				inject: face
			}, ReaderSettingsCard));
			// Boot canary: counted in the host's /text-reader/stats so the
			// installed-copy's own telemetry answers "did the page run this
			// bundle" without opening devtools.
			try {
				fetch("/text-reader/boot", { keepalive: true }).catch(() => {});
			} catch {
				/* no fetch in this context */
			}
		}
		//#endregion
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
