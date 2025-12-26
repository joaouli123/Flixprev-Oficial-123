// This file is imported by Node before anything else
import express from 'express';

// Dynamically import the auth routes
const authRoutes = await import('./server/auth-routes.ts', { with: { type: 'module' } });

const app = express();
app.use(express.json());
app.use('/api', authRoutes.default);

app.listen(3001, '0.0.0.0', () => {
  console.log('\n✅ API Server rodando em http://localhost:3001');
}).on('error', (err) => {
  if (err.code !== 'EADDRINUSE') {
    // Port already in use, that's fine - server is already running
  }
});
