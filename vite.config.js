import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    base: "/notes/",
    plugins: [react()],
    resolve: {
        alias: {
            "@": new URL("./src", import.meta.url).pathname,
        },
    },
});
