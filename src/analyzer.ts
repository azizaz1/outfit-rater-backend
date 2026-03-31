import Groq from 'groq-sdk';
import fs from 'fs';

let client: Groq;
function getClient() {
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

export interface OutfitAnalysis {
  score: number;
  styleCategory: string;
  colorScore: number;
  fitScore: number;
  occasionFit: string;
  strengths: string[];
  improvements: string[];
  celebrityMatch: string;
  shoppingSuggestions: { item: string; reason: string }[];
  weatherTip?: string;
}

const SYSTEM_PROMPT = `You are a professional fashion stylist and outfit rater.
Analyze outfits objectively and constructively. Always return valid JSON only, no markdown.`;

function buildPrompt(language: string, occasion: string, weather?: string) {
  const weatherField = weather
    ? `\n  "weatherTip": <string, one sentence on how suitable this outfit is for the current weather: ${weather}>,`
    : '\n  "weatherTip": null,';
  return `Analyze this outfit photo for a ${occasion} occasion and return a JSON object with exactly these fields. Write all text values in ${language}:
{
  "score": <number 1-10, one decimal, how suitable this outfit is for a ${occasion} occasion>,
  "styleCategory": <string, e.g. "Casual Streetwear", "Business Casual", "Smart Casual">,
  "colorScore": <number 1-10>,
  "fitScore": <number 1-10>,
  "occasionFit": <string, one sentence on how well this outfit fits a ${occasion} occasion>,
  "strengths": [<3 specific positive observations for a ${occasion} occasion>],
  "improvements": [<2-3 actionable suggestions to better suit a ${occasion} occasion>],
  "celebrityMatch": <string, a real celebrity whose style closely matches this outfit>,
  "shoppingSuggestions": [<2-3 objects with "item" (specific product name, e.g. "White leather sneakers") and "reason" (one short sentence why it would elevate this outfit)>],${weatherField}
}`;
}

export interface ComparisonResult {
  winner: 1 | 2;
  outfit1Score: number;
  outfit2Score: number;
  outfit1Strengths: string[];
  outfit2Strengths: string[];
  verdict: string;
}

export async function compareOutfits(imagePath1: string, imagePath2: string, language: string = 'English', occasion: string = 'Casual'): Promise<ComparisonResult> {
  const base64Image1 = fs.readFileSync(imagePath1).toString('base64');
  const base64Image2 = fs.readFileSync(imagePath2).toString('base64');

  const response = await getClient().chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image1}` } },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image2}` } },
          {
            type: 'text',
            text: `Compare these two outfits for a ${occasion} occasion. The first image is Outfit 1, the second is Outfit 2. Write all text in ${language}. Return a JSON object with exactly these fields:
{
  "winner": <1 or 2, which outfit wins overall>,
  "outfit1Score": <number 1-10, one decimal>,
  "outfit2Score": <number 1-10, one decimal>,
  "outfit1Strengths": [<2 strengths of outfit 1>],
  "outfit2Strengths": [<2 strengths of outfit 2>],
  "verdict": <one punchy sentence explaining why the winner wins>
}`,
          },
        ],
      },
    ],
  });

  const text = response.choices[0].message.content ?? '';
  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned) as ComparisonResult;
}

export async function analyzeOutfit(imagePath: string, language: string = 'English', occasion: string = 'Casual', weather?: string): Promise<OutfitAnalysis> {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');

  const response = await getClient().chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
          {
            type: 'text',
            text: buildPrompt(language, occasion, weather),
          },
        ],
      },
    ],
  });

  const text = response.choices[0].message.content ?? '';
  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const analysis: OutfitAnalysis = JSON.parse(cleaned);
  return analysis;
}
