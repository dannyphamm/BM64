
module.exports = {
    name: 'messageCreate',
    execute(message) {
        if(message.channel.type === 'GUILD_VOICE') {
            setTimeout(()=> {
                message.delete()
            }, 900000)
        }  
    },
};