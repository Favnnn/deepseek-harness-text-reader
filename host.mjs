/**
 * dsh-text-reader, Host half.
 *
 * A function plugin importing only Node builtins (bare package imports cannot
 * resolve here: the installed copy lives outside any pnpm tree, while `node:`
 * specifiers always resolve).
 *
 * Two responsibilities:
 * 1) The `text-reader` settings section — a hand-rolled, schemastery-compatible
 *    node whose `toJSON()` yields the `{ uid, refs }` envelope the settings
 *    provider serializes to the wire.
 * 2) `/text-reader/*` HTTP routes for system speech (Windows voices through a
 *    helper PowerShell process): browsers cannot pick an output device for
 *    speechSynthesis, so the GUI asks this route for audio instead — either a
 *    WAV the page plays through a chosen device via setSinkId, or a
 *    fire-and-speak from the helper process, which OS per-application audio
 *    routers can map independently of the browser.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const name = 'text-reader'

// ─── settings ────────────────────────────────────────────────────────────────

/** Speech rate bounds; anything outside clamps back into this range. */
const RATE_MIN = 0.5
const RATE_MAX = 4

/** Where the audio is produced: page speechSynthesis, host WAV, or host process. */
const OUTPUTS = ['browser', 'wav', 'process']

/**
 * Validate and normalize one merged settings candidate. Never throws: the
 * section must not be able to block a harness boot, so an invalid field
 * normalizes to its default instead.
 * @param {unknown} candidate - merged base + user section.
 * @returns {{ enabled: boolean, voice: string, rate: number, output: string, device: string }} normalized section.
 */
function resolveTextReaderSection(candidate) {
  if (candidate === undefined || candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { enabled: true, voice: 'auto', rate: 1, output: 'browser', device: '' }
  }
  const enabled = typeof candidate.enabled === 'boolean' ? candidate.enabled : true
  const voice = typeof candidate.voice === 'string' && candidate.voice.length > 0 ? candidate.voice : 'auto'
  const rawRate = typeof candidate.rate === 'string' ? Number(candidate.rate) : candidate.rate
  let rate = typeof rawRate === 'number' && Number.isFinite(rawRate) ? rawRate : 1
  if (rate < RATE_MIN) rate = RATE_MIN
  if (rate > RATE_MAX) rate = RATE_MAX
  const output = typeof candidate.output === 'string' && OUTPUTS.includes(candidate.output) ? candidate.output : 'browser'
  const device = typeof candidate.device === 'string' ? candidate.device : ''
  return { ...candidate, enabled, voice, rate, output, device }
}

/**
 * Build the schemastery-compatible node for the section.
 * @returns {object} callable schema with a wire `toJSON()` envelope.
 */
function createTextReaderSchema() {
  const refs = {
    0: { type: 'object', meta: {}, dict: { enabled: 1, voice: 2, rate: 3, output: 4, device: 5 } },
    1: { type: 'boolean', meta: { default: true } },
    2: { type: 'string', meta: { default: 'auto' } },
    3: { type: 'number', meta: { default: 1 } },
    4: { type: 'string', meta: { default: 'browser' } },
    5: { type: 'string', meta: { default: '' } },
  }
  const schema = (candidate) => resolveTextReaderSection(candidate)
  schema.type = 'object'
  schema.meta = refs[0].meta
  schema.dict = {
    enabled: refs[1],
    voice: refs[2],
    rate: refs[3],
    output: refs[4],
    device: refs[5],
  }
  schema.toJSON = () => ({ uid: 0, refs })
  return schema
}

/** Resolved reader configuration for diagnostics and fallback reads. */
const readerState = { enabled: true, voice: 'auto', rate: 1, output: 'browser', device: '' }

// ─── windows speech runner ───────────────────────────────────────────────────

const TTS_DIR = join(tmpdir(), 'dsh-text-reader')

/** The picker stores a plain multiplier (1 = normal). The browser applies it
 * as utterance.rate; the Windows path renders it through SSML
 * <prosody rate="NN%">, which both System.Speech and SAPI speak at the exact
 * requested speed — true parity across modes, unlike the coarse -10..10
 * spintype scale (non-linear and engine-dependent). */
