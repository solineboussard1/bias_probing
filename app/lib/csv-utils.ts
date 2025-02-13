import { AnalysisResult, ExtractedConcepts, LDATopicResult } from "@/app/types/pipeline";
import Papa from 'papaparse';

export type ConceptExtractionRow = {
  Category: string;
  Relevance: string; 
  Perspective: string;
  Question_Type: string;
  Prompt: string;
  Gender: string | null;
  Race: string;
  Response: string;
  GPT_Categories: string;
  Cluster: string;
}

export type LDAExtractionRow = {
  Prompt: string;
  Response: string;
  Gender: string | null;
  Race: string;
  Dominant_Topic: number;
  Topic_Probability: number;
  Topic_Keywords: string;
  Topic_Description: string;
  Topic_Distribution?: string;
}

export type EmbeddingsExtractionRow = {
  Prompt: string;
  Response: string;
  processed_response: string;
  pca_one: number;
  pca_two: number;
  cluster: number;
  pca_cluster_number: string;
  raw_embeddings: number[];
}

type ClusterData = {
  id: number;
  concepts: string[];
  frequency: number[];
}

type MergedRow = {
  Category: string;
  Relevance: string;
  Perspective: string;
  Question_Type: string;
  Prompt: string;
  Gender: string | null;
  Race: string;
  Response: string;
  GPT_Categories: string;
  Concept_Cluster: string;
  Dominant_Topic: number | string;
  Topic_Probability: number | string;
  Topic_Keywords: string;
  Topic_Distribution: string;
  PCA_One: number | string;
  PCA_Two: number | string;
  Embeddings_Cluster: number | string;
  Raw_Embeddings: number[] | string;
}

export function createConceptExtractionCSV(
  analysisResults: AnalysisResult[],
  extractedConcepts: ExtractedConcepts[], 
  clusters: ClusterData[]
): string {
  // Create rows array to hold all data
  const rows: ConceptExtractionRow[] = [];

  // Map through analysis results to create base rows
  analysisResults.forEach(result => {
    result.prompts.forEach(prompt => {
      // Extract gender from demographics metadata
      const gender = prompt.metadata.demographics.find(d => 
        ['woman', 'man', 'non-binary'].includes(d)
      ) || null;

      prompt.responses.forEach(response => {
        // Find matching extracted concepts for this response
        const matchingConcepts = extractedConcepts.find(
          ec => ec.response === response.replace(/[\n\r]+/g, ' ').trim()
        );

        if (matchingConcepts) {
          // Parse concepts array from string if needed
          const concepts = Array.isArray(matchingConcepts.concepts) 
            ? matchingConcepts.concepts 
            : JSON.parse(matchingConcepts.concepts as unknown as string);

          // Create a row for each concept
          concepts.forEach((concept: string) => {
            // Find which cluster this concept belongs to
            const clusterNumber = clusters.find(c => c.concepts.includes(concept))?.id.toString() || "";

            rows.push({
              Category: "Anxiety Management",
              Relevance: "Neutral",
              Perspective: prompt.metadata.perspective || "First",
              Question_Type: "Open-Ended",
              Prompt: prompt.text,
              Gender: gender,
              Race: matchingConcepts.race || "Unknown",
              Response: response,
              GPT_Categories: concept,
              Cluster: clusterNumber
            });
          });
        }
      });
    });
  });

  // Use Papa Parse to convert to CSV
  const csv = Papa.unparse(rows, {
    quotes: true,
    delimiter: ",",
    header: true
  });

  return csv;
}

