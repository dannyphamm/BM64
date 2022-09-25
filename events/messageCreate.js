
module.exports = {
    name: 'messageCreate',
    execute(message) {
        console.log(message.channel.type)
        if(message.channel.type === 2) {
            console.log(message)
            setTimeout(()=> {
                message.delete()
            }, 900000)
        }  
    },
};