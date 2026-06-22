const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const db = require('../utils/db');
const { log, error } = require('../utils/utils');
class LoLTracker {
    constructor() {
        this.riotApiKey = config.riotApiKey;
        this.trackedPlayers = new Map();
        this.isRunning = false;
        this.checkInterval = null;
        this.riotApiBaseUrls = {
            'NA': 'https://americas.api.riotgames.com',
            'EUW': 'https://europe.api.riotgames.com',
            'EUNE': 'https://europe.api.riotgames.com',
            'KR': 'https://asia.api.riotgames.com',
            'BR': 'https://americas.api.riotgames.com',
            'LAN': 'https://americas.api.riotgames.com',
            'LAS': 'https://americas.api.riotgames.com',
            'OCE': 'https://sea.api.riotgames.com',
            'TR': 'https://europe.api.riotgames.com',
            'RU': 'https://europe.api.riotgames.com',
            'JP': 'https://asia.api.riotgames.com'
        };
        this.riotApiRegionalUrls = {
            'NA': 'https://na1.api.riotgames.com',
            'EUW': 'https://euw1.api.riotgames.com',
            'EUNE': 'https://eun1.api.riotgames.com',
            'KR': 'https://kr.api.riotgames.com',
            'BR': 'https://br1.api.riotgames.com',
            'LAN': 'https://la1.api.riotgames.com',
            'LAS': 'https://la2.api.riotgames.com',
            'OCE': 'https://oc1.api.riotgames.com',
            'TR': 'https://tr1.api.riotgames.com',
            'RU': 'https://ru.api.riotgames.com',
            'JP': 'https://jp1.api.riotgames.com'
        };
        this.gameModes = {
            0: 'Custom Game',
            400: 'Normal Draft',
            420: 'Ranked Solo/Duo',
            430: 'Normal Blind',
            440: 'Ranked Flex',
            450: 'ARAM',
            700: 'Clash',
            900: 'URF',
            1020: 'One for All',
            1300: 'Nexus Blitz',
            1400: 'Ultimate Spellbook',
            1700: 'Arena'
        };
        this.championNames = {}; // Will be populated on-demand
        this.championNamesPromise = null; // For lazy loading
        this.apiCache = new Map(); // Cache for API responses
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
        this.cacheCleanupInterval = null;
        this.tierOrder = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
        this.divisionOrder = ['IV', 'III', 'II', 'I'];
        this.queueIdToQueueType = {
            420: 'RANKED_SOLO_5x5',
            440: 'RANKED_FLEX_SR'
        };
        this.RANK_CHECK_DELAYS = [15 * 1000, 60 * 1000, 120 * 1000];
    }

    async init() {
        if (!this.riotApiKey) {
            error('❌ Riot API key not configured');
            return false;
        }

        try {
            await db.connect();
            await this.loadTrackedPlayers();
            // Champion names will be loaded on-demand to improve startup time
            log('✅ LoL Tracker initialized');
            return true;
        } catch (e) {
            error('❌ Error initializing LoL Tracker:', e);
            return false;
        }
    }

    async loadTrackedPlayers() {
        try {
            const collection = db.db.collection('lol_tracked_players');
            const players = await collection.find({}).toArray();
            
            this.trackedPlayers.clear();
            for (const player of players) {
                const key = `${player.summonerName}#${player.tag || ''}-${player.region}`;
                this.trackedPlayers.set(key, player);
            }
            
            //log(`📋 Loaded ${this.trackedPlayers.size} tracked players`);
        } catch (e) {
            error('Error loading tracked players:', e);
        }
    }

    async loadChampionNames() {
        if (this.championNamesPromise) {
            return this.championNamesPromise;
        }

        this.championNamesPromise = this._loadChampionNamesInternal();
        return this.championNamesPromise;
    }

