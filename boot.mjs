// boot.mjs - guarded launcher for the dsh-text-reader host half.
//
// The patch row points at THIS file, never at host.mjs directly. The harness
// boots fail-loud: one entry that fails to import or to activate aborts the
// whole server start. This stub is always valid, so the row always activates;
// the real module is loaded through guarded dynamic imports, and a corrupted
// or broken host.mjs only switches the reader off (with the reason in the
// server log) instead of blocking the server from starting.

export async function apply(ctx, config) {
  let real
  try {
    real = await import(new URL('./host.mjs', import.meta.url))
  } catch (error) {
    const message = error && error.message ? error.message : String(error)
    ctx.logger?.warn?.('dsh-text-reader: host module failed to load; the reader starts disabled (' + message + ')')
    return
  }
  try {
    await real.apply(ctx, config)
  } catch (error) {
    const message = error && error.message ? error.message : String(error)
    ctx.logger?.warn?.('dsh-text-reader: activation failed; the reader starts disabled (' + message + ')')
  }
}
