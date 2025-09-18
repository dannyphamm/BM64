
const { log } = require('./utils');
const config = require('../config');

async function getUniqloItem(itemId, priceGroup = '01') {
    log(`Fetching item ${itemId} with price group ${priceGroup}`)
    
    // Call both APIs in parallel using the specific price group
    const [l2sResponse, detailsResponse] = await Promise.all([
        fetch(`${config.uniqloApiUrl}/products/${itemId}/price-groups/${priceGroup}/l2s?withPrices=true&withStocks=true&includePreviousPrice=false&httpFailure=true`, {
            headers: {
                'x-fr-clientid': 'uq.au.web-spa'
            }
        }),
        fetch(`${config.uniqloApiUrl}/products/${itemId}/price-groups/${priceGroup}/details?includeModelSize=false&imageRatio=3x4&httpFailure=true`, {
            headers: {
                'x-fr-clientid': 'uq.au.web-spa'
            }
        })
    ]);
    
    let l2sData, detailsData;
    try {
        l2sData = await l2sResponse.json();
        detailsData = await detailsResponse.json();
    } catch (e) {
        log("Error, failed to parse JSON", itemId)
        return []
    }
    
    if(l2sData.status === 'nok' || detailsData.status === 'nok') {
        log("NOK response", itemId)
        return []
    }
    
    if(!l2sData.result || !detailsData.result) {
        log("No result found", itemId)
        return []
    }
    
    // Create lookup maps from details data
    const colorMap = {};
    const sizeMap = {};
    
    if (detailsData.result.colors) {
        detailsData.result.colors.forEach(color => {
            colorMap[color.displayCode] = color.name;
        });
    }
    
    if (detailsData.result.sizes) {
        detailsData.result.sizes.forEach(size => {
            sizeMap[size.displayCode] = size.name;
        });
    }
    
    // Merge the data - enhance l2s with color/size names
    const enhancedL2s = l2sData.result.l2s ? l2sData.result.l2s.map(l2 => ({
        ...l2,
        color: {
            ...l2.color,
            name: colorMap[l2.color.displayCode] || l2.color.displayCode
        },
        size: {
            ...l2.size,
            name: sizeMap[l2.size.displayCode] || l2.size.displayCode
        }
    })) : [];
    
    // Return merged data structure - preserve l2Id-specific prices and stocks from l2s API
    const result = {
        ...detailsData.result,  // Product details (name, images, colors, sizes)
        ...l2sData.result,      // L2s data (l2s, prices keyed by l2Id, stocks keyed by l2Id)
        l2s: enhancedL2s,       // Enhanced l2s with color/size names
        // Keep both pricing structures for flexibility
        overallPrices: detailsData.result.prices  // Overall product pricing
    };
    return result;
}
// getlatestprice
async function getLatestPrices(itemId, priceGroup = '01') {
    const item = await getUniqloItem(itemId, priceGroup);
    if(Array.isArray(item) && item.length === 0) {
        return {basePrice: null, promoPrice: null}
    }
    
    // New API structure: try overall prices first, then fall back to l2Id-specific prices
    if (item.overallPrices && item.overallPrices.base && typeof item.overallPrices.base.value === 'number') {
        // Use overall prices from details API (representative pricing)
        const basePrice = item.overallPrices.base.value;
        const promoPrice = item.overallPrices.promo ? item.overallPrices.promo.value : null;
        return { basePrice, promoPrice };
    }
    
    // Fall back to l2Id-specific prices if overall prices not available
    if (!item.prices || typeof item.prices !== 'object') {
        return {basePrice: null, promoPrice: null}
    }
    
    // Look for l2Id-based pricing structure
    const priceKeys = Object.keys(item.prices).filter(key => key.match(/^\d+$/));
    if (priceKeys.length === 0) {
        return {basePrice: null, promoPrice: null}
    }
    
    // Get the first available price (could be any l2Id/color/size combination)
    const firstPriceKey = priceKeys[0];
    const priceData = item.prices[firstPriceKey];
    
    // Additional null check for priceData
    if (!priceData) {
        return {basePrice: null, promoPrice: null}
    }
    
    const basePrice = priceData.base ? priceData.base.value : null;
    const promoPrice = priceData.promo ? priceData.promo.value : null;
    return { basePrice, promoPrice };
}


const insertPrice = async (client, itemId, basePrice, promoPrice, title, imageURL, priceGroup = '01') => {
    const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
    const timestamp = new Date();
    await uniqloCollection.updateOne({ itemId, title }, {
        $push: { prices: { timestamp, basePrice, promoPrice } },
        $set: { lastUpdated: timestamp, imageURL, priceGroup },
    }, { upsert: true });
};
module.exports = { getUniqloItem, insertPrice, getLatestPrices };