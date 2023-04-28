let date = new Date().toLocaleString([], { dateStyle: 'long', timeStyle: 'long' });
const log = (message) => {
    return console.log(date, message)
}

module.exports = log