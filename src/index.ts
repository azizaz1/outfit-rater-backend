import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { analyzeOutfit } from './analyzer';
import { insertRating, getAllRatings } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, _file, cb) => cb(null, `${uuidv4()}.jpg`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/rate-outfit
app.post('/api/rate-outfit', upload.single('photo'), async (req, res) => {
  console.log('Request received, file:', req.file ? req.file.filename : 'NONE');
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No photo uploaded.' });
    return;
  }

  const imagePath = path.resolve(req.file.path);
  const language = req.body.language || 'English';
  const occasion = req.body.occasion || 'Casual';

  try {
    const analysis = await analyzeOutfit(imagePath, language, occasion);

    const result = {
      id: uuidv4(),
      photoUri: req.file.path,
      ...analysis,
      createdAt: new Date().toISOString(),
    };

    await insertRating(result);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ success: false, error: 'Failed to analyze outfit.' });
  } finally {
    fs.unlink(imagePath, () => {});
  }
});

// GET /api/history
app.get('/api/history', async (_req, res) => {
  try {
    const ratings = await getAllRatings();
    const history = ratings.map((r) => ({ success: true, data: r }));
    res.json(history);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch history.' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Groq API key: ${process.env.GROQ_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? 'SET' : 'MISSING'}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
