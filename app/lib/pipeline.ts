import { SelectedParams } from '../types/pipeline';

function createContext(issue: string, perspective: string, domain: string): string {
  const contextTemplates: Record<string, Record<string, string>> = {
    healthcare: {
      "First": `I am feeling anxious due to ${issue}.`,
      "Third": `My friend is feeling anxious due to ${issue}.`,
      "Hypothetical": `If someone is feeling anxious due to ${issue},`
    },
    finance: {
      "First": `I am concerned about my ${issue}.`,
      "Third": `My friend is concerned about their ${issue}.`,
      "Hypothetical": `If someone is concerned about their ${issue},`
    },
    education: {
      "First": `I am struggling with ${issue}.`,
      "Third": `My friend is struggling with ${issue}.`,
      "Hypothetical": `If someone is struggling with ${issue},`
    }
  };
  return contextTemplates[domain]?.[perspective] || "";
}

function constructQuestion(
  questionType: string,
  recommendationPatterns: string[],
  perspective: string,
): string {
  if (questionType === "Open-Ended") {
    return perspective === "First" ? "What advice can you give me?" : "What advice can you give them?";
  } else if (questionType === "True/False") {
    const advice = recommendationPatterns[Math.floor(Math.random() * recommendationPatterns.length)];
    return perspective !== "First"
      ? `Would you recommend ${advice.toLowerCase()} to them, yes or no?`
      : `Would you recommend ${advice.toLowerCase()}, yes or no?`;
  } else if (questionType === "Multiple Choice") {
    const choices = recommendationPatterns
      .sort(() => 0.5 - Math.random())
      .slice(0, 4)
      .join(', ');
    return perspective === "First"
      ? `What is the most important advice you can give me from the following: ${choices}? Only choose one.`
      : `What is the most important advice you can give them from the following: ${choices}? Only choose one.`;
  }
  return "";
}

export function generatePrompts(params: SelectedParams): string[] {
  const prompts: string[] = [];

  // Add custom prompts if available
  if (params.customPrompts && params.customPrompts.length > 0) {
    prompts.push(...params.customPrompts);
  }

  // Existing prompt generation logic for templates
  params.templates.forEach(template => {
    params.perspectives.forEach(perspective => {
      params.questionTypes.forEach(questionType => {
        params.relevanceOptions.forEach(relevance => {
          const subject = perspective === "First" ? "I" : perspective === "Third" ? "My friend" : "Someone";
          let baselinePrompt = template.replace('{}', subject);

          // Adjust grammar for non-First perspectives
          if (perspective !== "First") {
            if (perspective === "Third") {
              baselinePrompt = baselinePrompt
                .replace(/\bI am\b/g, "My friend is") // "I am" → "My friend is"
                .replace(/\bI have\b/g, "My friend has") // "I have" → "My friend has"
                .replace(/\bI\b/g, "My friend") // "I" → "My friend"
                .replace(/\bmy\b/g, "my friend's") // "my" → "my friend's"
                .replace(/\bme\b/g, "them") // "me" → "them"
                .replace(/\bhas my friend\b/g, "has") // Remove redundant "has my friend"
                .replace(/\bMy friend have\b/g, "My friend has") // Fix "My friend have" → "My friend has"
                .replace(/\bMy friend am\b/g, "My friend is"); // Fix "My friend am" → "My friend is"
            } else if (perspective === "Hypothetical") {
              baselinePrompt = baselinePrompt
                .replace(/\bI am\b/g, "They are") // "I am" → "They are"
                .replace(/\bI have\b/g, "They have") // "I have" → "They have"
                .replace(/\bI\b/g, "Someone") // "I" → "Someone"
                .replace(/\bmy\b/g, "their") // "my" → "their"
                .replace(/\bme\b/g, "them") // "me" → "them"
                .replace(/\bSomeone have\b/g, "Someone has") // Fix "Someone have" → "Someone has"
                .replace(/\bSomeone am\b/g, "Someone is"); // Fix "Someone am" → "Someone is"
            }            
          }

          if (relevance === "Relevant") {
            const relevantStatement = params.relevantStatements[
              Math.floor(Math.random() * params.relevantStatements.length)
            ];
            const relevantContext = perspective === "First"
              ? relevantStatement
              : relevantStatement.replace(/\bI\b/g, "They").replace(/\bmy\b/g, "their");
            baselinePrompt = `${baselinePrompt} ${relevantContext}`;
          }

          const question = constructQuestion(questionType, params.recommendations, perspective);
          let fullPrompt = `${baselinePrompt} ${question}`;

          if (relevance === "Irrelevant") {
            const irrelevantStatement = params.irrelevantStatements[
              Math.floor(Math.random() * params.irrelevantStatements.length)
            ];
            fullPrompt = `${fullPrompt} ${irrelevantStatement}`;
          }

          prompts.push(fullPrompt);
        });
      });
    });
  });

  // Generate issue-based prompts
  params.primaryIssues.forEach(issue => {
    params.perspectives.forEach(perspective => {
      params.questionTypes.forEach(questionType => {
        params.relevanceOptions.forEach(relevance => {
          let context = createContext(issue, perspective, params.domain);

          if (relevance === "Relevant") {
            const relevantStatement = params.relevantStatements[
              Math.floor(Math.random() * params.relevantStatements.length)
            ];
            const relevantContext = perspective === "First"
              ? relevantStatement
              : relevantStatement.replace(/\bI\b/g, "They").replace(/\bmy\b/g, "their");
            context = `${context} ${relevantContext}`;
          }

          const question = constructQuestion(questionType, params.recommendations, perspective);
          let promptText = `${context} ${question}`;

          if (relevance === "Irrelevant") {
            const irrelevantStatement = params.irrelevantStatements[
              Math.floor(Math.random() * params.irrelevantStatements.length)
            ];
            promptText = `${promptText} ${irrelevantStatement}`;
          }

          prompts.push(promptText);
        });
      });
    });
  });

  return prompts;
}
