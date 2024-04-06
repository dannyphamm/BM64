const { EmbedBuilder } = require('@discordjs/builders');
const config = require('../config.json');
const { log, error } = require('../utils/utils');
const { AttachmentBuilder } = require('discord.js');
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (config.mode !== 'DEV') {
            if (message.author.bot) return;
            if (message.type !== 0) return;
            //if (message.channel.id !== config['5headTextChannel']) return
            if (message.channel.type === 11 && message.channel.id === config['5headTextChannel']) {
                const body = {
                    "model": "gpt-4",
                    "messages": [
                        {
                            "role": "user",
                            "content": message.content // Use the content of the message
                        }
                    ],
                    "temperature": 0.7
                };
                const reply = await message.reply('Generating response...');
                try {
                    const response = await fetch(config['5headAPI'] + '/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });
                    const data = await response.json();
                    const content = data.choices[0].message.content;
                    const chunks = content.match(/[\s\S]{1,1990}/g);
                    // Edit the initial reply with the first chunk
                    await reply.edit(`\`\`\`${chunks[0]}\`\`\``);
                    // Send the remaining chunks as new messages
                    for (let i = 1; i < chunks.length; i++) {
                        await message.channel.send(`\`\`\`${chunks[i]}\`\`\``);
                    }
                } catch (e) {
                    error('Failed to call 5HeadAPI:', e);
                    // Handle the error...
                    await reply.edit('Failed to generate');
                }
            }

            if (message.channel.type === 11 && message.channel.id === config['5headImageChannel']) {
                const body = {
                    "prompt": message.content, // Use the content of the message
                    "size": "512x512"
                };
                const reply = await message.reply('Generating response...');
                try {
                    const response = await fetch(config['5headAPI'] + '/v1/images/generations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });
                    const data = await response.json();
                    console.log(data)
                    const imageUrl = data.data[0].url;
                    const attachment = new AttachmentBuilder(imageUrl);
                    await reply.edit({ content: 'Here is your image:', files: [attachment] });
                } catch (e) {
                    error('Failed to call 5HeadAPI:', e);
                    // Handle the error...
                    await reply.edit('Failed to generate');
                }
            }
        }
    },
};