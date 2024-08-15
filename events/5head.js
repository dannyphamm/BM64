const { EmbedBuilder } = require('@discordjs/builders');
const config = require('../config.json');
const { log, error } = require('../utils/utils');
const { AttachmentBuilder } = require('discord.js');

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "The city of the location e.g San Francisco",
                    },
                    "country": {
                        "type": "string",
                        "description": "The country of the location e.g America",
                    },
                },
                "required": ["city", "country"],
            }
        }
    }
]
//function get current weather
const get_current_weather = async (city, country) => {
    log(city, country)
    let result = await fetch(`https://api.api-ninjas.com/v1/weather?city=${city}&country=${country}`, { headers: { 'X-Api-Key': config.factKey } })
        .then(response => {
            log("response", data)
            return response.json()
        })
        .then(async data => {
            log("data", data)
            return data;
        });
    return result;

}
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (config.mode !== 'DEV') {
            if (message.author.bot) return;
            if (message.type !== 0) return;
            //if (message.channel.id !== config['5headTextChannel']) return
            if (message.channel.type === 11 && message.channel.id === config['5headTextChannel']) {
                const body = {
                    "model": "meta-llama-3.1-8b-instruct",
                    "messages": [
                        {
                            "role": "user",
                            "content": message.content // Use the content of the message
                        }
                    ],
                    functions: tools,
                    function_call: "auto",
                    "temperature": 0.7
                };
                const reply = await message.reply('Generating response...');
                try {
                    const response = await fetch(config['5headAPI'] + '/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });
                    let data = await response.json();
                    log(data.choices[0].message)
                    if (data.choices[0].message.function_call) {
                        available_functions = {
                            "get_current_weather": get_current_weather,
                        }
                        function_name = data.choices[0].message["function_call"]["name"]
                        fuction_to_call = available_functions[function_name]
                        function_args = JSON.parse(data.choices[0].message["function_call"]["arguments"])
                        function_response = fuction_to_call(
                            city = function_args.get("city"),
                            country = function_args.get("country")
                        )

                        const body = {
                            "model": "meta-llama-3.1-8b-instruct",
                            "messages": [
                                data.choices[0].message
                                , {
                                    "role": "function",
                                    "name": function_name,
                                    "content": function_response
                                }
                            ],

                        };
                        const response = await fetch(config['5headAPI'] + '/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(body)
                        });
                        data = await response.json();
                    }
                    const content = data.choices[0].message.content;
                    const chunks = content.match(/[\s\S]{1,1990}/g);
                    // Edit the initial reply with the first chunk
                    await reply.edit(`\`\`\`${chunks[0]}\`\`\``);
                    // Send the remaining chunks as new messages
                    for (let i = 1; i < chunks.length; i++) {
                        await message.channel.send(`\`\`\`${chunks[i]}\`\`\``);
                    }
                } catch (e) {
                    error('Failed to call 5HeadAPI:', e);
                    // Handle the error...
                    await reply.edit('Failed to generate');
                }
            }

            if (message.channel.type === 11 && message.channel.id === config['5headImageChannel']) {
                const body = {
                    "prompt": message.content, // Use the content of the message
                    "size": "512x512"
                };
                const reply = await message.reply('Generating response...');
                try {
                    const response = await fetch(config['5headAPI'] + '/v1/images/generations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });
                    const data = await response.json();
                    console.log(data)
                    const imageUrl = data.data[0].url;
                    const attachment = new AttachmentBuilder(imageUrl);
                    await reply.edit({ content: 'Here is your image:', files: [attachment] });
                } catch (e) {
                    error('Failed to call 5HeadAPI:', e);
                    // Handle the error...
                    await reply.edit('Failed to generate');
                }
            }
        }
    },
};