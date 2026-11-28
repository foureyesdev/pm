import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Browser tests use their own Compose project and port, so they never touch the board on :8000.
// Each run builds the current source and starts from an empty volume.
const compose = ["compose", "-f", fileURLToPath(new URL("../../../compose.yaml", import.meta.url)), "-p", "fieldwork-e2e"];
const options = { stdio: "inherit", env: { ...process.env, FIELDWORK_PORT: "8001" } } as const;

export default function globalSetup() {
  execFileSync("docker", [...compose, "up", "--build", "--detach", "--wait"], options);
  return () => execFileSync("docker", [...compose, "down", "--volumes"], options);
}
