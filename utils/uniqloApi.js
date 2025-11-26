
const { log, error } = require('./utils');
const config = require('../config');

// Helper function to sleep/delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cookie jar to store cookies across requests
class CookieJar {
    constructor() {
        this.cookies = new Map();
    }
    
    setCookie(url, setCookieHeader) {
        if (!setCookieHeader) return;
        
        // Parse Set-Cookie header
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        cookies.forEach(cookie => {
            const [nameValue] = cookie.split(';');
            const [name, value] = nameValue.split('=').map(s => s.trim());
            if (name && value) {
                this.cookies.set(name, value);
            }
        });
    }
    
    getCookieString() {
        return Array.from(this.cookies.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }
    
    clear() {
        this.cookies.clear();
    }
}

// Create timeout signal (with fallback for older Node.js versions)
function createTimeoutSignal(timeoutMs) {
    if (typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(timeoutMs);
    }
    // Fallback for older Node.js versions
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
}

// Custom fetch with redirect tracking and QueueIt support
async function fetchWithRedirectTracking(url, options, redirectChain = [], cookieJar = new CookieJar()) {
    const currentUrl = redirectChain.length > 0 ? redirectChain[redirectChain.length - 1] : url;
    
    // Prepare headers with cookies and browser-like user agent
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://www.uniqlo.com/',
        ...options.headers
    };
    
    // Add cookies if we have any
    const cookieString = cookieJar.getCookieString();
    if (cookieString) {
        headers['Cookie'] = cookieString;
    }
    
    const response = await fetch(currentUrl, {
        ...options,
        headers,
        redirect: 'manual',
        signal: createTimeoutSignal(30000)
    });
    
    // Store cookies from response
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
        cookieJar.setCookie(currentUrl, setCookieHeader);
    }
    
    // Check for QueueIt in response
    const contentType = response.headers.get('content-type') || '';
    if ((currentUrl.includes('queue-it') || currentUrl.includes('QueueIt')) && 
        contentType.includes('text/html') && 
        response.status === 200) {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        
        if (text.includes('QueueIt') || text.includes('queue-it')) {
            const redirectMatch = text.match(/window\.location\s*=\s*["']([^"']+)["']/i) || 
                                 text.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
                                 text.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^;]*;\s*url=([^"']+)["']/i);
            
            if (redirectMatch) {
                const redirectUrl = new URL(redirectMatch[1], currentUrl).href;
                redirectChain.push(redirectUrl);
                await sleep(1000);
                return fetchWithRedirectTracking(url, options, redirectChain, cookieJar);
            }
        }
    }
    
    // Check for redirect status codes
    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
            const redirectUrl = new URL(location, currentUrl).href;
            redirectChain.push(redirectUrl);
            
            if (redirectChain.length > 50) {
                const errorChain = [url, ...redirectChain].join(' -> ');
                throw new Error(`Redirect count exceeded (${redirectChain.length} redirects). Full chain: ${errorChain}`);
            }
            
            await sleep(500);
            return fetchWithRedirectTracking(url, options, redirectChain, cookieJar);
        } else {
            throw new Error(`Redirect ${response.status} but no Location header`);
        }
    }
    
    return response;
}

// Retry wrapper with exponential backoff
async function fetchWithRetry(url, options, maxRetries = 3, retryDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithRedirectTracking(url, options);
            
            if (!response.ok && response.status >= 500) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            return response;
        } catch (err) {
            const isLastAttempt = attempt === maxRetries;
            
            if (isLastAttempt) {
                error(`[fetchWithRetry] Failed after ${maxRetries} attempts:`, err.message || err);
                throw err;
            }
            
            const delay = retryDelay * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }
}

async function getUniqloItem(itemId, priceGroup = '01') {
    // Call both APIs in parallel using the specific price group
    let l2sResponse, detailsResponse;
    try {
        [l2sResponse, detailsResponse] = await Promise.all([
            fetchWithRetry(`${config.uniqloApiUrl}/products/${itemId}/price-groups/${priceGroup}/l2s?withPrices=true&withStocks=true&includePreviousPrice=false&httpFailure=true`, {
                headers: {
                    'x-fr-clientid': 'uq.au.web-spa'
                }
            }),
            fetchWithRetry(`${config.uniqloApiUrl}/products/${itemId}/price-groups/${priceGroup}/details?includeModelSize=false&imageRatio=3x4&httpFailure=true`, {
                headers: {
                    'x-fr-clientid': 'uq.au.web-spa'
                }
            })
        ]);
    } catch (err) {
        error(`[getUniqloItem] Fetch failed for itemId=${itemId}:`, err);
        return [];
    }
    
    let l2sData, detailsData;
    try {
        l2sData = await l2sResponse.json();
        detailsData = await detailsResponse.json();
    } catch (e) {
        return []
    }
    
    if(l2sData.status === 'nok' || detailsData.status === 'nok') {
        return []
    }
    
    if(!l2sData.result || !detailsData.result) {
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