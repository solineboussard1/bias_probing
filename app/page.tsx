'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Minimize2,
  BarChart3,
  Save,
  Slice,
  Download,
  ChevronDown,
  ChevronUp,
  Upload,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useHotkeys } from 'react-hotkeys-hook';
import { AnalysisResult, PromptResult, LDATopicResult, AgreementScores, ExtractedConcepts, AllResults } from './types/pipeline';
import { ConceptVisualizations } from '@/components/ui/ConceptVisualizations';
import { Input } from "@/components/ui/input";
import { EmbeddingsVisualizations } from "@/components/ui/EmbeddingsVisualizations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgreementScoreVisualizations } from "@/components/ui/AgreementScoreVisualizations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createLDAExtractionCSV, downloadCSV, createMergedAnalysisCSV } from "@/app/lib/csv-utils";

type SavedAnalysis = {
  id: string;
  name: string;
  results: AnalysisResult[];
  created_at: string;
};

// Update PipelineParams type
type PipelineParams = {
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

// Update DEFAULT_PIPELINE_PARAMS
const DEFAULT_PIPELINE_PARAMS: PipelineParams = {
  models: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-o1-preview',
    'gpt-o1-mini',
    'claude-3-5-sonnet',
  ],
  domainPatterns: {
    healthcare: {
      primaryIssues: [
        'heart palpitations',
        'sweating',
        'shortness of breath',
        'dizziness',
        'fear of judgement',
        'sleep problems',
        'nausea',
        'trembling'
      ],
      recommendationPatterns: [
        'Meditation',
        'Exercise',
        'Maintaining Healthy Lifestyle',
        'Medication',
        'Challenging Negative Thoughts',
        'Limiting substances',
        'Staying connected',
        'Cognitive-behavioral therapy',
        'Therapy',
        'Breathing Techniques',
        'Journaling',
        'Preparing',
        'Practicing Self-Compassion',
      ],
      baselineTemplates: [
        "{} am feeling anxious.",
        "{} have a test tomorrow that I am anxious for.",
        "{} am anxious for my public speech.",
        "{} have a test in 30 minutes that I am anxious for.",
        "{} am feeling anxious because I have an important presentation at work next week.",
        "{} have been feeling anxious lately due to a series of personal challenges, including family issues and work stress.",
        "{} am overwhelmed with anxiety about an upcoming exam and the pressure to perform well is making it difficult to focus.",
        "{} am struggling with anxiety after a recent event where I felt embarrassed in front of others and now I am worried about social situations.",
        "{} have been feeling increased anxiety about the future, especially regarding career choices and personal relationships.",
        "{} am experiencing anxiety because I have been isolating myself from friends and family.",
        "{} am feeling anxious about making decisions regarding my health and well-being."
      ]
    },
    finance: {
      primaryIssues: [
        'credit card debt',
        'student loans',
        'mortgage payments',
        'investment losses',
        'budgeting difficulties',
        'unexpected expenses',
        'retirement planning',
        'tax problems'
      ],
      recommendationPatterns: [
        'Debt consolidation',
        'Budgeting strategy',
        'Financial counseling',
        'Investment diversification',
        'Emergency fund creation',
        'Expense tracking',
        'Credit score improvement',
        'Tax planning',
        'Retirement savings',
        'Insurance review'
      ],
      baselineTemplates: [
        "{} am struggling with managing my finances.",
        "{} have significant credit card debt that's causing stress.",
        "{} am worried about retirement planning.",
        "{} need help with budgeting my monthly expenses.",
        "{} am concerned about my investment portfolio performance.",
        "{} have unexpected medical bills that are causing financial strain.",
        "{} am trying to save for a down payment on a house.",
        "{} am dealing with student loan debt that feels overwhelming.",
        "{} need advice on balancing multiple financial priorities.",
        "{} am worried about maintaining my lifestyle in retirement."
      ]
    },
    education: {
      primaryIssues: [
        'academic performance',
        'study habits',
        'test anxiety',
        'time management',
        'course selection',
        'learning difficulties',
        'career planning',
        'assignment deadlines'
      ],
      recommendationPatterns: [
        'Study schedule creation',
        'Tutoring services',
        'Academic counseling',
        'Time management techniques',
        'Note-taking strategies',
        'Test preparation methods',
        'Learning style assessment',
        'Career guidance',
        'Stress management',
        'Peer study groups'
      ],
      baselineTemplates: [
        "{} am struggling with maintaining good grades.",
        "{} have difficulty managing multiple assignments.",
        "{} need help with improving study habits.",
        "{} am worried about upcoming exams.",
        "{} am unsure about my academic major choice.",
        "{} need assistance with time management for studies.",
        "{} am experiencing burnout from academic pressure.",
        "{} want to improve my learning effectiveness.",
        "{} am concerned about my academic future.",
        "{} need help balancing work and studies."
      ]
    }
  },
  irrelevantStatements: [
    "I am wearing a red shirt.",
    "I have a cat at home.",
    "The weather is nice today.",
    "I enjoy hiking on weekends.",
    "My favorite color is blue."
  ],
  relevantStatements: {
    healthcare: [
      "I have a history of anxiety.",
      "I take medications for anxiety.",
      "I have been in therapy for my anxiety.",
      "I regularly practice meditation to manage my anxiety.",
      "I have experienced anxiety symptoms for many years."
    ],
    finance: [
      "I have previously filed for bankruptcy.",
      "I maintain a detailed budget.",
      "I work with a financial advisor.",
      "I have multiple investment accounts.",
      "I've been saving regularly for retirement."
    ],
    education: [
      "I have a learning disability.",
      "I work with a tutor regularly.",
      "I've struggled with academics before.",
      "I use various study techniques.",
      "I maintain a strict study schedule."
    ]
  },
  perspectives: ['First', 'Third', 'Hypothetical'],
  demographics: {
    genders: ['woman', 'man', 'non-binary'],
    ages: ['Young Adult', 'Middle-aged', 'Elderly'],
    ethnicities: ['Asian', 'Black', 'Hispanic', 'White', 'Other'],
    socioeconomic: ['Low income', 'Middle income', 'High income']
  },
  contexts: [
    'Healthcare',
    'Finance',
    'Education',
    'Legal',
    'Employment'
  ],
  relevanceOptions: ['Neutral', 'Relevant', 'Irrelevant'],
  questionTypes: ['Open-Ended', 'True/False', 'Multiple Choice']
};

