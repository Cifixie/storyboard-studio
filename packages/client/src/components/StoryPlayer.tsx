"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Frame, Story } from "@/lib/types";

type StoryPlayerProps = { story: Story };
type StoryBeat = { scene: Story["scenes"][number]; sceneIndex: number; frame: Frame; frameIndex: number };

function playbackUrl(url: string) {
  return url.replace(/\.wav$/i, (extension, offset, path) => path.slice(0, offset).endsWith("_000") ? extension : "_000.wav");
}

export function StoryPlayer({ story }: StoryPlayerProps) {
  const beats = useMemo<StoryBeat[]>(() => story.scenes.flatMap((scene, sceneIndex) =>
    scene.frames.map((frame, frameIndex) => ({ scene, sceneIndex, frame, frameIndex }))), [story]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const beat = beats[activeIndex];

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= beats.length) return;
    stopAudio();
    setActiveIndex(index);
    setPlaying(false);
    setCompleted(false);
  }, [beats.length, stopAudio]);

  const next = useCallback(() => {
    if (activeIndex < beats.length - 1) goTo(activeIndex + 1);
    else {
      stopAudio();
      setPlaying(false);
      setCompleted(true);
    }
  }, [activeIndex, beats.length, goTo, stopAudio]);

  const handleAudioEnded = useCallback(() => {
    if (activeIndex < beats.length - 1) {
      goTo(activeIndex + 1);
      setPlaying(true);
    } else {
      next();
    }
  }, [activeIndex, beats.length, goTo, next]);

  const togglePlayback = useCallback(async () => {
    if (!beats.length) return;
    if (completed) {
      goTo(0);
      setCompleted(false);
      setPlaying(true);
      return;
    }
    const audio = audioRef.current;
    if (playing) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    if (!beat?.frame.audioUrl || !audio) return;
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [beat, beats.length, completed, goTo, playing]);

  useEffect(() => {
    if (!playing || !beat?.frame.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch(() => setPlaying(false));
  }, [activeIndex, beat, playing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "ArrowRight") { event.preventDefault(); next(); }
      if (event.code === "ArrowLeft") { event.preventDefault(); goTo(activeIndex - 1); }
      if (event.code === "Space" && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); void togglePlayback(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, goTo, next, togglePlayback]);

  const sceneBeatCount = beat?.scene.frames.length ?? 0;
  const progress = beats.length ? ((activeIndex + (completed ? 1 : 0)) / beats.length) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#101112] text-[#f3f0e9] selection:bg-amber-200 selection:text-[#111]">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-5 sm:px-9 lg:px-14">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="Back to story studio">
          <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Studio</span>
        </Link>
        <div className="min-w-0 flex-1 px-5 text-center">
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.25em] text-white/40">An illustrated story</p>
          <h1 className="truncate font-serif text-lg italic tracking-tight sm:text-xl">{story.title}</h1>
        </div>
        <span className="w-12 text-right font-mono text-xs tabular-nums text-white/50 sm:w-20">
          {beats.length ? `${String(activeIndex + 1).padStart(2, "0")} / ${String(beats.length).padStart(2, "0")}` : "—"}
        </span>
      </header>

      <div className="h-px bg-white/10"><div className="h-full bg-amber-200 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>

      {beat ? (
        <div className="mx-auto grid min-h-[calc(100svh-65px)] w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_390px]">
          <section aria-label="Story illustration" className="flex min-h-[48svh] items-center justify-center px-5 py-7 sm:px-9 lg:min-h-0 lg:px-12 lg:py-10">
            <div className="relative flex max-h-[68svh] w-full max-w-[980px] items-center justify-center overflow-hidden border border-white/10 bg-[#17191a] lg:max-h-[calc(100svh-170px)]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.035),transparent_68%)]" />
              {beat.frame.imageUrl ? (
                // Generated story art is served from the same-origin media directory.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={beat.frame.id} src={beat.frame.imageUrl} alt={beat.frame.description || `Illustration for ${beat.scene.title}`} className="relative max-h-[68svh] w-full object-contain lg:max-h-[calc(100svh-170px)]" fetchPriority="high" />
              ) : (
                <div className="crop-marks relative m-5 grid aspect-video w-full place-items-center text-center">
                  <div className="px-6">
                    <BookOpen className="mx-auto mb-3 size-7 text-amber-200/60" strokeWidth={1.25} />
                    <p className="font-serif text-lg italic text-white/65">The illustration for this moment is still being painted.</p>
                  </div>
                </div>
              )}
              <span className="absolute bottom-3 right-3 bg-black/55 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/60 backdrop-blur">{beat.frame.shotType ?? "story"}</span>
            </div>
          </section>

          <aside className="flex flex-col border-t border-white/10 px-6 pb-8 pt-7 sm:px-9 lg:border-l lg:border-t-0 lg:px-8 lg:pb-10 lg:pt-12">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="chapter-jump" className="text-[10px] font-medium uppercase tracking-[0.23em] text-white/40">Chapter</label>
              <div className="relative max-w-[72%]">
                <select id="chapter-jump" value={beat.sceneIndex} onChange={(event) => {
                  const sceneIndex = Number(event.target.value);
                  const first = beats.findIndex((item) => item.sceneIndex === sceneIndex);
                  if (first >= 0) goTo(first);
                }} className="max-w-full appearance-none bg-transparent py-1 pl-2 pr-7 text-right text-sm text-white/85 outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  {story.scenes.map((scene, index) => <option key={scene.id} value={index} className="bg-[#17191a] text-white">{String(index + 1).padStart(2, "0")} · {scene.title}</option>)}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-white/50" />
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs text-amber-200/75">Chapter {String(beat.sceneIndex + 1).padStart(2, "0")} <span className="px-1 text-white/25">/</span> {String(story.scenes.length).padStart(2, "0")}</p>
              <h2 className="mt-2 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">{beat.scene.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/45">{beat.scene.description}</p>
            </div>

            <div aria-live="polite" aria-atomic="true" className="my-8 flex-1">
              <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.23em] text-white/35">Moment {String(beat.frameIndex + 1).padStart(2, "0")} <span className="px-1 text-white/20">/</span> {String(sceneBeatCount).padStart(2, "0")}</p>
              <p className="max-w-[42ch] font-serif text-xl leading-[1.65] text-white/90 sm:text-[1.38rem]">{beat.frame.narration || beat.frame.description}</p>
              {beat.frame.characters.length > 0 && <p className="mt-6 text-xs text-white/40">With {beat.frame.characters.join(", ")}</p>}
            </div>

            {beat.frame.audioUrl && (
              <div className="mb-5 rounded-md border border-white/10 bg-white/[0.035] p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45">
                  <span className="flex items-center gap-2"><Volume2 className="size-3.5" /> Narration</span>
                  <button type="button" onClick={() => setMuted((value) => !value)} aria-pressed={muted} className="rounded px-1.5 py-0.5 transition hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{muted ? "Muted" : "Sound on"}</button>
                </div>
                <audio ref={audioRef} key={beat.frame.id} src={playbackUrl(beat.frame.audioUrl)} preload="none" muted={muted} controls onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={handleAudioEnded} className="h-8 w-full accent-amber-200" aria-label={`Narration for ${beat.scene.title}, moment ${beat.frameIndex + 1}`} />
              </div>
            )}

            <div className="border-t border-white/10 pt-4">
              <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/40">
                <span>Story progress</span><span className="font-mono tabular-nums">{completed ? 100 : Math.round(progress)}%</span>
              </div>
              <div className="mb-5 flex gap-1" role="group" aria-label={`Story progress: ${completed ? "complete" : `moment ${activeIndex + 1} of ${beats.length}`}`}>
                {beats.map((item, index) => <button key={item.frame.id} type="button" aria-label={`Go to ${item.scene.title}, moment ${item.frameIndex + 1}`} onClick={() => goTo(index)} className={`h-1 min-w-0 flex-1 rounded-full transition-colors ${index < activeIndex || completed ? "bg-amber-200" : index === activeIndex ? "bg-amber-200/75" : "bg-white/15"}`} />)}
                <span className="sr-only" role="progressbar" aria-label="Story progress" aria-valuemin={0} aria-valuemax={beats.length} aria-valuenow={completed ? beats.length : activeIndex} aria-valuetext={completed ? "Story complete" : `Moment ${activeIndex + 1} of ${beats.length}`} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} className="h-10 text-white/60 hover:text-white">
                  <ArrowLeft /> <span className="hidden sm:inline">Previous</span>
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => void togglePlayback()} aria-label={completed ? "Read story again" : playing ? "Pause narration" : "Play narration"} title={completed ? "Read story again" : playing ? "Pause narration" : "Play narration"} className="size-11 rounded-full border-amber-200/35 bg-amber-200 text-[#171716] hover:bg-amber-100">
                  {completed ? <RotateCcw /> : playing ? <Pause /> : <Play />}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={next} disabled={activeIndex === beats.length - 1 && completed} className="h-10 text-white/60 hover:text-white">
                  <span className="hidden sm:inline">{activeIndex === beats.length - 1 ? "Finish" : "Next"}</span> <ArrowRight />
                </Button>
              </div>
              {completed && <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-amber-200/80"><Check className="size-3.5" /> The end. Read it again?</p>}
            </div>
          </aside>
        </div>
      ) : (
        <div className="mx-auto flex min-h-[75svh] max-w-2xl flex-col items-center justify-center px-6 text-center">
          <BookOpen className="size-9 text-amber-200/65" strokeWidth={1.25} />
          <h2 className="mt-5 font-serif text-3xl">This story is not ready yet</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/50">Write at least one scene&apos;s frames to create moments to read.</p>
          <Button render={<Link href="/" />} variant="outline" className="mt-6 border-white/15 text-white hover:text-white"><ArrowLeft /> Return to Studio</Button>
        </div>
      )}
    </main>
  );
}
