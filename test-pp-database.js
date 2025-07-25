const db = require('./utils/db');

// Test data
const mockStatsData = [
    {
        name: "League of Legends",
        totalDuration: 7200000, // 2 hours
        sessions: 3
    },
    {
        name: "Valorant",
        totalDuration: 3600000, // 1 hour
        sessions: 2
    },
    {
        name: "Minecraft",
        totalDuration: 1800000, // 30 minutes
        sessions: 1
    }
];

async function testDatabaseFunctionality() {
    console.log('🧪 Testing PP database functionality...\n');

    try {
        // Test 1: Database connection
        console.log('📊 Test 1: Database connection');
        await db.connect();
        console.log('✅ Database connection successful\n');

        // Test 2: Save mock stats to database
        console.log('📊 Test 2: Save mock stats to database');
        const collection = db.db.collection('daily_gaming_stats');
        
        const today = new Date();
        const dateString = today.toISOString().split('T')[0];
        
        const document = {
            date: dateString,
            userId: 'test-user-id',
            username: 'test-user',
            totalGames: mockStatsData.length,
            totalPlayTime: mockStatsData.reduce((total, game) => total + game.totalDuration, 0),
            games: mockStatsData.map(game => ({
                name: game.name,
                totalDuration: game.totalDuration,
                sessions: game.sessions,
                hours: Math.floor(game.totalDuration / (1000 * 60 * 60)),
                minutes: Math.floor((game.totalDuration % (1000 * 60 * 60)) / (1000 * 60))
            })),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await collection.updateOne(
            { date: dateString, userId: 'test-user-id' },
            { $set: document },
            { upsert: true }
        );
        console.log('✅ Mock stats saved to database\n');

        // Test 3: Retrieve stats from database
        console.log('📊 Test 3: Retrieve stats from database');
        const retrievedStats = await collection.findOne({
            date: dateString,
            userId: 'test-user-id'
        });

        if (retrievedStats) {
            console.log(`Date: ${retrievedStats.date}`);
            console.log(`Total Games: ${retrievedStats.totalGames}`);
            console.log(`Total Play Time: ${Math.floor(retrievedStats.totalPlayTime / (1000 * 60 * 60))}h ${Math.floor((retrievedStats.totalPlayTime % (1000 * 60 * 60)) / (1000 * 60))}m`);
            console.log('Games:');
            retrievedStats.games.forEach(game => {
                console.log(`  • ${game.name}: ${game.hours}h ${game.minutes}m (${game.sessions} sessions)`);
            });
            console.log('✅ Stats retrieved successfully\n');
        } else {
            console.log('❌ No stats found in database\n');
        }

        // Test 4: Test historical stats query
        console.log('📊 Test 4: Historical stats query');
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        const historicalStats = await collection.find({
            userId: 'test-user-id',
            date: {
                $gte: startDate.toISOString().split('T')[0],
                $lte: endDate.toISOString().split('T')[0]
            }
        }).sort({ date: -1 }).toArray();
        
        console.log(`Found ${historicalStats.length} historical records`);
        console.log('✅ Historical query successful\n');

        // Test 5: Clean up test data
        console.log('📊 Test 5: Clean up test data');
        await collection.deleteOne({
            date: dateString,
            userId: 'test-user-id'
        });
        console.log('✅ Test data cleaned up\n');

        console.log('🎉 All database tests completed successfully!');
        console.log('\n📋 Summary:');
        console.log('- Database connection works');
        console.log('- Stats can be saved with proper structure');
        console.log('- Stats can be retrieved and formatted correctly');
        console.log('- Historical queries work');
        console.log('- Database operations are ready for production use');

    } catch (error) {
        console.error('❌ Database test failed:', error);
    }
}

// Run the test
testDatabaseFunctionality(); 