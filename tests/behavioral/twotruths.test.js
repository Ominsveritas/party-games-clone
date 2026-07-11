// Behavioural tests for Two Truths & a Lie (server/games/twotruths.js).
//
// We exercise the full socket event flow: submit → auto-begin → vote → reveal.
import { describe, it, expect, vi } from "vitest";
import twotruths from "../../server/games/twotruths.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRoom() {
  return {
    code: "TTLX",
    gameId: "two-truths",
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
// Test data
// ---------------------------------------------------------------------------
const ALICE_STATEMENTS = ["I've climbed Everest", "I love jazz", "I have a pet iguana"];
const BOB_STATEMENTS   = ["I ran a marathon", "I can juggle", "I've been to Antarctica"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("two-truths — init", () => {
  it("sets collect phase and empty state", () => {
    const room = makeRoom();
    twotruths.init(room);
    expect(room.game.phase).toBe("collect");
    expect(room.game.players).toEqual({});
    expect(room.game.submitted).toEqual([]);
    expect(room.private.statements).toEqual({});
    expect(room.private.lies).toEqual({});
  });
});

describe("two-truths — submit → auto-begin → vote → reveal flow", () => {
  it("auto-starts guessing once all players have submitted, then scores correctly", () => {
    const room = makeRoom();
    twotruths.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    const s1 = makeFakeSocket("s1", "Alice", room);
    const s2 = makeFakeSocket("s2", "Bob", room);
    twotruths.register(fakeIo, s1, { room, broadcastState });
    twotruths.register(fakeIo, s2, { room, broadcastState });

    // Both players submit. Alice's lie is index 2 ("I have a pet iguana").
    s1._trigger("tt:submit", { statements: ALICE_STATEMENTS, lieIndex: 2 });
    // After one submission the game should still be in collect.
    expect(room.game.phase).toBe("collect");

    // Bob's lie is index 1 ("I can juggle").
    s2._trigger("tt:submit", { statements: BOB_STATEMENTS, lieIndex: 1 });
    // Now both have submitted — game should have auto-begun.
    expect(room.game.phase).toBe("guess");
    expect(room.game.featuredKey).toBeDefined();

    // The featured player's statements must be publicly visible.
    expect(Array.isArray(room.game.statements)).toBe(true);
    expect(room.game.statements).toHaveLength(3);

    // Determine which socket is not featured so they cast the vote.
    const featuredKey = room.game.featuredKey; // "alice" or "bob"
    const lieIndex = room.private.lies[featuredKey];

    // The non-featured player votes for the correct lie position.
    const voterSocket = featuredKey === "alice" ? s2 : s1;
    voterSocket._trigger("tt:vote", { choice: lieIndex });

    // All eligible voters have voted — should have auto-revealed.
    expect(room.game.phase).toBe("reveal");
    expect(room.game.reveal).toBeDefined();
    expect(room.game.reveal.lieIndex).toBe(lieIndex);

    // The correct guesser should have earned 100 points.
    const voterKey = featuredKey === "alice" ? "bob" : "alice";
    expect(room.game.players[voterKey].score).toBe(100);

    // The featured player was fooled by nobody — 50 * 0 = 0 bonus.
    expect(room.game.players[featuredKey].score).toBe(0);
  });

  it("does not auto-begin when only one player has submitted", () => {
    const room = makeRoom();
    twotruths.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    const s1 = makeFakeSocket("s1", "Alice", room);
    const s2 = makeFakeSocket("s2", "Bob", room);
    twotruths.register(fakeIo, s1, { room, broadcastState });
    twotruths.register(fakeIo, s2, { room, broadcastState });

    s1._trigger("tt:submit", { statements: ALICE_STATEMENTS, lieIndex: 0 });

    expect(room.game.phase).toBe("collect");
    expect(room.game.submitted).toContain("alice");
    expect(room.game.submitted).not.toContain("bob");
  });
});

describe("two-truths — duplicate submission rejected", () => {
  it("ignores a second submit from the same player", () => {
    const room = makeRoom();
    twotruths.init(room);

    const broadcastState = vi.fn();
    const fakeIo = { to: () => ({ emit: vi.fn() }) };

    const s1 = makeFakeSocket("s1", "Solo", room);
    twotruths.register(fakeIo, s1, { room, broadcastState });

    s1._trigger("tt:submit", { statements: ALICE_STATEMENTS, lieIndex: 0 });
    const countAfterFirst = room.game.submitted.length;
    s1._trigger("tt:submit", { statements: ALICE_STATEMENTS, lieIndex: 0 });

    expect(room.game.submitted.length).toBe(countAfterFirst); // no duplicate
  });
});
