import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import AgglomerativeClustering
import json
import sys
from collections import Counter

def cluster_concepts(concepts_data):
    # Parse input data and maintain frequency information
    concept_entries = [(concept, freq) for concept, freq in concepts_data]
    
    # Create a list where each concept appears frequency times
    expanded_concepts = []
    for concept, freq in concept_entries:
        expanded_concepts.extend([concept] * freq)
    
    # Create unique concept list for vectorization
    unique_concepts = list(set(expanded_concepts))
    
    # Create TF-IDF vectors for unique concepts
    vectorizer = TfidfVectorizer(stop_words='english')
    tfidf_matrix = vectorizer.fit_transform(unique_concepts)
    
    # Convert to dense array for clustering
    feature_matrix = tfidf_matrix.toarray()
    
    # Perform clustering only if we have enough samples
    if len(unique_concepts) < 2:
        # Count frequencies in expanded list
        freq_count = Counter(expanded_concepts)
        return [{
            'id': 0,
            'concepts': list(freq_count.keys()),
            'frequency': list(freq_count.values())
        }]
    
    # Determine number of clusters based on data size
    n_clusters = min(12, max(2, len(unique_concepts) // 4))
    
    try:
        # Perform clustering
        clustering = AgglomerativeClustering(
            n_clusters=n_clusters,
            affinity='cosine',
            linkage='average'
        )
        
        # Get cluster labels for unique concepts
        unique_labels = clustering.fit_predict(feature_matrix)
        
        # Create concept to cluster mapping
        concept_to_cluster = dict(zip(unique_concepts, unique_labels))
        
        # Assign cluster labels to expanded concepts
        expanded_labels = [concept_to_cluster[c] for c in expanded_concepts]
        
        # Create clusters with frequency information
        clusters = []
        for label in range(n_clusters):
            # Get concepts in this cluster from expanded list
            cluster_concepts = [c for c, l in zip(expanded_concepts, expanded_labels) if l == label]
            
            # Count frequencies within cluster
            concept_counts = Counter(cluster_concepts)
            
            # Sort by frequency
            sorted_items = sorted(concept_counts.items(), key=lambda x: x[1], reverse=True)
            
            if sorted_items:  # Only add non-empty clusters
                clusters.append({
                    'id': label,
                    'concepts': [item[0] for item in sorted_items],
                    'frequency': [item[1] for item in sorted_items]
                })
        
        # Sort clusters by total frequency
        clusters.sort(key=lambda x: sum(x['frequency']), reverse=True)
        
        # Reassign IDs based on sorted order
        for i, cluster in enumerate(clusters):
            cluster['id'] = i
        
        return clusters
        
    except Exception as e:
        print(f"Clustering error: {str(e)}", file=sys.stderr)
        # Count frequencies in expanded list as fallback
        freq_count = Counter(expanded_concepts)
        return [{
            'id': 0,
            'concepts': list(freq_count.keys()),
            'frequency': list(freq_count.values())
        }]

if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        clusters = cluster_concepts(input_data)
        print(json.dumps(clusters))
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1) 