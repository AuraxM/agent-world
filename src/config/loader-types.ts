import type { Language } from "./types";

export interface PackValidation {
  id: string;
  name: string;
  description?: string;
  language: Language;
  valid: boolean;
  characterCount: number;
  nodeCount: number;
  errors: { file: string; message: string }[];
}
