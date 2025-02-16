import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import AgglomerativeClustering
import json
import sys
from collections import Counter
from itertools import chain

def cluster_concepts(concepts_data):
    """
    Clusters concepts into meaningful groups using hierarchical clustering.
    Handles overall concepts and demographic-specific concepts separately.
    
    :param concepts_data: Dictionary with "overall" and "demographics" data
    :return: Dictionary containing clustered results for both
    """
    def process_clustering(concept_frequencies):
        """
        Internal function to perform clustering on a given dataset.
        :param concept_frequencies: List of (concept, frequency) tuples
        :return: Clustered concept data
        """
        concept_entries = [(concept, freq) for concept, freq in concept_frequencies]
        
        # Expand concepts based on frequency
        expanded_concepts = list(chain.from_iterable([[concept] * freq for concept, freq in concept_entries]))

        # Create unique list for vectorization
        unique_concepts = list(set(expanded_concepts))

        # If there aren't enough unique concepts, return frequency-based fallback
        if len(unique_concepts) < 2:
            freq_count = Counter(expanded_concepts)
            return [{
                'id': 0,
                'concepts': list(freq_count.keys()),
                'frequency': list(freq_count.values())
            }]

        # Convert concepts to TF-IDF vectors
        vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix = vectorizer.fit_transform(unique_concepts)
        feature_matrix = tfidf_matrix.toarray()

        # Determine number of clusters dynamically
        n_clusters = min(12, max(2, len(unique_concepts) // 4))

        try:
            clustering = AgglomerativeClustering(
                n_clusters=n_clusters,
                affinity='cosine',
                linkage='average'
            )

            unique_labels = clustering.fit_predict(feature_matrix)

            # Map unique concepts to cluster labels
            concept_to_cluster = dict(zip(unique_concepts, unique_labels))

            # Assign cluster labels to expanded concepts
            expanded_labels = [concept_to_cluster[c] for c in expanded_concepts]

            # Organize clusters
            clusters = []
            for label in range(n_clusters):
                cluster_concepts = [c for c, l in zip(expanded_concepts, expanded_labels) if l == label]
                concept_counts = Counter(cluster_concepts)
                sorted_items = sorted(concept_counts.items(), key=lambda x: x[1], reverse=True)

                if sorted_items:
                    clusters.append({
                        'id': label,
                        'concepts': [item[0] for item in sorted_items],
                        'frequency': [item[1] for item in sorted_items]
                    })

            # Sort clusters by total frequency
            clusters.sort(key=lambda x: sum(x['frequency']), reverse=True)

            # Reassign cluster IDs
            for i, cluster in enumerate(clusters):
                cluster['id'] = i

            return clusters

        except Exception as e:
            print(f"Clustering error: {str(e)}", file=sys.stderr)
            freq_count = Counter(expanded_concepts)
            return [{
                'id': 0,
                'concepts': list(freq_count.keys()),
                'frequency': list(freq_count.values())
            }]

    # Read the input JSON, which should contain "overall" and "demographics"
    overall_data = concepts_data.get("overall", [])
    demographics_data = concepts_data.get("demographics", {})

    # Process overall clustering
    overall_clusters = process_clustering(overall_data)

    # Process demographic-specific clustering
    demographic_clusters = {}
    for demo, demo_data in demographics_data.items():
        demographic_clusters[demo] = process_clustering(demo_data)

    return {
        "overall": overall_clusters,
        "demographics": demographic_clusters
    }


if __name__ == "__main__":
    try:
        # Read JSON input from stdin
        input_data = json.loads(sys.stdin.read())

        # Run clustering
        clusters = cluster_concepts(input_data)

        # Print JSON output
        print(json.dumps(clusters))

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
