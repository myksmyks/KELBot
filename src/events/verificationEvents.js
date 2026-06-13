const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { config } = require("../config");
const {
  applyVerifiedMemberState,
  createEnterCodeComponents,
  ENTER_CODE_BUTTON_PREFIX,
} = require("../services/discordVerificationService");
const {
  completeVerification,
  getVerificationSession,
  startVerification,
} = require("../services/verificationService");
const logger = require("../services/logger");

const START_BUTTON_PREFIX = "osu_verify_start:";
const USERNAME_MODAL_PREFIX = "osu_verify_username:";
const CODE_MODAL_PREFIX = "osu_verify_code_modal:";

function ownedCustomId(prefix, discordId) {
  return `${prefix}${discordId}`;
}

function getOwnerId(customId, prefix) {
  return customId.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function createWelcomeComponents(discordId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(ownedCustomId(START_BUTTON_PREFIX, discordId))
        .setLabel("Verify with osu!")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

function createUsernameModal(discordId) {
  return new ModalBuilder()
    .setCustomId(ownedCustomId(USERNAME_MODAL_PREFIX, discordId))
    .setTitle("Verify your osu! account")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("osu_username")
          .setLabel("osu! username")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32),
      ),
    );
}

function createCodeModal(discordId) {
  return new ModalBuilder()
    .setCustomId(ownedCustomId(CODE_MODAL_PREFIX, discordId))
    .setTitle("Enter your verification code")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("verification_code")
          .setLabel("Code from the osu! bot message")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(8)
          .setMaxLength(8),
      ),
    );
}

async function handleGuildMemberAdd(member) {
  if (member.user.bot || !config.discord.welcomeChannelId) return;

  try {
    const channel = await member.guild.channels.fetch(
      config.discord.welcomeChannelId,
    );
    if (!channel?.isTextBased()) {
      logger.warn(
        "VERIFICATION",
        "Configured welcome channel is missing or is not text-based.",
      );
      return;
    }

    await channel.send({
      content: `<@${member.id}> Welcome to the server!\nTo get access to the channels, click the button below and complete osu! verification.`,
      components: createWelcomeComponents(member.id),
      allowedMentions: { users: [member.id] },
    });
  } catch (error) {
    logger.error(
      "VERIFICATION",
      `Could not send welcome verification message for ${member.id}`,
      error,
    );
  }
}

async function rejectWrongUser(interaction, ownerId) {
  if (ownerId === interaction.user.id) return false;
  await interaction.reply({
    content: "This verification button belongs to another server member.",
    ephemeral: true,
  });
  return true;
}

async function handleStartButton(interaction) {
  const ownerId = getOwnerId(interaction.customId, START_BUTTON_PREFIX);
  if (!ownerId || (await rejectWrongUser(interaction, ownerId))) return true;

  const session = await getVerificationSession(ownerId);
  if (session?.is_verified === 1) {
    await interaction.reply({
      content: `You are already verified as **${session.osu_username}**.`,
      ephemeral: true,
    });
  } else if (session?.verification_code) {
    await interaction.reply({
      content: `A verification code is already active for **${session.osu_username}**. Check your osu! messages and enter it below.`,
      components: createEnterCodeComponents(ownerId),
      ephemeral: true,
    });
  } else {
    await interaction.showModal(createUsernameModal(ownerId));
  }
  return true;
}

async function handleUsernameModal(interaction) {
  const ownerId = getOwnerId(interaction.customId, USERNAME_MODAL_PREFIX);
  if (!ownerId || (await rejectWrongUser(interaction, ownerId))) return true;

  await interaction.deferReply({ ephemeral: true });
  const result = await startVerification(
    ownerId,
    interaction.fields.getTextInputValue("osu_username"),
  );

  const messages = {
    already_verified: `You are already verified as **${result.username}**.`,
    busy: "A verification action is already running. Please try again shortly.",
    delivery_failed:
      "I found that osu! account, but could not deliver the Bancho message. Please check the username and try again.",
    invalid_username: "Please enter a valid osu! username.",
    user_not_found: "That osu! user could not be found.",
  };

  if (result.status === "started" || result.status === "pending") {
    await interaction.editReply({
      content: `A code was sent to **${result.username}** through osu! private messages. Enter it below, or use \`/verifyosu\`.`,
      components: createEnterCodeComponents(ownerId),
    });
  } else {
    await interaction.editReply(messages[result.status] || "Verification failed.");
  }
  return true;
}

async function handleCodeButton(interaction) {
  const ownerId = getOwnerId(interaction.customId, ENTER_CODE_BUTTON_PREFIX);
  if (!ownerId || (await rejectWrongUser(interaction, ownerId))) return true;
  await interaction.showModal(createCodeModal(ownerId));
  return true;
}

async function handleCodeModal(interaction) {
  const ownerId = getOwnerId(interaction.customId, CODE_MODAL_PREFIX);
  if (!ownerId || (await rejectWrongUser(interaction, ownerId))) return true;

  await interaction.deferReply({ ephemeral: true });
  const result = await completeVerification(
    ownerId,
    interaction.fields.getTextInputValue("verification_code"),
  );

  if (result.status === "verified") {
    await interaction.editReply(
      await applyVerifiedMemberState(interaction, result),
    );
  } else {
    const messages = {
      already_verified: `You are already verified as **${result.username}**.`,
      busy: "A verification action is already running. Please try again shortly.",
      incorrect_code: "That verification code is incorrect.",
      no_pending:
        "You do not have an active verification. Use the welcome button or `/osuset` first.",
    };
    await interaction.editReply(messages[result.status] || "Verification failed.");
  }
  return true;
}

async function handleVerificationInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith(START_BUTTON_PREFIX)) {
      return handleStartButton(interaction);
    }
    if (interaction.customId.startsWith(ENTER_CODE_BUTTON_PREFIX)) {
      return handleCodeButton(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith(USERNAME_MODAL_PREFIX)) {
      return handleUsernameModal(interaction);
    }
    if (interaction.customId.startsWith(CODE_MODAL_PREFIX)) {
      return handleCodeModal(interaction);
    }
  }
  return false;
}

module.exports = {
  CODE_MODAL_PREFIX,
  START_BUTTON_PREFIX,
  USERNAME_MODAL_PREFIX,
  createWelcomeComponents,
  handleGuildMemberAdd,
  handleVerificationInteraction,
};
