const axios = require('axios');
const { log } = require('./utils');
const config = require('../config');

async function getUniqloItem(itemId) {
    log(`Fetching item ${itemId}`)
    const response = await axios.get(`${config.uniqloApiUrl}/products/${itemId}`);
    if(response.data.status === 'nok') {
        return []
    }
    if(response.data.result.items.length === 0) {
        return []
    }
    return response.data.result.items[0];
}
// getlatestprice
async function getLatestPrices(itemId) {
    const item = await getUniqloItem(itemId);
    if(item.length === 0) {
        return {basePrice: null, promoPrice: null}
    }
    const basePrice = item.prices.base.value;
    const promoPrice = item.prices.promo ? item.prices.promo.value : null;
    return { basePrice, promoPrice };
}


const insertPrice = async (client, itemId, basePrice, promoPrice, title, imageURL) => {
    const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
    const timestamp = new Date();
    await uniqloCollection.updateOne({ itemId, title }, {
        $push: { prices: { timestamp, basePrice, promoPrice } },
        $set: { lastUpdated: timestamp, imageURL },
    }, { upsert: true });
};
module.exports = { getUniqloItem, insertPrice, getLatestPrices };