function toRatePct(rate) {
  const mult = Number.isFinite(rate) ? Math.max(0.25, Math.min(4, rate)) : 1
  return Math.round(mult * 100)
}

function decodeB64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40000) return ''
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

/**
 * Build the PowerShell script. All user data rides as base64 string literals
 * (JSON-quoted, no quoting surface); the only other interpolated values are an
 * int and a generated file path filtered to safe characters.
 * @returns {string} the command text.
 */
function buildSpeechScript(opts) {
  const outLiteral = opts.outPath ? `$out='${opts.outPath.replace(/[^A-Za-z0-9_.:\\-]/g, '')}'` : ''
  const lines = [
    "$ErrorActionPreference='Stop'",
    '$txt=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(' + JSON.stringify(opts.txtB64) + '))',
    '$voice=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(' + JSON.stringify(opts.voiceB64) + '))',
    '$pct=' + toRatePct(opts.rate),
    '$esc=$txt.Replace("&","&amp;").Replace("<","&lt;").Replace(">","&gt;")',
    "$lang=if ([regex]::IsMatch($txt,'[\\u0400-\\u04FF]')) {'ru-RU'} else {'en-US'}",
    "$sp='<speak version=\"1.0\" xml:lang=\"' + $lang + '\" xmlns=\"http://www.w3.org/2001/10/synthesis\"><prosody rate=\"' + $pct + '%\">' + $esc + '</prosody></speak>'",
    outLiteral,
    'try {',
    'Add-Type -AssemblyName System.Speech',
    '$s=New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "if ($voice -ne '' -and $voice -ne 'auto') {",
    '$m=$s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq $voice } | Select-Object -First 1',
    "if (-not $m) { $m=$s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like ('*' + $voice + '*') } | Select-Object -First 1 }",
    'if ($m) { $s.SelectVoice($m.VoiceInfo.Name) }',
    '} else {',
    "$cult=if ([regex]::IsMatch($txt,'[\\u0400-\\u04FF]')) {'^ru'} else {'^en'}",
    '$m=$s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -match $cult } | Select-Object -First 1',
    'if ($m) { $s.SelectVoice($m.VoiceInfo.Name) }',
    '}',
    opts.outPath ? '$s.SetOutputToWaveFile($out)' : '$s.SetOutputToDefaultAudioDevice()',
    '$s.SpeakSsml($sp)',
    '$s.Dispose()',
    '} catch {',
    '$v=New-Object -ComObject SAPI.SpVoice',
    "if ($voice -ne '' -and $voice -ne 'auto') {",
    "$c=$v.GetVoices() | Where-Object { $_.GetDescription() -like ('*' + $voice + '*') } | Select-Object -First 1",
    'if ($c) { $v.Voice=$c }',
    '}',
    // SpFileStream finalizes (writes the real WAV header) only on Close().
    opts.outPath ? '$f=New-Object -ComObject SAPI.SpFileStream; $f.Open($out,3); $v.AudioOutputStream=$f' : '',
    '$v.Speak($sp,0)',
    opts.outPath ? '$f.Close()' : '',
    '}',
  ]
  return lines.filter((line) => line !== '').join('\n')
}

const PS_ARGS_HEAD = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']

/**
 * WinMM helpers compiled into the helper process: device listing and
 * blocking playback of one WAV through a chosen render device. .NET
 * Framework exposes no managed endpoint API, so MME functions do.
 */
