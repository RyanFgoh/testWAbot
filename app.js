const http = require('http');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// --- Configuration ---
const PORT = 5512;
const GROUP_CHAT_NAME = "Perplexity AI";
const FORWARD_USER_NAME = "Perplexity";
const BOT_MENTION = "@bot";

// --- Bot State ---
let forwardingUntil = null; // Timestamp until which we forward messages
let originalGroupChat = null; // The chat to forward replies back to

// --- Web Server ---
// A simple server to satisfy the port requirement and show bot status.
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`WhatsApp Bot Status:\n- Running on port ${PORT}\n- Monitoring Group: ${GROUP_CHAT_NAME}\n- Bot Mention: ${BOT_MENTION}`);
});

// --- WhatsApp Client ---
console.log("Initializing WhatsApp client...");
const client = new Client({
    authStrategy: new LocalAuth() // Use local session saving
});

client.on('qr', (qr) => {
    console.log('QR Code Received, please scan:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Bot is running. Monitoring '${GROUP_CHAT_NAME}' for mentions of '${BOT_MENTION}'.`);
    });
});

client.on('message_create', async (msg) => {
    try {
        const chat = await msg.getChat();

        // --- Task 1: Check for and Forward Replies ---
        // First, check if the forwarding window has expired.
        if (forwardingUntil && Date.now() >= forwardingUntil) {
            console.log("Forwarding period has ended.");
            forwardingUntil = null;
            originalGroupChat = null;
        }

        // If we are in the forwarding window and the message is from the target user, forward it.
        if (forwardingUntil && chat.name === FORWARD_USER_NAME && !msg.fromMe) {
            console.log(`Forwarding reply from ${FORWARD_USER_NAME}: "${msg.body}"`);
            if (originalGroupChat) {
                await originalGroupChat.sendMessage(msg.body);
            }
        }

        // --- Task 2: Check for New Mentions in the Group ---
        // This check runs independently of the forwarding logic above.
        if (chat.isGroup && chat.name === GROUP_CHAT_NAME && msg.body.includes(BOT_MENTION)) {
            const query = msg.body.replace(BOT_MENTION, "").trim();
            console.log(`Mention detected in ${GROUP_CHAT_NAME}! Query: "${query}"`);

            // Find the user to forward the query to
            const contacts = await client.getContacts();
            const forwardUserContact = contacts.find(c => c.name === FORWARD_USER_NAME && !c.isGroup);

            if (forwardUserContact) {
                const forwardChat = await forwardUserContact.getChat();
                await forwardChat.sendMessage(query);
                console.log(`Query sent to ${FORWARD_USER_NAME}.`);

                // Activate forwarding mode for the next 60 seconds
                console.log("Entering forwarding mode for 60 seconds.");
                forwardingUntil = Date.now() + 60000; // 60 seconds from now
                originalGroupChat = chat;

            } else {
                console.log(`Error: Contact ${FORWARD_USER_NAME} not found.`);
                await msg.reply(`Sorry, I couldn't find the user '${FORWARD_USER_NAME}' in my contacts.`);
            }
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

client.initialize();
