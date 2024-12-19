const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const { Server } = require('socket.io');

// MongoDB setup
const uri = 'mongodb://127.0.0.1:27017'; // Updated connection string
const client = new MongoClient(uri);

let users = {}; // Stores user info {username: {socketId, isAdmin, ...}}
let generalRoomMessages = []; // Store messages for the general chat room

async function connectMongo() {
  try {
    await client.connect();
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

connectMongo();

// Access database and collections
const database = client.db('chatapp');
const usersCollection = database.collection('users');
const chatMessagesCollection = database.collection('chatMessages');

// Express setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: 'maddy4454',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // For local dev
      maxAge: 60 * 60 * 1000, // Session expires after 1 hour
    },
  })
);

// Routes

// Registration Route
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, username, password, confirmPassword, gender } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).send('Passwords do not match');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await usersCollection.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).send('Username or email already taken');
    }

    const newUser = {
      firstName,
      lastName,
      email,
      username,
      password: hashedPassword,
      gender,
      isAdmin: false, // Default to regular user
    };

    await usersCollection.insertOne(newUser);
    req.session.username = username;

    res.redirect('/chat');
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).send('Internal server error');
  }
});

// Login Route
app.get('/', (req, res) => {
  try {
    if (req.session.username) {
      res.redirect('/chat');
    } else {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  } catch (err) {
    console.error('Error during login page load:', err);
    res.status(500).send('Internal server error');
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await usersCollection.findOne({ username });
    if (!user) {
      return res.status(400).send('User not found');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send('Invalid credentials');
    }

    // Set session data
    req.session.username = username;
    req.session.isAdmin = user.isAdmin;

    res.redirect('/chat'); // Redirect to the chat page after successful login
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).send('Internal server error');
  }
});

app.get('/session', (req, res) => {
  if (req.session.username) {
    return res.json({ username: req.session.username, isAdmin: req.session.isAdmin });
  }
  res.json({ username: null }); // If no session, return null username
});

// Chat Route
app.get('/chat', (req, res) => {
  try {
    if (req.session.username) {
      res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    } else {
      res.redirect('/');
    }
  } catch (err) {
    console.error('Error during chat page load:', err);
    res.status(500).send('Internal server error');
  }
});

// Logout Route
app.post('/logout', (req, res) => {
  try {
    if (req.session.username) {
      delete users[req.session.username];
    }
    req.session.destroy();
    res.redirect('/');
  } catch (err) {
    console.error('Error during logout:', err);
    res.status(500).send('Internal server error');
  }
});

// Socket.IO Events
io.on('connection', (socket) => {
  let username;

  socket.on('userJoin', async (data) => {
    try {
      username = data.username;
      const user = await usersCollection.findOne({ username });
      if (user) {
        users[username] = { isAdmin: user.isAdmin, socketId: socket.id };
        io.emit('updateUsers', users); // Broadcast updated user list

        const messages = await chatMessagesCollection.find().sort({ timestamp: 1 }).toArray();
        io.to(socket.id).emit('chatHistory', messages);
      }
    } catch (err) {
      console.error('Error during user join:', err);
    }
  });

  socket.on('sendMessage', async (message) => {
    try {
      const chatMessage = { username, message, timestamp: new Date() };
      generalRoomMessages.push(chatMessage);

      await chatMessagesCollection.insertOne(chatMessage);

      io.emit('newMessage', chatMessage);

      Object.values(users).forEach((user) => {
        if (user.socketId !== socket.id) {
          sendBrowserNotification(io, user.socketId, `${username}: ${message}`);
        }
      });
    } catch (err) {
      console.error('Error during sendMessage:', err);
    }
  });

  socket.on('disconnect', () => {
    try {
      if (username && users[username]) {
        delete users[username];
        io.emit('updateUsers', users);
      }
    } catch (err) {
      console.error('Error during disconnect:', err);
    }
  });

  socket.on('clearChat', async () => {
    try {
      if (users[username]?.isAdmin) {
        generalRoomMessages = [];
        await chatMessagesCollection.deleteMany({});
        io.emit('clearChat');
      }
    } catch (err) {
      console.error('Error during clearChat:', err);
    }
  });

  socket.on('kickUser', (targetUsername) => {
    try {
      if (users[username]?.isAdmin && users[targetUsername]) {
        const targetSocketId = users[targetUsername].socketId;
        io.to(targetSocketId).emit('kicked');
        delete users[targetUsername];
        io.emit('updateUsers', users);
      }
    } catch (err) {
      console.error('Error during kickUser:', err);
    }
  });
});

// Serve static files
app.get('/profile', (req, res) => {
  try {
    if (req.session.username) {
      res.sendFile(path.join(__dirname, 'public', 'profile.html'));
    } else {
      res.redirect('/');
    }
  } catch (err) {
    console.error('Error during profile page load:', err);
    res.status(500).send('Internal server error');
  }
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
