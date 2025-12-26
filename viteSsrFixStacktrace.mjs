import express from 'express';
import authRoutes from './server/auth-routes.ts' assert { type: 'module' };

const app = express();

app.use(express.json());
app.use('/api', authRoutes);

// Serve static files 
app.use(express.static('dist'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile('dist/index.html', { root: '.' });
});

app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});
