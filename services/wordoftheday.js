const { WebhookClient } = require('discord.js');
const config = require('../config.json');
const { error, log } = require('../utils/utils');

// Discord embed limits: https://discord.com/developers/docs/resources/message#embed-object
const LIMITS = {
	title: 256,
	fieldName: 256,
	fieldValue: 1024,
	footer: 2048,
	fieldsPerEmbed: 25,
	totalChars: 6000,
};

function truncate(text, max) {
	const value = String(text ?? '').trim() || '\u200b';
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function field(name, value, inline = false) {
	return {
		name: truncate(name, LIMITS.fieldName),
		value: truncate(value, LIMITS.fieldValue),
		inline,
	};
}

function embedCharCount(embed) {
	let total = 0;
	if (embed.title) total += embed.title.length;
	if (embed.description) total += embed.description.length;
	if (embed.footer?.text) total += embed.footer.text.length;
	if (embed.author?.name) total += embed.author.name.length;
	for (const f of embed.fields || []) {
		total += (f.name?.length || 0) + (f.value?.length || 0);
	}
	return total;
}

function trimFieldsToLimit(fields, maxFields = LIMITS.fieldsPerEmbed) {
	const trimmed = fields.slice(0, maxFields);
	// Avoid ending on a spacer-only field
	while (trimmed.length && trimmed[trimmed.length - 1].name === '\u200b') {
		trimmed.pop();
	}
	return trimmed;
}

function createDefinitions(data) {
	const fields = [];
	const definitions = Array.isArray(data.definitions) ? data.definitions : [];

	for (const def of definitions) {
		// Each definition uses up to 4 fields; stop before exceeding 25
		if (fields.length + 4 > LIMITS.fieldsPerEmbed) break;

		fields.push(
			field('Source', def.source || 'Unknown', true),
			field('PartOfSpeech', def.partOfSpeech || 'n/a', true),
			field('Text', def.text || 'No definition provided.', true),
			field('\u200b', '\u200b', false),
		);
	}

	if (data.note && fields.length < LIMITS.fieldsPerEmbed) {
		fields.push(field('Note', data.note, false));
	}

	return trimFieldsToLimit(fields);
}

function createExamples(examples) {
	const fields = [];
	const list = Array.isArray(examples) ? examples : [];

	for (const example of list) {
		if (fields.length + 3 > LIMITS.fieldsPerEmbed) break;

		const title = example.title || 'Source';
		const url = example.url;
		const sourceValue = url ? `[${title}](${url})` : title;

		fields.push(
			field('Source', sourceValue, true),
			field('Text', example.text || 'No example provided.', true),
			field('\u200b', '\u200b', false),
		);
	}

	return trimFieldsToLimit(fields);
}

function buildEmbeds(data) {
	const wordTitle = truncate(
		(data.word || 'Word').charAt(0).toUpperCase() + (data.word || 'word').slice(1),
		LIMITS.title,
	);
	const footer = { text: truncate('Powered by BM64', LIMITS.footer) };

	const word = {
		title: wordTitle,
		url: data.url || undefined,
		color: 0x7289da,
		footer,
	};

	const definitions = {
		title: truncate(`${wordTitle} Definitions`, LIMITS.title),
		color: 0x7289da,
		fields: createDefinitions(data),
		footer,
	};

	const examples = {
		title: truncate(`${wordTitle} Examples`, LIMITS.title),
		color: 0x7289da,
		fields: createExamples(data.examples),
		timestamp: new Date().toISOString(),
		footer,
	};

	// Drop empty field embeds; keep at least the word title embed
	const embeds = [word];
	if (definitions.fields.length) embeds.push(definitions);
	if (examples.fields.length) embeds.push(examples);

	// Discord: max 6000 characters across all embeds in one message
	while (embeds.length > 1) {
		const total = embeds.reduce((sum, embed) => sum + embedCharCount(embed), 0);
		if (total <= LIMITS.totalChars) break;
		embeds.pop();
	}

	return embeds;
}

const wordOfTheDayService = async (client) => {
	try {
		const response = await fetch(
			`https://api.wordnik.com/v4/words.json/wordOfTheDay?api_key=${config.wordofDayKey}`,
		);
		if (!response.ok) {
			throw new Error(`Wordnik API returned ${response.status}`);
		}

		const data = await response.json();
		if (!data?.word) {
			throw new Error('Wordnik response missing word');
		}

		const channel = client.channels.cache.find((c) => c.name === '💬word-of-the-day💬');
		if (!channel) return;

		const webhooks = await channel.fetchWebhooks();
		if (webhooks.size === 0) return;

		const first = webhooks.first();
		const webhook = new WebhookClient({ id: first.id, token: first.token });
		const embeds = buildEmbeds(data);

		await webhook.send({ embeds });
		log(`Word of the day posted: ${data.word}`);
	} catch (e) {
		error('Error posting word of the day:', e);
	}
};

module.exports = { wordOfTheDayService };
