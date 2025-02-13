import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Chart from 'chart.js/auto';
import { PaletteIcon } from "lucide-react";
import { createConceptExtractionCSV, downloadCSV } from "@/app/lib/csv-utils";
import { DownloadIcon } from "lucide-react";
import { AnalysisResult, ExtractedConcepts } from "@/app/types/pipeline";

type ClusterData = {
  id: number;
  concepts: string[];
  frequency: number[];
}

type ConceptVisualizationsProps = {
  conceptData: {
    concepts: Map<string, number>;
    raceDistributions: Map<string, Map<string, number>>;
    clusters?: ClusterData[];
    rawResults?: AnalysisResult[];
    extractedConcepts?: ExtractedConcepts[];
  };
}

const ITEMS_PER_PAGE = 8;

// Add ClusterHeatmap component interface
type ClusterHeatmapProps = {
  data: number[][];
  races: string[];
  clusters: string[];
}

// Add ClusterHeatmap component definition
function ClusterHeatmap({ data, races, clusters }: ClusterHeatmapProps) {
  // Get min and max values for color scaling
  const allValues = data.flat().filter(v => !isNaN(v) && v !== 0);
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);

  // Helper function to get color based on value with more subtle variations
  const getColor = (value: number) => {
    if (isNaN(value) || value === 0) return 'var(--background)';
    const percentage = ((value - minValue) / (maxValue - minValue)) * 100;
    // Use a more subtle blue scale with higher base lightness
    return `hsl(217, 75%, ${Math.max(85 - percentage * 0.65, 20)}%)`;
  };

  // Helper function to determine text color based on background
  const getTextColor = (value: number) => {
    if (isNaN(value) || value === 0) return 'var(--foreground)';
    const percentage = ((value - minValue) / (maxValue - minValue)) * 100;
    // Return dark text for lighter backgrounds, white for darker backgrounds
    return percentage > 60 ? 'white' : 'hsl(217, 90%, 15%)';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Race Distribution in Clusters</CardTitle>
        <CardDescription>
          Number of concept occurrences across different races for each cluster
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="grid" style={{
            gridTemplateColumns: `minmax(120px, auto) repeat(${clusters.length}, minmax(80px, 1fr))`,
            gap: '1px',
            backgroundColor: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)'
          }}>
            {/* Header row */}
            <div className="bg-muted p-2 font-medium">Race / Cluster</div>
            {clusters.map((cluster) => (
              <div key={cluster} className="bg-muted p-2 text-center font-medium">
                {cluster}
              </div>
            ))}

            {/* Data rows */}
            {races.map((race, i) => (
              <React.Fragment key={race}>
                <div className="bg-background p-2 font-medium border-t">
                  {race}
                </div>
                {data[i].map((value, j) => (
                  <div
                    key={`${i}-${j}`}
                    className="p-2 text-center transition-colors hover:opacity-90 border-t font-medium"
                    style={{
                      backgroundColor: getColor(value),
                      color: getTextColor(value)
                    }}
                    title={`${race} in ${clusters[j]}: ${value} occurrences`}
                  >
                    {isNaN(value) || value === 0 ? '0' : value.toString()}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <PaletteIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Distribution Scale</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-border" style={{ backgroundColor: getColor(minValue) }} />
            <span className="text-sm text-muted-foreground">{minValue}</span>
          </div>
          <div className="w-16 h-2 rounded-full" style={{
            background: `linear-gradient(to right, ${getColor(minValue)}, ${getColor(maxValue)})`,
            border: '1px solid var(--border)'
          }} />
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-border" style={{ backgroundColor: getColor(maxValue) }} />
            <span className="text-sm text-muted-foreground">{maxValue}</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

export function ConceptVisualizations({ conceptData }: ConceptVisualizationsProps) {
  const overallChartRef = useRef<HTMLCanvasElement>(null);
  const distributionChartRef = useRef<HTMLCanvasElement>(null);
  const clusterChartRef = useRef<HTMLCanvasElement>(null);

  // Add state for cluster pagination
  const [clusterPages, setClusterPages] = useState<{ [key: number]: number }>({});

  // Move helper functions inside component
  const calculateRaceDistributions = (
    cluster: ClusterData,
    raceDistributions: Map<string, Map<string, number>>
  ) => {
    const raceFrequencies = new Map<string, number>();

    // Initialize frequencies for all races
    Array.from(raceDistributions.keys()).forEach(race => {
      raceFrequencies.set(race, 0);
    });

    // Calculate frequencies
    cluster.concepts.forEach((concept, idx) => {
      const conceptFrequency = cluster.frequency[idx];
      raceDistributions.forEach((conceptMap, race) => {
        const raceSpecificFreq = conceptMap.get(concept) || 0;
        raceFrequencies.set(
          race,
          (raceFrequencies.get(race) || 0) + (raceSpecificFreq * conceptFrequency)
        );
      });
    });

    return raceFrequencies;
  };

  // Move getHeatmapData inside component
  const getHeatmapData = () => {
    if (!conceptData.clusters) return null;

    const races = Array.from(conceptData.raceDistributions.keys());
    const clusterLabels = conceptData.clusters.map(c => `Cluster ${c.id}`);

    // Calculate raw frequencies for each race in each cluster
    const distributions = conceptData.clusters.map(cluster =>
      calculateRaceDistributions(cluster, conceptData.raceDistributions)
    );

    // Use raw frequencies instead of percentages
    const rawData = races.map(race =>
      distributions.map(dist => dist.get(race) || 0)
    );

    return {
      data: rawData,
      races,
      clusters: clusterLabels
    };
  };

  // Initialize cluster pages when clusters change
  useEffect(() => {
    if (conceptData.clusters) {
      const initialPages = conceptData.clusters.reduce((acc, cluster) => {
        acc[cluster.id] = 0;
        return acc;
      }, {} as { [key: number]: number });
      setClusterPages(initialPages);
    }
  }, [conceptData.clusters]);

  // Helper function to get paginated concepts for a cluster
  const getPaginatedConcepts = (cluster: ClusterData) => {
    const currentPage = clusterPages[cluster.id] || 0;
    const start = currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return cluster.concepts.slice(start, end);
  };

  // Helper function to get total pages for a cluster
  const getTotalPages = (cluster: ClusterData) => {
    return Math.ceil(cluster.concepts.length / ITEMS_PER_PAGE);
  };

  useEffect(() => {
    if (!conceptData.concepts.size) return;

    // Clear any existing charts
    [overallChartRef, distributionChartRef, clusterChartRef].forEach(ref => {
      if (ref.current) {
        const existingChart = Chart.getChart(ref.current);
        if (existingChart) existingChart.destroy();
      }
    });

    // Overall concept distribution chart
    const overallCtx = overallChartRef.current?.getContext('2d');
    if (overallCtx) {
      new Chart(overallCtx, {
        type: 'bar',
        data: {
          labels: Array.from(conceptData.concepts.keys()),
          datasets: [{
            label: 'Concept Frequency',
            data: Array.from(conceptData.concepts.values()),
            backgroundColor: 'rgba(75, 192, 192, 0.6)'
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Overall Concept Distribution'
            }
          }
        }
      });
    }

    // Race-based distribution chart
    const distributionCtx = distributionChartRef.current?.getContext('2d');
    if (distributionCtx) {
      const datasets = Array.from(conceptData.raceDistributions.entries()).map(([race, concepts]) => ({
        label: race,
        data: Array.from(concepts.values()),
        backgroundColor: `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.6)`
      }));

      new Chart(distributionCtx, {
        type: 'bar',
        data: {
          labels: Array.from(conceptData.concepts.keys()),
          datasets
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Concept Distribution by Demographics'
            }
          }
        }
      });
    }

    // Enhanced cluster visualization
    if (conceptData.clusters && clusterChartRef.current) {
      const ctx = clusterChartRef.current.getContext('2d');
      if (ctx) {
        // Calculate average frequency for each cluster
        const avgFrequencies = conceptData.clusters.map(cluster =>
          cluster.frequency.reduce((a, b) => a + b, 0) / cluster.frequency.length
        );

        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: conceptData.clusters.map(c => `Cluster ${c.id}`),
            datasets: [{
              label: 'Average Concept Frequency',
              data: avgFrequencies,
              backgroundColor: 'rgba(75, 192, 192, 0.6)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: 'Concept Clusters Analysis'
              },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    const cluster = conceptData.clusters![context.dataIndex];
                    const avgFreq = avgFrequencies[context.dataIndex].toFixed(2);
                    return [
                      `Average Frequency: ${avgFreq}`,
                      'Concepts:',
                      ...cluster.concepts.map((c, i) =>
                        `  ${c} (${cluster.frequency[i]} occurrences)`
                      )
                    ];
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Average Frequency'
                }
              }
            }
          }
        });
      }
    }
  }, [conceptData]);

  // Add this handler function
  const handleDownloadCSV = () => {
    if (!conceptData.rawResults || !conceptData.extractedConcepts || !conceptData.clusters) {
      console.error("Missing required data for CSV export");
      return;
    }

    const csv = createConceptExtractionCSV(
      conceptData.rawResults,
      conceptData.extractedConcepts, 
      conceptData.clusters
    );
    downloadCSV(csv, 'concept_extraction_results.csv');
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex justify-end">
        <Button
          onClick={handleDownloadCSV}
          disabled={!conceptData.rawResults || !conceptData.extractedConcepts}
          className="flex items-center gap-2"
        >
          <DownloadIcon className="h-4 w-4" />
          complete_exploded.csv
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <h3 className="text-lg font-semibold mb-4">Overall Concept Distribution</h3>
          <canvas ref={overallChartRef} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <h3 className="text-lg font-semibold mb-4">Concept Distribution by Demographics</h3>
          <canvas ref={distributionChartRef} />
        </CardContent>
      </Card>

      {/* {JSON.stringify(conceptData)} */}

      {conceptData.clusters && (
        <>
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-lg font-semibold mb-4">Concept Clusters</h3>
              <canvas ref={clusterChartRef} />
            </CardContent>
          </Card>

          {getHeatmapData() && (
            <ClusterHeatmap {...getHeatmapData()!} />
          )}

          <Card>
            <CardContent className="pt-4">
              <h3 className="text-lg font-semibold mb-4">Detailed Cluster Contents</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {conceptData.clusters.map((cluster) => {
                  const currentPage = clusterPages[cluster.id] || 0;
                  const totalPages = getTotalPages(cluster);
                  const paginatedConcepts = getPaginatedConcepts(cluster);
                  const conceptIndices = paginatedConcepts.map((c: string) =>
                    cluster.concepts.indexOf(c)
                  );

                  return (
                    <div
                      key={cluster.id}
                      className="p-4 border rounded-lg bg-muted/50"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium">Cluster {cluster.id}</h4>
                        <span className="text-sm text-muted-foreground">
                          {cluster.concepts.length} concepts
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 min-h-[50px] items-start content-start">
                        {paginatedConcepts.map((concept: string, idx: number) => (
                          <Badge
                            key={concept}
                            variant="secondary"
                            className="flex items-center gap-1 min-h-[20px]"
                          >
                            <span>{concept}</span>
                            <span className="text-xs opacity-70">
                              ({cluster.frequency[conceptIndices[idx]]})
                            </span>
                          </Badge>
                        ))}
                      </div>

                      {totalPages > 1 && (
                        <div className="flex justify-between items-center mt-4 pt-2 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setClusterPages(prev => ({
                              ...prev,
                              [cluster.id]: Math.max(0, currentPage - 1)
                            }))}
                            disabled={currentPage === 0}
                          >
                            Previous
                          </Button>

                          <span className="text-sm text-muted-foreground">
                            {currentPage + 1} of {totalPages}
                          </span>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setClusterPages(prev => ({
                              ...prev,
                              [cluster.id]: Math.min(totalPages - 1, currentPage + 1)
                            }))}
                            disabled={currentPage === totalPages - 1}
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
} 