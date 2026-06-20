const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const lolTracker = require('../services/lolTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lol')
        .setDescription('League of Legends game tracking commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('track')
                .setDescription('Add a League of Legends player to track for match summaries')
                .addStringOption(option =>
                    option.setName('summoner')
                        .setDescription('The summoner name to track (supports Name#TAG format)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('region')
                        .setDescription('The region the player is in')
                        .setRequired(false)
                        .addChoices(
                            { name: 'North America', value: 'NA' },
                            { name: 'Europe West', value: 'EUW' },
                            { name: 'Europe Nordic & East', value: 'EUNE' },
                            { name: 'Korea', value: 'KR' },
                            { name: 'Brazil', value: 'BR' },
                            { name: 'Latin America North', value: 'LAN' },
                            { name: 'Latin America South', value: 'LAS' },
                            { name: 'Oceania', value: 'OCE' },
                            { name: 'Turkey', value: 'TR' },
                            { name: 'Russia', value: 'RU' },
                            { name: 'Japan', value: 'JP' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('untrack')
                .setDescription('Remove a League of Legends player from tracking')
                .addStringOption(option =>
                    option.setName('summoner')
                        .setDescription('The summoner name to stop tracking (supports Name#TAG format)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('region')
                        .setDescription('The region the player is in')
                        .setRequired(false)
                        .addChoices(
                            { name: 'North America', value: 'NA' },
                            { name: 'Europe West', value: 'EUW' },
                            { name: 'Europe Nordic & East', value: 'EUNE' },
                            { name: 'Korea', value: 'KR' },
                            { name: 'Brazil', value: 'BR' },
                            { name: 'Latin America North', value: 'LAN' },
                            { name: 'Latin America South', value: 'LAS' },
                            { name: 'Oceania', value: 'OCE' },
                            { name: 'Turkey', value: 'TR' },
                            { name: 'Russia', value: 'RU' },
                            { name: 'Japan', value: 'JP' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all tracked League of Legends players'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Manually check a player\'s latest game (does not add to tracking)')
                .addStringOption(option =>
                    option.setName('summoner')
                        .setDescription('The summoner name to check (supports Name#TAG format)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('region')
                        .setDescription('The region the player is in')
                        .setRequired(false)
                        .addChoices(
                            { name: 'North America', value: 'NA' },
                            { name: 'Europe West', value: 'EUW' },
                            { name: 'Europe Nordic & East', value: 'EUNE' },
                            { name: 'Korea', value: 'KR' },
                            { name: 'Brazil', value: 'BR' },
                            { name: 'Latin America North', value: 'LAN' },
                            { name: 'Latin America South', value: 'LAS' },
                            { name: 'Oceania', value: 'OCE' },
                            { name: 'Turkey', value: 'TR' },
                            { name: 'Russia', value: 'RU' },
                            { name: 'Japan', value: 'JP' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Force an immediate check for new games from tracked players'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'track':
                await this.handleTrack(interaction);
                break;
            case 'untrack':
                await this.handleUntrack(interaction);
                break;
            case 'list':
                await this.handleList(interaction);
                break;
            case 'check':
                await this.handleCheck(interaction);
                break;
            case 'update':
                await this.handleUpdate(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown subcommand.',
                    ephemeral: true
                });
        }
    },

    async handleTrack(interaction) {
        await interaction.deferReply();

        const summonerName = interaction.options.getString('summoner');
        const region = interaction.options.getString('region') || 'NA';
        const channelId = interaction.channelId;

        try {
            const success = await lolTracker.addPlayer(summonerName, channelId, region);
            
            if (success) {
                await interaction.editReply({
                    content: `✅ Successfully added **${summonerName}** to tracking! Match summaries will be posted in this channel when games finish.`,
                    ephemeral: false
                });
            } else {
                await interaction.editReply({
                    content: `❌ Failed to add **${summonerName}** to tracking. Please check the summoner name and try again.`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in lol track command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while adding the player to tracking.',
                ephemeral: true
            });
        }
    },

    async handleUntrack(interaction) {
        await interaction.deferReply();

        const summonerName = interaction.options.getString('summoner');
        const region = interaction.options.getString('region') || 'NA';

        try {
            const removed = await lolTracker.removePlayer(summonerName, region);
            
            if (removed) {
                await interaction.editReply({
                    content: `✅ Successfully removed **${summonerName}** from tracking.`,
                    ephemeral: false
                });
            } else {
                await interaction.editReply({
                    content: `❌ **${summonerName}** was not being tracked.`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in lol untrack command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while removing the player from tracking.',
                ephemeral: true
            });
        }
    },

    async handleList(interaction) {
        await interaction.deferReply();

        try {
            const trackedPlayers = lolTracker.getTrackedPlayers();
            
            if (trackedPlayers.length === 0) {
                await interaction.editReply({
                    content: '📋 No players are currently being tracked.',
                    ephemeral: true
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setTitle('Tracked League of Legends Players')
                .setDescription('Players currently being tracked for match summaries:')
                .addFields(
                    trackedPlayers.map((player, index) => {
                        const displayName = player.tag ? `${player.summonerName}#${player.tag}` : player.summonerName;
                        return {
                            name: `${index + 1}. ${displayName}`,
                            value: `Region: ${player.region} | Channel: <#${player.channelId}>`,
                            inline: true
                        };
                    })
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in lol list command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching the tracked players list.',
                ephemeral: true
            });
        }
    },

    async handleCheck(interaction) {
        await interaction.deferReply();

        const summonerName = interaction.options.getString('summoner');
        const region = interaction.options.getString('region') || 'NA';

        try {
            // Parse summoner input for tag
            const { summonerName: name, tag } = lolTracker.parseSummonerInput(summonerName);
            
            // Get summoner data
            const summonerData = await lolTracker.getSummonerByName(name, tag, region);
            if (!summonerData) {
                await interaction.editReply({
                    content: `❌ Summoner **${summonerName}** not found. Please check the spelling and try again.`,
                    ephemeral: true
                });
                return;
            }

            // Get latest game
            const lastGameId = await lolTracker.getLastGameId(summonerData.puuid, region);
            if (!lastGameId) {
                await interaction.editReply({
                    content: `📋 No recent games found for **${summonerName}**.`,
                    ephemeral: true
                });
                return;
            }

            // Get match data
            const matchData = await lolTracker.getMatchData(lastGameId, region);
            console.log(matchData);
            if (!matchData) {
                await interaction.editReply({
                    content: `❌ Could not retrieve match data for **${summonerName}**.`,
                    ephemeral: true
                });
                return;
            }

            // Create and send embed
            const embed = await lolTracker.createMatchEmbed(matchData, summonerName, summonerData.puuid);
            await interaction.editReply({
                content: `📊 Latest game for **${summonerName}**:`,
                embeds: [embed],
                ephemeral: false
            });

        } catch (error) {
            console.error('Error in lol check command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while checking the player\'s latest game.',
                ephemeral: true
            });
        }
    },

    async handleUpdate(interaction) {
        await interaction.deferReply();

        try {
            const trackedPlayers = lolTracker.getTrackedPlayers();
            if (trackedPlayers.length === 0) {
                await interaction.editReply({
                    content: '📋 No players are currently being tracked.',
                    ephemeral: true
                });
                return;
            }

            const result = await lolTracker.forceUpdate();

            if (result.newGames > 0) {
                await interaction.editReply({
                    content: `✅ Check complete. Found and posted **${result.newGames}** new game${result.newGames > 1 ? 's' : ''}.`,
                    ephemeral: false
                });
            } else {
                await interaction.editReply({
                    content: '✅ Check complete. No new games found for tracked players.',
                    ephemeral: true
                });
            }
        } catch (err) {
            console.error('Error in lol update command:', err);
            await interaction.editReply({
                content: '❌ An error occurred while checking for new games.',
                ephemeral: true
            });
        }
    }
}; 