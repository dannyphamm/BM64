const { MongoClient } = require('mongodb');
const config = require('../config');
const { log, error } = require('./utils');

const MONGODB_URI = config.mongodbURI;
const MONGODB_DB_NAME = config.mongodbDBName;

class Database {
  constructor(uri) {
    this.uri = uri;
    this.client = null;
  }

  async connect() {
    try {
      this.client = new MongoClient(this.uri, {
        retryWrites: true,
        w: 'majority',
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
      });

      await this.client.connect();
      log('Connected to MongoDB');

      // Add event listeners for connection monitoring
      this.client.on('close', () => {
        log('MongoDB connection closed. Attempting to reconnect...');
        this.reconnect();
      });

      this.client.on('error', (error) => {
        error('MongoDB error:', error);
        this.reconnect();
      });

      return this.client;
    } catch (error) {
      error('Failed to connect:', error);
      await this.reconnect();
    }
  }

  async reconnect() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        error('Error closing existing connection:', err);
      }
    }

    // Wait 5 seconds before trying to reconnect
    await new Promise(resolve => setTimeout(resolve, 5000));
    return this.connect();
  }

  getClient() {
    return this.client;
  }
}

module.exports = new Database(MONGODB_URI);