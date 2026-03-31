import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient;
function getSupabase() {
  if (!supabase) supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  return supabase;
}

export interface RatingRecord {
  id: string;
  user_id: string;
  photo_uri: string;
  score: number;
  style_category: string;
  color_score: number;
  fit_score: number;
  occasion_fit: string;
  strengths: string[];
  improvements: string[];
  created_at: string;
}

export async function insertRating(rating: {
  id: string;
  userId: string;
  photoUri: string;
  score: number;
  styleCategory: string;
  colorScore: number;
  fitScore: number;
  occasionFit: string;
  strengths: string[];
  improvements: string[];
  createdAt: string;
}) {
  const { error } = await getSupabase().from('ratings').insert({
    id: rating.id,
    user_id: rating.userId,
    photo_uri: rating.photoUri,
    score: rating.score,
    style_category: rating.styleCategory,
    color_score: rating.colorScore,
    fit_score: rating.fitScore,
    occasion_fit: rating.occasionFit,
    strengths: rating.strengths,
    improvements: rating.improvements,
    created_at: rating.createdAt,
  });

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
}

export async function getRatingsByUser(userId: string) {
  const { data, error } = await getSupabase()
    .from('ratings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Supabase fetch error: ${error.message}`);

  return (data as RatingRecord[]).map((row) => ({
    id: row.id,
    photoUri: row.photo_uri,
    score: row.score,
    styleCategory: row.style_category,
    colorScore: row.color_score,
    fitScore: row.fit_score,
    occasionFit: row.occasion_fit,
    strengths: row.strengths,
    improvements: row.improvements,
    createdAt: row.created_at,
  }));
}
