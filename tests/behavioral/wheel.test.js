// Behavioural tests for the Wheel game (server/games/wheel.js).
//
// These tests wire up the real register() function with a minimal fake I/O
// layer so we exercise the actual event-handling code paths, not just helpers.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import wheel from "../../server/games/wheel.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRoom(memberEntries = []) {
  const room = {
    code: "WHLX",
    gameId: "wheel",
    members: new Map(memberEntries),
    game: {},
    private: {},
  };
  wheel.init(room);
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

function makeFakeIo() {
  const roomEmit = vi.fn();
  return {
    roomEmit,
    to: () => ({ emit: roomEmit }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("wheel — spin rejected with fewer than 2 members", () => {
  it("does not emit a spin event when only one member is in the room", () => {
    const room = makeRoom([["s1", { id: "u1", name: "Alice" }]]);
    const socket = makeFakeSocket("s1");
    const fakeIo = makeFakeIo();

    wheel.register(fakeIo, socket, { room });
    socket._trigger("wheel:spin");

    expect(fakeIo.roomEmit).not.toHaveBeenCalled();
  });
});

describe("wheel — spin rejected when already spinning", () => {
  it("does not start a new spin while one is in progress", () => {
    const room = makeRoom([
      ["s1", { id: "u1", name: "Alice" }],
      ["s2", { id: "u2", name: "Bob" }],
    ]);
    room.game.spinning = true; // simulate mid-spin state

    const socket = makeFakeSocket("s1");
    const fakeIo = makeFakeIo();

    wheel.register(fakeIo, socket, { room });
    socket._trigger("wheel:spin");

    expect(fakeIo.roomEmit).not.toHaveBeenCalled();
  });
});

describe("wheel — successful spin flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("broadcasts spin event, marks spinning=true, then stores winner after timeout", () => {
    const room = makeRoom([
      ["s1", { id: "u1", name: "Alice" }],
      ["s2", { id: "u2", name: "Bob" }],
    ]);
    const socket = makeFakeSocket("s1");
    const fakeIo = makeFakeIo();

    wheel.register(fakeIo, socket, { room });
    socket._trigger("wheel:spin");

    // Immediately after the spin event the room should be spinning.
    expect(room.game.spinning).toBe(true);
    expect(room.game.winner).toBeNull();

    // The spin event should have been emitted to the room.
    expect(fakeIo.roomEmit).toHaveBeenCalledWith(
      "wheel:spin",
      expect.objectContaining({ rotation: expect.any(Number), duration: 4500 }),
    );

    // Advance past the spin duration + buffer (4500 + 150 ms).
    vi.advanceTimersByTime(4651);

    // After the timeout the spinner should be cleared and a winner stored.
    expect(room.game.spinning).toBe(false);
    expect(room.game.winner).not.toBeNull();
    expect(room.game.winner).toHaveProperty("name");

    // The result and new state should have been broadcast.
    expect(fakeIo.roomEmit).toHaveBeenCalledWith(
      "wheel:result",
      expect.objectContaining({ winner: expect.objectContaining({ name: expect.any(String) }) }),
    );
  });
});
