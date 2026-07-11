// Unit tests for server/games/punchline/index.js pure logic.
import { describe, it, expect, vi } from "vitest";
import punchline from "../../server/games/punchline/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRoom() {
  return {
    code: "PLNC",
    gameId: "punchline",
    members: new Map(),
    game: {},
    private: {},
  };
}

function makeFakeSocket(id, name, room) {
  const handlers = {};
  room.members.set(id, { id, name });
  return {
    id,
    on: (event, fn) => { handlers[event] = fn; },
    emit: vi.fn(),
    _trigger: (event, data) => handlers[event]?.(data),
  };
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe("punchline — init", () => {
  it("sets default phase, players, round, and private state", () => {
    const room = makeRoom();
    punchline.init(room);

    expect(room.game.phase).toBe("lobby");
    expect(room.game.players).toEqual({});
    expect(room.game.round).toBe(0);
    expect(room.private.usedPrompts).toEqual([]);
  });

  it("does not overwrite pre-existing state", () => {
    const room = makeRoom();
    room.game.phase = "write";
    room.game.round = 5;
    punchline.init(room);

    expect(room.game.phase).toBe("write");
    expect(room.game.round).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// startRound (triggered via pl:start)
// ---------------------------------------------------------------------------
describe("punchline — startRound", () => {
  it("increments the round counter and sets a prompt when the host starts", () => {
    const room = makeRoom();
    punchline.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    // socket s1 becomes host (first to register)
    const s1 = makeFakeSocket("s1", "Alice", room);
    punchline.register(fakeIo, s1, { room, broadcastState });

    s1._trigger("pl:start");

    expect(room.game.phase).toBe("write");
    expect(room.game.round).toBe(1);
    expect(typeof room.game.prompt).toBe("string");
    expect(room.game.prompt.length).toBeGreaterThan(0);
    expect(room.game.gallery).toBeNull();
    expect(room.game.reveals).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildResults / vote tallying
// ---------------------------------------------------------------------------
describe("punchline — buildResults tallies votes and awards points", () => {
  it("awards 100 points per vote to the answer author", () => {
    const room = makeRoom();
    punchline.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    const s1 = makeFakeSocket("s1", "Alice", room);
    const s2 = makeFakeSocket("s2", "Bob", room);
    punchline.register(fakeIo, s1, { room, broadcastState });
    punchline.register(fakeIo, s2, { room, broadcastState });

    // Manually start a round so there is a prompt.
    s1._trigger("pl:start");

    // Both players submit an answer.
    s1._trigger("pl:answer", { text: "Alice's answer" });
    s2._trigger("pl:answer", { text: "Bob's answer" });

    // Should have auto-advanced to vote phase (2 present players, 2 answers).
    expect(room.game.phase).toBe("vote");

    // Find the answer IDs from the gallery.
    const aliceEntry = room.game.gallery.find(
      ({ aid }) => room.private.authors[aid] === "alice",
    );
    const bobEntry = room.game.gallery.find(
      ({ aid }) => room.private.authors[aid] === "bob",
    );
    expect(aliceEntry).toBeDefined();
    expect(bobEntry).toBeDefined();

    // Bob votes for Alice's answer.
    s2._trigger("pl:vote", { aid: aliceEntry.aid });

    // Should have auto-advanced to results (all present players voted).
    expect(room.game.phase).toBe("results");

    // Alice should have 100 points; Bob should have 0.
    expect(room.game.players["alice"].score).toBe(100);
    expect(room.game.players["bob"].score).toBe(0);
  });
});
