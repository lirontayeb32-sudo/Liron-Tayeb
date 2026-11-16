import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "תכלת — מנוע מכירות",
    short_name: "תכלת",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fa",
    theme_color: "#095c9d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
