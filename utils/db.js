const { MongoClient } = require('mongodb');
const config = require('../config');

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
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      await this.client.connect();
      this.db = this.client.db(MONGODB_DB_NAME);
      console.log('Connected to MongoDB');
    } catch (err) {
      console.error('Error connecting to MongoDB:', err);
    }
  }
}

module.exports = new MongoConnection();