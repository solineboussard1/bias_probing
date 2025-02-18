import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import AgglomerativeClustering
import json
import sys
from collections import Counter
from itertools import chain

import nltk
from nltk.stem import WordNetLemmatizer
from nltk import word_tokenize

# Make sure you've downloaded these NLTK resources, e.g.:
# nltk.download('punkt')
# nltk.download('wordnet')

lemmatizer = WordNetLemmatizer()

def normalize_concept(concept: str) -> str:
    """
    Optional normalization function to reduce duplicates:
    1) Lowercase
    2) Tokenize
    3) Lemmatize
    """
    tokens = word_tokenize(concept.lower())
    lemmas = [lemmatizer.lemmatize(t) for t in tokens]
    return " ".join(lemmas)

def cluster_concepts(concepts_data):
    """
    Clusters concepts into meaningful groups using hierarchical clustering.
    Handles overall concepts and demographic-specific concepts separately.
    """

    def process_clustering(concept_frequencies):
        """
        Internal function to perform clustering on a given dataset.
        :param concept_frequencies: List of (concept, frequency) tuples
        :return: Clustered concept data
        """
        concept_entries = [(concept, freq) for concept, freq in concept_frequencies]
        
        # Expand concepts based on frequency
        expanded_concepts = list(
            chain.from_iterable([[concept] * freq for concept, freq in concept_entries])
        )

        # (Optional) Normalize each concept to reduce near-duplicates
        expanded_concepts = [normalize_concept(c) for c in expanded_concepts]

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

        # Instead of a fixed number of clusters, use a distance threshold:
        # Lower distance_threshold => fewer merges => more clusters
        # Higher distance_threshold => more merges => fewer clusters
        try:
            clustering = AgglomerativeClustering(
                affinity='cosine',
                linkage='average',
                distance_threshold=0.7,  
                n_clusters=None
            )
            clustering.fit(feature_matrix)

            labels = clustering.labels_
            n_clusters = labels.max() + 1

            # Map each unique concept to its cluster label
            concept_to_cluster = dict(zip(unique_concepts, labels))

            # Determine labels for expanded list
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

            # Reassign cluster IDs in sorted order
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
