import type { Column } from "./model";

export const initialBoard: Column[] = [
  {
    id: "backlog",
    name: "Backlog",
    cards: [
      { id: "content-audit", title: "Audit existing content", details: "Flag the pages to keep, rewrite, or retire before launch." },
      { id: "art-direction", title: "Explore art direction", details: "Gather type, color, and photography references for the new site." },
      { id: "journal", title: "Outline the journal", details: "Choose the first three stories for launch week." },
    ],
  },
  {
    id: "ready",
    name: "Ready",
    cards: [
      { id: "homepage-copy", title: "Write homepage copy", details: "Draft the opening headline and a short introduction to the studio." },
      { id: "project-images", title: "Prepare project imagery", details: "Select hero images for the featured case studies." },
    ],
  },
  {
    id: "progress",
    name: "In progress",
    cards: [
      { id: "homepage", title: "Build the homepage", details: "Bring the approved layout to life on desktop and mobile." },
      { id: "case-studies", title: "Design case studies", details: "Create a flexible page for telling each project’s story." },
      { id: "mobile-nav", title: "Refine mobile navigation", details: "Connect the main pages and tune the menu interactions." },
    ],
  },
  {
    id: "review",
    name: "Review",
    cards: [
      { id: "prototype", title: "Review the prototype", details: "Walk through the main journeys and collect final feedback." },
      { id: "studio-bio", title: "Proofread the studio bio", details: "Check the team names, links, and tone of voice." },
    ],
  },
  {
    id: "done",
    name: "Done",
    cards: [
      { id: "sitemap", title: "Define the sitemap", details: "Agree on the page structure and primary navigation." },
      { id: "wireframes", title: "Approve the wireframes", details: "Sign off on the core layouts with the studio team." },
    ],
  },
];