    async _loadChampionNamesInternal() {
        try {
            const response = await fetch('https://ddragon.leagueoflegends.com/cdn/14.1.1/data/en_US/champion.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch champion data: ${response.status}`);
            }

            const data = await response.json();

            for (const [key, champion] of Object.entries(data.data)) {
                this.championNames[parseInt(champion.key)] = champion.name;
            }

            log(`✅ Loaded ${Object.keys(this.championNames).length} champion names`);
        } catch (e) {
            error('Error loading champion names:', e);
            // Don't throw - we can still function without champion names
        }
    }

    parseSummonerInput(input) {
        const parts = input.split('#');
        return {
            summonerName: parts[0].trim(),
            tag: parts[1] ? parts[1].trim() : null
        };
    }

    async getSummonerByName(summonerName, tag, region = 'NA') {
        try {
            // If we have a tag, use Account v1 API to get PUUID first
            if (tag) {
                const accountData = await this.getAccountByRiotId(summonerName, tag, region);
                if (!accountData) {
                    return null;
                }
                
                // Now use the PUUID to get summoner data
                return await this.getSummonerByPUUID(accountData.puuid, region);
            }
            
            // Fallback: try to get by summoner name (legacy method)
            const baseUrl = this.riotApiRegionalUrls[region];
            const url = `${baseUrl}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
            //log(url);
            const response = await fetch(url, {
                headers: {
                    'X-Riot-Token': this.riotApiKey
                }
            });

            if (response.ok) {
                return await response.json();
            }

            if (response.status === 404) return null;
            throw new Error(`Riot API error: ${response.status}`);
        } catch (e) {
            error('Error fetching summoner:', e);
            return null;
        }
    }

    async getAccountByRiotId(gameName, tagLine, region = 'NA') {
        try {
            // Always use Americas API for account lookup
            const baseUrl = 'https://americas.api.riotgames.com';
            const url = `${baseUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
            //log(url);
            const response = await fetch(url, {
                headers: {
                    'X-Riot-Token': this.riotApiKey
                }
            });

            if (response.ok) {
                return await response.json();
            }

            if (response.status === 404) return null;
            throw new Error(`Riot API error: ${response.status}`);
        } catch (e) {
            error('Error fetching account by Riot ID:', e);
            return null;
        }
    }

    getQueueTypeFromQueueId(queueId) {
        return this.queueIdToQueueType[queueId] || null;
    }

    formatRank(tier, rank) {
        if (!tier) return 'Unranked';
        const titleTier = tier.charAt(0) + tier.slice(1).toLowerCase();
        if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
            return titleTier;
        }
        return `${titleTier} ${rank}`;
    }

    getRankChange(oldRank, newRank) {
        if (!oldRank?.tier || !newRank?.tier) return null;

        const oldTierIdx = this.tierOrder.indexOf(oldRank.tier);
        const newTierIdx = this.tierOrder.indexOf(newRank.tier);
        if (oldTierIdx === -1 || newTierIdx === -1) return null;

        if (newTierIdx > oldTierIdx) return 'promotion';
        if (newTierIdx < oldTierIdx) return 'demotion';

        if (newTierIdx >= 7) return null;

        const oldDivIdx = this.divisionOrder.indexOf(oldRank.rank);
        const newDivIdx = this.divisionOrder.indexOf(newRank.rank);
        if (oldDivIdx === -1 || newDivIdx === -1) return null;

        if (newDivIdx > oldDivIdx) return 'promotion';
        if (newDivIdx < oldDivIdx) return 'demotion';
        return null;
    }

    calculateLpChange(oldRank, newRank, rankChange) {
        if (!oldRank?.tier || !newRank?.tier) return null;

        const masterPlus = this.tierOrder.indexOf(oldRank.tier) >= 7;
        if (masterPlus) {
            return newRank.leaguePoints - oldRank.leaguePoints;
        }

        if (rankChange === 'promotion') {
            return newRank.leaguePoints - oldRank.leaguePoints + 100;
        }
        if (rankChange === 'demotion') {
            return newRank.leaguePoints - oldRank.leaguePoints - 100;
        }
        return newRank.leaguePoints - oldRank.leaguePoints;
    }

