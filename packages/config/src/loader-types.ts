import type { Language } from "./types";

export interface PackValidation {
  id: string;
  name: string;
  description?: string;
  language: Language;
  startDate?: string;
  valid: boolean;
  characterCount: number;
  nodeCount: number;
  errors: { file: string; message: string }[];
}