const WINMM_CS = [
  'using System;',
  'using System.Text;',
  'using System.Runtime.InteropServices;',
  'public static class TrdOut {',
  '[DllImport("winmm.dll")] public static extern uint waveOutGetNumDevs();',
  '[DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern uint waveOutGetDevCaps(uint id, out WAVOUTDEVCAPS caps, uint size);',
  '[StructLayout(LayoutKind.Sequential)] public struct WAVOUTDEVCAPS { public uint wMid; public uint wPid; public uint vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szPname; public uint dwFormats; public uint wChannels; public uint wReserved1; public uint dwSupport; }',
  '[DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern uint mciSendString(string cmd, StringBuilder ret, uint clen, IntPtr hwnd);',
  'public static string List() { StringBuilder sb = new StringBuilder(); uint n = waveOutGetNumDevs(); for (uint i = 0; i < n; i++) { WAVOUTDEVCAPS c; if (waveOutGetDevCaps(i, out c, (uint)Marshal.SizeOf(typeof(WAVOUTDEVCAPS))) == 0) { sb.Append(i).Append("|").Append(c.szPname).Append("\\n"); } } return sb.ToString(); }',
  'public static string Play(string file, string dev) { string alias = "trd" + Guid.NewGuid().ToString("N").Substring(0, 8); string open = (dev == null || dev.Length == 0) ? ("open \\"" + file + "\\" type waveaudio alias " + alias) : ("open \\"" + file + "\\" type waveaudio device " + dev + " alias " + alias); StringBuilder err = new StringBuilder(256); uint r = mciSendString(open, err, 256, IntPtr.Zero); if (r != 0) { return "open failed: " + err.ToString(); } r = mciSendString("play " + alias + " wait", null, 0, IntPtr.Zero); mciSendString("close " + alias, null, 0, IntPtr.Zero); return r == 0 ? "ok" : ("play failed: code " + r); }',
  '}',
].join('\n')

/** Every helper process currently alive; /text-reader/stop flushes them all. */
const activeChildren = new Set()
function killAllChildren() {
  for (const child of activeChildren) {
    try {
      child.kill()
    } catch {
      /* already gone */
    }
  }
  activeChildren.clear()
}

function runPs(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn('powershell.exe', [...PS_ARGS_HEAD, script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (error) {
      reject(error)
      return
    }
    activeChildren.add(child)
    let stdout = ''
    let settled = false
    const settle = (fn, value) => {
      if (settled) return
      settled = true
      activeChildren.delete(child)
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* gone */
      }
      settle(reject, new Error('powershell timed out'))
    }, timeoutMs)
    if (child.stdout !== null) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8')
      })
    }
    child.on('error', (error) => settle(reject, error))
    child.on('close', (code) => {
      if (code === 0 || stdout.trim().length > 0) settle(resolve, stdout)
      else settle(reject, new Error('powershell exited with ' + code))
    })
  })
}

/** WAV cache: the same text+voice+rate never resynthesizes. */
const wavCache = new Map()
function pruneWavCache() {
  if (wavCache.size <= 30) return
  const entries = [...wavCache.entries()].sort((a, b) => a[1].used - b[1].used)
  for (const [key, info] of entries.slice(0, Math.max(0, wavCache.size - 30))) {
    wavCache.delete(key)
    try {
      rmSync(info.path, { force: true })
    } catch {
      /* busy or gone */
    }
  }
}

function wavKeyFor(text, voice, rate) {
  return createHash('sha256').update(voice + '\u0000' + rate + '\u0000' + text).digest('hex').slice(0, 24)
}

async function synthesizeWav(text, voice, rate) {
  mkdirSync(TTS_DIR, { recursive: true })
  const hash = wavKeyFor(text, voice, rate)
  const path = join(TTS_DIR, hash + '.wav')
  const hit = wavCache.get(hash)
  if (hit !== undefined && existsSync(path) && statSync(path).size > 44) {
    hit.used = Date.now()
    return path
  }
  const script = buildSpeechScript({
    txtB64: Buffer.from(text, 'utf8').toString('base64'),
    voiceB64: Buffer.from(voice, 'utf8').toString('base64'),
    rate,
    outPath: path,
  })
  try {
    await runPs(script, 120000)
  } catch (error) {
    try {
      rmSync(path, { force: true })
    } catch {
      /* nothing to clean */
    }
    throw error
  }
  if (!existsSync(path) || statSync(path).size <= 44) throw new Error('no wav produced')
  wavCache.set(hash, { path, used: Date.now() })
  pruneWavCache()
  return path
}

