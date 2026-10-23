"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const realtime_1 = require("./realtime");
const config_1 = require("./config");
const app = (0, app_1.createApp)();
const server = http_1.default.createServer(app);
(0, realtime_1.createRealtime)(server);
server.listen(config_1.env.PORT, () => {
    console.log(`API listening on http://localhost:${config_1.env.PORT} (${config_1.env.NODE_ENV})`);
});
async function shutdown() {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
