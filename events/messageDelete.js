
module.exports = {
    name: 'messageDelete',
    execute(message) {
        if(message.channel.type === 'GUILD_VOICE') {
           console.log(message)
        }  
    },
};