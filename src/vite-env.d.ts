/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for backend API calls. Empty/unset falls back to same-origin '/api/v1'. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
