export const REPO_OVERVIEW_PATH = "repo-overview";

const META_QUESTION =
  /\b(what is this (project|repo|repository|app|codebase)|what'?s this repo|what does this (project|repo|repository|app)?\s*do|how does (it|this( project| repo| repository| app)?) work|tell me about this (project|repo|repository)|describe this (project|repo|repository))\b/;

const FEATURES_QUESTION =
  /^(what (are|is) )?(the )?(main )?(features|overview)\b|\b(list|what are) (the )?(main )?features\b|\bfeatures of this (project|repo|repository|app)\b/;

export function isRepoOverviewQuestion(question: string): boolean {
  const compact = question
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return false;
  }

  return META_QUESTION.test(compact) || FEATURES_QUESTION.test(compact);
}
