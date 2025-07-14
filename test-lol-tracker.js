const lolTracker = require('./services/lolTracker');

// Simple test function
async function testLoLTracker() {
    console.log('Testing LoL Tracker Service...');
    
    // Test 1: Check if service is initialized
    console.log('✓ Service initialized');
    
    // Test 2: Check if API key is configured
    if (!lolTracker.riotApiKey) {
        console.log('❌ Riot API key not configured');
        return;
    }
    console.log('✓ Riot API key configured');
    
    // Test 3: Test legacy summoner lookup
    try {
        console.log('\n--- Testing Legacy Summoner Name ---');
        const legacySummonerName = 'Faker'; // Replace with a real summoner name for testing
        const summonerData = await lolTracker.getSummonerByName(legacySummonerName, null, 'KR');
        
        if (summonerData) {
            console.log(`✓ Found summoner: ${summonerData.name} (Level: ${summonerData.summonerLevel})`);
            await testMatchData(summonerData, legacySummonerName);
        } else {
            console.log(`❌ Summoner "${legacySummonerName}" not found`);
        }
    } catch (error) {
        console.error('❌ Error during legacy summoner testing:', error.message);
    }

    // Test 4: Test Riot ID lookup
    try {
        console.log('\n--- Testing Riot ID (Name#TAG) ---');
        const gameName = 'THENOOBTUBE09';
        const tagLine = 'OC';
        const summonerData = await lolTracker.getSummonerByName(gameName, tagLine, 'OCE');
        console.log(summonerData);
        if (summonerData) {
            console.log(`✓ Found summoner by Riot ID: ${summonerData.puuid} (Level: ${summonerData.summonerLevel})`);
            await testMatchData(summonerData, `${gameName}#${tagLine}`);
        } else {
            console.log(`❌ Riot ID "${gameName}#${tagLine}" not found`);
        }
    } catch (error) {
        console.error('❌ Error during Riot ID testing:', error.message);
    }

    // Test 5: Test Account v1 API directly
    try {
        console.log('\n--- Testing Account v1 API ---');
        const accountData = await lolTracker.getAccountByRiotId('Faker', 'KR1', 'KR');
        
        if (accountData) {
            console.log(`✓ Found account: ${accountData.gameName}#${accountData.tagLine} (PUUID: ${accountData.puuid})`);
            
            // Test getting summoner data from PUUID
            const summonerData = await lolTracker.getSummonerByPUUID(accountData.puuid, 'KR');
            if (summonerData) {
                console.log(`✓ Retrieved summoner data: ${summonerData.name} (Level: ${summonerData.summonerLevel})`);
            } else {
                console.log('❌ Failed to get summoner data from PUUID');
            }
        } else {
            console.log('❌ Account not found via Account v1 API');
        }
    } catch (error) {
        console.error('❌ Error during Account v1 API testing:', error.message);
    }

    // Test 6: Test utility functions
    console.log('\n--- Testing Utility Functions ---');
    console.log(`Game Mode 420: ${lolTracker.getGameMode(420)}`);
    console.log(`Duration 1800s: ${lolTracker.formatDuration(1800)}`);
    console.log(`Champion 103: ${lolTracker.getChampionName(103)}`);
    
    console.log('\nTest completed!');
}

async function testMatchData(summonerData, displayName) {
    try {
        // Test 4: Get latest game
        console.log('Testing latest game lookup...');
        const lastGameId = await lolTracker.getLastGameId(summonerData.puuid, 'OCE');
        
        if (lastGameId) {
            console.log(`✓ Found latest game: ${lastGameId}`);
            
            // Test 5: Get match data
            console.log('Testing match data retrieval...');
            const matchData = await lolTracker.getMatchData(lastGameId, 'OCE');
            
            if (matchData) {
                console.log(`✓ Retrieved match data for game ${lastGameId}`);
                console.log(`  Game mode: ${lolTracker.getGameMode(matchData.info.queueId)}`);
                console.log(`  Duration: ${lolTracker.formatDuration(matchData.info.gameDuration)}`);
                
                // Test 6: Create embed
                console.log('Testing embed creation...');
                const embed = lolTracker.createMatchEmbed(matchData, displayName);
                console.log(`✓ Created embed: ${embed.title}`);
                
            } else {
                console.log('❌ Failed to retrieve match data');
            }
        } else {
            console.log('❌ No recent games found');
        }
    } catch (error) {
        console.error('❌ Error during match data testing:', error.message);
    }
}

// Run the test
testLoLTracker().catch(console.error); 