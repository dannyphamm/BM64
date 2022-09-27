
module.exports = {
    name: 'messageCreate',
    execute(message) {
        if(message.channel.type === 2) {
            setTimeout(()=> {
                message.delete()
            }, 900000)
        }  
    },
};