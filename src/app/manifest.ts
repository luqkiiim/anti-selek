import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anti-Selek",
    short_name: "Anti-Selek",
    description: "Schedule matches, track scores, and maintain player ratings",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f8fc",
    theme_color: "#102236",
    categories: ["sports", "utilities"],
    icons: [
      {
        src: "/apple-icon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
