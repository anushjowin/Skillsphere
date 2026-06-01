const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Gig = require('./models/Gig');
require('dotenv').config();

async function seed() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Clear old data for a clean test
    await User.deleteMany({ email: { $in: ['client_test@skillsphere.com', 'freelancer_test@skillsphere.com'] }});
    
    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash('password123', salt);
    
    const client = await User.create({
        name: 'Test Client',
        email: 'client_test@skillsphere.com',
        password,
        role: 'client'
    });
    
    const freelancer = await User.create({
        name: 'Test Freelancer',
        email: 'freelancer_test@skillsphere.com',
        password,
        role: 'freelancer'
    });
    
    await Gig.deleteMany({ title: 'Test Gig for Chat' });
    const gig = await Gig.create({
        client: client._id,
        title: 'Test Gig for Chat',
        description: 'Need a developer to build an amazing React app.',
        budget: { min: 500, max: 1000 },
        skillsRequired: ['React', 'Node.js']
    });
    
    console.log("Database seeded with test client, freelancer, and gig!");
    process.exit(0);
}

seed().catch(err => console.log(err));
