import express from 'express';
import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import cors from 'cors';

// Load environment variables
config();

// Create bot instance
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Store the group ID
const GROUP_ID = process.env.GROUP_ID;

// Verify environment variables
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

if (!GROUP_ID) {
  console.error('GROUP_ID is not set in .env file');
  process.exit(1);
}

// Middleware for logging
bot.use(async (ctx, next) => {
  const start = new Date();
  await next();
  const ms = new Date().getTime() - start.getTime();
  console.log('Response time: %sms', ms);
});

// Command handlers
bot.command('verify', async (ctx) => {
  try {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;

    if (!userId) {
      return ctx.reply('Could not verify your Telegram account.');
    }

    // Check if user is a member of the group
    const chatMember = await ctx.telegram.getChatMember(GROUP_ID, userId);
    
    if (chatMember.status === 'left' || chatMember.status === 'kicked') {
      return ctx.reply('You need to be a member of the Nillion group to verify.');
    }

    // User is a member
    console.log(`User ${userId} (${username}) verified as a member`);
    return ctx.reply('Your Telegram account has been verified! You are a member of the Nillion group.');
  } catch (error) {
    console.error('Verification error:', error);
    return ctx.reply('An error occurred during verification. Please try again later.');
  }
});

bot.command('status', async (ctx) => {
  try {
    const botInfo = await ctx.telegram.getMe();
    const groupInfo = await ctx.telegram.getChat(GROUP_ID);
    
    return ctx.reply(
      `Bot Status:\n` +
      `Name: ${botInfo.first_name}\n` +
      `Username: @${botInfo.username}\n` +
      `Group: ${groupInfo.type === 'group' || groupInfo.type === 'supergroup' ? groupInfo.title : 'N/A'}\n` +
      `Group ID: ${GROUP_ID}\n` +
      `Environment: ${process.env.NODE_ENV || 'development'}`
    );
  } catch (error) {
    console.error('Status check error:', error);
    return ctx.reply('Error checking bot status.');
  }
});

bot.command('userid', async (ctx) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name;
  if (userId) {
    await ctx.reply(`Your Telegram user ID is: \`${userId}\`\nUsername: @${username}`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('Could not retrieve your user ID.');
  }
});

bot.command('groupid', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId) {
    await ctx.reply(`This group's ID is: \`${chatId}\``, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('Could not retrieve the group ID.');
  }
});

// Handler for when the bot is mentioned in a group and an admin tags a user
bot.on('text', async (ctx) => {
  // Only respond in groups
  if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') return;

  const botInfo = await ctx.telegram.getMe();
  const botMention = `@${botInfo.username}`;

  // Check if the message mentions the bot
  if (ctx.message?.text?.includes(botMention)) {
    // Check if sender is admin
    const admins = await ctx.getChatAdministrators();
    const isAdmin = admins.some(admin => admin.user.id === ctx.from?.id);
    if (!isAdmin) {
      return ctx.reply('Only group admins can use this command.');
    }

    // Find mentioned user (other than the bot)
    const entities = ctx.message.entities || [];
    let targetUserId = null;
    let targetUsername = null;
    for (const entity of entities) {
      if (entity.type === 'text_mention' && entity.user && entity.user.id !== botInfo.id) {
        targetUserId = entity.user.id;
        targetUsername = entity.user.username || entity.user.first_name;
        break;
      }
      if (entity.type === 'mention' && ctx.message.text) {
        const mentioned = ctx.message.text.substring(entity.offset, entity.offset + entity.length);
        if (mentioned !== botMention) {
          // Try to resolve username to userId (Telegram API does not provide this directly)
          // So just show the username
          targetUsername = mentioned;
        }
      }
    }

    if (targetUserId) {
      await ctx.reply(`User @${targetUsername || 'unknown'} has Telegram user ID: ${targetUserId}`);
    } else if (targetUsername) {
      await ctx.reply(`Username ${targetUsername} was mentioned, but Telegram does not allow bots to resolve user IDs from @username mentions unless the user has interacted with the bot.`);
    } else {
      await ctx.reply('Please tag a user (not just the bot) to get their user ID.');
    }
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('An error occurred. Please try again later.');
});

// Express app for HTTP endpoints
const app = express();
app.use(cors()); // Allow all origins for development

// Health check endpoint
app.get('/', (req, res) => res.send('Telegram bot is running!'));

// API endpoint for user verification (by userId or username)
app.get('/api/verify', async (req, res) => {
  const { userId, username, groupId } = req.query;
  try {
    let chatMember;
    let resolvedUserId = userId ? Number(userId) : undefined;
    if (!userId && username) {
      // Remove leading @ if present
      const cleanUsername = (username as string).replace(/^@/, '');
      try {
        // Try to get the user by username using getChatMember (with @username)
        chatMember = await bot.telegram.getChatMember(groupId as string, `@${cleanUsername}` as any);
        resolvedUserId = chatMember.user.id;
      } catch (e) {
        // If not found, try to find among group admins
        const admins = await bot.telegram.getChatAdministrators(groupId as string);
        const admin = admins.find(a => a.user.username && a.user.username.toLowerCase() === cleanUsername.toLowerCase());
        if (admin) {
          resolvedUserId = admin.user.id;
        } else {
          return res.status(404).json({ exists: false, error: 'User not found in group or among admins.' });
        }
      }
    }
    // Only call getChatMember with a number for userId and only if we haven't already found chatMember
    if (!chatMember && resolvedUserId !== undefined && typeof resolvedUserId === 'number') {
      chatMember = await bot.telegram.getChatMember(groupId as string, resolvedUserId);
    }
    if (chatMember) {
      res.json({ exists: true, userId: chatMember.user.id, username: chatMember.user.username, status: chatMember.status });
    } else {
      res.status(404).json({ exists: false });
    }
  } catch (e) {
    res.status(404).json({ exists: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Telegram bot HTTP server running on port ${PORT}`);
});

// Start the bot
bot.launch()
  .then(() => {
    console.log('Telegram bot is running...');
    console.log(`Monitoring group: ${GROUP_ID}`);
  })
  .catch((error) => {
    console.error('Error starting bot:', error);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
