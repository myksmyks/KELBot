const ircService = require("../../src/services/ircService");
const osuService = require("../../src/services/osuService");
const {
  completeVerification,
  startVerification,
} = require("../../src/services/verificationService");

describe("Verification Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("starts a verification and stores the canonical osu! username", async () => {
    global.mockDb.get.mockResolvedValueOnce(null);
    jest.spyOn(osuService, "getUser").mockResolvedValueOnce({
      id: 42,
      username: "CanonicalName",
    });
    jest.spyOn(ircService, "sendMessage").mockResolvedValueOnce(true);

    const result = await startVerification("discord-1", "typed name");

    expect(result).toEqual({
      status: "started",
      username: "CanonicalName",
    });
    expect(global.mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO users"),
      ["discord-1", "CanonicalName", expect.stringMatching(/^[a-f0-9]{8}$/)],
    );
    expect(ircService.sendMessage).toHaveBeenCalledWith(
      "CanonicalName",
      expect.stringContaining("Return to Discord"),
    );
  });

  test("reuses an existing pending session without sending another code", async () => {
    global.mockDb.get.mockResolvedValueOnce({
      discord_id: "discord-1",
      osu_username: "ExistingName",
      verification_code: "12345678",
      is_verified: 0,
    });
    const sendSpy = jest.spyOn(ircService, "sendMessage");

    const result = await startVerification("discord-1", "AnotherName");

    expect(result).toEqual({
      status: "pending",
      username: "ExistingName",
    });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("clears an unusable code when Bancho delivery fails", async () => {
    global.mockDb.get.mockResolvedValueOnce(null);
    jest.spyOn(osuService, "getUser").mockResolvedValueOnce({
      username: "CanonicalName",
    });
    jest.spyOn(ircService, "sendMessage").mockResolvedValueOnce(false);

    const result = await startVerification("discord-1", "CanonicalName");

    expect(result.status).toBe("delivery_failed");
    expect(global.mockDb.run).toHaveBeenLastCalledWith(
      "UPDATE users SET verification_code = NULL WHERE discord_id = ?",
      ["discord-1"],
    );
  });

  test("rejects an incorrect verification code without changing storage", async () => {
    global.mockDb.get.mockResolvedValueOnce({
      discord_id: "discord-1",
      osu_username: "CanonicalName",
      verification_code: "12345678",
      is_verified: 0,
    });

    const result = await completeVerification("discord-1", "87654321");

    expect(result).toEqual({ status: "incorrect_code" });
    expect(global.mockDb.run).not.toHaveBeenCalled();
  });

  test("atomically completes verification and returns current osu! data", async () => {
    global.mockDb.get.mockResolvedValueOnce({
      discord_id: "discord-1",
      osu_username: "CanonicalName",
      verification_code: "12345678",
      is_verified: 0,
    });
    global.mockDb.run.mockResolvedValueOnce({ changes: 1 });
    const osuUser = {
      id: 42,
      username: "CanonicalName",
      statistics: { global_rank: 100, pp: 9000 },
    };
    jest.spyOn(osuService, "getUser").mockResolvedValueOnce(osuUser);

    const result = await completeVerification("discord-1", "12345678");

    expect(result).toEqual({
      status: "verified",
      username: "CanonicalName",
      osuUser,
    });
    expect(global.mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining("AND verification_code = ?"),
      ["discord-1", "12345678"],
    );
  });

  test("completes verification with fallback data when osu! refresh fails", async () => {
    global.mockDb.get.mockResolvedValueOnce({
      discord_id: "discord-1",
      osu_username: "CanonicalName",
      verification_code: "12345678",
      is_verified: 0,
    });
    global.mockDb.run.mockResolvedValueOnce({ changes: 1 });
    jest
      .spyOn(osuService, "getUser")
      .mockRejectedValueOnce(new Error("OAuth unavailable"));

    const result = await completeVerification("discord-1", "12345678");

    expect(result).toEqual({
      status: "verified",
      username: "CanonicalName",
      osuUser: null,
    });
  });
});
