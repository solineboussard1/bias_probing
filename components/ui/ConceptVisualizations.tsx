import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Chart from 'chart.js/auto';
import { PaletteIcon, DownloadIcon } from "lucide-react";
import { createConceptExtractionCSV, downloadCSV } from "@/app/lib/csv-utils";
import { AnalysisResult, ExtractedConcepts } from "@/app/types/pipeline";

type DemographicDistributions = Map<string, Map<string, Map<string, number>>>;

type ClusterData = {
  id: number;
  concepts: string[];
  frequency: number[];
};

type ConceptVisualizationsProps = {
  conceptData: {
    concepts: Map<string, number>;
    demographicDistributions: DemographicDistributions;
    clusters?: ClusterData[];
    rawResults?: AnalysisResult[];
    extractedConcepts?: ExtractedConcepts[];
  };
};

const ITEMS_PER_PAGE = 8;

// -------------------
// ClusterHeatmap Component
// -------------------
type ClusterHeatmapProps = {
  data: number[][];
  categories: string[];
  clusters: string[];
};

function ClusterHeatmap({ data, categories, clusters }: ClusterHeatmapProps) {
  const allValues = data.flat().filter(v => !isNaN(v) && v !== 0);
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);

  const getColor = (value: number) => {
    if (isNaN(value) || value === 0) return 'var(--background)';
    const percentage = ((value - minValue) / (maxValue - minValue)) * 100;
    return `hsl(217, 75%, ${Math.max(85 - percentage * 0.65, 20)}%)`;
  };

  const getTextColor = (value: number) => {
    if (isNaN(value) || value === 0) return 'var(--foreground)';
    const percentage = ((value - minValue) / (maxValue - minValue)) * 100;
    return percentage > 60 ? 'white' : 'hsl(217, 90%, 15%)';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demographic Distribution in Clusters</CardTitle>
        <CardDescription>
          Number of concept occurrences across different demographic attributes for each cluster
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
            <div className="bg-muted p-2 font-medium">Attribute / Cluster</div>
            {clusters.map(cluster => (
              <div key={cluster} className="bg-muted p-2 text-center font-medium">
                {cluster}
              </div>
            ))}
            {/* Data rows */}
            {categories.map((category, i) => (
              <React.Fragment key={category}>
                <div className="bg-background p-2 font-medium border-t">
                  {category}
                </div>
                {data[i].map((value, j) => (
                  <div
                    key={`${i}-${j}`}
                    className="p-2 text-center transition-colors hover:opacity-90 border-t font-medium"
                    style={{
                      backgroundColor: getColor(value),
                      color: getTextColor(value)
                    }}
                    title={`${category} in ${clusters[j]}: ${value} occurrences`}
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

// -------------------
// Helpers
// -------------------

// Transpose a 2D array.
const transpose = (matrix: number[][]): number[][] =>
  matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));

// Return a consistent color for a given subgroup.
const colorMap: { [key: string]: string } = {
  male: 'rgba(54, 162, 235, 0.6)',
  female: 'rgba(255, 99, 132, 0.6)',
  // Add other known subgroups as needed...
};
const getColorForAttribute = (attribute: string) => {
  if (colorMap[attribute]) return colorMap[attribute];
  // Fallback: generate a random pastel color.
  const r = Math.floor(Math.random() * 200 + 55);
  const g = Math.floor(Math.random() * 200 + 55);
  const b = Math.floor(Math.random() * 200 + 55);
  return `rgba(${r}, ${g}, ${b}, 0.6)`;
};

// -------------------
// Main Component
// -------------------
export function ConceptVisualizations({ conceptData }: ConceptVisualizationsProps) {
  const overallChartRef = useRef<HTMLCanvasElement>(null);
  const distributionChartRef = useRef<HTMLCanvasElement>(null);
  const clusterChartRef = useRef<HTMLCanvasElement>(null);

  // Use a default empty array if clusters is undefined.
  const clustersData: ClusterData[] = Array.isArray(conceptData.clusters)
    ? conceptData.clusters
    : [];

  const [clusterPages, setClusterPages] = useState<{ [key: number]: number }>({});

  // --- Flatten the demographicDistributions for the heatmap ---
  const flattenedDemographicDistributions = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const [group, groupMap] of conceptData.demographicDistributions.entries()) {
      const flattened = new Map<string, number>();
      for (const subMap of groupMap.values()) {
        for (const [concept, count] of subMap.entries()) {
          flattened.set(concept, (flattened.get(concept) || 0) + count);
        }
      }
      result.set(group, flattened);
    }
    return result;
  }, [conceptData.demographicDistributions]);

  const demographicGroups = useMemo(() => {
    return Array.from(conceptData.demographicDistributions.keys())
      .filter(group => group !== "Unspecified");
  }, [conceptData.demographicDistributions]);

  // Set default selected group: prefer "genders" or "ethnicities" if available.
  const defaultGroup = useMemo(() => {
    if (demographicGroups.includes("genders")) return "genders";
    if (demographicGroups.includes("ethnicities")) return "ethnicities";
    if (demographicGroups.includes("ages")) return "ages";
    if (demographicGroups.includes("socioeconomic")) return "socioeconomic";
    return demographicGroups.length > 0 ? demographicGroups[0] : "";
  }, [demographicGroups]);

  const [selectedGroup, setSelectedGroup] = useState<string>(defaultGroup);

  useEffect(() => {
    // In case the available groups change, update the default.
    if (demographicGroups.length > 0 && !demographicGroups.includes(selectedGroup)) {
      setSelectedGroup(defaultGroup);
    }
  }, [demographicGroups, selectedGroup, defaultGroup]);

  // Build grouped data for the demographic bar chart.
  const groupedDemographicData = useMemo(() => {
    const subgroupData = conceptData.demographicDistributions.get(selectedGroup);
    if (!subgroupData) return { labels: [] as string[], datasets: [] as any[] };

    // Build a set of all subgroup labels found in this demographic type.
    const labelSet = new Set<string>();
    subgroupData.forEach((freqMap) => {
      freqMap.forEach((_count, subgroup) => labelSet.add(subgroup));
    });

    const labels = Array.from(labelSet);

    const datasets = Array.from(subgroupData.entries()).map(([subgroup, conceptFreqMap]) => ({
      label: subgroup,
      data: labels.map(label => conceptFreqMap.get(label) || 0),
      backgroundColor: getColorForAttribute(subgroup)
    }));

    return { labels, datasets };
  }, [selectedGroup, conceptData.demographicDistributions]);

  const getPaginatedConcepts = (cluster: ClusterData) => {
    const currentPage = clusterPages[cluster.id] || 0;
    const start = currentPage * ITEMS_PER_PAGE;
    return cluster.concepts.slice(start, start + ITEMS_PER_PAGE);
  };

  const getTotalPages = (cluster: ClusterData) => {
    return Math.ceil(cluster.concepts.length / ITEMS_PER_PAGE);
  };

  // Build heatmap data if clusters are available.
  const getHeatmapData = () => {
    if (clustersData.length === 0) {
      console.warn("No clusters available for heatmap.");
      return null;
    }
  
    const demographicData = flattenedDemographicDistributions.get(selectedGroup);
    if (!demographicData) {
      console.error("Demographic distribution for the selected group is missing.");
      return null;
    }
  
    const attributes = Array.from(demographicData.keys());
    const clusterLabels = clustersData.map(c => `Cluster ${c.id}`);
  
    const matrix = clustersData.map(cluster =>
      attributes.map(attribute =>
        cluster.concepts.reduce((acc, concept) => 
          concept === attribute ? acc + (demographicData.get(concept) || 0) : acc
        , 0)
      )
    );
  
    return {
      data: transpose(matrix),
      categories: attributes,
      clusters: clusterLabels
    };
  };

  // Update charts when data changes.
  useEffect(() => {
    // Destroy any existing charts.
    [overallChartRef, distributionChartRef, clusterChartRef].forEach(ref => {
      if (ref.current) {
        const existingChart = Chart.getChart(ref.current);
        if (existingChart) existingChart.destroy();
      }
    });

    // If clusters exist, aggregate their frequencies for the overall chart.
    if (clustersData.length > 0) {
      const aggregatedClusters = clustersData.map(cluster => {
        const totalFrequency = cluster.frequency.reduce((a, b) => a + b, 0);
        return {
          label: `Cluster ${cluster.id}`,
          totalFrequency
        };
      });
      const overallCtx = overallChartRef.current?.getContext('2d');
      if (overallCtx) {
        new Chart(overallCtx, {
          type: 'bar',
          data: {
            labels: aggregatedClusters.map(c => c.label),
            datasets: [{
              label: 'Aggregated Concept Frequency',
              data: aggregatedClusters.map(c => c.totalFrequency),
              backgroundColor: 'rgba(75, 192, 192, 0.6)'
            }]
          },
          options: {
            responsive: true,
            plugins: { title: { display: true, text: 'Overall Concept Distribution (By Cluster)' } },
            scales: {
              x: { beginAtZero: true },
              y: { beginAtZero: true }
            }
          }
        });
      }
    } else {
      // Fallback: use raw concept data if no clusters are available.
      const overallCtx = overallChartRef.current?.getContext('2d');
      if (overallCtx) {
        new Chart(overallCtx, {
          type: 'bar',
          data: {
            labels: Array.from(conceptData.concepts.keys()).filter(
              label => label.toLowerCase() !== "unspecified"
            ),
            datasets: [{
              label: 'Concept Frequency',
              data: Array.from(conceptData.concepts.values()),
              backgroundColor: 'rgba(75, 192, 192, 0.6)'
            }]
          },
          options: {
            responsive: true,
            plugins: { title: { display: true, text: 'Overall Concept Distribution' } },
            scales: {
              x: { beginAtZero: true },
              y: { beginAtZero: true }
            }
          }
        });
      }
    }

    // Bar chart for the selected demographic type.
    const distributionCtx = distributionChartRef.current?.getContext('2d');
    if (distributionCtx && selectedGroup) {
      new Chart(distributionCtx, {
        type: 'bar',
        data: {
          labels: groupedDemographicData.labels,
          datasets: groupedDemographicData.datasets
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: `Concept Distribution by ${selectedGroup}` }
          },
          scales: {
            x: { beginAtZero: true },
            y: { beginAtZero: true }
          }
        }
      });
    }

    // Cluster visualization chart (only if clusters exist).
    if (clustersData.length > 0 && clusterChartRef.current) {
      const ctx = clusterChartRef.current.getContext('2d');
      if (ctx) {
        const avgFrequencies = clustersData.map(cluster =>
          cluster.frequency.reduce((a, b) => a + b, 0) / cluster.frequency.length
        );
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: clustersData.map(c => `Cluster ${c.id}`),
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
              title: { display: true, text: 'Concept Clusters Analysis' },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    const cluster = clustersData[context.dataIndex];
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
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Average Frequency' } } }
          }
        });
      }
    }
  }, [conceptData, selectedGroup, groupedDemographicData, flattenedDemographicDistributions, clustersData]);

  const handleDownloadCSV = () => {
    if (!conceptData.rawResults || !conceptData.extractedConcepts) {
      console.error("Missing required data for CSV export");
      return;
    }
    const csv = createConceptExtractionCSV(
      conceptData.rawResults,
      conceptData.extractedConcepts, 
      clustersData
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

      {/* Dropdown to filter by demographic type */}
      {demographicGroups.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="demographic-select" className="font-medium">
            Filter by Demographic Type:
          </label>
          <select
            id="demographic-select"
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="border rounded p-1"
          >
            {demographicGroups.map(group => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <h3 className="text-lg font-semibold mb-4">
            Concept Distribution by {selectedGroup}
          </h3>
          <canvas ref={distributionChartRef} />
        </CardContent>
      </Card>

      {/* Render cluster-related components only if clustersData exists */}
      {clustersData.length > 0 && (
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
                {clustersData.map((cluster) => {
                  const currentPage = clusterPages[cluster.id] || 0;
                  const totalPages = getTotalPages(cluster);
                  const paginatedConcepts = getPaginatedConcepts(cluster);
                  const conceptIndices = paginatedConcepts.map(concept =>
                    cluster.concepts.indexOf(concept)
                  );
                  return (
                    <div key={cluster.id} className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium">Cluster {cluster.id}</h4>
                        <span className="text-sm text-muted-foreground">
                          {cluster.concepts.length} concepts
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 min-h-[50px] items-start content-start">
                        {paginatedConcepts.map((concept, idx) => (
                          <Badge key={concept} variant="secondary" className="flex items-center gap-1 min-h-[20px]">
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