let voicesCache = { at: 0, body: '[]' }
async function listSystemVoices() {
  if (Date.now() - voicesCache.at < 60000) return voicesCache.body
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    '$out=@()',
    'Add-Type -AssemblyName System.Speech',
    '$s=New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "$out=@($s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name })",
    '$s.Dispose()',
    'if ($out.Count -eq 0) {',
    '$v=New-Object -ComObject SAPI.SpVoice',
    '$c=$v.GetVoices()',
    "for ($i=0; $i -lt $c.Count; $i++) { $out += $c.Item($i).GetDescription() + '|' }",
    '}',
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
    "$out -join [Environment]::NewLine",
  ].join('\n')
  try {
    const raw = await runPs(script, 30000)
    const names = raw
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => {
        const at = line.indexOf('|')
        return { name: at >= 0 ? line.slice(0, at) : line, culture: at >= 0 ? line.slice(at + 1) : '' }
      })
    voicesCache = { at: Date.now(), body: JSON.stringify(names) }
  } catch {
    voicesCache = { at: Date.now(), body: '[]' }
  }
  return voicesCache.body
}

/** Output render devices (WinMM indexes + names) for the GUI picker: the
 * browser's enumerateDevices may hand back nothing, while the helper process
 * plays straight through the chosen MME device. */
let devicesCache = { at: 0, body: '[]' }
async function listOutputDevicesOnWindows() {
  if (Date.now() - devicesCache.at < 60000) return devicesCache.body
  const script = [
    "$ErrorActionPreference='Stop'",
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
    'try {',
    'Add-Type -TypeDefinition @"',
    WINMM_CS.replace(/\$/g, '`$'),
    '"@',
    '[TrdOut]::List()',
    '} catch { Write-Output ("TRDERR:" + $_.Exception.Message) }',
  ].join('\n')
  try {
    const raw = await runPs(script, 45000)
    const errLine = raw.split(/\r?\n/).find((line) => line.startsWith('TRDERR:'))
    if (errLine !== undefined) {
      devicesCache = { at: Date.now(), body: JSON.stringify({ error: errLine.slice('TRDERR:'.length).trim() }) }
      return devicesCache.body
    }
    const seen = new Set()
    const list = []
    for (const line of raw.trim().split(/\r?\n/)) {
      if (line.length === 0) continue
      const at = line.indexOf('|')
      const id = at >= 0 ? line.slice(0, at) : line
      const name = at >= 0 ? line.slice(at + 1) : ''
      if (id.length === 0 || seen.has(id)) continue
      seen.add(id)
      list.push({ id, name: name === '' ? 'device ' + id : name.trim() })
    }
    devicesCache = { at: Date.now(), body: JSON.stringify(list) }
  } catch (error) {
    devicesCache = { at: Date.now(), body: JSON.stringify({ error: error && error.message ? error.message : String(error) }) }
  }
  return devicesCache.body
}

/**
 * Script that ensures the cached WAV exists (synthesizing it if not) and
 * then renders it through the chosen WinMM device, blocking until played.
 * @returns {string} the command text.
 */
function buildPlayScript(opts) {
  const synthBody = buildSpeechScript(opts)
    .split('\n')
    .filter((line) => !line.startsWith("$ErrorActionPreference"))
    .join('\n')
  return [
    "$ErrorActionPreference='Stop'",
    `$out='${opts.outPath.replace(/[^A-Za-z0-9_.:\\-]/g, '')}'`,
    `$dev='${String(opts.device || '').replace(/[^0-9]/g, '')}'`,
    'Add-Type -TypeDefinition @"',
    WINMM_CS.replace(/\$/g, '`$'),
    '"@',
    'if (-not (Test-Path $out)) {',
    synthBody,
    '}',
    '$r=[TrdOut]::Play($out,$dev)',
    "if ($r -ne 'ok') { throw $r }",
  ].join('\n')
}

// ─── routes ──────────────────────────────────────────────────────────────────

function respond(res, code, contentType, body) {
  res.writeHead(code, { 'content-type': contentType, 'cache-control': 'no-store' })
  res.end(body)
}

/** Route hit counters + client-boot canaries: the field diagnostic channel
 * (GET /text-reader/stats reads them; no devtools needed). */
const routeHits = { boot: 0, voices: 0, devices: 0, play: 0, speak: 0, wav: 0, stop: 0, other: 0, errors: 0 }
const bootedAt = Date.now()

