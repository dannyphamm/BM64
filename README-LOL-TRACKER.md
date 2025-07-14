# League of Legends Tracker

This Discord bot includes a League of Legends tracking feature that automatically posts match summaries when tracked players finish games.

## Features

- **Track Players**: Add League of Legends players to automatically track their games
- **Match Summaries**: Get detailed match information including KDA, CS, damage, and more
- **Multi-Region Support**: Supports all major League of Legends regions
- **Riot ID Support**: Works with the new Riot ID format (Name#TAG)
- **Automatic Updates**: Checks for new games every 2 minutes

## Commands

### `/lol track <summoner> [region]`
Add a player to tracking. The bot will automatically post match summaries in the current channel when they finish games.

**Parameters:**
- `summoner`: The summoner name (legacy) or Riot ID (Name#TAG format)
- `region`: (Optional) The player's region (defaults to NA)

**Example:**
```
/lol track Faker#KR1
/lol track Doublelift NA
```

**Note:** For Riot IDs (Name#TAG format), the bot uses the Account v1 API to get the PUUID, then fetches summoner data. For legacy summoner names, it uses the Summoner v4 API directly.

### `/lol untrack <summoner> [region]`
Remove a player from tracking.

**Parameters:**
- `summoner`: The summoner name or Riot ID to stop tracking
- `region`: (Optional) The player's region (defaults to NA)

### `/lol list`
List all currently tracked players with their regions and channels.

### `/lol check <summoner> [region]`
Manually check a player's latest game without adding them to tracking.

**Parameters:**
- `summoner`: The summoner name or Riot ID to check
- `region`: (Optional) The player's region (defaults to NA)

## Supported Regions

- **NA**: North America
- **EUW**: Europe West
- **EUNE**: Europe Nordic & East
- **KR**: Korea
- **BR**: Brazil
- **LAN**: Latin America North
- **LAS**: Latin America South
- **OCE**: Oceania
- **TR**: Turkey
- **RU**: Russia
- **JP**: Japan

## Match Summary Information

When a tracked player finishes a game, the bot posts an embed containing:

- **Result**: Victory or Defeat
- **Game Mode**: Ranked Solo/Duo, Normal Draft, ARAM, etc.
- **Champion**: The champion played
- **KDA**: Kills/Deaths/Assists
- **CS**: Total minions and neutral monsters killed
- **Duration**: Game length in MM:SS format
- **Level**: Champion level reached
- **Damage**: Total damage dealt to champions

## Setup Requirements

1. **Riot API Key**: A valid Riot Games API key is required
   - Get one from: https://developer.riotgames.com/
   - Add it to `config.json` as `riotApiKey`

2. **MongoDB**: The bot uses MongoDB to store tracked players
   - Ensure MongoDB connection is configured in `config.json`

3. **Discord Permissions**: The bot needs permission to:
   - Send messages in channels
   - Use slash commands
   - Manage channels (for the /lol command)

## Technical Details

- **Service**: `services/lolTracker.js`
- **Command**: `commands/lol.js`
- **Database Collection**: `lol_tracked_players`
- **Check Interval**: Every 2 minutes
- **API Rate Limits**: Respects Riot API rate limits

### API Flow
1. **Riot ID (Name#TAG)**: Account v1 API → PUUID → Summoner v4 API
2. **Legacy Summoner Name**: Summoner v4 API directly
3. **Match Data**: Match v5 API using PUUID

## Troubleshooting

### "Summoner not found" Error
- Check the spelling of the summoner name
- Ensure the correct region is selected
- For Riot IDs, use the format `Name#TAG`
- Try using the player's Riot ID instead of their old summoner name

### "Riot API error: 401" Error
- The Riot API key may be expired
- Get a new API key from the Riot Developer Portal
- Update the key in `config.json`

### No match summaries appearing
- Verify the player is being tracked (`/lol list`)
- Check that the bot has permission to send messages in the channel
- Ensure the Riot API key is valid and not rate limited

## Testing

Use the test file to verify the service is working:

```bash
node test-lol-tracker.js
```

This will test the basic functionality without making actual Discord API calls. 