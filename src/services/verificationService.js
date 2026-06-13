const crypto = require("crypto");
const { getDatabase } = require("../database/db");
const ircService = require("./ircService");
const logger = require("./logger");
const osuService = require("./osuService");

const activeOperations = new Set();

async function getVerificationSession(discordId) {
  const db = await getDatabase();
  return db.get("SELECT * FROM users WHERE discord_id = ?", [discordId]);
}

async function withUserLock(discordId, operation) {
  if (activeOperations.has(discordId)) {
    return { status: "busy" };
  }

  activeOperations.add(discordId);
  try {
    return await operation();
  } finally {
    activeOperations.delete(discordId);
  }
}

async function startVerification(discordId, requestedUsername) {
  return withUserLock(discordId, async () => {
    const username = String(requestedUsername || "").trim();
    if (!username) return { status: "invalid_username" };

    const existingUser = await getVerificationSession(discordId);
    if (existingUser?.is_verified === 1) {
      return { status: "already_verified", username: existingUser.osu_username };
    }
    if (existingUser?.verification_code) {
      return { status: "pending", username: existingUser.osu_username };
    }

    const osuUser = await osuService.getUser(username);
    if (!osuUser) return { status: "user_not_found" };

    const code = crypto.randomBytes(4).toString("hex");
    const db = await getDatabase();
    await db.run(
      "INSERT OR REPLACE INTO users (discord_id, osu_username, verification_code, is_verified) VALUES (?, ?, ?, 0)",
      [discordId, osuUser.username, code],
    );

    const delivered = await ircService.sendMessage(
      osuUser.username,
      `Code: ${code}. Return to Discord and enter it with the verification button or /verifyosu.`,
    );
    if (!delivered) {
      await db.run(
        "UPDATE users SET verification_code = NULL WHERE discord_id = ?",
        [discordId],
      );
      return { status: "delivery_failed", username: osuUser.username };
    }

    logger.info(
      "VERIFICATION",
      `Started verification for Discord user ${discordId} as ${osuUser.username}.`,
    );
    return { status: "started", username: osuUser.username };
  });
}

function codesMatch(expectedCode, submittedCode) {
  const expected = Buffer.from(expectedCode);
  const submitted = Buffer.from(String(submittedCode || "").trim());
  return (
    expected.length === submitted.length &&
    crypto.timingSafeEqual(expected, submitted)
  );
}

async function getUserDataSafely(username) {
  try {
    return await osuService.getUser(username);
  } catch (error) {
    logger.warn(
      "VERIFICATION",
      `Could not refresh osu! data for ${username}: ${error.message}`,
    );
    return null;
  }
}

async function completeVerification(discordId, submittedCode) {
  return withUserLock(discordId, async () => {
    const row = await getVerificationSession(discordId);
    if (row?.is_verified === 1) {
      const osuUser = await getUserDataSafely(row.osu_username);
      return {
        status: "already_verified",
        username: row.osu_username,
        osuUser,
      };
    }
    if (!row?.verification_code) return { status: "no_pending" };
    if (!codesMatch(row.verification_code, submittedCode)) {
      return { status: "incorrect_code" };
    }

    const db = await getDatabase();
    const result = await db.run(
      "UPDATE users SET is_verified = 1, verification_code = NULL WHERE discord_id = ? AND verification_code = ? AND is_verified = 0",
      [discordId, row.verification_code],
    );
    if (result.changes !== 1) return { status: "busy" };

    const osuUser = await getUserDataSafely(row.osu_username);
    logger.info(
      "VERIFICATION",
      `Discord user ${discordId} verified as ${row.osu_username}.`,
    );
    return {
      status: "verified",
      username: osuUser?.username || row.osu_username,
      osuUser,
    };
  });
}

module.exports = {
  completeVerification,
  getVerificationSession,
  startVerification,
};
