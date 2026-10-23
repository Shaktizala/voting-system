import http from "http";
import { createApp } from "./app";
import { createRealtime } from "./realtime";
import { env } from "./config";

const app = createApp();
const server = http.createServer(app);
createRealtime(server);

server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
