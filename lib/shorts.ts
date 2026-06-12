import OpenAI from "openai";
import type { YoutubeContext } from "./youtube";

export type ViralShort = {
  id: string;
  angle: string;
  hook: string;
  script: string;
  videoPrompt: string;
  title: string;
  description: string;
  hashtags: string[];
};

export type AnalysisResult = {
  source: YoutubeContext;
  shorts: ViralShort[];
  nextSteps: {
    voice: string;
    visuals: string;
    mp4: string;
    publishing: string;
  };
};

const fallbackAngles = [
  "Le moment qui change tout",
  "L'histoire que tout le monde va commenter",
  "L'analyse simple qui rend le sujet évident",
  "Le format stats qui donne envie de partager"
];

function cleanTopic(title: string) {
  return title.replace(/[-|].*YouTube/i, "").replace(/\s+/g, " ").trim();
}

function fallbackShorts(source: YoutubeContext): ViralShort[] {
  const topic = cleanTopic(source.title);

  return fallbackAngles.map((angle, index) => ({
    id: `short-${index + 1}`,
    angle,
    hook:
      index === 0
        ? `Tout le monde parle de ${topic}, mais le vrai moment viral est ailleurs.`
        : index === 1
          ? `Cette histoire autour de ${topic} peut faire exploser les commentaires.`
          : index === 2
            ? `En 45 secondes, voila pourquoi ${topic} est plus important qu'il n'y parait.`
            : `3 details sur ${topic} que la plupart des gens ont rates.`,
    script: `Tout part de cette video : ${topic}. L'objectif n'est pas de la recopier, mais de transformer le sujet en short original. On commence par un hook fort, puis on explique le contexte en une phrase. Ensuite, on isole le detail qui donne envie de regarder jusqu'au bout. Pour finir, on laisse une question simple en commentaire afin de pousser l'engagement.`,
    videoPrompt: `Vertical 9:16 sports news short about "${topic}". Fast editorial montage, cinematic stadium atmosphere, animated scoreboard, bold French captions, realistic but fully original AI visuals, no TV broadcast footage, no channel logos, high energy, punchy cuts, clean mobile framing.`,
    title: `${topic} : le detail qui peut devenir viral`,
    description: `Analyse originale inspiree du sujet "${topic}". Aucun extrait TV reutilise, video creee avec narration, visuels originaux et montage vertical.`,
    hashtags: ["#Football", "#WorldCup", "#Shorts", "#Foot", "#AnalyseFoot"]
  }));
}

export async function generateShorts(source: YoutubeContext): Promise<AnalysisResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      source,
      shorts: fallbackShorts(source),
      nextSteps: integrationStatus()
    };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const context = [
    `Titre: ${source.title}`,
    `Createur: ${source.author}`,
    source.description ? `Description: ${source.description}` : "",
    source.keywords.length ? `Mots-cles: ${source.keywords.join(", ")}` : "",
    source.transcript ? `Transcription: ${source.transcript.slice(0, 7000)}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Tu es un producteur de shorts viraux francophones. Tu crees des videos originales inspirees d'une source YouTube sans reutiliser d'images TV, logos, audio ou commentaires proteges. Reponds uniquement en JSON valide."
      },
      {
        role: "user",
        content: `A partir de ce contexte YouTube, genere exactement 4 shorts originaux. Chaque short doit contenir: id, angle, hook, script 45-60 secondes en francais, videoPrompt pour generer des visuels IA verticaux 9:16, title, description, hashtags. JSON attendu: {"shorts":[...]}\n\n${context}`
      }
    ]
  });

  const parsed = JSON.parse(completion.choices[0]?.message.content ?? "{}");
  return {
    source,
    shorts: parsed.shorts?.slice(0, 4) ?? fallbackShorts(source),
    nextSteps: integrationStatus()
  };
}

function integrationStatus() {
  return {
    voice: process.env.OPENAI_API_KEY
      ? "Disponible via /api/voice avec OpenAI TTS."
      : "Ajoute OPENAI_API_KEY pour generer la voix.",
    visuals:
      "Pret cote prompts. Pour generer des videos, il faut une API video: Veo, Runway, Kling, Pika ou Luma.",
    mp4:
      "Assemblage prevu avec Remotion/FFmpeg apres choix du fournisseur visuel.",
    publishing:
      "Publication auto possible apres configuration OAuth YouTube, TikTok et Instagram."
  };
}
