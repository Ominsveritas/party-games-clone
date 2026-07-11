// Behavioural tests for the Punchline game (server/games/punchline/index.js).
//
// Covers the full write → vote → results flow and edge-cases like self-vote
// blocking and the non-host being unable to start a round.
import { describe, it, expect, vi } from "vitest";
import punchline from "../../server/games/punchline/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRoom() {
  return {
    code: "PLBH",
    gameId: "punchline",
    members: new Map(),
    game: {},
    private: {},
  };
}

function registerSocket(id, name, room, fakeIo, broadcastState) {
  const handlers = {};
  room.members.set(id, { id, name });
  const socket = {
    id,
    on: (event, fn) => { handlers[event] = fn; },
    emit: vi.fn(),
    _trigger: (event, data) => handlers[event]?.(data),
  };
  punchline.register(fakeIo, socket, { room, broadcastState });
  return socket;
}

// ---------------------------------------------------------------------------
// Full write → vote → results flow
// ---------------------------------------------------------------------------
describe("punchline — write → auto-vote → self-vote blocked → results", () => {
  it("advances through the full round lifecycle correctly", () => {
    const room = makeRoom();
    punchline.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    // Register two players.  The first one (s1 / Alice) becomes the host.
    const s1 = registerSocket("s1", "Alice", room, fakeIo, broadcastState);
    const s2 = registerSocket("s2", "Bob", room, fakeIo, broadcastState);

    // Host starts round 1.
    s1._trigger("pl:start");
    expect(room.game.phase).toBe("write");
    expect(room.game.round).toBe(1);

    // Both players submit answers.
    s1._trigger("pl:answer", { text: "Because the server is written in PHP" });
    expect(room.game.phase).toBe("write"); // not yet auto-advanced (1 of 2)

    s2._trigger("pl:answer", { text: "The rubber duck quit" });
    // All present players have answered → should auto-advance to vote.
    expect(room.game.phase).toBe("vote");
    expect(Array.isArray(room.game.gallery)).toBe(true);
    expect(room.game.gallery).toHaveLength(2);

    // Find each player's own answer ID (self-vote must be blocked).
    const aliceAid = room.game.gallery.find(
      ({ aid }) => room.private.authors[aid] === "alice",
    )?.aid;
    const bobAid = room.game.gallery.find(
      ({ aid }) => room.private.authors[aid] === "bob",
    )?.aid;

    expect(aliceAid).toBeDefined();
    expect(bobAid).toBeDefined();

    // Alice tries to vote for herself — must be silently rejected.
    s1._trigger("pl:vote", { aid: aliceAid });
    expect(room.game.voted).not.toContain("alice");
    expect(room.game.phase).toBe("vote"); // still in vote

    // Alice votes legitimately for Bob.
    s1._trigger("pl:vote", { aid: bobAid });
    expect(room.game.voted).toContain("alice");
    expect(room.game.phase).toBe("vote"); // Bob hasn't voted yet

    // Bob votes for Alice.
    s2._trigger("pl:vote", { aid: aliceAid });
    // All present players voted → should auto-advance to results.
    expect(room.game.phase).toBe("results");

    // Each player received 1 vote → 100 points each.
    expect(room.game.players["alice"].score).toBe(100);
    expect(room.game.players["bob"].score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Non-host cannot start a round
// ---------------------------------------------------------------------------
describe("punchline — non-host cannot start a round", () => {
  it("ignores pl:start from a player who is not the host", () => {
    const room = makeRoom();
    punchline.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    // s1 is registered first → becomes host.
    registerSocket("s1", "Alice", room, fakeIo, broadcastState);
    const s2 = registerSocket("s2", "Bob", room, fakeIo, broadcastState);

    // Bob tries to start — should be ignored.
    s2._trigger("pl:start");

    expect(room.game.phase).toBe("lobby");
    expect(broadcastState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Duplicate answer rejected
// ---------------------------------------------------------------------------
describe("punchline — duplicate answer rejected", () => {
  it("ignores a second answer submission from the same player", () => {
    const room = makeRoom();
    punchline.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    const s1 = registerSocket("s1", "Alice", room, fakeIo, broadcastState);
    registerSocket("s2", "Bob", room, fakeIo, broadcastState);

    s1._trigger("pl:start");

    s1._trigger("pl:answer", { text: "First answer" });
    const answeredAfterFirst = Object.keys(room.private.answers).length;

    s1._trigger("pl:answer", { text: "Sneaky second answer" });
    // The private answer store must not change.
    expect(Object.keys(room.private.answers).length).toBe(answeredAfterFirst);
    expect(room.private.answers["alice"]).toBe("First answer");
  });
});
