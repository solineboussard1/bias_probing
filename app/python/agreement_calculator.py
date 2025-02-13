import sys
import json
import numpy as np
from scipy.optimize import linear_sum_assignment

def calculate_agreement_scores(data):
    """
    Calculate agreement scores between different concept extraction methods
    """
    try:
        # Parse input data from stdin
        input_data = json.loads(data)
        
        # Extract cluster assignments
        cluster_labels = []
        topic_labels = []
        embedding_labels = []
        
        # Process each analysis result
        for result in input_data['analysisResults']:
            cluster_labels.append(result['cluster_id'])
            topic_labels.append(result['dominant_topic'])
            embedding_labels.append(result['embedding_cluster'])

        # Convert to numpy arrays
        cluster_labels = np.array(cluster_labels)
        topic_labels = np.array(topic_labels)
        embedding_labels = np.array(embedding_labels)

        # Calculate agreement scores and mappings
        scores, mappings = calculate_pairwise_agreements(
            cluster_labels, 
            topic_labels, 
            embedding_labels
        )
        
        # Return results
        return {
            "agreement_scores": scores,
            "cluster_mappings": mappings
        }
    except Exception as e:
        return {
            "error": str(e)
        }

def calculate_pairwise_agreements(cluster_labels, topic_labels, embedding_labels):
    """
    Calculate pairwise agreement scores between different clustering methods
    """
    # Get unique counts for each method
    n_clusters = len(np.unique(cluster_labels))
    n_topics = len(np.unique(topic_labels))
    n_embeddings = len(np.unique(embedding_labels))

    # Create confusion matrices
    confusion_cluster_topic = np.zeros((n_clusters, n_topics))
    confusion_cluster_embedding = np.zeros((n_clusters, n_embeddings))
    confusion_topic_embedding = np.zeros((n_topics, n_embeddings))

    # Fill confusion matrices
    for i in range(len(cluster_labels)):
        confusion_cluster_topic[cluster_labels[i], topic_labels[i]] += 1
        confusion_cluster_embedding[cluster_labels[i], embedding_labels[i]] += 1
        confusion_topic_embedding[topic_labels[i], embedding_labels[i]] += 1

    # Calculate optimal assignments using Hungarian algorithm
    row_ind_ct, col_ind_ct = linear_sum_assignment(-confusion_cluster_topic)
    row_ind_ce, col_ind_ce = linear_sum_assignment(-confusion_cluster_embedding)
    row_ind_te, col_ind_te = linear_sum_assignment(-confusion_topic_embedding)

    # Calculate agreement scores
    total_samples = len(cluster_labels)
    
    agreement_scores = {
        "cluster_topic": float(confusion_cluster_topic[row_ind_ct, col_ind_ct].sum() / total_samples),
        "cluster_embedding": float(confusion_cluster_embedding[row_ind_ce, col_ind_ce].sum() / total_samples),
        "topic_embedding": float(confusion_topic_embedding[row_ind_te, col_ind_te].sum() / total_samples)
    }

    # Create mapping dictionaries
    mappings = {
        "cluster_to_topic": {str(k): int(v) for k, v in zip(row_ind_ct, col_ind_ct)},
        "cluster_to_embedding": {str(k): int(v) for k, v in zip(row_ind_ce, col_ind_ce)},
        "topic_to_embedding": {str(k): int(v) for k, v in zip(row_ind_te, col_ind_te)}
    }

    return agreement_scores, mappings

if __name__ == "__main__":
    # Read input from stdin
    input_data = sys.stdin.read()
    
    # Calculate agreement scores
    result = calculate_agreement_scores(input_data)
    
    # Output results as JSON
    print(json.dumps(result)) 