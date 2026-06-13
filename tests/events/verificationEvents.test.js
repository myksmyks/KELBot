const { config } = require("../../src/config");
const {
  CODE_MODAL_PREFIX,
  START_BUTTON_PREFIX,
  handleGuildMemberAdd,
  handleVerificationInteraction,
} = require("../../src/events/verificationEvents");

describe("Verification Events", () => {
  test("sends a member-owned welcome verification button", async () => {
    const originalChannelId = config.discord.welcomeChannelId;
    config.discord.welcomeChannelId = "welcome-channel";
    const send = jest.fn().mockResolvedValue(true);
    const member = {
      id: "discord-1",
      user: { bot: false },
      guild: {
        channels: {
          fetch: jest.fn().mockResolvedValue({
            isTextBased: () => true,
            send,
          }),
        },
      },
    };

    await handleGuildMemberAdd(member);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("<@discord-1>"),
        allowedMentions: { users: ["discord-1"] },
      }),
    );
    const payload = send.mock.calls[0][0];
    expect(payload.components[0].toJSON().components[0].custom_id).toBe(
      `${START_BUTTON_PREFIX}discord-1`,
    );
    config.discord.welcomeChannelId = originalChannelId;
  });

  test("rejects another member using someone else's welcome button", async () => {
    const interaction = {
      customId: `${START_BUTTON_PREFIX}discord-1`,
      user: { id: "discord-2" },
      isButton: () => true,
      isModalSubmit: () => false,
      reply: jest.fn().mockResolvedValue(true),
    };

    const handled = await handleVerificationInteraction(interaction);

    expect(handled).toBe(true);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("another server member"),
        ephemeral: true,
      }),
    );
  });

  test("publishes successful verification as a public message", async () => {
    const interaction = {
      customId: `${CODE_MODAL_PREFIX}discord-1`,
      user: { id: "discord-1" },
      member: {
        roles: { add: jest.fn().mockResolvedValue(true) },
        setNickname: jest.fn().mockResolvedValue(true),
      },
      guild: { name: "Tournament Server" },
      fields: {
        getTextInputValue: jest.fn().mockReturnValue("12345678"),
      },
      isButton: () => false,
      isModalSubmit: () => true,
      inGuild: () => true,
      deferReply: jest.fn().mockResolvedValue(true),
      followUp: jest.fn().mockResolvedValue(true),
      deleteReply: jest.fn().mockResolvedValue(true),
    };
    global.mockDb.get.mockResolvedValueOnce({
      discord_id: "discord-1",
      osu_username: "Player",
      verification_code: "12345678",
      is_verified: 0,
    });
    global.mockDb.run.mockResolvedValueOnce({ changes: 1 });

    await handleVerificationInteraction(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: false }),
    );
    expect(interaction.deleteReply).toHaveBeenCalled();
  });
});
