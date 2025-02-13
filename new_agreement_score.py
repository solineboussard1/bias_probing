import pandas as pd
import numpy as np
from scipy.optimize import linear_sum_assignment
import json
import sys
import os
import traceback

class NumpyJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.float32, np.float64)):
            if np.isnan(obj):
                return None
            return float(obj)
        return super().default(obj)

def calculate_agreement(cluster_labels, topic_labels, pca_cluster_labels):
    n_clusters = len(np.unique(cluster_labels))
    n_topics = len(np.unique(topic_labels))
    n_pca_clusters = len(np.unique(pca_cluster_labels))

    # Create confusion matrices
    confusion_matrix_cluster_topic = np.zeros((n_clusters, n_topics))
    confusion_matrix_cluster_pca = np.zeros((n_clusters, n_pca_clusters))
    confusion_matrix_topic_pca = np.zeros((n_topics, n_pca_clusters))

    for i in range(len(cluster_labels)):
        confusion_matrix_cluster_topic[cluster_labels[i], topic_labels[i]] += 1
        confusion_matrix_cluster_pca[cluster_labels[i], pca_cluster_labels[i]] += 1
        confusion_matrix_topic_pca[topic_labels[i], pca_cluster_labels[i]] += 1

    # Use Hungarian algorithm to find optimal matchings
    row_ind_ct, col_ind_ct = linear_sum_assignment(-confusion_matrix_cluster_topic)
    row_ind_cp, col_ind_cp = linear_sum_assignment(-confusion_matrix_cluster_pca)
    row_ind_tp, col_ind_tp = linear_sum_assignment(-confusion_matrix_topic_pca)

    # Calculate agreement scores
    total_matches_ct = confusion_matrix_cluster_topic[row_ind_ct, col_ind_ct].sum()
    total_matches_cp = confusion_matrix_cluster_pca[row_ind_cp, col_ind_cp].sum()
    total_matches_tp = confusion_matrix_topic_pca[row_ind_tp, col_ind_tp].sum()

    agreement_score_ct = total_matches_ct / len(cluster_labels)
    agreement_score_cp = total_matches_cp / len(cluster_labels)
    agreement_score_tp = total_matches_tp / len(cluster_labels)

    return (
        (agreement_score_ct, agreement_score_cp, agreement_score_tp),
        (confusion_matrix_cluster_topic, confusion_matrix_cluster_pca, confusion_matrix_topic_pca),
        (row_ind_ct, col_ind_ct),
        (row_ind_cp, col_ind_cp),
        (row_ind_tp, col_ind_tp)
    )

def create_mapping_dict(row_ind, col_ind):
    return {int(k): int(v) for k, v in zip(row_ind, col_ind)}

def check_agreement(row, cluster_to_topic, cluster_to_pca, topic_to_pca):
    cluster_label = row['Concept_Cluster']
    topic_label = row['Dominant_Topic']
    pca_label = row['Embeddings_Cluster']

    cluster_topic_agree = int(cluster_to_topic.get(cluster_label, -1) == topic_label)
    cluster_pca_agree = int(cluster_to_pca.get(cluster_label, -1) == pca_label)
    topic_pca_agree = int(topic_to_pca.get(topic_label, -1) == pca_label)
    
    return cluster_topic_agree, cluster_pca_agree, topic_pca_agree

def calculate_agreement_scores():
    try:
        csv_path = os.path.join(os.getcwd(), 'public', 'merged_analysis.csv')
        print(f"Looking for CSV at: {csv_path}", file=sys.stderr)
        
        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"CSV file not found at {csv_path}")
            
        grouped_df = pd.read_csv(csv_path)
        print(f"Successfully read CSV with {len(grouped_df)} rows", file=sys.stderr)
        print(f"CSV columns: {grouped_df.columns.tolist()}", file=sys.stderr)

        # Group by Response to handle exploded concepts
        grouped_df = grouped_df.dropna(subset=['Concept_Cluster', 'Dominant_Topic', 'Embeddings_Cluster'])

        # Convert labels to numeric codes
        grouped_df['Concept_Cluster'] = pd.Categorical(grouped_df['Concept_Cluster']).codes
        grouped_df['Dominant_Topic'] = pd.Categorical(grouped_df['Dominant_Topic'].astype(str)).codes
        grouped_df['Embeddings_Cluster'] = pd.Categorical(grouped_df['Embeddings_Cluster'].astype(str)).codes
        
        # Calculate agreement scores and get mappings
        agreement_scores, confusion_matrices, cluster_topic_mapping, cluster_pca_mapping, topic_pca_mapping = calculate_agreement(
            grouped_df['Concept_Cluster'].values,
            grouped_df['Dominant_Topic'].values,
            grouped_df['Embeddings_Cluster'].values
        )

        # Create mapping dictionaries with explicit int conversion
        cluster_to_topic = {int(cluster): int(topic) for cluster, topic in zip(cluster_topic_mapping[0], cluster_topic_mapping[1])}
        cluster_to_pca = {int(cluster): int(pca) for cluster, pca in zip(cluster_pca_mapping[0], cluster_pca_mapping[1])}
        topic_to_pca = {int(topic): int(pca) for topic, pca in zip(topic_pca_mapping[0], topic_pca_mapping[1])}

        # Calculate agreement for each row
        visualization_data = []
        for _, row in grouped_df.iterrows():
            cluster_topic_agree, cluster_pca_agree, topic_pca_agree = check_agreement(
                row, cluster_to_topic, cluster_to_pca, topic_to_pca
            )
            
            visualization_data.append({
                'pca_one': float(row['PCA_One']) if pd.notnull(row['PCA_One']) else 0.0,
                'pca_two': float(row['PCA_Two']) if pd.notnull(row['PCA_Two']) else 0.0,
                'cluster_topic_agree': cluster_topic_agree,
                'cluster_pca_agree': cluster_pca_agree,
                'topic_pca_agree': topic_pca_agree
            })

        def format_contingency_table(matrix):
            return {
                "table": matrix.tolist(),
                "rowLabels": [str(i) for i in range(matrix.shape[0])],
                "colLabels": [str(i) for i in range(matrix.shape[1])]
            }

        results = {
            'agreement_scores': {
                'cluster_topic': float(agreement_scores[0]), 
                'cluster_embedding': float(agreement_scores[1]),
                'topic_embedding': float(agreement_scores[2])
            },
            'visualization_data': visualization_data,
            'mapping_data': {
                'cluster_topic_mapping': cluster_to_topic,
                'cluster_pca_mapping': cluster_to_pca,
                'topic_pca_mapping': topic_to_pca,
                'contingency_tables': {
                    'cluster_topic': format_contingency_table(confusion_matrices[0]),
                    'cluster_pca': format_contingency_table(confusion_matrices[1]),
                    'topic_pca': format_contingency_table(confusion_matrices[2])
                }
            }
        }

        return results

    except Exception as e:
        error_details = {
            "error": f"Error calculating agreement scores: {str(e)}",
            "traceback": traceback.format_exc(),
            "type": str(type(e).__name__)
        }
        print(json.dumps(error_details), file=sys.stderr)
        raise

if __name__ == "__main__":
    try:
        results = calculate_agreement_scores()
        print(json.dumps(results, cls=NumpyJSONEncoder))
    except Exception as e:
        error_details = {
            "error": f"Failed to calculate agreement scores: {str(e)}",
            "traceback": traceback.format_exc(),
            "type": str(type(e).__name__)
        }
        print(json.dumps(error_details), file=sys.stderr)
        sys.exit(1) 