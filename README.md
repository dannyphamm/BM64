# BM64
This is a Discord Bot for my Discord Server. It creates a new text channel under a catergory when a voice channel is active. Once the voice channel is empty. It runs a 1 hour timer and deletes the text channel afterwards. However, if a user enters the voice channel during the timer, it will abort deleting and the text channel is still alive.

## Requirements

- [Node](https://nodejs.org/en/)
- [NPM](https://www.npmjs.com/)
- [nodemon](https://www.npmjs.com/package/nodemon)
## Getting started

First, make sure you have all the required tools installed on your local machine then continue with these steps.

### Installation

```bash
# Clone the repository
git clone https://github.com/s3719046/BM64.git

# Enter into the directory
cd BM64/

# Install the dependencies
npm install
```

### Configuration

After cloning the project and installing all dependencies, you need to add your IDs (TOKEN, CATERGORYID, CHANNELID).

### Starting the application

```bash
nodemon .
```