/** Synthesize-if-missing (cached), then render through the chosen WinMM
 * device, holding the response open until playback ends (/stop kills it). */
function playRequest(res, text, voice, rate, device) {
  routeHits.play += 1
  const fail = (error) => {
    routeHits.errors += 1
    try {
      respond(res, 500, 'text/plain; charset=utf-8', 'text-reader: ' + (error && error.message ? error.message : String(error)))
    } catch {
      /* socket gone */
    }
  }
  try {
    mkdirSync(TTS_DIR, { recursive: true })
    const hash = wavKeyFor(text, voice, rate)
    const outPath = join(TTS_DIR, hash + '.wav')
    const hit = wavCache.get(hash)
    if (hit !== undefined) hit.used = Date.now()
    else wavCache.set(hash, { path: outPath, used: Date.now() })
    pruneWavCache()
    const script = buildPlayScript({
      txtB64: Buffer.from(text, 'utf8').toString('base64'),
      voiceB64: Buffer.from(voice, 'utf8').toString('base64'),
      rate,
      outPath,
      device,
    })
    runPs(script, 600000).then(() => respond(res, 200, 'text/plain', 'ok'), fail)
  } catch (error) {
    fail(error)
  }
}

/** Speak inline through the helper process; resolves when speech ends. */
function speakRequest(res, text, voice, rate) {
  routeHits.speak += 1
  const fail = (error) => {
    routeHits.errors += 1
    try {
      respond(res, 500, 'text/plain; charset=utf-8', 'text-reader: ' + (error && error.message ? error.message : String(error)))
    } catch {
      /* socket gone */
    }
  }
  try {
    killAllChildren()
    const script = buildSpeechScript({
      txtB64: Buffer.from(text, 'utf8').toString('base64'),
      voiceB64: Buffer.from(voice, 'utf8').toString('base64'),
      rate,
      outPath: '',
    })
    let child
    try {
      child = spawn('powershell.exe', [...PS_ARGS_HEAD, script], { windowsHide: true, stdio: 'ignore' })
    } catch (error) {
      return void fail(error)
    }
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      activeChildren.delete(child)
      clearTimeout(timer)
      if (error) fail(error)
      else respond(res, 200, 'text/plain', 'spoken')
    }
    activeChildren.add(child)
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* gone */
      }
    }, 600000)
    child.on('error', (error) => finish(error))
    child.on('close', () => finish(null))
  } catch (error) {
    fail(error)
  }
}

/** POST /play and /speak carry {txt, voice, rate, device} in the body, so a
 * whole selection never has to fit into a request line. */
function handleSpeechPost(req, res, path) {
  let raw = ''
  let settled = false
  req.on('data', (chunk) => {
    raw += chunk
    if (raw.length > 262144) {
      settled = true
      try {
        res.writeHead(413).end('too large')
      } catch {
        /* socket gone */
      }
      try {
        req.destroy()
      } catch {
        /* gone */
      }
    }
  })
  req.on('error', () => {
    settled = true
  })
  req.on('end', () => {
    if (settled) return
    settled = true
    let params
    try {
      params = JSON.parse(raw || '{}')
    } catch {
      return void respond(res, 400, 'text/plain', 'bad json')
    }
    const text = String(params.txt || '').slice(0, 5000)
    if (text.length === 0) return void respond(res, 400, 'text/plain', 'empty txt')
    const voice = String(params.voice || '')
    let rate = Number(params.rate)
    if (!Number.isFinite(rate)) rate = 1
    if (path === '/play') playRequest(res, text, voice, rate, String(params.device || '').replace(/[^0-9]/g, ''))
    else speakRequest(res, text, voice, rate)
  })
}

