const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { config } = require("../config");
const logger = require("./logger");

const ENTER_CODE_BUTTON_PREFIX = "osu_verify_code:";

function createEnterCodeComponents(discordId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ENTER_CODE_BUTTON_PREFIX}${discordId}`)
        .setLabel("Enter verification code")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function countryCodeToFlag(countryCode) {
  if (!/^[A-Z]{2}$/i.test(countryCode || "")) return "🌐";
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((character) => 127397 + character.charCodeAt(0)),
  );
}

function formatRank(rank) {
  return Number.isFinite(rank)
    ? `#${rank.toLocaleString("en-US")}`
    : "Unranked";
}

function formatPp(pp) {
  return Number.isFinite(pp)
    ? `${Math.round(pp).toLocaleString("en-US")}pp`
    : "N/A";
}

function createVerifiedEmbed(guildName, username, osuUser) {
  const statistics = osuUser?.statistics || {};
  const countryCode = osuUser?.country_code;
  const profileUrl = osuUser?.id
    ? `https://osu.ppy.sh/users/${osuUser.id}`
    : `https://osu.ppy.sh/users/${encodeURIComponent(username)}`;

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`✅ You are verified, ${username}`)
    .setDescription(`Welcome to **${guildName}**`)
    .addFields(
      {
        name: "osu! profile",
        value: `[${username}](${profileUrl})`,
      },
      {
        name: "Ranks",
        value: [
          `osu! 🌎 ${formatRank(statistics.global_rank)} (${formatPp(statistics.pp)})`,
          `osu! ${countryCodeToFlag(countryCode)} ${formatRank(statistics.country_rank)}`,
        ].join("\n"),
      },
    );
}

async function getGuildMember(interaction) {
  if (!interaction.inGuild()) return null;
  if (interaction.member?.roles?.add) return interaction.member;
  return interaction.guild.members.fetch(interaction.user.id);
}

async function applyVerifiedMemberState(interaction, verification) {
  const warnings = [];
  let member = null;
  try {
    member = await getGuildMember(interaction);
  } catch (error) {
    warnings.push(
      "I could not load your server membership to update your role or nickname.",
    );
    logger.warn(
      "VERIFICATION",
      `Could not fetch guild member ${interaction.user.id}: ${error.message}`,
    );
  }

  if (!member) {
    if (warnings.length === 0) {
      warnings.push(
        "Server role and nickname updates were skipped outside a server.",
      );
    }
  } else {
    if (config.discord.verifiedRoleId) {
      try {
        await member.roles.add(
          config.discord.verifiedRoleId,
          "Completed osu! account verification",
        );
      } catch (error) {
        warnings.push(
          "I could not grant the verified role. Please contact a server administrator.",
        );
        logger.warn(
          "VERIFICATION",
          `Could not grant verified role to ${interaction.user.id}: ${error.message}`,
        );
      }
    } else {
      warnings.push(
        "The verified role is not configured. Please contact a server administrator.",
      );
    }

    try {
      await member.setNickname(
        verification.username,
        "Matched nickname to verified osu! account",
      );
    } catch (error) {
      warnings.push(
        "I could not change your nickname because of Discord permissions or role hierarchy.",
      );
      logger.warn(
        "VERIFICATION",
        `Could not update nickname for ${interaction.user.id}: ${error.message}`,
      );
    }
  }

  return {
    embeds: [
      createVerifiedEmbed(
        interaction.guild?.name || "this server",
        verification.username,
        verification.osuUser,
      ),
    ],
    content: warnings.length > 0 ? warnings.join("\n") : undefined,
    components: [],
  };
}

module.exports = {
  ENTER_CODE_BUTTON_PREFIX,
  applyVerifiedMemberState,
  createEnterCodeComponents,
  createVerifiedEmbed,
};
