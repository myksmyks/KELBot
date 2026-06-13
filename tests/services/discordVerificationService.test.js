const { config } = require("../../src/config");
const {
  applyVerifiedMemberState,
  createEnterCodeComponents,
  createVerifiedEmbed,
} = require("../../src/services/discordVerificationService");

describe("Discord Verification Service", () => {
  test("creates an owner-specific code button", () => {
    const components = createEnterCodeComponents("discord-1");

    expect(components[0].toJSON().components[0].custom_id).toBe(
      "osu_verify_code:discord-1",
    );
  });

  test("formats real osu! rank data and country flag", () => {
    const embed = createVerifiedEmbed("Tournament Server", "Player", {
      id: 42,
      avatar_url: "https://a.ppy.sh/42",
      country_code: "PL",
      statistics: {
        global_rank: 1234,
        country_rank: 56,
        pp: 9876.4,
      },
    });

    expect(embed.data.title).toBe("✅ You are verified, Player!");
    expect(embed.data.thumbnail.url).toBe("https://a.ppy.sh/42");
    expect(embed.data.fields[0].value).toContain(
      "https://osu.ppy.sh/users/42",
    );
    expect(embed.data.fields[1].value).toContain("🌎 #1,234 (9,876pp)");
    expect(embed.data.fields[1].value).toContain("🇵🇱 #56");
    expect(embed.data.fields[1].value).not.toContain("osu!");
  });

  test("uses clean fallbacks when osu! statistics are unavailable", () => {
    const embed = createVerifiedEmbed("Tournament Server", "Player", null);

    expect(embed.data.fields[1].value).toContain("Unranked (N/A)");
    expect(embed.data.fields[1].value).toContain("🌐 Unranked");
  });

  test("grants the role and changes the nickname after verification", async () => {
    const originalRoleId = config.discord.verifiedRoleId;
    config.discord.verifiedRoleId = "verified-role";
    const member = {
      roles: { add: jest.fn().mockResolvedValue(true) },
      setNickname: jest.fn().mockResolvedValue(true),
    };
    const interaction = {
      user: { id: "discord-1" },
      member,
      guild: { name: "Tournament Server" },
      inGuild: () => true,
    };

    const response = await applyVerifiedMemberState(interaction, {
      username: "Player",
      osuUser: { id: 42 },
    });

    expect(member.roles.add).toHaveBeenCalledWith(
      "verified-role",
      expect.any(String),
    );
    expect(member.setNickname).toHaveBeenCalledWith(
      "Player",
      expect.any(String),
    );
    expect(response.content).toBeUndefined();
    config.discord.verifiedRoleId = originalRoleId;
  });

  test("reports nickname permission failures without losing verification", async () => {
    const originalRoleId = config.discord.verifiedRoleId;
    config.discord.verifiedRoleId = "";
    const interaction = {
      user: { id: "discord-1" },
      member: {
        roles: { add: jest.fn() },
        setNickname: jest
          .fn()
          .mockRejectedValue(new Error("Missing Permissions")),
      },
      guild: { name: "Tournament Server" },
      inGuild: () => true,
    };

    const response = await applyVerifiedMemberState(interaction, {
      username: "Player",
      osuUser: null,
    });

    expect(response.content).toContain("verified role is not configured");
    expect(response.content).toContain("could not change your nickname");
    expect(response.embeds).toHaveLength(1);
    config.discord.verifiedRoleId = originalRoleId;
  });
});
