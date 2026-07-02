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

type RunMode = "generation" | "clipping";

type ClipReport = {
  source: {
    title?: string;
    author?: string;
    durationSeconds: number;
  };
  outputDir: string;
  clips: Array<{
    segment: {
      id: string;
      title: string;
      start: number;
      end: number;
      hashtags: string[];
    };
    render?: { status: string; path?: string };
    upload?: { status: string; publicUrl?: string };
    publish?: { status: string };
  }>;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<RunMode>("clipping");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [clipReport, setClipReport] = useState<ClipReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const duration = useMemo(() => {
    const seconds = analysis?.source.durationSeconds ?? clipReport?.source.durationSeconds;
    if (!seconds) return "duree inconnue";
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }, [analysis?.source.durationSeconds, clipReport?.source.durationSeconds]);

  async function analyze() {
    setLoading(true);
    setError("");
    setAnalysis(null);
    setClipReport(null);

    const response = await fetch(mode === "clipping" ? "/api/clip" : "/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, limit: 1, publish: false }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Analyse impossible.");
      return;
    }

    if (mode === "clipping") {
      setClipReport(data);
    } else {
      setAnalysis(data);
    }
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
          factory clipping shorts
        </div>
        <h1>Colle un lien YouTube. Sors des clips verticaux prêts à valider.</h1>
        <p>
          Découpe les meilleurs moments d&apos;une vidéo YouTube en shorts 1080x1920 avec
          sous-titres, previews R2 et publication contrôlée après validation humaine.
        </p>

        <div className="modeSwitch" aria-label="Mode de pipeline">
          <button
            className={mode === "generation" ? "active" : ""}
            onClick={() => setMode("generation")}
            type="button"
          >
            <Wand2 size={16} />
            Génération IA legacy
          </button>
          <button
            className={mode === "clipping" ? "active" : ""}
            onClick={() => setMode("clipping")}
            type="button"
          >
            <Clapperboard size={16} />
            Clipping réel
          </button>
        </div>

        <div className="inputRow">
          <Link2 size={20} />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://youtu.be/..."
          />
          <button onClick={analyze} disabled={loading || !url}>
            <Wand2 size={18} />
            {loading ? "Traitement..." : mode === "clipping" ? "Clipper" : "Générer"}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </section>

      <section className="pipeline">
        {[
          ["Clipping", "Téléchargement, transcription et sélection des moments", Clapperboard],
          ["Format mobile", "Recadrage 1080x1920 et sous-titres dynamiques", Captions],
          ["Previews", "Upload R2 sans publication automatique", Mic2],
          ["Validation", "Publication YouTube/Instagram seulement après confirmation", BarChart3],
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

      {clipReport ? (
        <>
          <section className="source">
            <div>
              <span>source clippée</span>
              <h2>{clipReport.source.title ?? "Vidéo YouTube"}</h2>
              <p>
                {clipReport.source.author ?? "YouTube"} · {duration} · {clipReport.clips.length}{" "}
                clip
                {clipReport.clips.length > 1 ? "s" : ""}
              </p>
            </div>
          </section>

          <section className="grid">
            {clipReport.clips.map((clip, index) => (
              <article className="shortCard" key={clip.segment.id}>
                <div className="cardTop">
                  <span>clip {index + 1}</span>
                  <strong>{Math.round(clip.segment.end - clip.segment.start)}s</strong>
                </div>
                <h3>{clip.segment.title}</h3>
                <p className="hook">
                  {clip.segment.start.toFixed(1)}s → {clip.segment.end.toFixed(1)}s
                </p>
                <div className="meta">
                  <strong>{clip.render?.status ?? "en attente"}</strong>
                  <p>{clip.render?.path ?? clip.upload?.publicUrl ?? clipReport.outputDir}</p>
                  <span>{clip.segment.hashtags.join(" ")}</span>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}
