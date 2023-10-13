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
            const response = await fetch(imageURL);
            return await response.arrayBuffer();;
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

module.exports = { log, error, imageAttachment }