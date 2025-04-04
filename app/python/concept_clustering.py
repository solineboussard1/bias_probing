import numpy as np
import json
import sys
from collections import Counter
from sklearn.cluster import DBSCAN, KMeans
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import nltk
from nltk.stem import WordNetLemmatizer
from nltk import word_tokenize

# nltk.download('punkt')
# nltk.download('wordnet')

lemmatizer = WordNetLemmatizer()
model = SentenceTransformer('all-MiniLM-L6-v2')  # Efficient & accurate SBERT model

def normalize_concept(concept: str) -> str:
    """Lemmatizes and normalizes a concept string."""
    tokens = word_tokenize(concept.lower())
    lemmas = [lemmatizer.lemmatize(t) for t in tokens]
    return " ".join(lemmas)

def get_best_label_sbert(cluster_concepts, model):
    """Find the most representative concept based on cosine similarity to the centroid."""
    if not cluster_concepts:
        return ""

    cluster_embeddings = model.encode(cluster_concepts, normalize_embeddings=True)
    centroid = np.mean(cluster_embeddings, axis=0).reshape(1, -1)
    similarities = cosine_similarity(cluster_embeddings, centroid).flatten()
    best_index = similarities.argmax()
    
    return cluster_concepts[best_index]

def process_clustering(concept_frequencies, eps=0.25, min_samples=2, min_freq_threshold=3, max_clusters=16, min_clusters=4):
    if not concept_frequencies:
        return [], {}

    # Normalize and expand concepts by frequency
    concepts = []
    for concept, freq in concept_frequencies:
        normalized = normalize_concept(concept)
        concepts.extend([normalized] * freq)

    # Compute Sentence-BERT embeddings
    embeddings = model.encode(concepts, normalize_embeddings=True)

    try:
        # Clustering using DBSCAN
        dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric='cosine')
        labels = dbscan.fit_predict(embeddings)

        clusters_dict = {}
        for idx, label in enumerate(labels):
            clusters_dict.setdefault(label, []).append(idx)

        # Compute centroids
        cluster_centroids = {label: np.mean(embeddings[indices], axis=0) for label, indices in clusters_dict.items()}

        # Merge small clusters
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
                clusters_dict[best_label].extend(clusters_dict[small_label])
                del clusters_dict[small_label]
                cluster_centroids[best_label] = np.mean(embeddings[clusters_dict[best_label]], axis=0)
                del cluster_centroids[small_label]

        # If too many clusters, reduce with KMeans
        if len(clusters_dict) > max_clusters:
            kmeans = KMeans(n_clusters=max_clusters, random_state=0)
            kmeans_labels = kmeans.fit_predict(embeddings)
            clusters_dict = {}
            for idx, label in enumerate(kmeans_labels):
                clusters_dict.setdefault(label, []).append(idx)
            cluster_centroids = {label: np.mean(embeddings[indices], axis=0) for label, indices in clusters_dict.items()}
        
        if len(clusters_dict) < min_clusters and len(concepts) > min_clusters:
            kmeans = KMeans(n_clusters=min_clusters, random_state=0)
            kmeans_labels = kmeans.fit_predict(embeddings)
            clusters_dict = {}
            for idx, label in enumerate(kmeans_labels):
                clusters_dict.setdefault(label, []).append(idx)
            cluster_centroids = {label: np.mean(embeddings[indices], axis=0) for label, indices in clusters_dict.items()}

        # Convert clusters to structured format
        clusters = []
        for label, indices in clusters_dict.items():
            cluster_list = [concepts[i] for i in indices]
            concept_counts = Counter(cluster_list)
            sorted_items = sorted(concept_counts.items(), key=lambda x: x[1], reverse=True)
            
            best_label = get_best_label_sbert(cluster_list, model)  # Use SBERT similarity-based labeling
            
            clusters.append({
                'id': label,
                'concepts': [item[0] for item in sorted_items],
                'frequency': [item[1] for item in sorted_items],
                'total_frequency': len(cluster_list),
                'label': best_label
            })

        # Sort by frequency
        clusters.sort(key=lambda x: x['total_frequency'], reverse=True)
        for i, cluster in enumerate(clusters):
            cluster['id'] = i  # Reassign cluster IDs

        # Mapping from concept to cluster ID
        new_concept_to_cluster = {concept: cluster['id'] for cluster in clusters for concept in cluster['concepts']}
        
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
    all_concepts = input_data.get("all", [])
    demographic_data = input_data.get("demographics", {}) or {"baseline": all_concepts}

    # Process overall clustering
    all_clusters, concept_to_cluster = process_clustering(all_concepts)

    # Process demographic-specific clusters
    demographic_clusters = {}
    for demo, demo_concepts in demographic_data.items():
        cluster_freq = {cluster['id']: 0 for cluster in all_clusters}
        for concept, freq in demo_concepts:
            normalized = normalize_concept(concept)
            cluster_id = concept_to_cluster.get(normalized, None)
            if cluster_id is not None:
                cluster_freq[cluster_id] += freq

        demo_clusters = []
        for cluster in all_clusters:
            cid = cluster['id']
            demo_clusters.append({
                'id': cid,
                'concepts': cluster['concepts'],
                'frequency': cluster['frequency'], 
                'total_frequency': cluster_freq[cid],
                'label': cluster['label']
            })
        demographic_clusters[demo] = demo_clusters

    return {"all": all_clusters, "demographics": demographic_clusters}

if __name__ == "__main__":
    try:
        input_str = sys.stdin.read()
        input_data = json.loads(input_str)
        clusters = cluster_concepts(input_data)
        print(json.dumps(clusters, indent=2))
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
