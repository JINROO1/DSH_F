// Preloaded into the owned Harness Node process. If the desktop/preview parent
// dies abruptly, the IPC channel disconnects and we reap the whole detached
// process group so no loopback engine is orphaned. Normal stops send a release
// message first, preserving graceful SIGTERM shutdown.
let released = false
process.on('message', message => {
  if (message && typeof message === 'object' && message.type === 'dshf:release') released = true
})
process.once('disconnect', () => {
  if (released) return
  if (process.platform === 'linux') {
    try { process.kill(-process.pid, 'SIGKILL'); return } catch { /* fall through */ }
  }
  process.exit(1)
})
