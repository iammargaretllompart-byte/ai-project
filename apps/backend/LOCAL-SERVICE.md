# Persistent local backend (macOS)

For everyday use on this Mac, run the backend as a user LaunchAgent rather than
a background terminal command. macOS owns the process, starts it when you log
in, and restarts it after an unexpected exit. Closing a terminal or a coding
session does not own or stop this service.

Run the following commands from `apps/backend`:

| Command | Action |
| --- | --- |
| `npm run service:install` | Compile, install/update the login service, start it, and verify health. |
| `npm run service:status` | Show launchd state, PID, last exit information, health, and log paths. |
| `npm run service:restart` | Compile current code, restart the service, and verify health. Use after code or `.env` changes. |
| `npm run service:stop` | Intentionally stop and disable the service, including at the next login. |
| `npm run service:start` | Re-enable an installed service, start it, and verify health. |
| `npm run service:uninstall` | Stop and remove the login service; retain project data and logs. |

The service runs the **built backend**, not the development file watcher. Code
edits take effect after `npm run service:restart`; a failed compilation does not
stop the current service. `service:install` regenerates absolute paths if the
project or Node installation moves.

## Configuration and logs

- Service label: `local.ai-project.backend`.
- Installed configuration: `~/Library/LaunchAgents/local.ai-project.backend.plist`.
- Output: `~/Library/Logs/ai-project/backend.stdout.log`.
- Errors: `~/Library/Logs/ai-project/backend.stderr.log`.
- Startup and clean exit messages include timestamps and process IDs. Uncaught
  exceptions are logged before Node exits and macOS restarts the service.
- The working directory is always `apps/backend`, so `.env`, SQLite, uploads,
  and saved snapshots use the same paths as the existing application.
- API keys remain in the ignored `.env`; they are not copied into the plist.
- Crash restarts are throttled by macOS to avoid a tight failure loop.

Do not run `npm run dev` or `npm start` alongside the managed backend on the same
port/data directory. To use the live development watcher, first run
`npm run service:stop`, then `npm run dev`; stop that watcher before restoring
the managed service with `npm run service:start`.

The frontend currently runs separately at `http://localhost:5173`. The backend
normally listens on port 4000; `PORT` can be configured at installation. This
is a local login service: the Mac must be awake and the user logged in. It is
not an internet deployment.

## Recovery verification

On installation for this workspace, the managed process was deliberately
terminated with `launchctl kill SIGKILL gui/$(id -u)/local.ai-project.backend`.
macOS launched a new backend PID and `/health` recovered in approximately one
second. The saved-search listing and library status were identical before and
after recovery. There were no queued/running moodboards during this test.

If a future failure occurs, inspect `service:status` and the durable error log
before restarting. An application error or invalid configuration is recorded
even when macOS has already brought the service back up.
