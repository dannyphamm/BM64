const mongoose = require('mongoose');
const config = require('../config');
const { log, error } = require('./utils');

const MONGODB_URI = config.mongodbURI;
const MONGODB_DB_NAME = config.mongodbDBName;

// Basic retry logic for free tier
const connectWithRetry = async (uri) => {
    const options = {
        retryWrites: true,
        w: 'majority',
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
    };

    try {
        await mongoose.connect(uri, options);
        log('Connected to MongoDB');
    } catch (err) {
        error('MongoDB connection error:', err);
        // Wait 5 seconds and try again
        setTimeout(() => connectWithRetry(uri), 5000);
    }
};

// Handle disconnection events
mongoose.connection.on('disconnected', () => {
    log('MongoDB disconnected, attempting to reconnect...');
    connectWithRetry(MONGODB_URI);
});

mongoose.connection.on('error', (err) => {
    error('MongoDB error:', err);
    // If connection was lost, mongoose will try to reconnect automatically
});

module.exports = mongoose.connection;