function handleRequest(req, res) {
  let url
  try {
    url = new URL(req.url ?? '/', 'http://text-reader.local')
  } catch {
    routeHits.errors += 1
    return void respond(res, 400, 'text/plain', 'bad url')
  }
  // Tolerate both routing conventions: full path, or prefix already stripped.
  let path = url.pathname
  if (path.startsWith('/text-reader')) path = path.slice('/text-reader'.length)
  if (path === '' || !path.startsWith('/')) path = '/'
  const fail = (error) => {
    routeHits.errors += 1
    try {
      respond(res, 500, 'text/plain; charset=utf-8', 'text-reader: ' + (error && error.message ? error.message : String(error)))
    } catch {
      /* socket gone */
    }
  }
  try {
    if (req.method === 'POST' && (path === '/play' || path === '/speak')) return void handleSpeechPost(req, res, path)
    if (req.method !== 'GET' && req.method !== 'HEAD') return void respond(res, 405, 'text/plain', 'GET only')
    if (path === '/boot') {
      routeHits.boot += 1
      return void respond(res, 200, 'text/plain', 'ok')
    }
    if (path === '/stats') {
      return void respond(res, 200, 'application/json; charset=utf-8', JSON.stringify({ up: Date.now() - bootedAt, hits: routeHits, wavs: wavCache.size }))
    }
    if (path === '/stop') {
      routeHits.stop += 1
      killAllChildren()
      return void respond(res, 200, 'text/plain', 'ok')
    }
    if (path === '/voices') {
      routeHits.voices += 1
      listSystemVoices().then((body) => respond(res, 200, 'application/json; charset=utf-8', body), fail)
      return
    }
    if (path === '/devices') {
      routeHits.devices += 1
      listOutputDevicesOnWindows().then((body) => respond(res, 200, 'application/json; charset=utf-8', body), fail)
      return
    }
    const text = decodeB64(url.searchParams.get('txt')).slice(0, 5000)
    if (text.length === 0) return void respond(res, 400, 'text/plain', 'empty txt')
    const voice = decodeB64(url.searchParams.get('voice'))
    const rateRaw = Number(url.searchParams.get('rate'))
    const rate = Number.isFinite(rateRaw) ? rateRaw : 1
    if (path === '/speak.wav') {
      routeHits.wav += 1
      synthesizeWav(text, voice, rate).then((file) => {
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': String(statSync(file).size) })
        const stream = createReadStream(file)
        stream.on('error', fail)
        stream.pipe(res)
      }, fail)
      return
    }
    if (path === '/play') {
      playRequest(res, text, voice, rate, (url.searchParams.get('device') || '').replace(/[^0-9]/g, ''))
      return
    }
    if (path === '/speak') {
      speakRequest(res, text, voice, rate)
      return
    }
    return void respond(res, 404, 'text/plain', 'unknown text-reader route')
  } catch (error) {
    fail(error)
  }
}

// ─── plugin ──────────────────────────────────────────────────────────────────

/**
 * Plugin body: register the `text-reader` settings section and the
 * `/text-reader` speech routes on the web server.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 * @param {object | undefined} config - patch row `config`.
 */
export function apply(ctx, config) {
  const resolved = resolveTextReaderSection(config ?? {})
  Object.assign(readerState, resolved)

  // The settings service may mount after this row (file:// inserts run early in
  // the layer). Wait for it reactively — a one-shot ctx.get raced the provider
  // on one boot and silently cost both user plugins their settings cards.
  const registerSection = (settingsCtx) => {
    settingsCtx.settings.installSection(settingsCtx, 'text-reader', createTextReaderSchema(), {
      enabled: readerState.enabled,
      voice: readerState.voice,
      rate: readerState.rate,
      output: readerState.output,
      device: readerState.device,
    }, {
      setSource: (current) => {
        Object.assign(readerState, resolveTextReaderSection(current))
      },
      onChange: () => {
        ctx.logger?.debug?.('text-reader: enabled=%s output=%s voice=%s', readerState.enabled, readerState.output, readerState.voice)
      },
    })
  }
  if (ctx.get('settings') !== undefined) registerSection(ctx)
  else ctx.inject(['settings'], registerSection)

  const registerRoutes = (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'prefix', path: '/text-reader', handler: handleRequest }),
      'text-reader: speech routes',
    )
  }
  if (ctx.get('webServer') === undefined) ctx.inject(['webServer'], registerRoutes)
  else registerRoutes(ctx)
}

/** Current resolved reader state (host-side fallback when settings are absent). */
export function readTextReaderState() {
  return { ...readerState }
}
