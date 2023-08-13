import TOML from '@ltd/j-toml';
import pkg from 'node-wit';
import { Collection, Message } from 'discord.js';
import { readFileSync } from 'node:fs';
import { request } from 'undici';
import { config } from 'dotenv';

config();

const { Wit } = pkg;
const { WIT_AI_TOKEN, UPDATE_URL } = process.env;

interface ConfigObject {
	title: string;
	responses: Record<string, string>;
}

const configStore = TOML.parse(readFileSync('./src/config.toml', 'utf8')) as unknown as ConfigObject;
const responseCache = new Collection<string, string>();

for (const [key, value] of Object.entries(configStore.responses)) {
	responseCache.set(key, value);
}

export async function updateCacheFromRemote() {
	const res = await request(UPDATE_URL!)
		.then((res) => res.body.text())
		.catch(() => null);

	if (!res) return;

	const config = TOML.parse(res) as unknown as ConfigObject;

	for (const [key, value] of Object.entries(config.responses)) {
		responseCache.set(key, value);
	}
}

const wit = new Wit({
	accessToken: WIT_AI_TOKEN!
});

export async function getResponse(message: Message) {
	const res = await wit.message(message.content, {});

	if (!res.intents.length) return;
	await message.channel.sendTyping();
	const intent = res.intents.reduce((prev, current) => (prev.confidence > current.confidence ? prev : current));
	return responseCache.get(intent.name);
}
