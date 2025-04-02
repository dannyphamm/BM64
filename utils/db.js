const { MongoClient } = require('mongodb');
const config = require('../config');
const { log, error } = require('./utils');

const MONGODB_URI = config.mongodbURI;
const MONGODB_DB_NAME = config.mongodbDBName;

class MongoConnection {
  constructor() {
    if (MongoConnection.instance) {
      return MongoConnection.instance;
    }

    this.client = null;
    this.db = null;
    MongoConnection.instance = this;
  }

  async connect() {
    try {
      this.client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, // Time to find an available server
        heartbeatFrequencyMS: 2000,     // How often to check server status
        replicaSet: 'atlas-aexofr-shard-0',
        readPreference: 'primaryPreferred',
        w: 'majority',                   // Write concern
        retryWrites: true,
        useUnifiedTopology: true,
        maxPoolSize: 50,
        minPoolSize: 10,
        // High availability options
        ha: true,                        // Enable high availability monitoring
        haInterval: 10000,  
      });

      await this.client.connect();
      this.db = this.client.db(MONGODB_DB_NAME);
      log('Connected to MongoDB');
      
    } catch (err) {
      error('Error connecting to MongoDB:', err);
    }
  }
}

module.exports = new MongoConnection();