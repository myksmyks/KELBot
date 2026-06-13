const { config } = require("../../src/config");
const {
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
});
