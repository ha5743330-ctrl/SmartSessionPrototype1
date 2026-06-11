const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server'); // Direct pointer to your server.js file

// Increase global timeout for the entire suite to 30 seconds
jest.setTimeout(30000);

describe('Auth API Integration Tests', () => {
  let serverInstance;

  // Capture the running server before tests execute
  beforeAll(() => {
    // If your server.js file starts the listener automatically, we listen for it
    serverInstance = app.listen(process.env.TEST_PORT || 3001);
  });

  // Clean up ALL running connections cleanly so Jest exits instantly
  afterAll(async () => {
    // 1. Close the HTTP Server Port Listener
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    // 2. Disconnect from MongoDB
    await mongoose.disconnect();
  });

  // Test 1: Testing your exact registration path
  it('should successfully register a new user with valid data', async () => {
    const uniqueEmail = `testuser_${Date.now()}@example.com`;
    
    const res = await request(app)
      .post('/api/register')
      .send({
        name: 'Test User',
        email: uniqueEmail,
        password: 'SecurePassword123!'
      });
    
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('redirect', '/face-auth');
    expect(res.body.message).toContain('Account created securely.');
  }, 30000);

  // Test 2: Checking bad payloads
  it('should reject registration if email is missing', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        name: 'Flawed User',
        password: 'SecurePassword123!'
      });
    
    expect([400, 500]).toContain(res.statusCode);
  }, 10000);
});