    formatLpChange(lpChange) {
        if (lpChange === null || lpChange === undefined) return '';
        const sign = lpChange > 0 ? '+' : '';
        return ` ${sign}${lpChange} LP`;
    }

    async getLeagueEntries(puuid, region = 'NA', { skipCache = false } = {}) {
        const cacheKey = `league_${puuid}_${region}`;
        if (!skipCache) {
            const cached = this.getCache(cacheKey);
            if (cached) return cached;
        }

        try {
            const baseUrl = this.riotApiRegionalUrls[region];
            const url = `${baseUrl}/lol/league/v4/entries/by-puuid/${puuid}`;

            const response = await fetch(url, {
                headers: {
                    'X-Riot-Token': this.riotApiKey
                }
            });

            if (response.status === 404) return [];
            if (!response.ok) {
                throw new Error(`Riot API error: ${response.status}`);
            }

            const data = await response.json();
            if (!skipCache) {
                this.setCache(cacheKey, data, 60 * 1000);
            }
            return data;
        } catch (e) {
            error('Error fetching league entries:', e);
            return [];
        }
    }

    async getLeagueEntryForQueue(puuid, region, queueType) {
        const entries = await this.getLeagueEntries(puuid, region, { skipCache: true });
        return entries.find(entry => entry.queueType === queueType) || null;
    }

    async fetchRankState(puuid, region) {
        const entries = await this.getLeagueEntries(puuid, region);
        const rankState = {};

        for (const entry of entries) {
            if (entry.queueType === 'RANKED_SOLO_5x5' || entry.queueType === 'RANKED_FLEX_SR') {
                rankState[entry.queueType] = {
                    tier: entry.tier,
                    rank: entry.rank,
                    leaguePoints: entry.leaguePoints
                };
            }
        }

        return rankState;
    }

    async savePlayerRankState(player) {
        const collection = db.db.collection('lol_tracked_players');
        await collection.updateOne(
            {
                summonerName: player.summonerName,
                tag: player.tag,
                region: player.region
            },
            { $set: { rankState: player.rankState || {} } }
        );
    }

    async updatePlayerRank(player, channel, queueType) {
        const displayName = player.tag
            ? `${player.summonerName}#${player.tag}`
            : player.summonerName;
        const oldRank = player.rankState?.[queueType] || null;
        const newEntry = await this.getLeagueEntryForQueue(player.puuid, player.region, queueType);
        const newRank = newEntry
            ? {
                tier: newEntry.tier,
                rank: newEntry.rank,
                leaguePoints: newEntry.leaguePoints
            }
            : null;

        if (!oldRank) {
            if (newRank) {
                if (!player.rankState) player.rankState = {};
                player.rankState[queueType] = newRank;
                await this.savePlayerRankState(player);
            }
            return { rankChange: null, lpChange: null };
        }

        const rankChange = this.getRankChange(oldRank, newRank);
        const lpChange = this.calculateLpChange(oldRank, newRank, rankChange);

        if (rankChange && channel) {
            const rankDisplay = this.formatRank(newRank.tier, newRank.rank);
            const message = rankChange === 'promotion'
                ? `**${displayName}** has promoted to **${rankDisplay}**!`
                : `**${displayName}** has demoted to **${rankDisplay}**!`;
            await channel.send(message);
        }

        if (!player.rankState) player.rankState = {};
        if (newRank) {
            player.rankState[queueType] = newRank;
        } else {
            delete player.rankState[queueType];
        }
        await this.savePlayerRankState(player);

        return { rankChange, lpChange };
    }

    scheduleRankCheck(matchData, channel, players, message) {
        const context = { lpApplied: false };
        for (const delay of this.RANK_CHECK_DELAYS) {
            setTimeout(() => {
                this.checkRankChanges(matchData, channel, players, message, context).catch(e => {
                    error('Error checking rank changes:', e);
                });
            }, delay);
        }
    }

