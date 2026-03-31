import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { analyzeOutfit, compareOutfits } from './analyzer';
import { insertRating, getRatingsByUser } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

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

// Verify Supabase JWT and return user id
async function getUserId(authHeader?: string): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

async function fetchWeather(lat: number, lon: number): Promise<string | undefined> {
  try {
    const res = await fetch(`https://wttr.in/${lat},${lon}?format=j1`);
    if (!res.ok) return undefined;
    const data: any = await res.json();
    const cond = data?.current_condition?.[0];
    if (!cond) return undefined;
    const desc = cond.weatherDesc?.[0]?.value ?? '';
    const temp = cond.temp_C ?? '';
    return `${desc}, ${temp}°C`;
  } catch {
    return undefined;
  }
}

// POST /api/rate-outfit
app.post('/api/rate-outfit', upload.single('photo'), async (req, res) => {
  console.log('Request received, file:', req.file ? req.file.filename : 'NONE');

  const userId = await getUserId(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'No photo uploaded.' });
    return;
  }

  const imagePath = path.resolve(req.file.path);
  const language = req.body.language || 'English';
  const occasion = req.body.occasion || 'Casual';
  const lat = parseFloat(req.body.lat);
  const lon = parseFloat(req.body.lon);
  const weather = !isNaN(lat) && !isNaN(lon) ? await fetchWeather(lat, lon) : undefined;

  try {
    const analysis = await analyzeOutfit(imagePath, language, occasion, weather);

    const result = {
      id: uuidv4(),
      userId,
      photoUri: req.body.photoUri || req.file.path,
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

// POST /api/compare
app.post('/api/compare', upload.fields([{ name: 'photo1', maxCount: 1 }, { name: 'photo2', maxCount: 1 }]), async (req, res) => {
  const userId = await getUserId(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  const files = req.files as Record<string, Express.Multer.File[]>;
  if (!files?.photo1?.[0] || !files?.photo2?.[0]) {
    res.status(400).json({ success: false, error: 'Two photos required.' });
    return;
  }

  const path1 = path.resolve(files.photo1[0].path);
  const path2 = path.resolve(files.photo2[0].path);
  const language = req.body.language || 'English';
  const occasion = req.body.occasion || 'Casual';

  try {
    const result = await compareOutfits(path1, path2, language, occasion);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Compare error:', err);
    res.status(500).json({ success: false, error: 'Failed to compare outfits.' });
  } finally {
    fs.unlink(path1, () => {});
    fs.unlink(path2, () => {});
  }
});

// GET /api/history
app.get('/api/history', async (req, res) => {
  const userId = await getUserId(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  try {
    const ratings = await getRatingsByUser(userId);
    const history = ratings.map((r) => ({ success: true, data: r }));
    res.json(history);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch history.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Groq API key: ${process.env.GROQ_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? 'SET' : 'MISSING'}`);
});

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
