const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const config = require('../config');
const {AttachmentBuilder} = require('discord.js');
let date = new Date().toLocaleString([], { dateStyle: 'long', timeStyle: 'long' });
const log = (...message) => {
    return console.log(date, ...message)
}
const error = (...message) => {
    return console.error(date, ...message)
}

async function imageAttachment(images, name) {
    if (images.length === 0) return null
    const gridSize = Math.ceil(Math.sqrt(images.length));
    const gridWidth = gridSize * 200;
    const gridHeight = gridSize * 200;
    
    const imageBuffers = await Promise.all(images.map(async (imageURL) => {
        const response = await axios.get(imageURL, { responseType: 'arraybuffer' });
        return response.data;
    }));

    const canvas = createCanvas(gridWidth, gridHeight);
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < imageBuffers.length; i++) {
        const img = await loadImage(Buffer.from(imageBuffers[i]));
        const x = (i % gridSize) * 200;
        const y = Math.floor(i / gridSize) * 200;
        ctx.drawImage(img, x, y, 200, 200);
    }

    const attachment = await new AttachmentBuilder(canvas.toBuffer('image/png'), { name: name + '.png' });
    return attachment
}

module.exports = { log, error, imageAttachment }