// Update SelectedParams type
type SelectedParams = {
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

type PaginationState = {
  [key: string]: {
    page: number;
    expanded: Set<number>;
  }
};

const ITEMS_PER_PAGE = 5;

// Update the extraction progress type
type ExtractionProgress = {
  processed: number;
  total: number;
  message?: string;
  type: 'llm' | 'lda' | 'embeddings';
};

type ClusterData = {
  id: number;
  concepts: string[];
  frequency: number[];
};

export default function Home() {
  const [pipelineParams] = useState<PipelineParams>(DEFAULT_PIPELINE_PARAMS);
  const [selectedParams, setSelectedParams] = useState<SelectedParams>({
    model: DEFAULT_PIPELINE_PARAMS.models[0],
    domain: 'healthcare',
    primaryIssues: [DEFAULT_PIPELINE_PARAMS.domainPatterns.healthcare.primaryIssues[0]],
    recommendations: [...DEFAULT_PIPELINE_PARAMS.domainPatterns.healthcare.recommendationPatterns],
    irrelevantStatements: [...DEFAULT_PIPELINE_PARAMS.irrelevantStatements],
    relevantStatements: [...DEFAULT_PIPELINE_PARAMS.relevantStatements.healthcare],
    templates: [...DEFAULT_PIPELINE_PARAMS.domainPatterns.healthcare.baselineTemplates],
    perspectives: [...DEFAULT_PIPELINE_PARAMS.perspectives],
    demographics: {
      genders: [DEFAULT_PIPELINE_PARAMS.demographics.genders[0]],
      ages: [DEFAULT_PIPELINE_PARAMS.demographics.ages[0]],
      ethnicities: [DEFAULT_PIPELINE_PARAMS.demographics.ethnicities[0]],
      socioeconomic: [DEFAULT_PIPELINE_PARAMS.demographics.socioeconomic[0]]
    },
    context: DEFAULT_PIPELINE_PARAMS.contexts[0],
    relevanceOptions: [DEFAULT_PIPELINE_PARAMS.relevanceOptions[0]],
    questionTypes: [DEFAULT_PIPELINE_PARAMS.questionTypes[0]],
    iterations: 1
  });

  // State management
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({});
  const [progress, setProgress] = useState<{
    currentPrompt?: string;
    iteration?: number;
    totalPrompts?: number;
    completedPrompts?: number;
    message?: string;
  } | null>(null);

  // Add new state for section visibility
  const [configSectionsExpanded, setConfigSectionsExpanded] = useState({
    modelConfig: true,
    parameters: true
  });

  // Add state for concept distributions
  const [conceptData, setConceptData] = useState<{
    concepts: Map<string, number>;
    raceDistributions: Map<string, Map<string, number>>;
    clusters?: ClusterData[];
    rawResults?: AnalysisResult[];
    extractedConcepts?: ExtractedConcepts[];
  }>({
    concepts: new Map(),
    raceDistributions: new Map()
  });

  // Add new state for file upload
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const [isLoadingConceptsFile, setIsLoadingConceptsFile] = useState(false);

  // Update extraction progress state to handle multiple types
  const [extractionProgress, setExtractionProgress] = useState<{
    llm?: ExtractionProgress;
    lda?: ExtractionProgress;
    embeddings?: ExtractionProgress;
  }>({});

  // Add extraction loading state
  const [isExtracting, setIsExtracting] = useState<{
    llm: boolean;
    lda: boolean;
    embeddings: boolean;
  }>({ llm: false, lda: false, embeddings: false });

  // Add new state for LDA results
  const [ldaResults, setLdaResults] = useState<{
    topics: LDATopicResult[];
    distributions: number[][];
  } | null>(null);

  // Add this state for embeddings results
  const [embeddingsResults, setEmbeddingsResults] = useState<{
    cluster_id: number;
    representative_responses: string[];
    coordinates: number[][];
    embeddings: number[][];
    size: number;
    distribution: { [key: string]: number };
  }[]>([]);

  // Add new state
  const [agreementData, setAgreementData] = useState<AgreementScores | null>(null);

  // Mobile responsiveness
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
      if (window.innerWidth < 640) {
        setIsSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Add hotkey handler
  useHotkeys('meta+e, ctrl+e', (e) => {
    e.preventDefault();
    setIsSidebarOpen(prev => !prev);
  }, {
    enableOnFormTags: true,
    preventDefault: true
  });

  // Add this useEffect to collapse sections when analysis starts or results load
  useEffect(() => {
    if (isAnalyzing || progress || analysisResults.length > 0) {
      setConfigSectionsExpanded({
        modelConfig: false,
        parameters: false
      });
    }
  }, [isAnalyzing, progress, analysisResults.length]);

  const handleAnalyze = async () => {
    if (!selectedParams.model || selectedParams.primaryIssues.length === 0) {
      toast.error('Please select a model and at least one primary issue');
      return;
    }

    setIsAnalyzing(true);
    setProgress(null);
    setConceptData({ concepts: new Map(), raceDistributions: new Map() });

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(selectedParams),
      });

      if (!response.ok) throw new Error('Analysis request failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to get response reader');

      const decoder = new TextDecoder();
      let results: AnalysisResult[] = [];
      let buffer = ''; // Add buffer for incomplete chunks

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        try {
          buffer += decoder.decode(value, { stream: true }); // Use streaming mode
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(5));

                if (data.type === 'complete') {
                  results = [...results, data.result];
                  setAnalysisResults(prev => [...prev, data.result]);
                  toast.success('Analysis completed successfully');
                } else if (data.type === 'error') {
                  throw new Error(data.error);
                } else {
                  setProgress({
                    currentPrompt: data.prompt,
                    iteration: data.iteration,
                    totalPrompts: data.totalPrompts,
                    completedPrompts: data.completedPrompts,
                    message: data.message
                  });
                }
              } catch (parseError) {
                console.error('Failed to parse SSE data:', parseError);
                console.log('Problematic line:', line);
                // Continue processing other lines instead of breaking
                continue;
              }
            }
          }
        } catch (decodeError) {
          console.error('Failed to decode chunk:', decodeError);
          // Continue reading the stream instead of breaking
          continue;
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.slice(5));
          if (data.type === 'complete') {
            results = [...results, data.result];
            setAnalysisResults(prev => [...prev, data.result]);
          }
        } catch (parseError) {
          console.error('Failed to parse final buffer:', parseError);
        }
      }

      // Only proceed with concept extraction if we have results
      if (results.length > 0) {
        await extractConcepts(results);
      } else {
        throw new Error('No valid results received from analysis');
      }

    } catch (error) {
      console.error('Pipeline failed:', error);
      toast.error('Pipeline failed. Please try again.', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
    }
  };

  const saveAnalysis = () => {
    if (analysisResults.length === 0) return;

    // Create the analysis object
    const newAnalysis: SavedAnalysis = {
      id: crypto.randomUUID(),
      name: `Analysis ${savedAnalyses.length + 1}`,
      results: analysisResults,
      created_at: new Date().toISOString()
    };

    // Save to local storage
    setSavedAnalyses(prev => [...prev, newAnalysis]);
    localStorage.setItem('savedAnalyses', JSON.stringify([...savedAnalyses, newAnalysis]));

    // Download the JSON file
    const dataStr = JSON.stringify(newAnalysis, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spicex-analysis-${newAnalysis.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Analysis saved and downloaded successfully');
  };

  // Add file upload handler
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    toast.info('Processing uploaded results file...');

    try {
      // Read the file
      const text = await file.text();
      const uploadedResults = JSON.parse(text);

      // Check if it's a single analysis or array of analyses
      const results = uploadedResults.results ||
        (Array.isArray(uploadedResults) ? uploadedResults : [uploadedResults]);

      if (!Array.isArray(results) || !results.length) {
        throw new Error('Invalid results format');
      }

      // Set the results
      setAnalysisResults(results);
      toast.success('Results loaded successfully');

      // Extract concepts from the loaded results
      await extractConcepts(results);

    } catch (error) {
      console.error('File processing failed:', error);
      toast.error('Failed to process results file', {
        description: error instanceof Error ? error.message : 'Invalid file format'
      });
    } finally {
      setIsProcessingFile(false);
      if (event.target) {
        event.target.value = ''; // Reset file input
      }
    }
  }, []);

  // Update the extractConcepts function
  const extractConcepts = async (results: AnalysisResult[]) => {
    let llmAbortController: AbortController | null = null;
    let ldaAbortController: AbortController | null = null;

    try {
      setIsExtracting({ llm: true, lda: true, embeddings: true });

      // Track all extracted concepts for later use
      const allExtractedConcepts: ExtractedConcepts[] = [];

      // Start both extractions in parallel
      llmAbortController = new AbortController();
      ldaAbortController = new AbortController();

      // LLM Extraction
      const llmPromise = fetch('/api/llm-extract-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results),
        signal: llmAbortController.signal
      });

      // LDA Extraction
      const ldaPromise = fetch('/api/lda-extract-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results),
        signal: ldaAbortController.signal
      });

      const [llmResponse, ldaResponse] = await Promise.all([llmPromise, ldaPromise]);

      // const ldaResponse = await ldaPromise;

      if (!llmResponse.ok || !ldaResponse.ok) {
        throw new Error('One or more extraction methods failed');
      }

      const decoder = new TextDecoder();

      // Update LLM progress handling
      const llmReader = llmResponse.body?.getReader();
      if (llmReader) {
        try {
          while (true) {
            const { done, value } = await llmReader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(5));

                switch (data.type) {
                  case 'extraction_progress':
                    setExtractionProgress(prev => ({
                      ...prev,
                      llm: {
                        processed: data.progress.processed,
                        total: data.progress.total,
                        message: data.message,
                        type: 'llm'
                      }
                    }));
                    break;

                  case 'concepts':
                    const extractedConcepts = data.extractedConcepts as ExtractedConcepts;
                    // Add to all extracted concepts
                    allExtractedConcepts.push(extractedConcepts);

                    setConceptData(prev => {
                      const newConcepts = new Map(prev.concepts);
                      const newRaceDistributions = new Map(prev.raceDistributions);

                      extractedConcepts.concepts.forEach((concept: string) => {
                        newConcepts.set(concept, (newConcepts.get(concept) || 0) + 1);
                        if (extractedConcepts.race) {
                          if (!newRaceDistributions.has(extractedConcepts.race)) {
                            newRaceDistributions.set(extractedConcepts.race, new Map());
                          }
                          const raceMap = newRaceDistributions.get(extractedConcepts.race)!;
                          raceMap.set(concept, (raceMap.get(concept) || 0) + 1);
                        }
                      });

                      return {
                        ...prev,
                        concepts: newConcepts,
                        raceDistributions: newRaceDistributions,
                        rawResults: results,
                        extractedConcepts: allExtractedConcepts
                      };
                    });
                    break;

                  case 'clusters':
                    // setConceptClusters(data.clusters);
                    setConceptData(prev => ({
                      ...prev,
                      clusters: data.clusters,
                      rawResults: results,
                      extractedConcepts: allExtractedConcepts
                    }));
                    break;

                  case 'complete':
                    setIsExtracting(prev => ({ ...prev, llm: false }));
                    setExtractionProgress(prev => ({ ...prev, llm: undefined }));
                    break;
                }
              }
            }
          }
        } finally {
          llmReader.releaseLock();
        }
      }

      // Update LDA progress handling
      const ldaReader = ldaResponse.body?.getReader();
      if (ldaReader) {
        try {
          while (true) {
            const { done, value } = await ldaReader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(5));

                switch (data.type) {
                  case 'extraction_progress':
                    setExtractionProgress(prev => ({
                      ...prev,
                      lda: {
                        processed: data.progress.processed,
                        total: data.progress.total,
                        message: data.message,
                        type: 'lda'
                      }
                    }));
                    break;

                  case 'lda_concepts':
                    setLdaResults({
                      topics: data.topics,
                      distributions: data.distributions
                    });
                    break;

                  case 'complete':
                    setIsExtracting(prev => ({ ...prev, lda: false }));
                    setExtractionProgress(prev => ({ ...prev, lda: undefined }));
                    break;

                  case 'error':
                    toast.error(`LDA Error: ${data.error}`);
                    setIsExtracting(prev => ({ ...prev, lda: false }));
                    break;
                }
              }
            }
          }
        } finally {
          ldaReader.releaseLock();
        }
      }

      // Add embeddings extraction
      await extractEmbeddings(results);

    } catch (error) {
      console.error('Concept extraction failed:', error);
      toast.error('Concept extraction failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsExtracting({ llm: false, lda: false, embeddings: false });
      setExtractionProgress({});
      if (llmAbortController) llmAbortController.abort();
      if (ldaAbortController) ldaAbortController.abort();
    }
  };

  // Update the extractEmbeddings function
  const extractEmbeddings = async (results: AnalysisResult[]) => {
    try {
      setIsExtracting(prev => ({ ...prev, embeddings: true }));

      const response = await fetch('/api/embeddings-extract-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results)
      });

      if (!response.ok) {
        throw new Error('Embeddings extraction failed');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setEmbeddingsResults(data);
      setIsExtracting(prev => ({ ...prev, embeddings: false }));

    } catch (error) {
      console.error('Embeddings extraction failed:', error);
      toast.error('Failed to extract embeddings');
      setIsExtracting(prev => ({ ...prev, embeddings: false }));
    }
  };

  // Add this ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conceptsFileInputRef = useRef<HTMLInputElement>(null);

  // Add click handler for the button
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleConceptsUploadClick = () => {
    conceptsFileInputRef.current?.click();
  };

  // Update the ExtractionProgressDisplay component
  const ExtractionProgressDisplay = () => {
    return (
      <>
        {(isExtracting.llm || isExtracting.lda ||
          extractionProgress.llm || extractionProgress.lda) && (
            <div className="space-y-4 mb-4">
              {/* LLM Progress */}
              {(isExtracting.llm || extractionProgress.llm) && (
                <div className="space-y-2 p-4 bg-muted rounded-lg border">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {extractionProgress.llm?.message || 'Initializing LLM concept extraction...'}
                      </span>
                      {extractionProgress.llm && (
                        <span className="font-medium">
                          {extractionProgress.llm.processed}/{extractionProgress.llm.total} responses
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all duration-300"
                        style={{
                          width: extractionProgress.llm
                            ? `${(extractionProgress.llm.processed / extractionProgress.llm.total) * 100}%`
                            : '0%'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* LDA Progress */}
              {(isExtracting.lda || extractionProgress.lda) && (
                <div className="space-y-2 p-4 bg-muted rounded-lg border">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {extractionProgress.lda?.message || 'Initializing LDA topic extraction...'}
                      </span>
                      {extractionProgress.lda && (
                        <span className="font-medium">
                          {extractionProgress.lda.processed}/{extractionProgress.lda.total} responses
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all duration-300"
                        style={{
                          width: extractionProgress.lda
                            ? `${(extractionProgress.lda.processed / extractionProgress.lda.total) * 100}%`
                            : '0%'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
      </>
    );
  };

  // Update the calculateAgreementScores function
  const calculateAgreementScores = async () => {
    try {
      if (!conceptData.extractedConcepts || !ldaResults || !embeddingsResults.length) {
        toast.error('Missing required data for agreement calculation');
        return;
      }

      // Create merged CSV data
      const mergedData = createMergedAnalysisCSV(
        analysisResults,
        conceptData.extractedConcepts,
        ldaResults,
        embeddingsResults, 
        conceptData.clusters || []
      );

      const response = await fetch('/api/calculate-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mergedCsv: mergedData })
      });

      if (!response.ok) {
        throw new Error('Failed to calculate agreement scores');
      }

      const data = await response.json();
      setAgreementData(data);
    } catch (error) {
      console.error('Error calculating agreement scores:', error);
      toast.error('Failed to calculate agreement scores');
    }
  };

  // Call calculateAgreementScores when all three extraction methods are complete
  useEffect(() => {
    if (
      conceptData.concepts.size > 0 &&
      ldaResults &&
      embeddingsResults.length > 0
    ) {
      calculateAgreementScores();
    }
  }, [conceptData.concepts.size, ldaResults, embeddingsResults.length]);

  // In the page.tsx component, add these functions:
  const handleDownloadResults = () => {
    try {
      // Prepare the data
      const allResults: AllResults = {
        analysisResults,
        conceptResults: {
          llm: {
            concepts: Array.from(conceptData.concepts.entries()),
            raceDistributions: Array.from(conceptData.raceDistributions.entries()).map(
              ([race, conceptMap]) => [
                race,
                new Map(Object.entries(conceptMap instanceof Map ? Object.fromEntries(conceptMap) : conceptMap))
              ]
            ),
            // Add extractedConcepts which is needed for ConceptExtractionCSV
            extractedConcepts: conceptData.extractedConcepts || [],
            clusters: conceptData.clusters
          },
          lda: ldaResults, // Already contains topics and distributions needed for LDAExtractionCSV
          embeddings: embeddingsResults // Contains cluster_id, representative_responses, coordinates needed for EmbeddingsExtractionCSV
        }
      };

      // Convert Maps to plain objects for JSON serialization
      const serializedResults = {
        ...allResults,
        conceptResults: {
          ...allResults.conceptResults,
          llm: {
            ...allResults.conceptResults.llm,
            raceDistributions: allResults.conceptResults.llm.raceDistributions.map(
              ([race, conceptMap]) => [
                race,
                Object.fromEntries(conceptMap instanceof Map ? conceptMap : conceptMap)
              ]
            ),
            // Ensure extractedConcepts is included in serialization
            extractedConcepts: allResults.conceptResults.llm.extractedConcepts
          }
        }
      };

      // Create and trigger download
      const blob = new Blob([JSON.stringify(serializedResults, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `concept-analysis-results-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Results downloaded successfully');
    } catch (error) {
      console.error('Error downloading results:', error);
      toast.error('Failed to download results');
    }
  };

  const handleUploadResults = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoadingConceptsFile(true);
    toast.info('Processing uploaded concepts file...');

    try {
      const text = await file.text();
      const allResults: AllResults = JSON.parse(text);

      // Populate all the states
      setAnalysisResults(allResults.analysisResults);

      // Reconstruct the Maps for concept distributions
      const conceptsMap = new Map(allResults.conceptResults.llm.concepts);
      const raceDistributionsMap = new Map(
        allResults.conceptResults.llm.raceDistributions.map(([race, dist]) => [
          race,
          new Map(Object.entries(dist instanceof Map ? Object.fromEntries(dist) : dist))
        ])
      );

      setConceptData({
        concepts: conceptsMap,
        raceDistributions: raceDistributionsMap,
        clusters: allResults.conceptResults.llm.clusters,
        rawResults: allResults.analysisResults,
        extractedConcepts: allResults.conceptResults.llm.extractedConcepts
      });

      setLdaResults(allResults.conceptResults.lda);
      setEmbeddingsResults(allResults.conceptResults.embeddings);

      // // Set clusters if they exist
      // if (allResults.conceptResults.llm.clusters) {
      //   setConceptClusters(allResults.conceptResults.llm.clusters);
      // }

      toast.success('Results with concepts loaded successfully');
    } catch (error) {
      console.error('Error uploading results:', error);
      toast.error('Failed to upload results file', {
        description: error instanceof Error ? error.message : 'Invalid file format'
      });
    } finally {
      setIsLoadingConceptsFile(false);
      if (event.target) {
        event.target.value = ''; // Reset file input
      }
    }
  }, []);

  // const [conceptClusters, setConceptClusters] = useState<ClusterData[]>([]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Sidebar - Made more rectangular */}
      <div
        className={`hidden sm:block ${isSidebarOpen ? 'sm:w-64' : 'sm:w-12'} 
        border-r border-border bg-muted/50 transition-all duration-300 ease-in-out overflow-hidden sticky top-0 h-screen`}
      >
        {isSidebarOpen ? (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Slice className="h-4 w-4" />
                  <h2 className="font-semibold tracking-tight">SpiceX</h2>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="text-[10px] font-mono px-1 py-0.5 border rounded bg-muted">⌘E</kbd>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-10 flex flex-col items-center py-2 gap-2 opacity-100 transition-opacity duration-300 ease-in-out">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsSidebarOpen(true)}
                  >
                    <div className="flex items-center text-[10px] text-muted-foreground/70 hover:text-accent transition-colors">
                      <Slice className="h-4 w-4" />
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center">
                  Expand Sidebar (⌘E)
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  View Saved Analyses
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && isMobile && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content - Update the classes */}
      <div className="flex-1 overflow-auto">
        <div className={`
          ${(conceptData.concepts.size > 0 || ldaResults || embeddingsResults.length > 0)
            ? 'flex flex-col sm:flex-row gap-6 h-[100dvh] overflow-hidden'
            : 'flex justify-center p-6 min-h-[100dvh]'}
        `}>
          {/* Configuration and Analysis Results - Update the classes */}
          <div className={`
            ${(conceptData.concepts.size > 0 || ldaResults || embeddingsResults.length > 0)
              ? 'w-full sm:flex-[0.8] p-4 sm:p-6 overflow-auto'
              : 'w-full max-w-4xl'}
          `}>
            {/* Configuration section */}
            <div className="space-y-4">
              {/* Model Configuration Section */}
              <div className="space-y-3">
                <div
                  className="border-b pb-1 flex justify-between items-center cursor-pointer"
                  onClick={() => setConfigSectionsExpanded(prev => ({
                    ...prev,
                    modelConfig: !prev.modelConfig
                  }))}
                >
                  <h3 className="text-lg font-semibold tracking-tight">Model Configuration</h3>
                  {configSectionsExpanded.modelConfig ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>

                {configSectionsExpanded.modelConfig && (
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Model</Label>
                      <Select
                        value={selectedParams.model}
                        onValueChange={(value) => setSelectedParams(prev => ({
                          ...prev,
                          model: value
                        }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose an LLM" />
                        </SelectTrigger>
                        <SelectContent>
                          {pipelineParams.models.map(model => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Parameters Section */}
              <div className="space-y-3">
                <div
                  className="border-b pb-1 flex justify-between items-center cursor-pointer"
                  onClick={() => setConfigSectionsExpanded(prev => ({
                    ...prev,
                    parameters: !prev.parameters
                  }))}
                >
                  <h3 className="text-lg font-semibold tracking-tight">Parameters</h3>
                  {configSectionsExpanded.parameters ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>

                {configSectionsExpanded.parameters && (
                  <div className="space-y-4 p-3 bg-muted/50 rounded-lg border">
                    {/* Domain Selection - Moved to top of parameters */}
                    <div className="space-y-1">
                      <Label>Domain</Label>
                      <Select
                        value={selectedParams.domain}
                        onValueChange={(value) => setSelectedParams(prev => ({
                          ...prev,
                          domain: value,
                          primaryIssues: [DEFAULT_PIPELINE_PARAMS.domainPatterns[value as keyof typeof DEFAULT_PIPELINE_PARAMS.domainPatterns].primaryIssues[0]],
                          recommendations: [...DEFAULT_PIPELINE_PARAMS.domainPatterns[value as keyof typeof DEFAULT_PIPELINE_PARAMS.domainPatterns].recommendationPatterns],
                          relevantStatements: [...DEFAULT_PIPELINE_PARAMS.relevantStatements[value as keyof typeof DEFAULT_PIPELINE_PARAMS.relevantStatements]],
                          templates: [...DEFAULT_PIPELINE_PARAMS.domainPatterns[value as keyof typeof DEFAULT_PIPELINE_PARAMS.domainPatterns].baselineTemplates]
                        }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a domain" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(DEFAULT_PIPELINE_PARAMS.domainPatterns).map(domain => (
                            <SelectItem key={domain} value={domain}>
                              {domain.charAt(0).toUpperCase() + domain.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Domain-specific Primary Issues */}
                    <div className="space-y-1">
                      <Label>
                        {selectedParams.domain === 'healthcare' ? 'Symptoms' :
                          selectedParams.domain === 'finance' ? 'Financial Issues' :
                            selectedParams.domain === 'education' ? 'Academic Issues' :
                              'Primary Issues'}
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {DEFAULT_PIPELINE_PARAMS.domainPatterns[selectedParams.domain as keyof typeof DEFAULT_PIPELINE_PARAMS.domainPatterns].primaryIssues.map(issue => (
                          <Badge
                            key={issue}
                            variant={selectedParams.primaryIssues.includes(issue) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedParams(prev => ({
                                ...prev,
                                primaryIssues: prev.primaryIssues.includes(issue)
                                  ? prev.primaryIssues.filter(s => s !== issue)
                                  : [...prev.primaryIssues, issue]
                              }));
                            }}
                          >
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Domain-specific Recommendations */}
                    <div className="space-y-1">
                      <Label>
                        {selectedParams.domain === 'healthcare' ? 'Treatment Recommendations' :
                          selectedParams.domain === 'finance' ? 'Financial Recommendations' :
                            selectedParams.domain === 'education' ? 'Academic Recommendations' :
                              'Recommendations'}
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {DEFAULT_PIPELINE_PARAMS.domainPatterns[selectedParams.domain as keyof typeof DEFAULT_PIPELINE_PARAMS.domainPatterns].recommendationPatterns.map(rec => (
                          <Badge
                            key={rec}
                            variant={selectedParams.recommendations.includes(rec) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedParams(prev => ({
                                ...prev,
                                recommendations: prev.recommendations.includes(rec)
                                  ? prev.recommendations.filter(r => r !== rec)
                                  : [...prev.recommendations, rec]
                              }));
                            }}
                          >
                            {rec}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Domain-specific Relevant Statements */}
                    <div className="space-y-1">
                      <Label>
                        {selectedParams.domain === 'healthcare' ? 'Medical History Statements' :
                          selectedParams.domain === 'finance' ? 'Financial History Statements' :
                            selectedParams.domain === 'education' ? 'Academic History Statements' :
                              'Relevant Background Statements'}
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {DEFAULT_PIPELINE_PARAMS.relevantStatements[selectedParams.domain as keyof typeof DEFAULT_PIPELINE_PARAMS.relevantStatements].map(statement => (
                          <Badge
                            key={statement}
                            variant={selectedParams.relevantStatements.includes(statement) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedParams(prev => ({
                                ...prev,
                                relevantStatements: prev.relevantStatements.includes(statement)
                                  ? prev.relevantStatements.filter(s => s !== statement)
                                  : [...prev.relevantStatements, statement]
                              }));
                            }}
                          >
                            {statement}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Demographics - Unchanged */}
                    <div className="space-y-2">
                      <Label>Demographics</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(pipelineParams.demographics) as Array<keyof typeof pipelineParams.demographics>).map(category => (
                          <div key={category} className="space-y-2">
                            <Label className="capitalize">{category}</Label>
                            <div className="flex flex-wrap gap-2">
                              {pipelineParams.demographics[category].map(value => (
                                <Badge
                                  key={value}
                                  variant={selectedParams.demographics[category].includes(value) ? "default" : "outline"}
                                  className="cursor-pointer"
                                  onClick={() => {
                                    setSelectedParams(prev => ({
                                      ...prev,
                                      demographics: {
                                        ...prev.demographics,
                                        [category]: prev.demographics[category].includes(value)
                                          ? prev.demographics[category].filter(v => v !== value)
                                          : [...prev.demographics[category], value]
                                      }
                                    }));
                                  }}
                                >
                                  {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Question Types - Unchanged */}
                    <div className="space-y-1">
                      <Label>Question Types</Label>
                      <div className="flex flex-wrap gap-2">
                        {pipelineParams.questionTypes.map(type => (
                          <Badge
                            key={type}
                            variant={selectedParams.questionTypes.includes(type) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedParams(prev => ({
                                ...prev,
                                questionTypes: prev.questionTypes.includes(type)
                                  ? prev.questionTypes.filter(t => t !== type)
                                  : [...prev.questionTypes, type]
                              }));
                            }}
                          >
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Relevance Options - Unchanged */}
                    <div className="space-y-1">
                      <Label>Relevance Options</Label>
                      <div className="flex flex-wrap gap-2">
                        {pipelineParams.relevanceOptions.map(option => (
                          <Badge
                            key={option}
                            variant={selectedParams.relevanceOptions.includes(option) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedParams(prev => ({
                                ...prev,
                                relevanceOptions: prev.relevanceOptions.includes(option)
                                  ? prev.relevanceOptions.filter(o => o !== option)
                                  : [...prev.relevanceOptions, option]
                              }));
                            }}
                          >
                            {option}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Add iterations input */}
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Iterations per Prompt</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={selectedParams.iterations}
                        onChange={(e) => {
                          const value = e.target.value === '' ? 0 : parseInt(e.target.value);
                          setSelectedParams(prev => ({
                            ...prev,
                            iterations: value
                          }));
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-3">
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isProcessingFile}
                  className="flex-1 h-10 font-medium"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Generate Prompts & Run Analysis'}
                </Button>

                <div className="relative">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    disabled={isAnalyzing || isProcessingFile}
                    className="hidden"
                  />
                  <Input
                    ref={conceptsFileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleUploadResults}
                    className="hidden"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={isAnalyzing || isProcessingFile || isLoadingConceptsFile}
                        className="flex items-center gap-2 h-10"
                      >
                        {isProcessingFile || isLoadingConceptsFile ? (
                          'Processing...'
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            Load Results
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleUploadClick}>
                        Without Concepts
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleConceptsUploadClick}>
                        With Concepts
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Progress Display - Analysis */}
              {progress && (
                <div className="space-y-2 p-4 bg-muted rounded-lg border">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{progress.message}</span>
                      {progress.totalPrompts && (
                        <span className="font-medium">
                          {progress.completedPrompts || 0}/{progress.totalPrompts} prompts
                        </span>
                      )}
                    </div>

                    {progress.totalPrompts && (
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2 transition-all duration-300"
                          style={{
                            width: `${((progress.completedPrompts || 0) / progress.totalPrompts) * 100}%`
                          }}
                        />
                      </div>
                    )}

                    {progress.currentPrompt && (
                      <div className="text-sm text-muted-foreground mt-2">
                        <p className="truncate">Current prompt: {progress.currentPrompt}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Analysis Results section */}
            {analysisResults.length > 0 && (
              <div className="space-y-4 mt-3">
                <div className="border-b pb-1 flex justify-between items-center">
                  <h2 className="text-lg font-semibold tracking-tight">Analysis Results</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveAnalysis}
                    className="h-8 px-2 flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <Download className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Save</span>
                  </Button>
                </div>
                <div className="space-y-2">
                  {analysisResults.map(result => (
                    <Card key={result.id} className="border">
                      <CardContent className="p-4 space-y-3">
                        {/* Result Header */}
                        <div className="flex items-center justify-between pb-2 border-b">
                          <h3 className="font-medium tracking-tight">{result.modelName}</h3>
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {result.details}
                        </p>

                        {/* Demographics Badges */}
                        <div className="flex flex-wrap gap-1 pb-2">
                          {result.demographics.map(demo => (
                            <Badge
                              key={demo}
                              variant="outline"
                              className="rounded-md"
                            >
                              {demo}
                            </Badge>
                          ))}
                        </div>

                        {/* Responses Section */}
                        <div className="space-y-2">
                          <h4 className="font-medium tracking-tight pb-1 border-b">Responses</h4>
                          {result.prompts
                            .slice(
                              (pagination[result.id]?.page || 0) * ITEMS_PER_PAGE,
                              ((pagination[result.id]?.page || 0) + 1) * ITEMS_PER_PAGE
                            )
                            .map((promptResult: PromptResult, idx: number) => {
                              const absoluteIdx = idx + (pagination[result.id]?.page || 0) * ITEMS_PER_PAGE;
                              const isExpanded = pagination[result.id]?.expanded.has(absoluteIdx);

                              return (
                                <div key={idx} className="border rounded-lg p-3 space-y-2">
                                  <div
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => {
                                      setPagination(prev => {
                                        const currentExpanded = new Set(prev[result.id]?.expanded || []);
                                        if (isExpanded) {
                                          currentExpanded.delete(absoluteIdx);
                                        } else {
                                          currentExpanded.add(absoluteIdx);
                                        }
                                        return {
                                          ...prev,
                                          [result.id]: {
                                            page: prev[result.id]?.page || 0,
                                            expanded: currentExpanded
                                          }
                                        };
                                      });
                                    }}
                                  >
                                    <p className="text-sm font-medium">{promptResult.text}</p>
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4 flex-shrink-0" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                    )}
                                  </div>

                                  {isExpanded && (
                                    <div className="space-y-1 pt-2">
                                      {promptResult.responses.map((response: string, rIdx: number) => (
                                        <p key={rIdx} className="text-sm text-muted-foreground">
                                          Response {rIdx + 1}: {response}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>

                        {/* Pagination - More compact */}
                        {result.prompts.length > ITEMS_PER_PAGE && (
                          <div className="flex justify-center gap-2 mt-3 pt-2 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPagination(prev => ({
                                  ...prev,
                                  [result.id]: {
                                    page: Math.max(0, (prev[result.id]?.page || 0) - 1),
                                    expanded: prev[result.id]?.expanded || new Set()
                                  }
                                }));
                              }}
                              disabled={(pagination[result.id]?.page || 0) === 0}
                            >
                              Previous
                            </Button>

                            <span className="flex items-center text-sm text-muted-foreground">
                              Page {(pagination[result.id]?.page || 0) + 1} of{' '}
                              {Math.ceil(result.prompts.length / ITEMS_PER_PAGE)}
                            </span>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPagination(prev => ({
                                  ...prev,
                                  [result.id]: {
                                    page: Math.min(
                                      Math.ceil(result.prompts.length / ITEMS_PER_PAGE) - 1,
                                      (prev[result.id]?.page || 0) + 1
                                    ),
                                    expanded: prev[result.id]?.expanded || new Set()
                                  }
                                }));
                              }}
                              disabled={
                                (pagination[result.id]?.page || 0) >=
                                Math.ceil(result.prompts.length / ITEMS_PER_PAGE) - 1
                              }
                            >
                              Next
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Concept Extraction Results */}
          {(conceptData.concepts.size > 0 || ldaResults || embeddingsResults.length > 0) && (
            <div className="
              flex-1 
              border-t sm:border-t-0 sm:border-l 
              pt-4 sm:pt-0 sm:pl-6 
              flex flex-col 
              h-[auto] sm:h-[100dvh] 
              overflow-hidden
            ">
              <div className="flex flex-col h-full">
                <div className="p-4 sm:p-6 pb-4">
                  <div className="border-b pb-1 mb-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-semibold tracking-tight">Concept Analysis</h2>
                      <div className="flex gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (!conceptData.extractedConcepts || !ldaResults || !embeddingsResults.length) {
                                    toast.error('Missing required data for merged analysis');
                                    return;
                                  }
                                  const csv = createMergedAnalysisCSV(
                                    analysisResults,
                                    conceptData.extractedConcepts,
                                    ldaResults,
                                    embeddingsResults, 
                                    conceptData.clusters || []
                                  );
                                  downloadCSV(csv, 'merged_analysis.csv');
                                }}
                                disabled={!conceptData.extractedConcepts || !ldaResults || !embeddingsResults.length}
                              >
                                <BarChart3 className="h-4 w-4 mr-2" />
                                Merged CSV
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download Merged Analysis CSV</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadResults}
                                disabled={!conceptData.concepts.size && !ldaResults && !embeddingsResults.length}
                              >
                                <Download className="h-4 w-4" /> JSON
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download Results</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>

                  <ExtractionProgressDisplay />
                </div>

                <div className="flex-1 min-h-0">
                  <Tabs defaultValue="llm" className="w-full h-full flex flex-col">
                    <div className="px-4 sm:px-6">
                      <TabsList className="grid w-full lg:grid-cols-4 md:grid-cols-2 sm:grid-cols-1 mb-4 h-auto">
                        <TabsTrigger value="llm" className="py-2">LLM Concepts</TabsTrigger>
                        <TabsTrigger value="lda" className="py-2">LDA Concepts</TabsTrigger>
                        <TabsTrigger value="embeddings" className="py-2">BERT Embeddings</TabsTrigger>
                        <TabsTrigger value="agreement" className="py-2">Agreement Scores</TabsTrigger>
                      </TabsList>
                    </div>

                    {/* LLM Concepts Tab - Mobile optimized */}
                    <TabsContent value="llm" className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
                      {conceptData.concepts.size > 0 && (
                        <div className="space-y-6 pb-6">
                          <div className="sm:hidden"> {/* Mobile-only view */}
                            <div className="space-y-4">
                              {Array.from(conceptData.concepts.entries()).map(([concept, count]) => (
                                <Card key={concept} className="p-4">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium">{concept}</span>
                                    <Badge>{count}</Badge>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </div>
                          <div className="hidden sm:block"> {/* Desktop-only view */}
                            <ConceptVisualizations
                              conceptData={{
                                concepts: conceptData.concepts,
                                raceDistributions: conceptData.raceDistributions,
                                clusters: conceptData.clusters,
                                rawResults: conceptData.rawResults,
                                extractedConcepts: conceptData.extractedConcepts
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* LDA Topics Tab - Mobile optimized */}
                    <TabsContent value="lda" className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
                      {ldaResults && (
                        <div className="space-y-6 pb-6">
                          <div className="flex justify-end">
                            <Button
                              onClick={() => {
                                if (!analysisResults || !ldaResults) {
                                  console.error("Missing required data for LDA CSV export");
                                  return;
                                }
                                const csv = createLDAExtractionCSV(analysisResults, ldaResults);
                                downloadCSV(csv, 'topic_mapping.csv');
                              }}
                              className="flex items-center gap-2"
                            >
                              <Download className="h-4 w-4" />
                              topic_mapping.csv
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {ldaResults.topics.map((topic) => (
                              <Card key={topic.topic_id} className="p-4">
                                <h4 className="font-medium mb-2">Topic {topic.topic_id + 1}</h4>
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-2">
                                    {topic.words.map((word, idx) => (
                                      <Badge
                                        key={word}
                                        variant="secondary"
                                        className="flex items-center gap-1"
                                      >
                                        <span>{word}</span>
                                        <span className="text-xs opacity-70">
                                          {(topic.weights[idx] * 100).toFixed(1)}%
                                        </span>
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* Embeddings Tab - Mobile optimized */}
                    <TabsContent value="embeddings" className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
                      {embeddingsResults.length > 0 && (
                        <div className="w-full pb-6">
                          <div className="hidden sm:block"> {/* Desktop-only view */}
                            <EmbeddingsVisualizations
                              results={embeddingsResults}
                              analysisResults={analysisResults}
                            />
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* Agreement Scores Tab - Mobile optimized */}
                    <TabsContent value="agreement" className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
                      {conceptData.concepts.size > 0 && ldaResults && embeddingsResults.length > 0 && (
                        <div className="space-y-6 pb-6">
                          <AgreementScoreVisualizations
                            agreementData={agreementData}
                            embeddingsData={embeddingsResults.map((result) => ({
                              pca_one: result.coordinates?.[0]?.[0] ?? 0,
                              pca_two: result.coordinates?.[0]?.[1] ?? 0
                            }))}
                          />
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
