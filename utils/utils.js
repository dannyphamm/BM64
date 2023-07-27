let date = new Date().toLocaleString([], { dateStyle: 'long', timeStyle: 'long' });
const log = (...message) => {
    return console.log(date, ...message)
}
const error = (...message) => {
    return console.error(date, ...message)
}
module.exports = { log, error }