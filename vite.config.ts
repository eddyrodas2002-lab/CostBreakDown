import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { folderApiPlugin } from "./server/folderApiPlugin";

export default defineConfig({
  plugins: [react(), folderApiPlugin()],
});
