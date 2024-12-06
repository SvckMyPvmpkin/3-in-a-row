# Multiplayer Match-3 Game

A real-time multiplayer Match-3 game where 2-4 players compete to get the highest score in 5 minutes.

## Features

- 2-4 player support
- Real-time gameplay
- Live score updates
- 5-minute time limit
- Beautiful animations
- Responsive design

## How to Play

1. Enter your name and click "Join Game"
2. Wait for other players (2-4 total)
3. Make matches of 3 or more gems
4. See other players' moves in real-time
5. Highest score after 5 minutes wins!

## Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
node server.js
```

3. Open `http://localhost:3000` in your browser

## Deployment

The game can be deployed to any Node.js hosting platform. Here's how to deploy to Render:

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Use the following settings:
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. Deploy!
