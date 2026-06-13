const { SlashCommandBuilder } = require("discord.js");
const {
  applyVerifiedMemberState,
} = require("../../services/discordVerificationService");
const logger = require("../../services/logger");
const {
  completeVerification,
} = require("../../services/verificationService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verifyosu")
    .setDescription("Verify your code")
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("Code from Bancho")
        .setRequired(true),
    ),

  async execute(interaction) {
    const result = await completeVerification(
      interaction.user.id,
      interaction.options.getString("code"),
    );

    if (result.status === "verified") {
      await interaction.editReply(
        await applyVerifiedMemberState(interaction, result),
      );
      logger.info(
        "VERIFICATION",
        `User ${interaction.user.tag} verified as ${result.username}.`,
      );
      return;
    }

    const messages = {
      already_verified: `You are already verified as **${result.username}**.`,
      busy: "A verification action is already running. Please try again shortly.",
      incorrect_code: "Incorrect code.",
      no_pending:
        "No active verification found. Use the welcome button or `/osuset` first.",
    };
    await interaction.editReply(messages[result.status] || "Verification failed.");
  },
};
