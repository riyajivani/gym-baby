import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

// The Yeshu Gym tracker (a standalone static app) is served from /gym/.
// Browsers navigate directly to the static HTML; SSR renders a link.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yeshu Gym | Workout Tracker" },
      { name: "description", content: "Track your workouts, review session history, and follow your training progress with Yeshu Gym." },
      { property: "og:title", content: "Yeshu Gym | Workout Tracker" },
      { property: "og:description", content: "Your workouts, session history, and training progress in one private tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/gym/index.html");
  }, []);

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: "#fcfbf8" }}
    >
      <a href="/gym/index.html">Open Yeshu Gym…</a>
    </div>
  );
}
