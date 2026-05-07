/**
 * vitals-emotion 生理 + 情绪引擎。
 * 此文件为 re-export；实现已迁移到 @agw/systems。
 */
export {
  VITALS_EMOTION_CONSTANTS,
  clamp,
  decayVitals,
  evolveEmotions,
  applyEmotionEvent,
  resetVital,
  reduceVital,
  checkSickness,
} from "@agw/systems";
export type {
  VitalsDecayInput,
  EmotionEvolutionInput,
  EmotionEventType,
  SicknessCheckInput,
} from "@agw/systems";