    async forceRankUpdate() {
        const client = global.discordClient;
        if (!client) {
            throw new Error('Discord client not available');
        }

        const results = { promotions: 0, demotions: 0, playersChecked: 0 };
        const queueTypes = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'];

        for (const player of this.getTrackedPlayers()) {
            results.playersChecked++;

            let channel = null;
            try {
                channel = await client.channels.fetch(player.channelId);
            } catch (e) {
                error(`Channel ${player.channelId} not found for ${player.summonerName}:`, e);
            }

            for (const queueType of queueTypes) {
                try {
                    const { rankChange } = await this.updatePlayerRank(player, channel, queueType);
                    if (rankChange === 'promotion') results.promotions++;
                    if (rankChange === 'demotion') results.demotions++;
                } catch (e) {
                    error(`Error checking rank for ${player.summonerName} (${queueType}):`, e);
                }
            }
        }

        return results;
    }

    async forceUpdate() {
        const newGames = await this.checkForNewGames({ force: true });
        const rankResults = await this.forceRankUpdate();
        return { newGames, ...rankResults };
    }

    async checkRankChanges(matchData, channel, players, message, context = {}) {
        const queueType = this.getQueueTypeFromQueueId(matchData.info.queueId);
        if (!queueType) return;

        const lpChanges = {};
        let shouldUpdateEmbed = false;

        for (const player of players) {
            try {
                const { rankChange, lpChange } = await this.updatePlayerRank(player, channel, queueType);
                if (lpChange !== null && (lpChange !== 0 || rankChange)) {
                    lpChanges[player.puuid] = lpChange;
                    shouldUpdateEmbed = true;
                }
            } catch (e) {
                error(`Error checking rank change for ${player.summonerName}:`, e);
            }
        }

        if (shouldUpdateEmbed && message && !context.lpApplied) {
            try {
                const embed = await this.createConsolidatedMatchEmbed(matchData, players, lpChanges);
                await message.edit({ embeds: [embed] });
                context.lpApplied = true;
            } catch (e) {
                error('Error updating match embed with LP:', e);
            }
        }
    }

