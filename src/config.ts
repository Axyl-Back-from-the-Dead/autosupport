import data from "@src/data.toml";
import { Collection } from "discord.js";
import { createConfigLoader } from "neat-config";
import { z } from "zod";
import { addIntent, witIntents } from "@utils/wit";

const configSchema = z.object({
	discordToken: z
		.string()
		.regex(/^([MN][\w-]{23,25})\.([\w-]{6})\.([\w-]{27,39})$/),
	devGuildId: z.string().regex(/^(?<id>\d{17,20})$/).optional(),
	witAiServerToken: z.record(z.string().regex(/^(?<id>\d{17,20})$/), z.string().regex(/^[A-Z0-9]{32}$/)),
});

export const config = createConfigLoader()
	.addFromFile(".env")
	.addFromEnvironment()
	.addZodSchema(configSchema)
	.load();

function validateConfig(data: unknown) {
	const parsed = configSchema.parse(data);
	if (parsed.devGuildId && !Object.keys(parsed.witAiServerToken).includes(parsed.devGuildId)) {
		throw new z.ZodError([
			{
				path: ['witAiServerToken'],
				message: 'if devGuildId is set, it must be a key in witAiServerToken',
				code: z.ZodIssueCode.custom,
			},
		]);
	}
}

validateConfig(config);
const tomlSchema = z.record(z.string().regex(/^(?<id>\d{17,20})$/), z.record(z.string().regex(/^(?!\d)[a-zA-Z0-9_]+$/), z.string()))
tomlSchema.parse(data);

export const responseCache = new Collection<string, Collection<string, string>>();

for (const [key, value] of Object.entries(data)) {
	const values = new Collection<string, string>();

	for (const [responseKey, responseValue] of Object.entries(value)) {
		values.set(responseKey, responseValue);
	}

	responseCache.set(key, values);
}

for (const [guildId, responses] of responseCache) {
	const intents = await witIntents(config.witAiServerToken[config.devGuildId ?? guildId]);

	for (const intentName of responses.keys()) {
		const intent = intents.find((intent) => intent.name === intentName);
		if (!intent) {
			await addIntent(intentName, config.witAiServerToken[config.devGuildId ?? guildId]);
		}
	}
}