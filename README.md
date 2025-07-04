# BM64

This is a Discord Bot for my Discord Server. It creates a new text channel under a catergory when a voice channel is active. Once the voice channel is empty. It runs a 1 hour timer and deletes the text channel afterwards. However, if a user enters the voice channel during the timer, it will abort deleting the text channel and the remaining content is still there.

## Features

-   Music from a variety of providers. Eg. PlugDJ, YouTube, Spotify, SoundCloud
-   Temporary text channels
-   Presence tracking with daily gaming summaries
-   Game session tracking with duration and session count

## Requirements

-   [Node.JS](https://nodejs.org/en/) 
-   [Node-GYP](https://github.com/nodejs/node-gyp) ```npm install -g node-gyp```
-   [nodemon](https://www.npmjs.com/package/nodemon) **optional** ```npm install -g nodemon```

## Getting started

First, make sure you have all the required tools installed on your local machine then continue with these steps.

### Installation

```bash
# Clone the repository
git clone https://github.com/s3719046/BM64.git

# Enter into the directory
cd BM64/

# Install the dependencies with less errors
npm install --no-optional
```

### Configuration

After cloning the project and installing all dependencies, you need to add your IDs (TOKEN, CATERGORYID, CHANNELID, Youtube Cookie and ID_Token).

### Starting the application

```bash
node .
```
If you have nodemon installed
```bash
nodemon .
```

## Gaming Features

### Daily Gaming Summary
The bot automatically tracks gaming activity and sends a daily summary at 12 AM to the configured tracking channel. The summary includes:
- Total time spent playing each game
- Number of gaming sessions per game
- Games sorted by total playtime

### Commands
- `/gamesummary` - View current daily gaming statistics without waiting for the scheduled summary

### Configuration
Make sure to set the following in your `config.json`:
- `devilshinxID` - The user ID to track for gaming activity
- `pptracking` - The channel ID where gaming updates and summaries will be sent
