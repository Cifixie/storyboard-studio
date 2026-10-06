"use client";

import { useStoryStore } from "@/lib/store/StoryStore";
import { deleteSavedStory, openStory } from "@/lib/persistence";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";

export function StoryLibrary() {
  const library = useStoryStore((s) => s.library);
  const currentId = useStoryStore((s) => s.story?.id);

  return (
    <section aria-label="Saved stories" className="flex max-h-72 flex-col border-b border-sidebar-border">
      <h2 className="px-4 pb-1 pt-4 text-base font-semibold tracking-tight">Stories</h2>
      {library.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">Generated stories are saved here.</p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="space-y-0.5 px-2 pb-3">
            {library.map((s) => {
              const active = s.id === currentId;
              return (
                <li key={s.id} className="group relative">
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => openStory(s.id)}
                    className={`block w-full rounded-md py-2 pl-2.5 pr-9 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 ${
                      active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.sceneCount} {s.sceneCount === 1 ? "scene" : "scenes"} ·{" "}
                      {new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${s.title}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${s.title}"? This can't be undone.`)) deleteSavedStory(s.id);
                    }}
                    className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 outline-none transition hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
