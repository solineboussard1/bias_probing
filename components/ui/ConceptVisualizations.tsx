import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Chart from 'chart.js/auto';
import { PaletteIcon, DownloadIcon } from "lucide-react";
import { createConceptExtractionCSV, downloadCSV } from "@/app/lib/csv-utils";
import { AnalysisResult, ExtractedConcepts } from "@/app/types/pipeline";

export type ClusterData = {
  id: number
    concepts: string[]
    frequency: number[]
    label: string
    total_frequency: number
};
export type ClusterOutput = {
  overall: ClusterData[];
  demographics: { [key: string]: ClusterData[] };
};


type DemographicDistributions = Map<string, Map<string, Map<string, number>>>;

type ConceptVisualizationsProps = {
  conceptData: {
    concepts: Map<string, number>;
    demographicDistributions: DemographicDistributions;
    clusters?: ClusterOutput;
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

const colorMap: { [key: string]: string } = {
  male: 'rgba(54, 162, 235, 0.6)',
  female: 'rgba(255, 99, 132, 0.6)',
};
const getColorForAttribute = (attribute: string) => {
  if (colorMap[attribute]) return colorMap[attribute];
  // Fallback: generate a random pastel color.
  const r = Math.floor(Math.random() * 200 + 55);
  const g = Math.floor(Math.random() * 200 + 55);
  const b = Math.floor(Math.random() * 200 + 55);
  return `rgba(${r}, ${g}, ${b}, 0.6)`;
};

// Define types for the grouped demographic data.
type DemographicDataset = {
  label: string;
  data: number[];
  backgroundColor: string;
};

type GroupedDemographicData = {
  labels: string[];
  datasets: DemographicDataset[];
};

// -------------------
// Main Component
// -------------------
export function ConceptVisualizations({ conceptData }: ConceptVisualizationsProps) {
  const overallChartRef = useRef<HTMLCanvasElement>(null);
  const distributionChartRef = useRef<HTMLCanvasElement>(null);
  const clusterChartRef = useRef<HTMLCanvasElement>(null);

  // Use the aggregated clusters returned by the backend.
  const clustersData = useMemo<ClusterData[]>(() => {
    return Array.isArray(conceptData.clusters) ? conceptData.clusters : [];
  }, [conceptData.clusters]);

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
    if (demographicGroups.length > 0 && !demographicGroups.includes(selectedGroup)) {
      setSelectedGroup(defaultGroup);
    }
  }, [demographicGroups, selectedGroup, defaultGroup]);

  // Build grouped data for the demographic bar chart.
  const groupedDemographicData = useMemo<GroupedDemographicData>(() => {
    const subgroupData = conceptData.demographicDistributions.get(selectedGroup);
    if (!subgroupData) return { labels: [], datasets: [] };

    const labelSet = new Set<string>();
    subgroupData.forEach((freqMap) => {
      freqMap.forEach((_count, subgroup) => labelSet.add(subgroup));
    });

    const labels = Array.from(labelSet);

    const datasets: DemographicDataset[] = Array.from(subgroupData.entries()).map(([subgroup, conceptFreqMap]) => ({
      label: subgroup,
      data: labels.map(label => conceptFreqMap.get(label) || 0),
      backgroundColor: getColorForAttribute(subgroup)
    }));

    return { labels, datasets };
  }, [selectedGroup, conceptData.demographicDistributions]);

  // Build heatmap data using the aggregated cluster data.
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
    // Use the aggregated cluster label for each cluster.
    const clusterLabels = clustersData.map(cluster => cluster.label);
  
    // In this simplified heatmap, for each cluster we display the frequency if the cluster label exists among the attributes.
    const matrix = clustersData.map(cluster =>
      attributes.map(attribute =>
        attribute === cluster.label ? demographicData.get(attribute) || 0 : 0
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
    // Clean up any existing charts.
    [overallChartRef, distributionChartRef, clusterChartRef].forEach(ref => {
      if (ref.current) {
        const existingChart = Chart.getChart(ref.current);
        if (existingChart) existingChart.destroy();
      }
    });

    // --- Overall Clusters Chart ---
    if (clustersData.length > 0) {
      const clusterLabels = clustersData.map(cluster => cluster.label);
      const clusterFrequencies = clustersData.map(cluster => cluster.total_frequency);
      const overallCtx = overallChartRef.current?.getContext('2d');
      if (overallCtx) {
        new Chart(overallCtx, {
          type: 'bar',
          data: {
            labels: clusterLabels,
            datasets: [{
              label: 'Cluster Frequency',
              data: clusterFrequencies,
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

    // --- Demographic Distribution Chart ---
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
    // --- Cluster Visualization Chart ---
    if (clustersData.length > 0 && clusterChartRef.current) {
      const ctx = clusterChartRef.current.getContext('2d');
      if (ctx) {
        const clusterLabels = clustersData.map(cluster => cluster.label);
        const clusterFrequencies = clustersData.map(cluster => cluster.total_frequency);
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: clusterLabels,
            datasets: [{
              label: 'Total Frequency',
              data: clusterFrequencies,
              backgroundColor: 'rgba(153, 102, 255, 0.6)',
              borderColor: 'rgba(153, 102, 255, 1)',
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
                    const totalFreq = clusterFrequencies[context.dataIndex];
                    return `Total Frequency: ${totalFreq}`;
                  }
                }
              }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Total Frequency' } } }
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
              <h3 className="text-lg font-semibold mb-4">Cluster Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clustersData.map(cluster => (
                  <div key={cluster.id} className="p-4 border rounded-lg bg-muted/50">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium">{cluster.label}</h4>
                      <span className="text-sm text-muted-foreground">
                        Frequency: {cluster.total_frequency}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
