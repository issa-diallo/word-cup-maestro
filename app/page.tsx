"use client";

import { BarChart3, Captions, Clapperboard, Copy, Link2, Mic2, Rocket, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

type ViralShort = {
  id: string;
  angle: string;
  hook: string;
  script: string;
  videoPrompt: string;
  title: string;
  description: string;
  hashtags: string[];
};

type Analysis = {
  source: {
    title: string;
    author: string;
    durationSeconds?: number;
    transcript: string;
  };
  shorts: ViralShort[];
  nextSteps: Record<string, string>;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const duration = useMemo(() => {
    const seconds = analysis?.source.durationSeconds;
    if (!seconds) return "duree inconnue";
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }, [analysis]);

  async function analyze() {
    setLoading(true);
    setError("");
    setAnalysis(null);

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Analyse impossible.");
      return;
    }

    setAnalysis(data);
  }

  function copyShort(short: ViralShort) {
    navigator.clipboard.writeText(
      [
        `ANGLE: ${short.angle}`,
        `HOOK: ${short.hook}`,
        `SCRIPT:\n${short.script}`,
        `PROMPT VIDEO:\n${short.videoPrompt}`,
        `TITRE: ${short.title}`,
        `DESCRIPTION:\n${short.description}`,
        `HASHTAGS: ${short.hashtags.join(" ")}`,
      ].join("\n\n"),
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">
          <Rocket size={16} />
          factory shorts monétisables
        </div>
        <h1>Colle un lien. Sors 4 shorts originaux.</h1>
        <p>
          Analyse le sujet d&apos;une vidéo YouTube et transforme-le en scripts, prompts visuels,
          titres, descriptions et hashtags prêts à produire.
        </p>

        <div className="inputRow">
          <Link2 size={20} />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://youtu.be/..."
          />
          <button onClick={analyze} disabled={loading || !url}>
            <Wand2 size={18} />
            {loading ? "Analyse..." : "Générer"}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </section>

      <section className="pipeline">
        {[
          ["Analyse", "Lien, titre, description, transcription", Clapperboard],
          ["Scripts", "4 angles viraux en français", Captions],
          ["Voix", "OpenAI TTS dès que la clé est ajoutée", Mic2],
          ["Publication", "YouTube, TikTok, Instagram via OAuth", BarChart3],
        ].map(([title, text, Icon]) => (
          <div className="step" key={title as string}>
            <Icon size={20} />
            <strong>{title as string}</strong>
            <span>{text as string}</span>
          </div>
        ))}
      </section>

      {analysis ? (
        <>
          <section className="source">
            <div>
              <span>source analysée</span>
              <h2>{analysis.source.title}</h2>
              <p>
                {analysis.source.author} · {duration} ·{" "}
                {analysis.source.transcript
                  ? "transcription trouvée"
                  : "sans transcription publique"}
              </p>
            </div>
          </section>

          <section className="grid">
            {analysis.shorts.map((short, index) => (
              <article className="shortCard" key={short.id}>
                <div className="cardTop">
                  <span>short {index + 1}</span>
                  <button onClick={() => copyShort(short)} title="Copier le short">
                    <Copy size={16} />
                  </button>
                </div>
                <h3>{short.angle}</h3>
                <p className="hook">{short.hook}</p>
                <div className="block">
                  <strong>Script</strong>
                  <p>{short.script}</p>
                </div>
                <div className="block">
                  <strong>Prompt vidéo</strong>
                  <p>{short.videoPrompt}</p>
                </div>
                <div className="meta">
                  <strong>{short.title}</strong>
                  <p>{short.description}</p>
                  <span>{short.hashtags.join(" ")}</span>
                </div>
              </article>
            ))}
          </section>

          <section className="requirements">
            <h2>Ce qu&apos;il faut pour activer la suite</h2>
            {Object.entries(analysis.nextSteps).map(([key, value]) => (
              <div key={key}>
                <strong>{key}</strong>
                <span>{value}</span>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}
