import { StoryEditor } from "@/components/StoryEditor";
import { AssetStudio } from "@/components/AssetStudio";
import { StoryLibrary } from "@/components/StoryLibrary";
import { ResumeLastStory } from "@/components/ResumeLastStory";

export default function Home() {
  return (
    <div className="flex h-screen">
      <ResumeLastStory />
      <aside className="w-72 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <StoryLibrary />
        <div className="min-h-0 flex-1">
          <AssetStudio />
        </div>
      </aside>
      <main className="flex-1 overflow-hidden">
        <StoryEditor />
      </main>
    </div>
  );
}