    async getSummonerByPUUID(puuid, region = 'NA') {
        try {
            const baseUrl = this.riotApiRegionalUrls[region];
            const url = `${baseUrl}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
            
            const response = await fetch(url, {
                headers: {
                    'X-Riot-Token': this.riotApiKey
                }
            });

            if (response.ok) {
                return await response.json();
            }

            if (response.status === 404) return null;
            throw new Error(`Riot API error: ${response.status}`);
        } catch (e) {
            error('Error fetching summoner by PUUID:', e);
            return null;
        }
    }

    async getLastGameId(puuid, region = 'NA') {
        try {
            const baseUrl = this.riotApiBaseUrls[region];
            const url = `${baseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1`;
            //log(url);
            const response = await fetch(url, {
                headers: {
                    'X-Riot-Token': this.riotApiKey
                }
            });

            if (!response.ok) {
                throw new Error(`Riot API error: ${response.status}`);
            }

            const matchIds = await response.json();
            return matchIds.length > 0 ? matchIds[0] : null;
        } catch (e) {
            error('Error fetching last game ID:', e);
            return null;
        }
    }

    async getMatchData(matchId, region = 'NA') {
        try {
            const baseUrl = this.riotApiBaseUrls[region];
            const url = `${baseUrl}/lol/match/v5/matches/${matchId}`;
            //log(url);
            const response = await fetch(url, {
                headers: {
                    'X-Riot-Token': this.riotApiKey
                }
            });

            if (!response.ok) {
                throw new Error(`Riot API error: ${response.status}`);
            }

            return await response.json();
        } catch (e) {
            error('Error fetching match data:', e);
            return null;
        }
    }

    getGameMode(queueId) {
        return this.gameModes[queueId] || `Unknown (${queueId})`;
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    async getChampionName(championId) {
        // Ensure champion names are loaded
        if (Object.keys(this.championNames).length === 0) {
            await this.loadChampionNames();
        }

        return this.championNames[championId] || `Champion ${championId}`;
    }

    // Cache management methods
    setCache(key, value, ttl = this.CACHE_TTL) {
        const expiresAt = Date.now() + ttl;
        this.apiCache.set(key, { value, expiresAt });
    }

    getCache(key) {
        const cached = this.apiCache.get(key);
        if (!cached) return null;

        if (Date.now() > cached.expiresAt) {
            this.apiCache.delete(key);
            return null;
        }

        return cached.value;
    }

    cleanExpiredCache() {
        const now = Date.now();
        for (const [key, cached] of this.apiCache) {
            if (now > cached.expiresAt) {
                this.apiCache.delete(key);
            }
        }
    }

    async createMatchEmbed(matchData, summonerName, puuid = null) {
        const info = matchData.info;
        let trackedParticipant;

        if (puuid) {
            // Find participant by PUUID
            trackedParticipant = info.participants.find(p => p.puuid === puuid);
        } else {
            // Fallback: try to find by summoner name or Riot ID
            trackedParticipant = info.participants.find(p =>
                p.riotIdGameName === summonerName ||
                p.summonerName === summonerName ||
                p.riotIdName === summonerName
            );
        }

        if (!trackedParticipant) {
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Match Summary')
                .setDescription('Could not find player data in this match.');
        }

        const isWin = trackedParticipant.win;
        const color = isWin ? 0x00FF00 : 0xFF0000;
        const result = isWin ? 'Victory' : 'Defeat';

        // Separate participants by team
        const team1 = info.participants.filter(p => p.teamId === 100);
        const team2 = info.participants.filter(p => p.teamId === 200);

        // Create team fields with async champion name resolution
        const team1Field = await this.createTeamField(team1, 'Blue Team', [trackedParticipant.puuid]);
        const team2Field = await this.createTeamField(team2, 'Red Team', [trackedParticipant.puuid]);

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${result} - ${this.getGameMode(info.queueId)}`)
            .setDescription(`**${summonerName}**'s latest game`)
            .addFields(
                { name: 'Game Duration', value: this.formatDuration(info.gameDuration), inline: true },
                { name: 'Game Mode', value: this.getGameMode(info.queueId), inline: true },
                { name: '\u200b', value: '\u200b', inline: true }, // Empty field for spacing
                team1Field,
                team2Field
            )
            .setTimestamp(new Date(info.gameCreation + info.gameDuration * 1000));

        return embed;
    }

    async createTeamField(participants, teamName, trackedPlayerPuuids, lpChanges = {}) {
        const sortedParticipants = participants.sort((a, b) => {
            // Sort by damage dealt to champions (descending)
            return b.totalDamageDealtToChampions - a.totalDamageDealtToChampions;
        });

        const teamLines = await Promise.all(sortedParticipants.map(async (p) => {
            const playerName = p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline}` : p.summonerName;
            const champion = await this.getChampionName(p.championId);
            const kda = `${p.kills}/${p.deaths}/${p.assists}`;
            const damage = p.totalDamageDealtToChampions.toLocaleString();

            // Handle both single PUUID (string) and multiple PUUIDs (array)
            const isTrackedPlayer = Array.isArray(trackedPlayerPuuids)
                ? trackedPlayerPuuids.includes(p.puuid)
                : p.puuid === trackedPlayerPuuids;

            // Add indicator for tracked player
            const indicator = isTrackedPlayer ? '👁️ ' : '';
            const lpSuffix = isTrackedPlayer && lpChanges[p.puuid] !== undefined
                ? ` |${this.formatLpChange(lpChanges[p.puuid])}`
                : '';

            return `${indicator}**${playerName}** (${champion})${lpSuffix}\n└ KDA: ${kda} | DMG: ${damage}`;
        }));

        return {
            name: teamName,
            value: teamLines.join('\n'),
            inline: true
        };
    }

    async addPlayer(summonerName, channelId, region = 'NA') {
        try {
            const { summonerName: name, tag } = this.parseSummonerInput(summonerName);
            
            // Check if player exists
            const summonerData = await this.getSummonerByName(name, tag, region);
            if (!summonerData) {
                return false;
            }

            const key = `${name}#${tag || ''}-${region}`;
            
            // Check if already tracked
            if (this.trackedPlayers.has(key)) {
                return false;
            }

            const rankState = await this.fetchRankState(summonerData.puuid, region);

            const playerData = {
                summonerName: name,
                tag: tag,
                region: region,
                channelId: channelId,
                puuid: summonerData.puuid,
                lastGameId: null,
                rankState,
                addedAt: new Date()
            };

            // Save to database
            const collection = db.db.collection('lol_tracked_players');
            await collection.insertOne(playerData);

            // Add to memory
            this.trackedPlayers.set(key, playerData);

            return true;
        } catch (e) {
            error('Error adding player:', e);
            return false;
        }
    }

    async removePlayer(summonerName, region = 'NA') {
        try {
            const { summonerName: name, tag } = this.parseSummonerInput(summonerName);
            const key = `${name}#${tag || ''}-${region}`;

            if (!this.trackedPlayers.has(key)) {
                return false;
            }

            // Remove from database
            const collection = db.db.collection('lol_tracked_players');
            await collection.deleteOne({ 
                summonerName: name, 
                tag: tag, 
                region: region 
            });

            // Remove from memory
            this.trackedPlayers.delete(key);

            return true;
        } catch (e) {
            error('Error removing player:', e);
            return false;
        }
    }

    getTrackedPlayers() {
        return Array.from(this.trackedPlayers.values());
    }

    async start() {
        if (this.isRunning) return;

        this.isRunning = true;
        log('🔄 Starting LoL Tracker...');

        // Check every 2 minutes
        this.checkInterval = setInterval(async () => {
            await this.checkForNewGames();
        }, 2 * 60 * 1000);

        // Clean cache every 10 minutes
        this.cacheCleanupInterval = setInterval(() => {
            this.cleanExpiredCache();
        }, 10 * 60 * 1000);

        // Initial check
        await this.checkForNewGames();
    }

    async stop() {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
            this.cacheCleanupInterval = null;
        }

        // Clear cache on shutdown
        this.apiCache.clear();

        log('⏹️ Stopped LoL Tracker');
    }

    async checkForNewGames({ force = false } = {}) {
        if (!force && !this.isRunning) return 0;

        //log('🔍 Checking API for new games...');

        // Group players by their new game IDs to consolidate embeds
        const gameGroups = new Map(); // gameId -> { matchData, players }

        for (const [key, player] of this.trackedPlayers) {
            try {
                //log(`📊 Checking API for ${player.summonerName} (${player.region})`);
                const lastGameId = await this.getLastGameId(player.puuid, player.region);
                
                if (lastGameId && lastGameId !== player.lastGameId) {
                    // New game found
                    const matchData = await this.getMatchData(lastGameId, player.region);
                    
                    if (matchData) {
                        // Group by game ID
                        if (!gameGroups.has(lastGameId)) {
                            gameGroups.set(lastGameId, {
                                matchData: matchData,
                                players: []
                            });
                        }
                        
                        gameGroups.get(lastGameId).players.push(player);
                    }
                }
            } catch (e) {
                error(`Error checking games for ${player.summonerName}:`, e);
            }
        }

        // Process each game group and send consolidated embeds
        for (const [gameId, gameData] of gameGroups) {
            try {
                // Update all players' last game ID
                const collection = db.db.collection('lol_tracked_players');
                
                // Update each player individually to avoid issues with _id
                for (const player of gameData.players) {
                    await collection.updateOne(
                        { 
                            summonerName: player.summonerName,
                            tag: player.tag,
                            region: player.region
                        },
                        { $set: { lastGameId: gameId } }
                    );
                }

                // Update in memory
                gameData.players.forEach(player => {
                    player.lastGameId = gameId;
                });

                // Send consolidated match summary
                await this.sendConsolidatedMatchSummary(gameData.matchData, gameData.players);
            } catch (e) {
                error(`Error processing game group ${gameId}:`, e);
            }
        }

        return gameGroups.size;
    }

    async sendConsolidatedMatchSummary(matchData, players) {
        try {
            //log(`📊 New game with ${players.length} tracked players`);
            
            // Get Discord client from global
            const client = global.discordClient;
            if (!client) {
                error('Discord client not available');
                return;
            }

            // Group players by channel to send appropriate embeds
            const channelGroups = new Map(); // channelId -> players
            
            for (const player of players) {
                if (!channelGroups.has(player.channelId)) {
                    channelGroups.set(player.channelId, []);
                }
                channelGroups.get(player.channelId).push(player);
            }

            // Send consolidated embed to each channel
            for (const [channelId, channelPlayers] of channelGroups) {
                const embed = await this.createConsolidatedMatchEmbed(matchData, channelPlayers);
                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    const message = await channel.send({ embeds: [embed] });
                    this.scheduleRankCheck(matchData, channel, channelPlayers, message);
                } else {
                    error(`Channel ${channelId} not found`);
                }
            }
        } catch (e) {
            error('Error sending consolidated match summary:', e);
        }
    }

