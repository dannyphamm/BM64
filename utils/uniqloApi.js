const axios = require('axios');
const { log } = require('./utils');
const config = require('../config');

async function getUniqloItem(itemId) {
<<<<<<< HEAD
    log(`Fetching item ${itemId}`)
=======
>>>>>>> b8e183dfa399915e8b7533769335a1759cacb075
    const response = await axios.get(`${config.uniqloApiUrl}/products/${itemId}`);
    if(response.data.result.items.length === 0) {
        return []
    }
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
    const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
    const timestamp = new Date();
    await uniqloCollection.updateOne({ itemId, title }, {
        $push: { prices: { timestamp, basePrice, promoPrice } },
        $set: { lastUpdated: timestamp, imageURL },
    }, { upsert: true });
};
module.exports = { getUniqloItem, insertPrice, getLatestPrices };