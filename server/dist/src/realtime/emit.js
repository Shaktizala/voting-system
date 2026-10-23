"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rtEvents = void 0;
exports.setIo = setIo;
exports.getIo = getIo;
exports.emitToRoom = emitToRoom;
const shared_1 = require("@voting/shared");
let io = null;
function setIo(server) {
    io = server;
}
function getIo() {
    return io;
}
function emitToRoom(roomId, event, payload) {
    if (!io)
        return;
    io.to((0, shared_1.ROOM_CHANNEL)(roomId)).emit(event, payload);
}
exports.rtEvents = {
    stateChanged(roomId, payload) {
        emitToRoom(roomId, "room:state_changed", payload);
    },
    presentingChanged(roomId, payload) {
        emitToRoom(roomId, "team:presenting_changed", payload);
        emitToRoom(roomId, "room:state_changed", { roomId });
    },
    votingOpened(roomId, roundId) {
        emitToRoom(roomId, "voting:opened", { roundId });
    },
    votingPaused(roomId, roundId) {
        emitToRoom(roomId, "voting:paused", { roundId });
    },
    votingResumed(roomId, roundId) {
        emitToRoom(roomId, "voting:resumed", { roundId });
    },
    votingClosed(roomId, roundId) {
        emitToRoom(roomId, "voting:closed", { roundId });
    },
    voteSubmitted(roomId, payload) {
        // admin/moderator-only rooms join a separate privileged channel
        emitToRoom(`mod:${roomId}`, "vote:submitted", payload);
    },
    resultsPublished(roomId, payload) {
        emitToRoom(roomId, "results:published", payload);
    },
};
