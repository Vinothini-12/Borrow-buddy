import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { uploadsDir } from './paths.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import needRoutes from './routes/needs.js';
import requestRoutes from './routes/requests.js';

export const app = express();

app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/needs', needRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
