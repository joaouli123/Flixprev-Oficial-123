import express from 'express';
import authRoutes from './server/auth-routes';

const app = express();

app.use(express.json());
app.use('/api', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});
