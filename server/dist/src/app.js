"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const config_1 = require("./config");
const auth_1 = require("./middleware/auth");
const rateLimit_1 = require("./middleware/rateLimit");
const errors_1 = require("./middleware/errors");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const participants_routes_1 = __importDefault(require("./routes/participants.routes"));
const teams_routes_1 = __importDefault(require("./routes/teams.routes"));
const rooms_routes_1 = __importDefault(require("./routes/rooms.routes"));
const rounds_routes_1 = __importDefault(require("./routes/rounds.routes"));
const categories_routes_1 = __importDefault(require("./routes/categories.routes"));
const results_routes_1 = __importDefault(require("./routes/results.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
function createApp() {
    const app = (0, express_1.default)();
    app.set("trust proxy", 1);
    app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
    app.use((0, cors_1.default)({
        origin: [config_1.env.WEB_ORIGIN],
        credentials: true,
    }));
    app.use((0, compression_1.default)());
    app.use(express_1.default.json({ limit: "1mb" }));
    app.use((0, cookie_parser_1.default)());
    app.use((0, morgan_1.default)(config_1.env.NODE_ENV === "production" ? "tiny" : "dev"));
    app.use("/api", auth_1.attachUser, rateLimit_1.apiLimiter, auth_1.ensureCsrfCookie);
    // mutating requests must carry X-CSRF-Token matching the csrf cookie
    app.use("/api", auth_1.verifyCsrf);
    // health
    app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
    app.use("/api/auth", auth_routes_1.default);
    app.use("/api/participants", participants_routes_1.default);
    app.use("/api/teams", teams_routes_1.default);
    app.use("/api/rooms", rooms_routes_1.default);
    app.use("/api", rounds_routes_1.default);
    app.use("/api", results_routes_1.default);
    app.use("/api", audit_routes_1.default);
    app.use("/api", categories_routes_1.default);
    app.use(errors_1.notFoundHandler);
    app.use(errors_1.errorHandler);
    return app;
}
