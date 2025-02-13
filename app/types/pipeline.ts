export type PipelineParams = {
  models: string[];
  domainPatterns: {
    [key: string]: {
      primaryIssues: string[];
      recommendationPatterns: string[];
      baselineTemplates: string[];
    }
  };
  irrelevantStatements: string[];
  relevantStatements: {
    [key: string]: string[];
  };
  perspectives: string[];
  demographics: {
    genders: string[];
    ages: string[];
    ethnicities: string[];
    socioeconomic: string[];
  };
  contexts: string[];
  relevanceOptions: string[];
  questionTypes: string[];
};

export type SelectedParams = {
  model: string;
  domain: string;
  primaryIssues: string[];
  recommendations: string[];
  irrelevantStatements: string[];
  relevantStatements: string[];
  templates: string[];
  perspectives: string[];
  demographics: {
    genders: string[];
    ages: string[];
    ethnicities: string[];
    socioeconomic: string[];
  };
  context: string;
  relevanceOptions: string[];
  questionTypes: string[];
  iterations: number;
};

export type PromptResult = {
  text: string;
  responses: string[];
  metadata: {
    perspective: string;
    demographics: string[];
    context: string;
    questionType: string;
  };
};

export type AnalysisResult = {
  id: string;
  modelName: string;
  concept: string;
  demographics: string[];
  context: string;
  details: string;
  timestamp: string;
  prompts: PromptResult[];
};

export type ProgressUpdate = {
  type: 'prompt-generation' | 'prompt-execution' | 'iteration-complete';
  message: string;
  prompt?: string;
  iteration?: number;
  totalPrompts?: number;
  completedPrompts?: number;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export type LDATopicResult = {
  topic_id: number;
  words: string[];
  weights: number[];
};

export type LDAResult = {
  topics: LDATopicResult[];
  doc_topic_distributions: number[][];
  error?: string;
};

export type ConceptExtractionType = 'llm' | 'lda';

export type ExtractedConcepts = {
  concepts: string[];
  race?: string;
  response: string;
  cluster?: number;
};

export type LDAExtractedConcepts = {
  topics: LDATopicResult[];
  distributions: number[][];
};

export type ClusterConcept = {
  cluster_id: number;
  size: number;
  representative_responses: string[];
  distribution: { [race: string]: number };
}

export type EmbeddingsResults = {
  clusters: ClusterConcept[];
  distributions: number[][];
}

export type ExtractionProgress = {
  processed: number;
  total: number;
  message: string;
  type: 'llm' | 'lda' | 'embeddings';
}

export type EmbeddingsResult = {
  cluster_id: number;
  size: number;
  representative_responses: string[];
  distribution: { [key: string]: number };
  coordinates: number[][];
  embeddings: number[][];
}

export type AgreementScores = {
  agreement_scores: {
    cluster_topic: number;
    cluster_embedding: number;
    topic_embedding: number;
  };
  visualization_data: AgreementVisualizationPoint[];
  mapping_data: MappingData;
}

export type AllResults = {
  analysisResults: AnalysisResult[];
  conceptResults: {
    llm: {
      concepts: [string, number][];
      raceDistributions: [string, Map<string, number>][];
      clusters?: Array<{
        id: number;
        concepts: string[];
        frequency: number[];
      }>;
      extractedConcepts?: ExtractedConcepts[];
    };
    lda: {
      topics: LDATopicResult[];
      distributions: number[][];
    } | null;
    embeddings: {
      cluster_id: number;
      representative_responses: string[];
      coordinates: number[][];
      embeddings: number[][];
      size: number;
      distribution: { [key: string]: number };
    }[];
  };
};

export type AgreementVisualizationPoint = {
  pca_one: number;
  pca_two: number;
  cluster_topic_agree: number;
  cluster_pca_agree: number;
  topic_pca_agree: number;
}

export type ContingencyTable = {
  table: number[][];
  rowLabels: string[];
  colLabels: string[];
}

export type MappingData = {
  cluster_topic_mapping: { [key: string]: number };
  cluster_pca_mapping: { [key: string]: number };
  topic_pca_mapping: { [key: string]: number };
  contingency_tables: {
    cluster_topic: ContingencyTable;
    cluster_pca: ContingencyTable;
    topic_pca: ContingencyTable;
  };
}