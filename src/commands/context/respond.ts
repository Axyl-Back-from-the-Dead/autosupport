import { Command } from "@sapphire/framework";
import { config, responseCache } from "@src/config";
import {
	ActionRowBuilder,
	ApplicationCommandType,
	Collection,
	Message,
	type MessageComponentInteraction,
	type MessageContextMenuCommandInteraction,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
} from "discord.js";
import type { WitIntent } from "node-wit";

export class ResponseCommand extends Command {
	public override async contextMenuRun(
		interaction: MessageContextMenuCommandInteraction,
	) {
		try {
			if (
				!interaction.isMessageContextMenuCommand &&
				!(interaction.targetMessage instanceof Message)
			)
				return;
			if (!interaction.targetMessage.inGuild()) return;

			const intents = (await fetch("https://api.wit.ai/intents", {
				headers: {
					Authorization: `Bearer ${config.witAiServerToken[
						config.devGuildId ? Object.keys(config.witAiServerToken)[0] : interaction.targetMessage.guildId
					]}`
				},
			}).then((res) => res.json())) as WitIntent[];

			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder().setCustomId("select_response").addOptions(
					intents.map((intent) => ({
						label: intent.name,
						value: intent.name,
					})),
				),
			);

			const res = await interaction.reply({
				components: [row],
				ephemeral: true,
			});

			const collectorFilter = (i: MessageComponentInteraction) =>
				i.user.id === interaction.user.id;
			try {
				const confirmation = await res.awaitMessageComponent({
					filter: collectorFilter,
					time: 10_000,
				});
				if (!confirmation.isStringSelectMenu()) return await res.delete();

				if (confirmation.customId === "select_response") {
					const intent = intents.find(
						(intent) => intent.name === confirmation.values[0],
					);
					if (!intent) return await res.delete();
					await res.delete();
					if (!interaction.inCachedGuild()) return;

					let responseContent = '';
					const aggregatedResponses = new Collection<string, string>();

					if (config.devGuildId) {
						for (const [, guildResponses] of responseCache) {
							if (guildResponses) {
								for (const [key, value] of guildResponses.values) {
									aggregatedResponses.set(key, value);
								}
							}
						}

						responseContent = aggregatedResponses.get(intent.name) ?? '';
					} else {
						const guildResponses = responseCache.get(interaction.guildId);
						if (guildResponses) {
							responseContent = guildResponses.values.get(intent.name) ?? '';
						}
					}

					await interaction.targetMessage.reply({
						content: `${responseContent?.trim()}\n-# sent manually by ${interaction.user}`,
						allowedMentions: { repliedUser: true },
					});

					await fetch("https://api.wit.ai/utterances", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${config.witAiServerToken[
								config.devGuildId ? Object.keys(config.witAiServerToken)[0] : interaction.targetMessage.guildId
							]}`
						},
						body: JSON.stringify([
							{
								text: interaction.targetMessage.content,
								intent: intent.name,
								entities: [],
								traits: [],
							},
						]),
					});
				}
			} catch (ex) {
				await res.delete();
			}
		} catch (ex) {
			this.container.logger.error(ex);
		}
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerContextMenuCommand((builder) =>
			builder //
				.setName("Send Response")
				.setType(ApplicationCommandType.Message)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
		);
	}
}
