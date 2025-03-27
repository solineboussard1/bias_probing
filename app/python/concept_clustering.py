import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_similarity
import json
import sys
from collections import Counter

import nltk
from nltk.stem import WordNetLemmatizer
from nltk import word_tokenize

# nltk.download('punkt')
# nltk.download('wordnet')

lemmatizer = WordNetLemmatizer()

def normalize_concept(concept: str) -> str:
    """Lemmatizes and normalizes a concept string."""
    tokens = word_tokenize(concept.lower())
    lemmas = [lemmatizer.lemmatize(t) for t in tokens]
    return " ".join(lemmas)

def process_clustering(concept_frequencies, eps=0.15, min_samples=1, min_freq_threshold=3):
    if not concept_frequencies:
        return [], {}

    # Expand the list by frequency: each concept appears 'freq' times.
    concepts = []
    for concept, freq in concept_frequencies:
        normalized = normalize_concept(concept)
        concepts.extend([normalized] * freq)
    
    # Vectorize every instance so that repeated occurrences affect density.
    vectorizer = TfidfVectorizer(stop_words='english')
    tfidf_matrix = vectorizer.fit_transform(concepts)
    feature_matrix = tfidf_matrix.toarray()

    try:
        # Run DBSCAN on the full repeated list.
        dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric='cosine')
        dbscan.fit(feature_matrix)
        labels = dbscan.labels_

        # Build initial clusters.
        clusters_dict = {}
        for idx, label in enumerate(labels):
            clusters_dict.setdefault(label, []).append(idx)
        
        # Compute centroids for each cluster.
        cluster_centroids = {}
        for label, indices in clusters_dict.items():
            vectors = feature_matrix[indices]
            centroid = np.mean(vectors, axis=0)
            cluster_centroids[label] = centroid
        
        # Merge clusters whose total frequency is less than min_freq_threshold.
        small_labels = [label for label, indices in clusters_dict.items() if len(indices) < min_freq_threshold]
        for small_label in small_labels:
            if len(clusters_dict) == 1:
                break
            small_centroid = cluster_centroids[small_label].reshape(1, -1)
            best_label = None
            best_sim = -1
            for label, centroid in cluster_centroids.items():
                if label == small_label:
                    continue
                sim = cosine_similarity(small_centroid, centroid.reshape(1, -1))[0][0]
                if sim > best_sim:
                    best_sim = sim
                    best_label = label
            if best_label is not None:
                # Merge: append all indices from the small cluster to the target cluster.
                clusters_dict[best_label].extend(clusters_dict[small_label])
                # Remove the small cluster.
                del clusters_dict[small_label]
                # Recompute centroid for the target cluster.
                indices = clusters_dict[best_label]
                vectors = feature_matrix[indices]
                cluster_centroids[best_label] = np.mean(vectors, axis=0)
                # Also remove the small cluster's centroid.
                del cluster_centroids[small_label]

        # Build final clusters from clusters_dict.
        clusters = []
        for label, indices in clusters_dict.items():
            cluster_list = [concepts[i] for i in indices]
            concept_counts = Counter(cluster_list)
            sorted_items = sorted(concept_counts.items(), key=lambda x: x[1], reverse=True)
            cluster_data = {
                'id': label,  # original DBSCAN label
                'concepts': [item[0] for item in sorted_items],
                'frequency': [item[1] for item in sorted_items],
                'total_frequency': len(cluster_list)
            }
            clusters.append(cluster_data)

        # Sort clusters by total frequency and reassign sequential IDs.
        clusters.sort(key=lambda x: x['total_frequency'], reverse=True)
        for i, cluster in enumerate(clusters):
            cluster['id'] = i
            cluster['label'] = cluster['concepts'][0] if cluster['concepts'] else ""
        
        # Rebuild the mapping from normalized concept to new sequential cluster ID.
        new_concept_to_cluster = {}
        for cluster in clusters:
            for concept in cluster['concepts']:
                new_concept_to_cluster[concept] = cluster['id']
        
        return clusters, new_concept_to_cluster

    except Exception as e:
        print(f"Error during clustering: {e}", file=sys.stderr)
        freq_count = Counter(concepts)
        cluster = {
            'id': 0,
            'concepts': list(freq_count.keys()),
            'frequency': list(freq_count.values()),
            'label': list(freq_count.keys())[0] if freq_count else "",
            'total_frequency': sum(freq_count.values())
        }
        return [cluster], {c: 0 for c in concepts}

def cluster_concepts(input_data):
    # Get the 'all' concepts list.
    all_concepts = input_data.get("all", [])
    # Get demographic subgroup data.
    demographic_data = input_data.get("demographics", {})
    if not demographic_data:
        demographic_data = {"baseline": all_concepts}

    # Process clustering for overall concepts.
    all_clusters, concept_to_cluster = process_clustering(all_concepts)
    
    # Process demographic-specific clusters using the overall mapping.
    demographic_clusters = {}
    for demo, demo_concepts in demographic_data.items():
    # Initialize frequency count for each overall cluster id.
        cluster_freq = {cluster['id']: 0 for cluster in all_clusters}
        
        for concept, freq in demo_concepts:
            normalized = normalize_concept(concept)
            cluster_id = concept_to_cluster.get(normalized, None)
            if cluster_id is not None:
                cluster_freq[cluster_id] += freq

        demo_clusters = []
        for cluster in all_clusters:
            cid = cluster['id']
            demo_cluster = {
                'id': cid,
                'concepts': cluster['concepts'],
                'frequency': cluster['frequency'], 
                'total_frequency': cluster_freq[cid],
                'label': cluster['label']
            }
            demo_clusters.append(demo_cluster)
        demographic_clusters[demo] = demo_clusters


    return {
        "all": all_clusters,
        "demographics": demographic_clusters,
        "demographicDistributions": demographic_clusters  
    }

if __name__ == "__main__":
    try:
        input_str = sys.stdin.read()
        input_data = json.loads(input_str)
        clusters = cluster_concepts(input_data)
        print(json.dumps(clusters, indent=2))
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
