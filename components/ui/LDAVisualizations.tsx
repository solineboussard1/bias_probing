import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import Chart from "chart.js/auto";

type LDAVisualizationProps = {
  ldaData: {
    topics: { topic_id: number; words: string[]; weights: number[] }[];
    demographicDistributions: Record<string, Record<string, number[]>>;
  };
};


export function LDAVisualizations({ ldaData }: LDAVisualizationProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Get demographic groups from the passed data.
  const demographicGroups = useMemo(() => {
    console.log("Demographic groups:", ldaData.demographicDistributions);
    return Object.keys(ldaData.demographicDistributions);
  }, [ldaData]);

  // Initialize selectedGroup to the first available group.
  const [selectedGroup, setSelectedGroup] = useState<string>(demographicGroups[0] || "");

  // Ensure selectedGroup is valid when demographicGroups changes.
  useEffect(() => {
    console.log("Available demographic groups:", demographicGroups);
    if (demographicGroups.length > 0 && !demographicGroups.includes(selectedGroup)) {
      setSelectedGroup(demographicGroups[0]);
    }
  }, [demographicGroups, selectedGroup]);

  // Extract topic labels.
  const topicLabels = useMemo(() => {
    console.log("Topic labels:", ldaData.topics);
    return ldaData.topics.map((topic) => `Topic ${topic.topic_id + 1}`);
  }, [ldaData]);

  // Get data for the selected demographic group.
  const groupedData = useMemo(() => {
    console.log("Grouping data for selected demographic:", selectedGroup);
    const categoryData = ldaData.demographicDistributions[selectedGroup];
    if (!categoryData) return { labels: [], datasets: [] };

    const datasets = Object.entries(categoryData).map(([subgroup, topicProbs]) => ({
      label: subgroup,
      data: topicProbs,
      backgroundColor: getColorForAttribute(subgroup),
    }));

    return { labels: topicLabels, datasets };
  }, [selectedGroup, ldaData, topicLabels]);

  useEffect(() => {
    console.log("Grouped data for chart:", groupedData);
    if (chartRef.current) {
      const ctx = chartRef.current.getContext("2d");
      if (ctx) {
        // Destroy any existing chart instance to prevent duplicates.
        const existingChart = Chart.getChart(chartRef.current);
        if (existingChart) existingChart.destroy();

        new Chart(ctx, {
          type: "bar",
          data: groupedData,
          options: {
            responsive: true,
            plugins: {
              title: { display: true, text: `LDA Topic Distribution - ${selectedGroup}` },
            },
            scales: { x: { stacked: false }, y: { beginAtZero: true } },
          },
        });
      }
    }
  }, [groupedData, selectedGroup]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex items-center gap-2">
        <label htmlFor="demographic-select" className="font-medium">
          Select Demographic Type:
        </label>
        <select
          id="demographic-select"
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="border rounded p-1"
        >
          {demographicGroups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="pt-4">
          <h3 className="text-lg font-semibold mb-4">LDA Topic Distributions</h3>
          <canvas ref={chartRef} />
        </CardContent>
      </Card>
    </div>
  );
}

const colorMap: { [key: string]: string } = {
  man: "rgba(54, 162, 235, 0.6)",
  woman: "rgba(255, 99, 132, 0.6)",
  non_binary: "rgba(153, 102, 255, 0.6)",
  baseline: "rgba(100, 100, 100, 0.6)",
};

function getColorForAttribute(attribute: string) {
  return colorMap[attribute] ||
    `rgba(${Math.random() * 200 + 55}, ${Math.random() * 200 + 55}, ${Math.random() * 200 + 55}, 0.6)`;
}
