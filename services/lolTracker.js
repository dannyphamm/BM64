const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const db = require('../utils/db');

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
        this.championNames = {}; // Will be populated when needed
    }

    async init() {
        if (!this.riotApiKey) {
            console.error('❌ Riot API key not configured');
            return false;
        }

        try {
            await db.connect();
            await this.loadTrackedPlayers();
            await this.loadChampionNames();
            console.log('✅ LoL Tracker initialized');
            return true;
        } catch (error) {
            console.error('❌ Error initializing LoL Tracker:', error);
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
            
            console.log(`📋 Loaded ${this.trackedPlayers.size} tracked players`);
        } catch (error) {
            console.error('Error loading tracked players:', error);
        }
    }

    async loadChampionNames() {
        try {
            const response = await fetch('https://ddragon.leagueoflegends.com/cdn/14.1.1/data/en_US/champion.json');
            const data = await response.json();
            
            for (const [key, champion] of Object.entries(data.data)) {
                this.championNames[parseInt(champion.key)] = champion.name;
            }
        } catch (error) {
            console.error('Error loading champion names:', error);
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
            console.log(url);
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
        } catch (error) {
            console.error('Error fetching summoner:', error);
            return null;
        }
    }

    async getAccountByRiotId(gameName, tagLine, region = 'NA') {
        try {
            // Always use Americas API for account lookup
            const baseUrl = 'https://americas.api.riotgames.com';
            const url = `${baseUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
            console.log(url);
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
        } catch (error) {
            console.error('Error fetching account by Riot ID:', error);
            return null;
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
        } catch (error) {
            console.error('Error fetching summoner by PUUID:', error);
            return null;
        }
    }

    async getLastGameId(puuid, region = 'NA') {
        try {
            const baseUrl = this.riotApiBaseUrls[region];
            const url = `${baseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1`;
            console.log(url);
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
        } catch (error) {
            console.error('Error fetching last game ID:', error);
            return null;
        }
    }

    async getMatchData(matchId, region = 'NA') {
        try {
            const baseUrl = this.riotApiBaseUrls[region];
            const url = `${baseUrl}/lol/match/v5/matches/${matchId}`;
            console.log(url);
            const response = await fetch(url, {
                headers: {
                    'X-Riot-Token': this.riotApiKey
                }
            });

            if (!response.ok) {
                throw new Error(`Riot API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching match data:', error);
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

    getChampionName(championId) {
        return this.championNames[championId] || `Champion ${championId}`;
    }

    createMatchEmbed(matchData, summonerName, puuid = null) {
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

        // Create team fields
        const team1Field = this.createTeamField(team1, 'Blue Team', trackedParticipant.puuid);
        const team2Field = this.createTeamField(team2, 'Red Team', trackedParticipant.puuid);

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

    createTeamField(participants, teamName, trackedPlayerPuuid) {
        const sortedParticipants = participants.sort((a, b) => {
            // Sort by damage dealt to champions (descending)
            return b.totalDamageDealtToChampions - a.totalDamageDealtToChampions;
        });

        const teamLines = sortedParticipants.map(p => {
            const playerName = p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline}` : p.summonerName;
            const champion = this.getChampionName(p.championId);
            const kda = `${p.kills}/${p.deaths}/${p.assists}`;
            const damage = p.totalDamageDealtToChampions.toLocaleString();
            const isTrackedPlayer = p.puuid === trackedPlayerPuuid;
            
            // Add indicator for tracked player
            const indicator = isTrackedPlayer ? '👁️ ' : '';
            
            return `${indicator}**${playerName}** (${champion})\n└ KDA: ${kda} | DMG: ${damage}`;
        });

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

            const playerData = {
                summonerName: name,
                tag: tag,
                region: region,
                channelId: channelId,
                puuid: summonerData.puuid,
                lastGameId: null,
                addedAt: new Date()
            };

            // Save to database
            const collection = db.db.collection('lol_tracked_players');
            await collection.insertOne(playerData);

            // Add to memory
            this.trackedPlayers.set(key, playerData);

            return true;
        } catch (error) {
            console.error('Error adding player:', error);
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
        } catch (error) {
            console.error('Error removing player:', error);
            return false;
        }
    }

    getTrackedPlayers() {
        return Array.from(this.trackedPlayers.values());
    }

    async start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('🔄 Starting LoL Tracker...');
        
        // Check every 2 minutes
        this.checkInterval = setInterval(async () => {
            await this.checkForNewGames();
        }, 2 * 60 * 1000);
        
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
        console.log('⏹️ Stopped LoL Tracker');
    }

    async checkForNewGames() {
        if (!this.isRunning) return;

        console.log('🔍 Checking API for new games...');

        for (const [key, player] of this.trackedPlayers) {
            try {
                console.log(`📊 Checking API for ${player.summonerName} (${player.region})`);
                const lastGameId = await this.getLastGameId(player.puuid, player.region);
                
                if (lastGameId && lastGameId !== player.lastGameId) {
                    // New game found
                    const matchData = await this.getMatchData(lastGameId, player.region);
                    
                    if (matchData) {
                        // Update last game ID
                        const collection = db.db.collection('lol_tracked_players');
                        await collection.updateOne(
                            { _id: player._id },
                            { $set: { lastGameId: lastGameId } }
                        );
                        player.lastGameId = lastGameId;

                        // Send match summary
                        await this.sendMatchSummary(matchData, player);
                    }
                }
            } catch (error) {
                console.error(`Error checking games for ${player.summonerName}:`, error);
            }
        }
    }

    async sendMatchSummary(matchData, player) {
        try {
            const displayName = player.tag ? `${player.summonerName}#${player.tag}` : player.summonerName;
            console.log(`📊 New game for ${displayName} (${player.region})`);
            
            // Get Discord client from global
            const client = global.discordClient;
            if (!client) {
                console.error('Discord client not available');
                return;
            }

            // Send embed to Discord channel
            const embed = this.createMatchEmbed(matchData, displayName, player.puuid);
            const channel = await client.channels.fetch(player.channelId);
            if (channel) {
                await channel.send({ embeds: [embed] });
            } else {
                console.error(`Channel ${player.channelId} not found`);
            }
        } catch (error) {
            console.error('Error sending match summary:', error);
        }
    }
}

module.exports = new LoLTracker(); 