import { spawn } from 'child_process';
import express from 'express';
import authRoutes from './server/auth-routes.js';

// Start API server on port 3001
const apiApp = express();
apiApp.use(express.json());
apiApp.use('/api', authRoutes.default);
apiApp.listen(3001, '0.0.0.0', () => {
  console.log('\n✅ API Server rodando em http://localhost:3001');
});

// Start Vite on port 5000
const vite = spawn('node_modules/.bin/vite', [], { stdio: 'inherit' });
process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