export function createLDAExtractionCSV(
  analysisResults: AnalysisResult[],
  ldaResults: {
    topics: LDATopicResult[];
    distributions: number[][];
  }
): string {
  const rows: LDAExtractionRow[] = [];
  let responseIndex = 0;

  analysisResults.forEach(result => {
    result.prompts.forEach(prompt => {
      const gender = prompt.metadata.demographics.find(d => 
        ['woman', 'man', 'non-binary'].includes(d)
      ) || null;
      
      const race = prompt.metadata.demographics.find(d => 
        ['Asian', 'Black', 'Hispanic', 'White'].includes(d)
      ) || 'Unknown';

      prompt.responses.forEach(response => {
        // Get topic distribution for this response
        const topicDistribution = ldaResults.distributions[responseIndex];
        if (!topicDistribution) return;

        // Find dominant topic and its probability
        const dominantTopicIndex = topicDistribution.indexOf(Math.max(...topicDistribution));
        const dominantTopic = ldaResults.topics[dominantTopicIndex];
        const topicProbability = topicDistribution[dominantTopicIndex];
        
        // Create topic description with all probabilities
        const topKeywords = dominantTopic.words.slice(0, 5).join(', ');
        const topicDescription = ldaResults.topics.map((topic, idx) => 
          `Topic ${topic.topic_id} (${topicDistribution[idx].toFixed(3)})`
        ).join('; ');

        rows.push({
          Prompt: prompt.text,
          Response: response,
          Gender: gender,
          Race: race,
          Dominant_Topic: dominantTopic.topic_id,
          Topic_Probability: topicProbability,
          Topic_Keywords: topKeywords,
          Topic_Description: topicDescription
        });

        responseIndex++;
      });
    });
  });

  // Use Papa Parse to convert to CSV
  const csv = Papa.unparse(rows, {
    quotes: true,
    delimiter: ",",
    header: true
  });

  return csv;
}

