// Unit tests for the pure logic inside server/games/disordered.js.
//
// The functions under test (isPermutationOf, clampN, init, guess scoring) are
// not exported directly, so we pull the module and exercise them via the
// exported surface (init) or by replicating the tiny helpers here where they
// are private.  The guess-scoring path is tested through a minimal fake-socket
// interaction that does NOT spin up Socket.IO.
import { describe, it, expect, vi } from "vitest";
import disordered from "../../server/games/disordered.js";

// ---------------------------------------------------------------------------
// Helpers replicated from disordered.js (they are small enough to duplicate
// rather than export just for tests).
// ---------------------------------------------------------------------------
function isPermutationOf(order, palette) {
  if (!Array.isArray(order) || order.length !== palette.length) return false;
  const remaining = new Map();
  for (const e of palette) remaining.set(e, (remaining.get(e) || 0) + 1);
  for (const e of order) {
    const count = remaining.get(e);
    if (!count) return false;
    remaining.set(e, count - 1);
  }
  return true;
}

function clampN(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.max(4, Math.min(8, n));
}

// ---------------------------------------------------------------------------
// isPermutationOf
// ---------------------------------------------------------------------------
describe("disordered — isPermutationOf", () => {
  const palette = ["🐙", "🦊", "🐸", "🐵"];

  it("returns true for the exact same arrangement", () => {
    expect(isPermutationOf(["🐙", "🦊", "🐸", "🐵"], palette)).toBe(true);
  });

  it("returns true for a different valid arrangement", () => {
    expect(isPermutationOf(["🐵", "🐸", "🦊", "🐙"], palette)).toBe(true);
  });

  it("returns false when the order is too short", () => {
    expect(isPermutationOf(["🐙", "🦊", "🐸"], palette)).toBe(false);
  });

  it("returns false when an emoji not in the palette is included", () => {
    expect(isPermutationOf(["🐙", "🦊", "🐸", "🚀"], palette)).toBe(false);
  });

  it("returns false for a non-array", () => {
    expect(isPermutationOf(null, palette)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clampN
// ---------------------------------------------------------------------------
describe("disordered — clampN", () => {
  it("clamps a value below the minimum up to 4", () => {
    expect(clampN(1)).toBe(4);
  });

  it("clamps a value above the maximum down to 8", () => {
    expect(clampN(99)).toBe(8);
  });

  it("passes through a value within the valid range", () => {
    expect(clampN(6)).toBe(6);
  });

  it("returns the default 5 for non-numeric input", () => {
    expect(clampN("banana")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe("disordered — init", () => {
  it("seeds default fields on an empty game object", () => {
    const room = { game: {}, private: {} };
    disordered.init(room);
    expect(room.game.phase).toBe("setup");
    expect(room.game.mode).toBe("race");
    expect(typeof room.game.roundId).toBe("number");
    expect(room.game.players).toEqual({});
    expect(room.game.palette).toEqual([]);
    expect(room.game.answer).toBeNull();
  });

  it("does not overwrite existing fields", () => {
    const room = { game: { phase: "playing", roundId: 3 }, private: {} };
    disordered.init(room);
    expect(room.game.phase).toBe("playing");
    expect(room.game.roundId).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Guess scoring (via register + fake socket)
// ---------------------------------------------------------------------------
describe("disordered — guess scoring", () => {
  function makeRoom() {
    const room = { game: {}, private: {}, members: new Map(), code: "DISC" };
    disordered.init(room);
    return room;
  }

  function makeFakeSocket(id) {
    const handlers = {};
    return {
      id,
      on: (event, fn) => { handlers[event] = fn; },
      emit: vi.fn(),
      _trigger: (event, data) => handlers[event]?.(data),
    };
  }

  it("counts correct positions and marks the player as solved on a perfect guess", () => {
    const room = makeRoom();
    room.game.phase = "playing";
    room.game.n = 3;
    room.game.palette = ["🐙", "🦊", "🐸"];
    room.private.secret = ["🐙", "🦊", "🐸"]; // known secret for the test

    const socket = makeFakeSocket("s1");
    room.members.set("s1", { id: "u1", name: "Alice" });

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    disordered.register(fakeIo, socket, { room, broadcastState });
    socket._trigger("disordered:guess", { order: ["🐙", "🦊", "🐸"] });

    // The socket should have received private feedback.
    expect(socket.emit).toHaveBeenCalledWith(
      "disordered:feedback",
      expect.objectContaining({ correct: 3, solved: true, attempts: 1 }),
    );
    expect(room.game.players["s1"].solved).toBe(true);
  });

  it("gives partial credit for a partially correct guess and does not mark solved", () => {
    const room = makeRoom();
    room.game.phase = "playing";
    room.game.n = 3;
    room.game.palette = ["🐙", "🦊", "🐸"];
    room.private.secret = ["🐙", "🦊", "🐸"];

    const socket = makeFakeSocket("s2");
    room.members.set("s2", { id: "u2", name: "Bob" });

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    disordered.register(fakeIo, socket, { room, broadcastState });
    socket._trigger("disordered:guess", { order: ["🐙", "🐸", "🦊"] }); // only index 0 correct

    expect(socket.emit).toHaveBeenCalledWith(
      "disordered:feedback",
      expect.objectContaining({ correct: 1, solved: false }),
    );
    expect(room.game.players["s2"].solved).toBe(false);
  });
});
