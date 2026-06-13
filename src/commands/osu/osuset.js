const { SlashCommandBuilder } = require("discord.js");
const {
  createEnterCodeComponents,
} = require("../../services/discordVerificationService");
const logger = require("../../services/logger");
const {
  startVerification,
} = require("../../services/verificationService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("osuset")
    .setDescription("Link your osu! account")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("osu! username")
        .setRequired(true),
    ),

  async execute(interaction) {
    logger.info("COMMAND", `osuset triggered by ${interaction.user.tag}`);

    const discordId = interaction.user.id;
    const result = await startVerification(
      discordId,
      interaction.options.getString("username"),
    );

    if (result.status === "already_verified") {
      logger.info(
        "COMMAND",
        `Blocked verified user ${interaction.user.tag} from changing link.`,
      );
      return interaction.editReply({
        content: `You are already verified as **${result.username}**! ✅\nIf you wish to change your linked account, please contact **myksmyks@KELTournaments**.`,
      });
    }
    if (result.status === "user_not_found") {
      return interaction.editReply("User not found on osu!.");
    }
    if (result.status === "delivery_failed") {
      return interaction.editReply(
        "The osu! account was found, but the verification message could not be delivered. Please try again.",
      );
    }
    if (result.status === "busy") {
      return interaction.editReply(
        "A verification action is already running. Please try again shortly.",
      );
    }

    return interaction.editReply({
      content:
        result.status === "pending"
          ? `A code is already active for **${result.username}**. Check your osu! messages.`
          : `Sent a code to **${result.username}** in-game. Check your messages, then enter it below or run \`/verifyosu\`.`,
      components: createEnterCodeComponents(discordId),
    });
  },
};
