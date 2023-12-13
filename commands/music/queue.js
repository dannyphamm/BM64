const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Queue info'),
    async execute(interaction) {
        const { client } = interaction;
        const queue = client.distube.getQueue(interaction.guild.id);

        const q = queue.songs
            .map((song, i) => {
                if(i < 10) { 
                    return `${i === 0 ? 'Playing:' : `${i}.`} ${song.name} - \`${song.formattedDuration}\``
                }
            })
            .join('\n');
        return interaction.reply(`**Server Queue**\n${q}\nQueue Length: ${queue.songs.length}`);
    },
};