/** @type {import("tailwindcss").Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0B0D",
        surface: "#121215",
        panel: "#17171C",
        border: "#24242B",
        gold: "#C6A14A",
        text: "#F5F5F7",
        muted: "#9A9AA3",
      },
      borderRadius: {
        xl: "18px",
      },
    },
  },
  plugins: [],
};
