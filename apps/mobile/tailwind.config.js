/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        echo: {
          cetacean: "#150A35",
          lavender: "#A577FF",
          ghost: "#F5F7FC",
          cyan: "#21C4DD",
          success: "#22c55e",
          error: "#ef4444",
          warning: "#f59e0b",
          text: "#150A35",
          "text-muted": "#6b7280",
          "text-light": "#9ca3af",
          surface: "#F5F7FC",
          border: "rgba(165, 119, 255, 0.2)",
        },
      },
      fontFamily: {
        sans: ["Inter"],
        inter: ["Inter"],
      },
    },
  },
  plugins: [],
};