export function createEmbeddingsExtractionCSV(
  analysisResults: AnalysisResult[],
  embeddingsResults: {
    cluster_id: number;
    representative_responses: string[];
    coordinates: number[][];
    embeddings: number[][];
  }[]
): string {
  const rows: EmbeddingsExtractionRow[] = [];

  analysisResults.forEach(result => {
    result.prompts.forEach(prompt => {
      prompt.responses.forEach(response => {
        const cluster = embeddingsResults.find(c => 
          c.representative_responses.some(rep => 
            rep.replace(/[\n\r\s]+/g, ' ').trim().toLowerCase() === 
            response.replace(/[\n\r\s]+/g, ' ').trim().toLowerCase()
          )
        );
        
        if (cluster) {
          const responseIdx = cluster.representative_responses.findIndex(rep =>
            rep.replace(/[\n\r\s]+/g, ' ').trim().toLowerCase() === 
            response.replace(/[\n\r\s]+/g, ' ').trim().toLowerCase()
          );

          if (responseIdx !== -1) {
            const coordinates = cluster.coordinates[responseIdx];
            const embeddings = cluster.embeddings[responseIdx];

            rows.push({
              Prompt: prompt.text,
              Response: response,
              processed_response: response.toLowerCase().replace(/[^\w\s]/g, ''),
              pca_one: coordinates[0],
              pca_two: coordinates[1],
              cluster: Math.round(cluster.cluster_id),
              pca_cluster_number: `Cluster ${cluster.cluster_id + 1}`,
              raw_embeddings: embeddings
            });
          }
        }
      });
    });
  });

  return Papa.unparse(rows, {
    quotes: true,
    delimiter: ",",
    header: true
  });
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function createMergedAnalysisCSV(
  analysisResults: AnalysisResult[],
  extractedConcepts: ExtractedConcepts[],
  ldaResults: {
    topics: LDATopicResult[];
    distributions: number[][];
  },
  embeddingsResults: {
    cluster_id: number;
    representative_responses: string[];
    coordinates: number[][];
    embeddings: number[][];
    size: number;
    distribution: { [key: string]: number };
  }[],
  clusters: ClusterData[]
): string {
  // Create rows array to hold all data
  const mergedRows: MergedRow[] = [];
  let currentResponseIdx = 0;

  // Process each response once and create all rows
  analysisResults.forEach(result => {
    result.prompts.forEach(prompt => {
      const gender = prompt.metadata.demographics.find(d => 
        ['woman', 'man', 'non-binary'].includes(d)
      ) || null;
      
      const race = prompt.metadata.demographics.find(d => 
        ['Asian', 'Black', 'Hispanic', 'White'].includes(d)
      ) || 'Unknown';

      prompt.responses.forEach(response => {
        const cleanResponse = response.replace(/[\n\r]+/g, ' ').trim();

        // 1. LLM Concepts - now exploded
        const matchingConcepts = extractedConcepts.find(
          ec => ec.response === cleanResponse
        );

        if (matchingConcepts) {
          // Get concepts array
          const concepts = Array.isArray(matchingConcepts.concepts) 
            ? matchingConcepts.concepts 
            : JSON.parse(matchingConcepts.concepts as unknown as string);

          // 2. LDA Topics
          const topicDistribution = ldaResults.distributions[currentResponseIdx];
          const dominantTopicIndex = topicDistribution 
            ? topicDistribution.indexOf(Math.max(...topicDistribution))
            : -1;
          const dominantTopic = dominantTopicIndex !== -1 
            ? ldaResults.topics[dominantTopicIndex]
            : null;

          // 3. Embeddings
          const embeddingCluster = embeddingsResults.find(c => 
            c.representative_responses.some(rep => 
              rep.replace(/[\n\r\s]+/g, ' ').trim().toLowerCase() === 
              cleanResponse.toLowerCase()
            )
          );

          const responseEmbeddingIdx = embeddingCluster?.representative_responses.findIndex(rep =>
            rep.replace(/[\n\r\s]+/g, ' ').trim().toLowerCase() === 
            cleanResponse.toLowerCase()
          );

          // Create a row for each concept
          concepts.forEach((concept: string) => {
            // Find which cluster this concept belongs to
            const clusterNumber = clusters.find(c => c.concepts.includes(concept))?.id.toString() || "";

            // Create merged row with all information
            mergedRows.push({
              // LLM Concept fields (exploded)
              Category: "Anxiety Management",
              Relevance: "Neutral",
              Perspective: prompt.metadata.perspective || "First",
              Question_Type: "Open-Ended",
              Prompt: prompt.text,
              Gender: gender,
              Race: race,
              Response: cleanResponse,
              GPT_Categories: concept,
              Concept_Cluster: clusterNumber,

              // LDA Topic fields
              Dominant_Topic: dominantTopic?.topic_id ?? "",
              Topic_Probability: dominantTopic ? topicDistribution[dominantTopicIndex] : "",
              Topic_Keywords: dominantTopic ? dominantTopic.words.slice(0, 5).join(', ') : "",
              Topic_Distribution: topicDistribution ? JSON.stringify(
                ldaResults.topics.map((topic, idx) => ({
                  topic_id: topic.topic_id,
                  probability: topicDistribution[idx]
                }))
              ) : "",

              // Embeddings fields
              PCA_One: embeddingCluster && responseEmbeddingIdx !== undefined && responseEmbeddingIdx !== -1
                ? embeddingCluster.coordinates[responseEmbeddingIdx][0]
                : "",
              PCA_Two: embeddingCluster && responseEmbeddingIdx !== undefined && responseEmbeddingIdx !== -1
                ? embeddingCluster.coordinates[responseEmbeddingIdx][1]
                : "",
              Embeddings_Cluster: embeddingCluster ? embeddingCluster.cluster_id : "",
              Raw_Embeddings: embeddingCluster && responseEmbeddingIdx !== undefined && responseEmbeddingIdx !== -1
                ? embeddingCluster.embeddings[responseEmbeddingIdx]
                : []
            });
          });
        }
        currentResponseIdx++;
      });
    });
  });

  // Use Papa Parse to convert to CSV
  const csv = Papa.unparse(mergedRows, {
    quotes: true,
    delimiter: ",",
    header: true
  });

  return csv;
} 