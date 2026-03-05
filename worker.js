// Cloudflare Worker for Telegram Bot
// KV Namespaces required: USERS, CHANNELS, BROADCAST_STATE

const BOT_TOKEN = 'BOT_TOKEN'; // Environment variable se set karenge
const ADMIN_ID = ADMIN_ID; // Apna Telegram User ID
const CHANNEL_LINK = 'UPDATE_CHANNEL_LINK'; // Apna channel link

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Webhook setup endpoint
    if (url.pathname === '/setup-webhook') {
      const webhookUrl = `${url.origin}/webhook`;
      const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}&allowed_updates=["message","my_chat_member"]`;
      
      const response = await fetch(telegramUrl);
      const data = await response.json();
      
      return new Response(JSON.stringify({
        success: data.ok,
        message: data.ok ? 'Webhook set successfully!' : 'Failed to set webhook',
        webhook_url: webhookUrl,
        details: data
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Webhook info endpoint
    if (url.pathname === '/webhook-info') {
      const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
      const response = await fetch(telegramUrl);
      const data = await response.json();
      
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Main webhook endpoint
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        console.log('Received update:', JSON.stringify(update));
        
        // Handle update asynchronously
        ctx.waitUntil(handleUpdate(update, env));
        
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error handling update:', error);
        return new Response('Error: ' + error.message, { status: 200 });
      }
    }

    return new Response('Bot is running! ✅', { status: 200 });
  }
};

// Handle incoming updates
async function handleUpdate(update, env) {
  try {
    console.log('Processing update:', update);

    // Handle /start command
    if (update.message?.text === '/start') {
      await handleStart(update, env);
    }
    
    // Handle /channel_broadcast command
    else if (update.message?.text === '/channel_broadcast') {
      await handleChannelBroadcast(update, env);
    }
    
    // Handle /user_broadcast command
    else if (update.message?.text === '/user_broadcast') {
      await handleUserBroadcast(update, env);
    }
    
    // Handle /cancel command
    else if (update.message?.text === '/cancel') {
      await handleCancel(update, env);
    }
    
    // Delete join/leave messages (ye sabse pehle check karo)
    else if (update.message?.new_chat_members || update.message?.left_chat_member) {
      await deleteMessage(update.message.chat.id, update.message.message_id);
    }
    
    // Handle bot added to group
    else if (update.my_chat_member) {
      await handleMyChatMember(update, env);
    }
    
    // Handle broadcast messages
    else if (update.message && (update.message.text || update.message.photo || update.message.video)) {
      const userId = update.message.from.id;
      const stateData = await env.BROADCAST_STATE.get(`state_${userId}`);
      
      if (stateData) {
        await handleBroadcastMessage(update, env);
      }
    }
  } catch (error) {
    console.error('Error in handleUpdate:', error);
  }
}

// Handle /start command
async function handleStart(update, env) {
  try {
    const user = update.message.from;
    const chatId = update.message.chat.id;
    
    console.log('Start command from user:', user.id);
    
    // Save user to KV
    const userData = {
      user_id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      started_at: new Date().toISOString()
    };
    
    await env.USERS.put(`user_${user.id}`, JSON.stringify(userData));
    console.log('User saved to KV');
    
    // Notify admin
    try {
      await sendMessage(ADMIN_ID, 
        `🆕 ${user.first_name} started the bot.\n` +
        `User ID: ${user.id}\n` +
        `Username: @${user.username || 'None'}`
      );
    } catch (e) {
      console.error('Failed to notify admin:', e);
    }
    
    // Send welcome message with inline button
    const keyboard = {
      inline_keyboard: [[
        { text: 'Join Now ✅', url: CHANNEL_LINK }
      ]]
    };
    
    await sendMessage(chatId,
      `Hii ${user.first_name}! I can remove join leave messages in your group! ` +
      `to make your group neat and clean 🫧. Just add me in your group as an admin ` +
      `and see the magic ✨\n\n` +
      `Join Our Update Channel For More Interesting Tools 😃`,
      keyboard
    );
    
    console.log('Welcome message sent');
  } catch (error) {
    console.error('Error in handleStart:', error);
  }
}

// Handle bot added to group
async function handleMyChatMember(update, env) {
  try {
    const chat = update.my_chat_member.chat;
    const newStatus = update.my_chat_member.new_chat_member.status;
    const oldStatus = update.my_chat_member.old_chat_member.status;
    
    console.log('Chat member update:', { chat: chat.id, oldStatus, newStatus });
    
    // Check if bot was added to group
    if ((chat.type === 'group' || chat.type === 'supergroup') &&
        oldStatus === 'left' && 
        (newStatus === 'member' || newStatus === 'administrator')) {
      
      // Save channel to KV
      const channelData = {
        chat_id: chat.id,
        title: chat.title,
        username: chat.username,
        added_at: new Date().toISOString()
      };
      
      await env.CHANNELS.put(`channel_${chat.id}`, JSON.stringify(channelData));
      console.log('Channel saved to KV');
      
      // Notify admin
      const addedBy = update.my_chat_member.from;
      await sendMessage(ADMIN_ID,
        `🎉 ${addedBy.first_name} added the bot to ${chat.title}\n` +
        `Chat ID: ${chat.id}\n` +
        `Username: @${chat.username || 'None'}`
      );
    }
  } catch (error) {
    console.error('Error in handleMyChatMember:', error);
  }
}

// Handle /channel_broadcast
async function handleChannelBroadcast(update, env) {
  try {
    const userId = update.message.from.id;
    const chatId = update.message.chat.id;
    
    if (userId !== ADMIN_ID) {
      await sendMessage(chatId, '⛔ Only admin can use this command!');
      return;
    }
    
    await env.BROADCAST_STATE.put(`state_${userId}`, JSON.stringify({
      type: 'channel',
      waiting: true
    }));
    
    await sendMessage(chatId,
      '📢 Channel Broadcast Mode Activated!\n\n' +
      'Send me the message you want to broadcast to all channels.\n' +
      'You can send:\n' +
      '• Text messages\n' +
      '• Photos with captions\n' +
      '• Videos with captions\n\n' +
      'Send /cancel to cancel.'
    );
  } catch (error) {
    console.error('Error in handleChannelBroadcast:', error);
  }
}

// Handle /user_broadcast
async function handleUserBroadcast(update, env) {
  try {
    const userId = update.message.from.id;
    const chatId = update.message.chat.id;
    
    if (userId !== ADMIN_ID) {
      await sendMessage(chatId, '⛔ Only admin can use this command!');
      return;
    }
    
    await env.BROADCAST_STATE.put(`state_${userId}`, JSON.stringify({
      type: 'user',
      waiting: true
    }));
    
    await sendMessage(chatId,
      '📢 User Broadcast Mode Activated!\n\n' +
      'Send me the message you want to broadcast to all users.\n' +
      'You can send:\n' +
      '• Text messages\n' +
      '• Photos with captions\n' +
      '• Videos with captions\n\n' +
      'Send /cancel to cancel.'
    );
  } catch (error) {
    console.error('Error in handleUserBroadcast:', error);
  }
}

// Handle /cancel
async function handleCancel(update, env) {
  try {
    const userId = update.message.from.id;
    const chatId = update.message.chat.id;
    const state = await env.BROADCAST_STATE.get(`state_${userId}`);
    
    if (state) {
      await env.BROADCAST_STATE.delete(`state_${userId}`);
      await sendMessage(chatId, '❌ Broadcast cancelled!');
    } else {
      await sendMessage(chatId, 'No active broadcast to cancel.');
    }
  } catch (error) {
    console.error('Error in handleCancel:', error);
  }
}

// Handle broadcast messages
async function handleBroadcastMessage(update, env) {
  try {
    const userId = update.message.from.id;
    const stateData = await env.BROADCAST_STATE.get(`state_${userId}`);
    
    if (!stateData) return;
    
    const state = JSON.parse(stateData);
    if (!state.waiting) return;
    
    const message = update.message;
    const chatId = message.chat.id;
    
    // Clear broadcast state
    await env.BROADCAST_STATE.delete(`state_${userId}`);
    
    // Send status message
    const statusMsg = await sendMessage(chatId,
      `🚀 Starting ${state.type} broadcast...\nPlease wait...`
    );
    
    let successCount = 0;
    let failCount = 0;
    let total = 0;
    
    if (state.type === 'channel') {
      // Get all channels from KV
      const channelsList = await env.CHANNELS.list();
      total = channelsList.keys.length;
      
      for (const key of channelsList.keys) {
        const channelData = await env.CHANNELS.get(key.name);
        const channel = JSON.parse(channelData);
        
        try {
          if (message.text) {
            await sendMessage(channel.chat_id, message.text);
          } else if (message.photo) {
            await sendPhoto(channel.chat_id, message.photo[message.photo.length - 1].file_id, message.caption);
          } else if (message.video) {
            await sendVideo(channel.chat_id, message.video.file_id, message.caption);
          }
          successCount++;
          await sleep(100); // Rate limiting
        } catch (error) {
          console.error(`Failed to send to channel ${channel.chat_id}:`, error);
          failCount++;
        }
      }
    } else {
      // Get all users from KV
      const usersList = await env.USERS.list();
      total = usersList.keys.length;
      
      for (const key of usersList.keys) {
        const userData = await env.USERS.get(key.name);
        const user = JSON.parse(userData);
        
        try {
          if (message.text) {
            await sendMessage(user.user_id, message.text);
          } else if (message.photo) {
            await sendPhoto(user.user_id, message.photo[message.photo.length - 1].file_id, message.caption);
          } else if (message.video) {
            await sendVideo(user.user_id, message.video.file_id, message.caption);
          }
          successCount++;
          await sleep(100); // Rate limiting
        } catch (error) {
          console.error(`Failed to send to user ${user.user_id}:`, error);
          failCount++;
        }
      }
    }
    
    // Update status message
    if (statusMsg.ok) {
      await editMessage(chatId, statusMsg.result.message_id,
        `✅ Broadcast completed!\n\n` +
        `📊 Total: ${total}\n` +
        `✅ Success: ${successCount}\n` +
        `❌ Failed: ${failCount}`
      );
    }
  } catch (error) {
    console.error('Error in handleBroadcastMessage:', error);
  }
}

// Helper function for rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Telegram API helpers
async function sendMessage(chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const data = await response.json();
  
  if (!data.ok) {
    console.error('Telegram API error:', data);
  }
  
  return data;
}

async function sendPhoto(chatId, photoId, caption = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
  const body = {
    chat_id: chatId,
    photo: photoId
  };
  
  if (caption) {
    body.caption = caption;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return await response.json();
}

async function sendVideo(chatId, videoId, caption = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`;
  const body = {
    chat_id: chatId,
    video: videoId
  };
  
  if (caption) {
    body.caption = caption;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return await response.json();
}

async function editMessage(chatId, messageId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: text
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return await response.json();
}

async function deleteMessage(chatId, messageId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
  const body = {
    chat_id: chatId,
    message_id: messageId
  };
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('Message deleted successfully');
  } catch (error) {
    console.error('Failed to delete message:', error);
  }
}
