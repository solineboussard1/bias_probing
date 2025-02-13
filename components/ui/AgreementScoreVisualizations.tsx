'use client';

import { AgreementScores, AgreementVisualizationPoint, ContingencyTable } from '@/app/types/pipeline';
import { Scatter, ScatterChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AgreementScoreVisualizationsProps = {
  agreementData: AgreementScores | null;
  embeddingsData?: { pca_one: number; pca_two: number; }[];
};

const ContingencyTableView = ({ table, title }: { table: ContingencyTable, title: string }) => (
  <Card className="w-full">
    <CardContent className="p-4">
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>-</TableHead>
              {table.colLabels.map((label, i) => (
                <TableHead key={i}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.table.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{table.rowLabels[i]}</TableCell>
                {row.map((cell, j) => (
                  <TableCell key={j}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
);

const MappingView = ({ 
  mapping, 
  title 
}: { 
  mapping: { [key: string]: number }, 
  title: string 
}) => (
  <Card className="w-full">
    <CardContent className="p-4">
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <div className="space-y-2">
        {Object.entries(mapping).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center text-sm">
            <span>{key}</span>
            <span>→</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export function AgreementScoreVisualizations({
  agreementData
}: AgreementScoreVisualizationsProps) {
  if (!agreementData) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-muted-foreground">Calculating agreement scores...</p>
      </div>
    );
  }

  const ScatterPlot = ({
    data,
    dataKey,
    title
  }: {
    data: AgreementVisualizationPoint[];
    dataKey: keyof Pick<AgreementVisualizationPoint, 'cluster_topic_agree' | 'cluster_pca_agree' | 'topic_pca_agree'>;
    title: string;
  }) => (
    <div className="h-[300px] w-full p-4 border rounded-lg">
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 40, left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="pca_one"
            type="number"
            name="PCA Dimension 1"
            label={{ value: "PCA Dimension 1", position: "bottom" }}
          />
          <YAxis
            dataKey="pca_two"
            type="number"
            name="PCA Dimension 2"
            label={{ value: "PCA Dimension 2", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            formatter={(value: number) => [value ? 'Agree' : 'Disagree', 'Agreement']}
            labelFormatter={(label: number) => `PCA 1: ${label.toFixed(2)}`}
          />
          <Scatter name={title} data={data} fill="#8884d8">
            {data.map((entry: AgreementVisualizationPoint, idx: number) => (
              <circle
                key={idx}
                r={4}
                fill={entry[dataKey] ? '#22c55e' : '#ef4444'}
                fillOpacity={0.6}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border bg-card">
        <div>
          <p className="font-medium">Cluster-Topic Agreement:</p>
          <p className="text-lg">{(agreementData.agreement_scores.cluster_topic * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="font-medium">Cluster-Embedding Agreement:</p>
          <p className="text-lg">{(agreementData.agreement_scores.cluster_embedding * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="font-medium">Topic-Embedding Agreement:</p>
          <p className="text-lg">{(agreementData.agreement_scores.topic_embedding * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MappingView 
          mapping={agreementData.mapping_data.cluster_topic_mapping} 
          title="Cluster to Topic Mapping" 
        />
        <MappingView 
          mapping={agreementData.mapping_data.cluster_pca_mapping} 
          title="Cluster to PCA Mapping" 
        />
        <MappingView 
          mapping={agreementData.mapping_data.topic_pca_mapping} 
          title="Topic to PCA Mapping" 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ContingencyTableView 
          table={agreementData.mapping_data.contingency_tables.cluster_topic}
          title="Cluster-Topic Contingency Table"
        />
        <ContingencyTableView 
          table={agreementData.mapping_data.contingency_tables.cluster_pca}
          title="Cluster-PCA Contingency Table"
        />
        <ContingencyTableView 
          table={agreementData.mapping_data.contingency_tables.topic_pca}
          title="Topic-PCA Contingency Table"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <ScatterPlot
          data={agreementData.visualization_data}
          dataKey="cluster_topic_agree"
          title="Cluster-Topic Agreement"
        />
        <ScatterPlot
          data={agreementData.visualization_data}
          dataKey="cluster_pca_agree"
          title="Cluster-Embedding Agreement"
        />
        <ScatterPlot
          data={agreementData.visualization_data}
          dataKey="topic_pca_agree"
          title="Topic-Embedding Agreement"
        />
      </div>
    </div>
  );
} 