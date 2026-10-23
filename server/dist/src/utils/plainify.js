"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plainify = plainify;
function plainify(value) {
    const parsed = JSON.parse(JSON.stringify(value, (_k, v) => {
        if (typeof v === "bigint")
            return v.toString();
        if (v && typeof v === "object" && typeof v.d === "object" && typeof v.s === "number") {
            return String(v);
        }
        return v;
    }));
    return parsed;
}
