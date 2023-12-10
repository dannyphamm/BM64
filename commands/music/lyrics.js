const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Lyrics of current song playing or search for one').
        addStringOption(option =>
            option.setName('song')
                .setDescription('The name of the song to find.')
                .setRequired(false)),
    async execute(interaction) {
        const { client } = interaction;
        const queue = client.distube.getQueue(interaction.guild.id);
        try {
            let currentSong = "";
            if (interaction.options.getString('song')) {
                currentSong = interaction.options.getString('song')
            } else {
                if (!queue) {
                    return interaction.reply({ content: 'There is nothing playing.', ephemeral: true });
                }
                currentSong = queue.songs[0].name
            }
            const searches = await client.genius.songs.search(currentSong);
            const initial = {
                title: "Searching for " + searches[0].fullTitle,
                color: 0x7289da
            }
            await interaction.deferReply()
            await interaction.editReply({ embeds: [initial] });
            const lyrics = await searches[0].lyrics();
            const embed = {
                title: searches[0].title,
                description: lyrics,
                color: 0x7289da
            }
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.reply(`Unable to find lyrics. Please try a manual search`);
        }

    },
};