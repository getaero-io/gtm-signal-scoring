import { ScoringWeights } from '@/types/scoring';
import rawConfig from './scoring-config.json';

const { scoring } = rawConfig;

export const SCORING_WEIGHTS: ScoringWeights = {
  validBusinessEmailPoints: scoring.emailQuality.validBusinessEmailPoints,
  validFreeEmailPoints: scoring.emailQuality.validFreeEmailPoints,
  namedContactPoints: scoring.contactIdentity.namedContactPoints,
  founderMatchPoints: scoring.founderMatch.founderMatchPoints,
  mxFoundPoints: scoring.dataCoverage.mxFoundPoints,
  techStackDetectedPoints: scoring.techStack.techStackDetectedPoints,
  icpMatchBonusPoints: scoring.techStack.icpMatchBonusPoints,
  icpTechnologies: scoring.techStack.icpTechnologies,
};

export const BASE_SCORE = scoring.baseScore;
