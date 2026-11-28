import { createServer } from "node:http";

// A stand-in for OpenRouter's chat completions endpoint. The fieldwork-e2e container reaches it
// through host.docker.internal (see e2e.env). Each test queues the replies it expects.

export interface ModelRequest {
  messages: { role: string; content: string }[];
  tools?: unknown[];
}

type Answer = [status: number, body: object];
type Handler = (request: ModelRequest) => Answer | Promise<Answer>;

export const MODEL_PORT = 8002;

export function respond(reply: string, operations: object[] = []): Answer {
  const call = { id: "call-e2e", type: "function", function: { name: "respond", arguments: JSON.stringify({ reply, operations }) } };
  return [200, { choices: [{ message: { role: "assistant", content: null, tool_calls: [call] } }] }];
}

export class FakeModel {
  readonly requests: ModelRequest[] = [];
  private readonly handlers: Handler[] = [];

  /** Queue a reply with card operations. */
  reply(reply: string, ...operations: object[]) {
    this.handlers.push(() => respond(reply, operations));
  }

  /** Queue an OpenRouter error. */
  fail(status: number, message: string) {
    this.handlers.push(() => [status, { error: { code: status, message } }]);
  }

  /** Queue a custom answer, for example one that waits or changes the board first. */
  handle(handler: Handler) {
    this.handlers.push(handler);
  }

  /** The board JSON the backend sent with a request. */
  board(index: number) {
    return JSON.parse(this.requests.at(index)!.messages[0].content.split("Current board as JSON:\n")[1]);
  }

  async answer(request: ModelRequest): Promise<Answer> {
    this.requests.push(request);
    const handler = this.handlers.shift();
    return handler ? handler(request) : [500, { error: { code: 500, message: "No reply queued in FakeModel" } }];
  }
}

export async function startModelServer() {
  const state: { model: FakeModel | null } = { model: null };
  const server = createServer(async (incoming, outgoing) => {
    let body = "";
    for await (const chunk of incoming) body += chunk;
    const [status, payload] = state.model
      ? await state.model.answer(JSON.parse(body))
      : [500, { error: { code: 500, message: "No FakeModel is active" } }];
    outgoing.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(payload));
  });
  // Docker Desktop forwards host.docker.internal to the host's loopback; Linux needs a bridge-facing address.
  const host = process.platform === "linux" ? "0.0.0.0" : "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(MODEL_PORT, host, resolve));
  return {
    use: (model: FakeModel | null) => { state.model = model; },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
