# Running Fieldwork locally

Start Docker with Linux container support and Docker Compose. From the project root, use the commands for your platform.

| Platform | Start | Stop |
| --- | --- | --- |
| Windows PowerShell | `.\scripts\start.ps1` | `.\scripts\stop.ps1` |
| macOS or Linux | `sh scripts/start.sh` | `sh scripts/stop.sh` |

Open http://127.0.0.1:8000/ after the start script reports ready. Both script pairs use the root `compose.yaml`. Stopping removes the app container and keeps the named volume mounted at `/data` on the next start.
