const axios = require('axios');
const { log } = require('./utils');


async function getUniqloItem(itemId) {
    const config = require('../config');
    const response = await axios.get(`${config.uniqloApiUrl}/products/${itemId}`);
    return response.data.result.items[0];
}
// getlatestprice
async function getLatestPrices(itemId) {

    const item = await getUniqloItem(itemId);
    const basePrice = item.prices.base.value;
    const promoPrice = item.prices.promo ? item.prices.promo.value : null;
    return { basePrice, promoPrice };
}


const insertPrice = async (client, itemId, basePrice, promoPrice, title, imageURL) => {
    const config = require('../config');
    const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
    const timestamp = new Date();
    await uniqloCollection.updateOne({ itemId, title }, {
        $push: { prices: { timestamp, basePrice, promoPrice } },
        $set: { lastUpdated: timestamp, imageURL },
    }, { upsert: true });
};
module.exports = { getUniqloItem, insertPrice, getLatestPrices };