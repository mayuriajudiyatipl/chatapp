const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

// MongoDB connection setup
const uri = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(uri);

async function initializeDatabase() {
    try {
        await client.connect();
        console.log('MongoDB connected successfully');

        const database = client.db('chatapp');

        // Ensure 'users' collection exists
        const collections = await database.listCollections({ name: 'users' }).toArray();
        if (collections.length === 0) {
            console.log("'users' collection does not exist. Creating it...");
            await database.createCollection('users');
        }

        // Ensure 'chatMessages' collection exists
        const chatCollections = await database.listCollections({ name: 'chatMessages' }).toArray();
        if (chatCollections.length === 0) {
            console.log("'chatMessages' collection does not exist. Creating it...");
            await database.createCollection('chatMessages');
        }

        // Add default admin user
        const defaultAdmin = {
            firstName: 'Mehul',
            lastName: 'Jogi',
            email: 'mehul@trivediinfotech.com',
            username: 'mehul',
            password: await bcrypt.hash('Mehul@123', 10), // Default admin password
            gender: 'Other',
            isAdmin: true,
        };

        const existingAdmin = await database.collection('users').findOne({ username: 'admin' });
        if (!existingAdmin) {
            console.log('Default admin user does not exist. Creating it...');
            await database.collection('users').insertOne(defaultAdmin);
        }

        console.log('Database initialization complete.');
    } catch (err) {
        console.error('Error during database initialization:', err);
    } finally {
        await client.close();
    }
}

// Execute the initialization
initializeDatabase().catch(console.error);
