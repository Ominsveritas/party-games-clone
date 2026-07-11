// Keyboard Zen.
//
// Endless, solo-per-player typing race. The client generates and shows the key
// sequences locally (they are not secret), so play stays snappy with no
// per-round network round-trip — the server is just the shared scoreboard.
//
// Identity is name-keyed (refresh-proof) like Two Truths. Public state
// room.game.players is a name-keyed map of the best run reached so far plus the
// player's live progress, ranked furthest-round then fastest-time on the client.

function nameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function keyOf(room, socketId) {
  const m = room.members.get(socketId);
  return m ? nameKey(m.name) : null;
}

function ensurePlayer(room, name) {
  const key = nameKey(name);
  if (!key) return null;
  if (!room.game.players[key]) {
    room.game.players[key] = {
      name: String(name).trim(),
      bestRound: 0,
      bestTimeMs: 0,
      curRound: 0,
      active: false,
    };
  }
  return room.game.players[key];
}

function init(room) {
  if (!room.game.players) room.game.players = {};
}

function register(io, socket, { room, broadcastState }) {
  const myName = room.members.get(socket.id)?.name;
  if (myName) ensurePlayer(room, myName);

  const myPlayer = () => {
    const key = keyOf(room, socket.id);
    return key ? room.game.players[key] : null;
  };

  socket.on("kz:start", () => {
    if (!myName) return;
    const p = ensurePlayer(room, myName);
    if (!p) return;
    p.active = true;
    p.curRound = 0;
    broadcastState();
  });

  socket.on("kz:clear", ({ round, timeMs } = {}) => {
    const p = myPlayer();
    if (!p) return;
    const r = Number(round);
    const t = Number(timeMs);
    if (!Number.isFinite(r) || r <= 0) return;
    if (!Number.isFinite(t) || t < 0) return;
    p.curRound = r;
    if (r > p.bestRound || (r === p.bestRound && t < p.bestTimeMs)) {
      p.bestRound = r;
      p.bestTimeMs = t;
    }
    broadcastState();
  });

  socket.on("kz:fail", () => {
    const p = myPlayer();
    if (!p) return;
    p.active = false;
    broadcastState();
  });
}

module.exports = { id: "keyboard-zen", init, register };
