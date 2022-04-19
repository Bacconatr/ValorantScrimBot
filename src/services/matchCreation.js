const CONSTANTS = require('../constants')
const moment = require('moment-timezone')
const chrono = require('chrono-node')

module.exports = exports = {
  name: 'matchCreation',
  enabled: true,
  /**
   * @param {import('../index.js').GLOBALS} GLOBALS
   */
  process: async (GLOBALS) => {
    GLOBALS.client.on('message', async message => {
      if (message.author === GLOBALS.client.user || message.author.bot === true) return // ignore messages from the bot itself or other bots
      if (GLOBALS.activeMatchCreation.has(message.author.id)) handleMatchCreation(GLOBALS.activeMatchCreation.get(message.author.id), message, GLOBALS)
      if (GLOBALS.activeMatchCreation.has(message.author.id)) handleMatchCreationSerious(GLOBALS.activeMatchCreation.get(message.author.id),message,GLOBALS)
    })
    GLOBALS.client.on('messageReactionAdd', (reaction, user) => {
      if (user.bot) return // ignore messages from the bot itself or other bots
      if (GLOBALS.activeMatchCreation.has(user.id)) cancelMatchCreation(reaction, user, GLOBALS)
    })
  }
}

/**
 * @param {import('../index.js').GLOBALS} GLOBALS
 */
const handleMatchCreation = async (matchRecord, userMessage, GLOBALS) => {
  if (userMessage.channel !== matchRecord.botMessage.channel) return

  if (userMessage.guild.me.hasPermission('MANAGE_MESSAGES')) userMessage.delete({ timeout: 500 })
  const content = userMessage.content.toLowerCase()
  switch (matchRecord.step) {
    case 0: {

      matchRecord.creationInformation.rankMinimum = 0
      matchRecord.creationInformation.rankMaximum = 99
      matchRecord.creationInformation.maxTeamCount = 5
      matchRecord.creationInformation.mode = 'standard'

      const date = chrono.parseDate(`${userMessage.content} ${moment.tz.zone(process.env.TIME_ZONE).abbr(Date.now())}`)
      if (!date) return userMessage.reply('please give a valid date!').then(msg => msg.delete({ timeout: 5000 }))
      matchRecord.creationInformation.date = date
      break
    }
    

        
    case 1: {
      matchRecord.creationInformation.spectators = (CONSTANTS.AFFIRMATIVE_WORDS.includes(content)) ? [] : false
      break
    
    }

  

    case 2: {
      if (content === 'any') {
        matchRecord.creationInformation.map = CONSTANTS.MAPS[Math.floor(Math.random() * Math.floor(CONSTANTS.MAPS.length))]
        break
      } else if (CONSTANTS.MAPS.includes(content)) {
        matchRecord.creationInformation.map = CONSTANTS.MAPS.find(e => e === content) || content
        break
      } else {
        return userMessage.reply('please give a valid map!').then(msg => msg.delete({ timeout: 5000 }))
      }
    }

  }

  if (matchRecord.step < CONSTANTS.matchCreationSteps.length - 1) {
    const embed = matchRecord.botMessage.embeds[0]

    const previousField = embed.fields[matchRecord.step]
    previousField.name = '✅ ' + previousField.name

    matchRecord.step = matchRecord.step + 1

    const stepInfo = CONSTANTS.matchCreationSteps[matchRecord.step]
    embed.addField(stepInfo[0], stepInfo[1])
    matchRecord.botMessage.edit(embed)

    GLOBALS.activeMatchCreation.set(matchRecord.userID, matchRecord)
  } else {
    const embed = new GLOBALS.Embed()
      .setAuthor(userMessage.author.tag, userMessage.author.avatarURL())
      .setTitle('Match Creation Complete')
      .setDescription('Your match has been made! To start it, type `s!match start <match id>`')
      .setFooter('This message will self-destruct in 30 seconds.')
    matchRecord.botMessage.edit(embed)
    matchRecord.botMessage.delete({ timeout: 30000 })
    if (userMessage.guild.me.hasPermission('MANAGE_MESSAGES')) matchRecord.botMessage.reactions.removeAll()
    else matchRecord.botReaction.remove()
    matchRecord.creationInformation.timestamp = new Date()

    const guildInformation = await GLOBALS.mongoDb.collection('guilds').findOne({ _id: userMessage.guild.id })
    let notificationRole = userMessage.guild.id
    if (guildInformation) notificationRole = guildInformation.notificationRole

    const matchEmbed = new GLOBALS.Embed()
      .setTitle('Match Information')
      .setDescription('React with 🇦 to join the A team, react with 🇧 to join the B team' + (matchRecord.creationInformation.spectators instanceof Array ? ', and react with 🇸 to be a spectator.' : '.'))
      .setThumbnail(CONSTANTS.MAPS_THUMBNAILS[matchRecord.creationInformation.map])
      .setTimestamp(matchRecord.creationInformation.date)
      .setAuthor(userMessage.author.tag, userMessage.author.avatarURL())
      .addField('Status', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.status), true)
      .addField('Game Mode', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.mode), true)
      .addField('Map', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.map), true)
      .addField('Max Team Count', matchRecord.creationInformation.maxTeamCount + ' players per team', true)
      .addField('Minimum Rank', CONSTANTS.capitalizeFirstLetter(CONSTANTS.RANKS_REVERSED[matchRecord.creationInformation.rankMinimum]), true)
      .addField('Maximum Rank', CONSTANTS.capitalizeFirstLetter(CONSTANTS.RANKS_REVERSED[matchRecord.creationInformation.rankMaximum]), true)
      .addField('Team A', 'None', true)
      .addField('Team B', 'None', true)
      .addField('Spectators', matchRecord.creationInformation.spectators instanceof Array ? 'None' : 'Not allowed', true)
    matchRecord.botMessage.channel.send(`A match has been created! <@&${notificationRole}>`, matchEmbed)
      .then(async message => {
        message.react('🇦').catch(console.error)
        message.react('🇧').catch(console.error)
        if (matchRecord.creationInformation.spectators) message.react('🇸').catch(console.error)
        matchEmbed.setFooter('match id: ' + message.id)
        message.edit(matchEmbed).catch(console.error)
        matchRecord.userMessage.delete().catch(console.error)
        matchRecord.creationInformation.message = {
          id: message.id,
          channel: message.channel.id
        }
        await GLOBALS.mongoDb.collection('matches').insertOne({ _id: message.id, ...matchRecord.creationInformation })
        GLOBALS.activeMatchCreation.delete(matchRecord.userID)
      }).catch(console.error)
  }
}

