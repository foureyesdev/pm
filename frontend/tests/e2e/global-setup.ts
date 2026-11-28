import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Browser tests use their own Compose project and port, so they never touch the board on :8000.
// Each run builds the current source and starts from an empty volume. e2e.env replaces the root
// .env, so the container talks to the fake model and never receives the real API key.
const compose = ["compose", "-f", fileURLToPath(new URL("../../../compose.yaml", import.meta.url)), "-p", "fieldwork-e2e"];
const env = { ...process.env, FIELDWORK_PORT: "8001", FIELDWORK_ENV_FILE: "frontend/tests/e2e/e2e.env" };
const options = { stdio: "inherit", env } as const;

export default function globalSetup() {
  execFileSync("docker", [...compose, "up", "--build", "--detach", "--wait"], options);
  return () => execFileSync("docker", [...compose, "down", "--volumes"], options);
}
