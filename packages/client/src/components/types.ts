import { Story, Frame, Asset } from "@/lib/types";

export interface StoryEditorProps {
  story?: Story | null;
  onGenerate?: (prompt: string, context?: { title?: string; style?: string }) => Promise<Story>;
}
