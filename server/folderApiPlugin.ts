import type { Plugin } from "vite";
import { createFolderMiddleware } from "./library";

export function folderApiPlugin(): Plugin {
  return {
    name: "costbreak-folder",
    configureServer(server) {
      server.middlewares.use(createFolderMiddleware(server.config.root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createFolderMiddleware(server.config.root));
    },
  };
}
