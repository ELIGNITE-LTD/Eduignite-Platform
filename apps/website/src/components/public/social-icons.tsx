import { Facebook, Github, Globe, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";

const ICONS = { linkedin: Linkedin, website: Globe, x: Twitter, github: Github, facebook: Facebook, instagram: Instagram, youtube: Youtube } as const;

export type LinkKind = keyof typeof ICONS;

/** The mark of a social network or website, for the public cards and the editor. */
export function LinkIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICONS[kind as LinkKind] ?? Globe;
  return <Icon className={className} aria-hidden />;
}
