
const { log } = require('./utils');
const config = require('../config');

async function getUniqloItem(itemId) {
    log(`Fetching item ${itemId}`)
    const url = await fetch(`${config.uniqloApiUrl}/products/${itemId}`, {
        headers: {
            'x-fr-clientid': 'uq.au.web-spa'
        }
    });
    let response = null;
    try {
        response = await url.json();
    } catch (e) {
        log("Error, failed to parse to json", itemId)
        return []
    }
    
    if(response.status === 'nok') {
        log("NOK", itemId)
        return []
    }
    
    // Handle both array and direct object response structures
    if(Array.isArray(response.result.items)) {
        // Old API structure - items is an array
        if(response.result.items.length === 0) {
            log("0", itemId)
            return []
        }
        return response.result.items[0];
    } else {
        // New API structure - items is a direct object
        if(!response.result.items) {
            log("No items found", itemId)
            return []
        }
        return response.result.items;
    }
}
// getlatestprice
async function getLatestPrices(itemId) {
    const item = await getUniqloItem(itemId);
    if(Array.isArray(item) && item.length === 0) {
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