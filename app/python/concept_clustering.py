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

# nltk.download('punkt')
# nltk.download('wordnet')

lemmatizer = WordNetLemmatizer()

def normalize_concept(concept: str) -> str:
    tokens = word_tokenize(concept.lower())
    lemmas = [lemmatizer.lemmatize(t) for t in tokens]
    return " ".join(lemmas)

def process_clustering(concept_frequencies):
    # Parse input data and maintain frequency information
    concept_entries = [(concept, freq) for concept, freq in concept_frequencies]
    
    # Expand concepts based on frequency.
    expanded_concepts = list(chain.from_iterable([[concept] * freq for concept, freq in concept_entries]))
    
    # Normalize each concept to reduce near-duplicates.
    expanded_concepts = [normalize_concept(c) for c in expanded_concepts]
    
    # Get a unique list for vectorization.
    unique_concepts = list(set(expanded_concepts))
    
    # If there aren't enough unique concepts, return a fallback cluster.
    if len(unique_concepts) < 2:
        freq_count = Counter(expanded_concepts)
        cluster = {
            'id': 0,
            'concepts': list(freq_count.keys()),
            'frequency': list(freq_count.values())
        }
        cluster['label'] = cluster['concepts'][0] if cluster['concepts'] else ""
        cluster['total_frequency'] = sum(cluster['frequency'])
        return [cluster]
    
    # Convert concepts to TF-IDF vectors.
    vectorizer = TfidfVectorizer(stop_words='english')
    tfidf_matrix = vectorizer.fit_transform(unique_concepts)
    feature_matrix = tfidf_matrix.toarray()
    
    try:
        # Force exactly 20 clusters if possible; otherwise, let the data decide.
        if len(unique_concepts) >= 20:
            clustering = AgglomerativeClustering(
                metric='cosine',
                linkage='average',
                n_clusters=20
            )
        else:
            clustering = AgglomerativeClustering(
                metric='cosine',
                linkage='average',
                distance_threshold=0.7,
                n_clusters=None
            )
        clustering.fit(feature_matrix)
        labels = clustering.labels_
        n_clusters = labels.max() + 1
        
        # Map each unique concept to its cluster label.
        concept_to_cluster = dict(zip(unique_concepts, labels))
        
        # Determine labels for the expanded list.
        expanded_labels = [concept_to_cluster[c] for c in expanded_concepts]
        
        # Organize clusters.
        clusters = []
        for label in range(n_clusters):
            cluster_concepts = [c for c, l in zip(expanded_concepts, expanded_labels) if l == label]
            concept_counts = Counter(cluster_concepts)
            sorted_items = sorted(concept_counts.items(), key=lambda x: x[1], reverse=True)
            if sorted_items:
                cluster = {
                    'id': label,
                    'concepts': [item[0] for item in sorted_items],
                    'frequency': [item[1] for item in sorted_items]
                }
                clusters.append(cluster)
        
        # Sort clusters by total frequency.
        clusters.sort(key=lambda x: sum(x['frequency']), reverse=True)
        
        # Reassign cluster IDs and add the representative label and total frequency.
        for i, cluster in enumerate(clusters):
            cluster['id'] = i
            cluster['label'] = cluster['concepts'][0] if cluster['concepts'] else ""
            cluster['total_frequency'] = sum(cluster['frequency'])
        
        return clusters

    except Exception as e:
        print(f"Clustering error: {str(e)}", file=sys.stderr)
        freq_count = Counter(expanded_concepts)
        cluster = {
            'id': 0,
            'concepts': list(freq_count.keys()),
            'frequency': list(freq_count.values())
        }
        cluster['label'] = cluster['concepts'][0] if cluster['concepts'] else ""
        cluster['total_frequency'] = sum(cluster['frequency'])
        return [cluster]

def cluster_concepts(concepts_data):
    overall_data = concepts_data.get("overall", [])
    demographics_data = concepts_data.get("demographics", {})

    # Process overall clustering.
    overall_clusters = process_clustering(overall_data)

    # Process demographic-specific clustering.
    demographic_clusters = {}
    for demo, demo_data in demographics_data.items():
        demographic_clusters[demo] = process_clustering(demo_data)

    return {
        "overall": overall_clusters,
        "demographics": demographic_clusters
    }

if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        clusters = cluster_concepts(input_data)
        print(json.dumps(clusters))
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
