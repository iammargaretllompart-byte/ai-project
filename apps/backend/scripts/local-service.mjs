import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'

const directory = fileURLToPath(new URL('..', import.meta.url))
const label = 'local.ai-project.backend'
const domain = `gui/${process.getuid()}`
const target = `${domain}/${label}`
const plist = path.join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
const logs = path.join(homedir(), 'Library', 'Logs', 'ai-project')
const command = process.argv[2]

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: directory, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${executable} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout
}
const launch = (...args) => run('/bin/launchctl', args)
const installed = () => spawnSync('/bin/launchctl', ['print', target], { encoding: 'utf8' }).status === 0
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

async function configuration() {
  let env = {}
  try { env = parse(await readFile(path.join(directory, '.env'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const port = Number(process.env.PORT ?? env.PORT ?? 4000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid backend PORT')
  return { port, health: `http://localhost:${port}/health` }
}

async function healthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
    return response.ok && (await response.json()).ok === true
  } catch { return false }
}

async function waitForHealth(url) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (await healthy(url)) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Backend did not become healthy. Inspect ${logs}/backend.stderr.log and run npm run service:status.`)
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('This local service uses macOS launchd.')
  const { port, health } = await configuration()
  if (command === 'install') {
    if (!installed() && await healthy(health)) throw new Error(`A backend is already running on port ${port}. Stop that development process before installing the service.`)
    // Compile before replacing a running service, so a build failure cannot stop it.
    process.stdout.write(run(process.execPath, ['node_modules/typescript/bin/tsc']))
    // Prefer the stable PATH entry (e.g. Homebrew's symlink), not a Cellar version.
    const node = run('/usr/bin/which', ['node']).trim()
    await access(node)
    await mkdir(path.dirname(plist), { recursive: true })
    await mkdir(logs, { recursive: true, mode: 0o700 })
    try {
      const previous = await readFile(plist, 'utf8')
      if (!previous.includes(`<string>${xml(directory)}</string>`)) throw new Error(`An existing service points at another project location: ${plist}`)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (installed()) launch('bootout', target)
    await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(path.join(directory, 'scripts/run-service.mjs'))}</string></array>
  <key>WorkingDirectory</key><string>${xml(directory)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>${xml(homedir())}</string>
    <key>PATH</key><string>${xml(path.dirname(node))}:/usr/local/bin:/usr/bin:/bin</string>
    <key>PORT</key><string>${port}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ExitTimeOut</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(path.join(logs, 'backend.stdout.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logs, 'backend.stderr.log'))}</string>
</dict></plist>
`, { mode: 0o600 })
    launch('enable', target)
    launch('bootstrap', domain, plist)
    await waitForHealth(health)
    console.log(`Backend service installed and healthy at ${health}\nStarts at login and restarts automatically after exit.\nLogs: ${logs}`)
  } else if (command === 'start') {
    if (!installed()) {
      launch('enable', target)
      launch('bootstrap', domain, plist)
    }
    await waitForHealth(health)
    console.log(`Backend service is healthy at ${health}`)
  } else if (command === 'restart') {
    if (!installed()) throw new Error('Service is not running. Use npm run service:start or npm run service:install.')
    // A code update is applied only after compilation succeeds.
    process.stdout.write(run(process.execPath, ['node_modules/typescript/bin/tsc']))
    launch('kickstart', '-k', target)
    await waitForHealth(health)
    console.log(`Backend rebuilt, restarted, and healthy at ${health}`)
  } else if (command === 'stop' || command === 'uninstall') {
    // Disable first: stopping is intentional, and must also survive the next login.
    launch('disable', target)
    if (installed()) launch('bootout', target)
    if (command === 'uninstall') await rm(plist, { force: true })
    console.log(command === 'uninstall' ? 'Backend service removed. Data and logs are preserved.' : 'Backend service stopped. Use npm run service:start to enable it again.')
  } else if (command === 'status') {
    if (installed()) console.log(launch('print', target))
    else console.log('Backend service is not loaded.')
    console.log(`Health: ${await healthy(health) ? 'OK' : 'unavailable'} (${health})\nLogs: ${logs}`)
  } else {
    throw new Error('Usage: node scripts/local-service.mjs install|start|restart|stop|status|uninstall')
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
