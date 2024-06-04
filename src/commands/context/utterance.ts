import { Command } from "@sapphire/framework";
import { config } from "@src/config";
import {
	ActionRowBuilder,
	ApplicationCommandType,
	Message,
	type MessageComponentInteraction,
	type MessageContextMenuCommandInteraction,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
} from "discord.js";
import type { WitIntent } from "node-wit";

export class UtteranceCommand extends Command {
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
				new StringSelectMenuBuilder().setCustomId("select_intent").addOptions(
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

				if (confirmation.customId === "select_intent") {
					const intent = intents.find(
						(intent) => intent.name === confirmation.values[0],
					);
					if (!intent) return await res.delete();

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

					await confirmation.update({ content: 'Training intent classifier with selected message.', components: [] });
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
				.setName("Train Phrase")
				.setType(ApplicationCommandType.Message)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
		);
	}
}