const handleMatchCreationSerious = async (matchRecord, userMessage, GLOBALS) => {
  if (userMessage.channel !== matchRecord.botMessage.channel) return

  if (userMessage.guild.me.hasPermission('MANAGE_MESSAGES')) userMessage.delete({ timeout: 500 })
  const content = userMessage.content.toLowerCase()
  switch (matchRecord.step) {
    case 0: {
      matchRecord.creationInformation.mode = 'Standard'
      matchRecord.creationInformation.maxTeamCount = 5
      const date = chrono.parseDate(`${userMessage.content} ${moment.tz.zone(process.env.TIME_ZONE).abbr(Date.now())}`)
      if (!date) return userMessage.reply('please give a valid date!').then(msg => msg.delete({ timeout: 5000 }))
      matchRecord.creationInformation.date = date
      break
    }

    case 1: {
      if (content === 'any') {
        matchRecord.creationInformation.rankMinimum = 0
        break
      } else if (!CONSTANTS.RANKS[userMessage.content.toUpperCase()]) {
        return userMessage.reply('please give a valid rank!').then(msg => msg.delete({ timeout: 5000 }))
      } else {
        matchRecord.creationInformation.rankMinimum = CONSTANTS.RANKS[userMessage.content.toUpperCase()] // TODO: cover edge cases
        break
      }
    }

    case 2: {
      if (content === 'any') {
        matchRecord.creationInformation.rankMaximum = 99
        break
      } else if (!CONSTANTS.RANKS[userMessage.content.toUpperCase()]) {
        return userMessage.reply('please give a valid rank!').then(msg => msg.delete({ timeout: 5000 }))
      } else if (CONSTANTS.RANKS[userMessage.content.toUpperCase()] < matchRecord.creationInformation.rankMinimum) {
        return userMessage.reply('the maximum rank cannot be below the minimum rank!').then(msg => msg.delete({ timeout: 5000 }))
      } else {
        matchRecord.creationInformation.rankMaximum = CONSTANTS.RANKS[userMessage.content.toUpperCase()] // TODO: cover edge cases
        break
      }
    }
  
    case 3:
      matchRecord.creationInformation.spectators = (CONSTANTS.AFFIRMATIVE_WORDS.includes(content)) ? [] : false
      break

    case 4: {
      if (content === 'any') {
        matchRecord.creationInformation.map = CONSTANTS.MAPS[Math.floor(Math.random() * Math.floor(CONSTANTS.MAPS.length))]
        break
      } else if (CONSTANTS.MAPS.includes(content)) {
        matchRecord.creationInformation.map = CONSTANTS.MAPS.find(e => e === content) || content
        break
      } else {
        return userMessage.reply('please give a valid map!').then(msg => msg.delete({ timeout: 5000 }))
      }
    }

    
  }

  if (matchRecord.step < CONSTANTS.matchCreationStepsSerious.length - 1) {
    const embed = matchRecord.botMessage.embeds[0]

    const previousField = embed.fields[matchRecord.step]
    previousField.name = '✅ ' + previousField.name

    matchRecord.step = matchRecord.step + 1

    const stepInfo = CONSTANTS.matchCreationStepsSerious[matchRecord.step]
    embed.addField(stepInfo[0], stepInfo[1])
    matchRecord.botMessage.edit(embed)

    GLOBALS.activeMatchCreation.set(matchRecord.userID, matchRecord)
  } else {
    const embed = new GLOBALS.Embed()
      .setAuthor(userMessage.author.tag, userMessage.author.avatarURL())
      .setTitle('Match Creation Complete')
      .setDescription('Your match has been made! To start it, type `s!match start <match id>`')
      .setFooter('This message will self-destruct in 30 seconds.')
    matchRecord.botMessage.edit(embed)
    matchRecord.botMessage.delete({ timeout: 30000 })
    if (userMessage.guild.me.hasPermission('MANAGE_MESSAGES')) matchRecord.botMessage.reactions.removeAll()
    else matchRecord.botReaction.remove()
    matchRecord.creationInformation.timestamp = new Date()

    const guildInformation = await GLOBALS.mongoDb.collection('guilds').findOne({ _id: userMessage.guild.id })
    let notificationRole = userMessage.guild.id
    if (guildInformation) notificationRole = guildInformation.notificationRole

    const matchEmbed = new GLOBALS.Embed()
      .setTitle('Match Information')
      .setDescription('React with 🇦 to join the A team, react with 🇧 to join the B team' + (matchRecord.creationInformation.spectators instanceof Array ? ', and react with 🇸 to be a spectator.' : '.'))
      .setThumbnail(CONSTANTS.MAPS_THUMBNAILS[matchRecord.creationInformation.map])
      .setTimestamp(matchRecord.creationInformation.date)
      .setAuthor(userMessage.author.tag, userMessage.author.avatarURL())
      .addField('Status', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.status), true)
      .addField('Game Mode', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.mode), true)
      .addField('Map', CONSTANTS.capitalizeFirstLetter(matchRecord.creationInformation.map), true)
      .addField('Max Team Count', matchRecord.creationInformation.maxTeamCount + ' players per team', true)
      .addField('Minimum Rank', CONSTANTS.capitalizeFirstLetter(CONSTANTS.RANKS_REVERSED[matchRecord.creationInformation.rankMinimum]), true)
      .addField('Maximum Rank', CONSTANTS.capitalizeFirstLetter(CONSTANTS.RANKS_REVERSED[matchRecord.creationInformation.rankMaximum]), true)
      .addField('Team A', 'None', true)
      .addField('Team B', 'None', true)
      .addField('Spectators', matchRecord.creationInformation.spectators instanceof Array ? 'None' : 'Not allowed', true)
    matchRecord.botMessage.channel.send(`A match has been created! <@&${notificationRole}>`, matchEmbed)
      .then(async message => {
        message.react('🇦').catch(console.error)
        message.react('🇧').catch(console.error)
        if (matchRecord.creationInformation.spectators) message.react('🇸').catch(console.error)
        matchEmbed.setFooter('match id: ' + message.id)
        message.edit(matchEmbed).catch(console.error)
        matchRecord.userMessage.delete().catch(console.error)
        matchRecord.creationInformation.message = {
          id: message.id,
          channel: message.channel.id
        }
        await GLOBALS.mongoDb.collection('matches').insertOne({ _id: message.id, ...matchRecord.creationInformation })
        GLOBALS.activeMatchCreation.delete(matchRecord.userID)
      }).catch(console.error)
  }
}

const cancelMatchCreation = async (reaction, user, GLOBALS) => {
  if (reaction.emoji.name === '❌') {
    const userRecord = GLOBALS.activeMatchCreation.get(user.id)
    const embed = new GLOBALS.Embed()
      .setTitle('ScrimBot Match Creation Cancelled')
      .setDescription('Your Match Creation has been cancelled. If you want to try again, just type s!match create.')
    userRecord.botMessage.edit(embed)
    GLOBALS.activeMatchCreation.delete(userRecord.userID)
    reaction.remove()
  }
}