    async createConsolidatedMatchEmbed(matchData, players, lpChanges = {}) {
        const info = matchData.info;

        // Find all tracked participants
        const trackedParticipants = [];
        for (const player of players) {
            const participant = info.participants.find(p => p.puuid === player.puuid);
            if (participant) {
                trackedParticipants.push({
                    participant: participant,
                    player: player
                });
            }
        }

        if (trackedParticipants.length === 0) {
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Match Summary')
                .setDescription('Could not find tracked player data in this match.');
        }

        // Determine overall result (if all players are on same team, use that result; otherwise show mixed)
        const allSameTeam = trackedParticipants.every(tp => tp.participant.teamId === trackedParticipants[0].participant.teamId);
        const allWon = trackedParticipants.every(tp => tp.participant.win);
        const allLost = trackedParticipants.every(tp => !tp.participant.win);

        let color, result;
        if (allSameTeam) {
            color = allWon ? 0x00FF00 : 0xFF0000;
            result = allWon ? 'Victory' : 'Defeat';
        } else {
            color = 0xFFA500; // Orange for mixed results
            result = 'Mixed Results';
        }

        // Separate participants by team
        const team1 = info.participants.filter(p => p.teamId === 100);
        const team2 = info.participants.filter(p => p.teamId === 200);

        // Create team fields with async champion name resolution
        const team1Field = await this.createTeamField(team1, 'Blue Team', players.map(p => p.puuid), lpChanges);
        const team2Field = await this.createTeamField(team2, 'Red Team', players.map(p => p.puuid), lpChanges);

        // Create tracked players summary with async champion names
        const trackedPlayersSummary = await Promise.all(trackedParticipants.map(async (tp) => {
            const displayName = tp.player.tag ? `${tp.player.summonerName}#${tp.player.tag}` : tp.player.summonerName;
            const champion = await this.getChampionName(tp.participant.championId);
            const kda = `${tp.participant.kills}/${tp.participant.deaths}/${tp.participant.assists}`;
            const result = tp.participant.win ? '✅' : '❌';
            const lpSuffix = lpChanges[tp.player.puuid] !== undefined
                ? ` |${this.formatLpChange(lpChanges[tp.player.puuid])}`
                : '';
            return `${result} **${displayName}** (${champion}) - ${kda}${lpSuffix}`;
        }));

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${result} - ${this.getGameMode(info.queueId)}`)
            .setDescription(`**${trackedParticipants.length} tracked player${trackedParticipants.length > 1 ? 's' : ''}** in this game`)
            .addFields(
                { name: 'Game Duration', value: this.formatDuration(info.gameDuration), inline: true },
                { name: 'Game Mode', value: this.getGameMode(info.queueId), inline: true },
                { name: '\u200b', value: '\u200b', inline: true }, // Empty field for spacing
                { name: 'Tracked Players', value: trackedPlayersSummary.join('\n'), inline: false },
                team1Field,
                team2Field
            )
            .setTimestamp(new Date(info.gameCreation + info.gameDuration * 1000));

        return embed;
    }

}

module.exports = new LoLTracker(); 