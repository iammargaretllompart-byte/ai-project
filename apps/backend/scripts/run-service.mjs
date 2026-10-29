// Run the built backend directly under launchd, without a terminal or watcher.
console.log(`[${new Date().toISOString()}] Backend service starting; PID ${process.pid}`)
process.on('exit', code => {
  console.log(`[${new Date().toISOString()}] Backend service exiting; PID ${process.pid}; code ${code}`)
})
process.on('uncaughtExceptionMonitor', error => {
  console.error(`[${new Date().toISOString()}] Backend service uncaught exception; PID ${process.pid}`, error)
})
await import('../dist/server.js')
