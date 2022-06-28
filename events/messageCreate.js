
module.exports = {
    name: 'messageCreate',
    execute(message) {
        console.log(message.channel.type);
        if(message.channel.type === 'GUILD_VOICE') {
            setTimeout(()=> {
                message.delete()
            }, 900000)
        }
    },
};