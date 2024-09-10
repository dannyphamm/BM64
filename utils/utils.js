const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const config = require('../config');
const { AttachmentBuilder } = require('discord.js');
const log = (...message) => {
    let date = new Date().toLocaleString([], { dateStyle: 'long', timeStyle: 'long' });
    return console.log(date, ...message)
}
const error = (...message) => {
    let date = new Date().toLocaleString([], { dateStyle: 'long', timeStyle: 'long' });
    return console.error(date, ...message)
}

async function imageAttachment(images, name) {
    if (images.length === 0) return null
    const gridSize = Math.ceil(Math.sqrt(images.length));
    const gridWidth = gridSize * 400;
    const gridHeight = gridSize * 400;
    const imageBuffers = await Promise.all(images.map(async (imageURL) => {
        try {
            const response = await fetch(imageURL).then(response =>
                response.arrayBuffer());
            return response;
        } catch (e) {
            const notfound = createCanvas(400, 400);
            const ctx = notfound.getContext('2d');
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = 'red';
            ctx.textAlign = 'center';
            ctx.fillText('Image not available', notfound.width / 2, notfound.height / 2);
            // Convert the canvas to a buffer
            return notfound.toBuffer('image/png');
        }
    }));
    const canvas = createCanvas(gridWidth, gridHeight);
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < imageBuffers.length; i++) {
        const img = await loadImage(Buffer.from(imageBuffers[i]));
        const x = (i % gridSize) * 400;
        const y = Math.floor(i / gridSize) * 400;
        ctx.drawImage(img, x, y, 400, 400);
    }

    const attachment = await new AttachmentBuilder(canvas.toBuffer('image/png'), { name: name + '.png' });
    return attachment
}

const pricePrecision = (price) => {
    return `$${parseFloat(price).toFixed(2)}`
}


async function fetchAllMessages(channel) {
    let allMessages = [];
    let lastMessageId = null;
    let fetchMore = true;

    while (fetchMore) {
        const options = { limit: 100 };
        if (lastMessageId) {
            options.before = lastMessageId;
        }

        const messages = await channel.messages.fetch(options);
        allMessages = allMessages.concat(Array.from(messages.values()));
        lastMessageId = messages.last()?.id;

        if (messages.size < 100) {
            fetchMore = false;
        }
    }

    return allMessages;
}

async function fetchMessagesWithCriteria(channel, itemId, limit = 1000) {
    let allMessages = [];
    let lastMessageId = null;
    let fetchMore = true;
    let fetchedCount = 0;

    while (fetchMore && fetchedCount < limit) {
        const options = { limit: 100 };
        if (lastMessageId) {
            options.before = lastMessageId;
        }

        const messages = await channel.messages.fetch(options);
        allMessages = allMessages.concat(Array.from(messages.values()));
        lastMessageId = messages.last()?.id;
        fetchedCount += messages.size;

        if (messages.size < 100) {
            fetchMore = false;
        }
    }

    return allMessages.filter(message => {
        for (const embed of message.embeds) {
            if (embed.title && embed.title.startsWith('Added items')) {
                const description = embed.description;
                if (!description) continue; // Skip if description is undefined

                const regex = /\*\*\[(.*?)\]\((.*?)\)\*\*\s*Base:\s*\$(\d+\.\d+)\s*Promo:\s*\$(\d+\.\d+)/g;
                let match;
                while ((match = regex.exec(description)) !== null) {
                    if (match[2].includes(itemId)) {
                        return true;
                    }
                }
            }
        }
        return false;
    });
}

module.exports = { log, error, imageAttachment, pricePrecision, fetchAllMessages, fetchMessagesWithCriteria }