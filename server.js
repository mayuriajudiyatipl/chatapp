const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const { body, validationResult } = require('express-validator');

// MongoDB setup
const uri = 'mongodb://127.0.0.1:27017'; // Replace with your actual MongoDB connection string
const client = new MongoClient(uri);

let users = {}; // Stores user info {username: {socketId, isAdmin, ...}}

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
      secure: false,
      maxAge: 60 * 60 * 1000,
    },
  })
);

// Routes

// Registration Route
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post(
  '/register',
  // Validation middleware
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Invalid email address'),
  body('username').notEmpty().withMessage('Username is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { firstName, lastName, email, username, password, gender } = req.body;

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
        isAdmin: false,
      };

      await usersCollection.insertOne(newUser);
      req.session.username = username;

      res.redirect('/chat');
    } catch (err) {
      console.error('Error during registration:', err);
      res.status(500).send('Internal server error');
    }
  }
);

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

app.post(
  '/login',
  // Validation middleware
  body('username').notEmpty().withMessage('Username is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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

      req.session.username = username;
      req.session.isAdmin = user.isAdmin;

      res.redirect('/chat');
    } catch (err) {
      console.error('Error during login:', err);
      res.status(500).send('Internal server error');
    }
  }
);

// Session Route
app.get('/session', (req, res) => {
  if (req.session.username) {
    return res.json({ username: req.session.username, isAdmin: req.session.isAdmin });
  }
  res.json({ username: null });
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

// Clear Chat Route
app.get('/clearChat', (req, res) => {
  try {
    if (req.session.username) {
      chatMessagesCollection.deleteMany({});
      io.emit('clearChat', { message: `Chat history cleared by ${req.session.username}` });
      res.send('Chat cleared successfully');
    } else {
      res.status(401).send('Unauthorized');
    }
  } catch (err) {
    console.error('Error clearing chat:', err);
    res.status(500).send('Internal server error');
  }
});

// Socket.IO Events
io.on('connection', (socket) => {
  let username;

  socket.on('userJoin', async (data) => {
    username = data.username;
    users[username] = { isAdmin: false, socketId: socket.id };
    io.emit('updateUsers', users);

    try {
      const messages = await chatMessagesCollection
        .find()
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray();

      io.to(socket.id).emit('chatHistory', messages.reverse());
    } catch (err) {
      console.error('Error fetching chat history:', err);
      io.to(socket.id).emit('chatHistoryError', 'Failed to load chat history.');
    }
  });

  socket.on('sendMessage', async (message) => {
    try {
      const chatMessage = { username, message, timestamp: new Date() };
      await chatMessagesCollection.insertOne(chatMessage);
      io.emit('newMessage', chatMessage);
    } catch (err) {
      console.error('Error during sendMessage:', err);
    }
  });

  socket.on('disconnect', () => {
    if (username && users[username]) {
      delete users[username];
      io.emit('updateUsers', users);
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
